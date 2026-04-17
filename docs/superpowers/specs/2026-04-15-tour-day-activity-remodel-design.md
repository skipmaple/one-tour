# Tour / Day / Activity 重建模

## Context

当前产品是 "AI 协作 Markdown 路书编辑器"：整份路书存为 `guidebooks.content` 的 Markdown + YAML frontmatter，AI 通过 `FrontmatterSchema.to_prompt_description` 拿到 schema 描述后整段输出 Markdown，前端通过 `DiffModal` diff-apply 到 CodeMirror。

产品形态要转为 "可视化 trip planner"，新 UX：

1. 罗列出所有要去玩的「行」
2. 【auto】行在地图上展示
3. 把景点拖入以「日」为单位的排序中（D1: 天坛、故宫；D2: 颐和园、北大）
4. 【auto】在地图上显示行之间的连接线，并在景点上标 Dn
5. 年表化展示每日行程，富 UI

同时用户已写出「旅行规划宪法」（本 spec 附件），定义了：

- 三级时间单元：**程 / 日 / 行**
- 四级公民等级：一等 (`tier_one`) / 二等 (`tier_two`) / 三等 (`tier_three`) / 基础 (`infrastructure`)
- 硬约束：单日驾驶 ≤ 7h、一等公民 ≤ 3/日、机动日 ≥ 1/程、二等餐 ≤ 3/程...
- 弹性机制：升级/降级/熔断

现有模型把 "程/日/行" 藏在 `guidebooks.content` 的 YAML 里，既支撑不了拖拽与地图实时连线，也无法机器校验宪法约束。

**生产数据量**：当前 5 个 guidebook，无真实用户数据需要保全 — 支持一次性硬切换，不做数据迁移。

---

## 产品目标（本 spec 覆盖的范围）

**设计思想：自顶向下**。用户使用路径按优先级分三步 —— 先定宪法、再列候选行、最后规划日程。宪法是"程"的起点，不可跳过。

| 目标 | 落地形式 |
|---|---|
| 新 Tour 必经宪法确认 | 创建 Tour 后先跳转到宪法编辑屏，用户审阅/修订后才进入 Planner；Planner 顶部菜单可随时再次修订 |
| 行作为第一类实体 | 独立的 `activities` 表 |
| 行可属于「日」也可属于 backlog | `activities.day_id` nullable |
| 拖拽排序 | `activities.position` 整数 |
| 按宪法机器校验 | `Constitution::DEFAULTS` + `Tour#constitution` + `Tour::ConstitutionCheck` |
| AI 通过 tool-calling 操作结构化实体 | 替换 `ChatStreamJob` 的 markdown-diff 路径；AI 也可通过 `update_constitution` 工具提议修宪 |
| 多人协作 | `TourMembership`（reader / editor），同构现有 `GuidebookMembership` |
| 时间 | `activities.planned_start_at` 用 `time` 类型，只存时分；按旅游地 wall-clock 语义，全链路不做时区转换 |

### 不在本 spec 范围（YAGNI）

- 跨 tour 的 POI 复用（不抽 `Location` 表）
- 路径折线缓存（前端懒请求 AMAP）
- 宪法约束在保存时硬阻止（只做 soft-validation + 警告）
- 真实数据从 guidebook 迁移到 tour（5 条数据 wipe，新项目用新模型）
- 老 ChatStreamJob 的 markdown-diff 模式保留或并存

---

## 数据模型

### `tours` 表（程）

```ruby
create_table :tours do |t|
  t.references :author, null: false, foreign_key: { to_table: :users }
  t.string     :title, null: false
  t.string     :date_range
  t.string     :vehicle
  t.integer    :team_size
  t.string     :trip_style
  t.string     :budget_per_person
  t.jsonb      :constitution, default: {}, null: false
  t.jsonb      :constraint_overrides, default: [], null: false
  t.boolean    :archived, default: false, null: false
  t.timestamps
  t.index [:author_id]
end
```

**`constitution`**：建 tour 时 **深拷贝** `Constitution::DEFAULTS`。每个 tour 有自己独立的宪法文本快照，修改默认值不影响老 tour（对应 "宪法" 的庄重语义）。

**`constraint_overrides`**：jsonb array，已被用户 "承认" 的 soft violation 白名单，抑制 UI 再次报警。结构：

```json
[
  { "rule": "max_daily_driving_minutes", "scope": { "day_index": 3 }, "reason": "独库必走", "acknowledged_at": "..." }
]
```

`scope` 允许的键（视规则而定）：
- `{}` — tour-wide（如 `max_fuel_emergency_per_tour`、`max_yurt_nights`）
- `{"day_index": N}` — 特定一天（如 `max_daily_driving_minutes`、`max_tier_one_per_day`）
- `{"activity_id": N}` — 特定一个行（预留，目前规则都不用这个粒度）

### `tour_memberships` 表

同构现有 `guidebook_memberships`：

```ruby
create_table :tour_memberships do |t|
  t.references :tour, null: false
  t.references :user, null: false
  t.integer    :role, default: 0, null: false # reader=0, editor=1
  t.timestamps
  t.index [:tour_id, :user_id], unique: true
end
```

### `days` 表（日）

```ruby
create_table :days do |t|
  t.references :tour, null: false
  t.integer    :day_index, null: false
  t.date       :date
  t.string     :title
  t.text       :theme
  t.integer    :intensity                      # enum: green=0, yellow=1, red=2
  t.boolean    :buffer_day, default: false, null: false
  t.timestamps
  t.index [:tour_id, :day_index], unique: true
end
```

`date` 留 `date` 类型（无时区）。`buffer_day = true` 表示机动日（对应宪法 §12 要求）。

### `activities` 表（行）

```ruby
create_table :activities do |t|
  t.references :tour, null: false            # 冗余于 day.tour_id，但查 backlog 与跨 day 聚合常用
  t.references :day, null: true              # null = backlog
  t.integer    :position, null: false

  t.integer    :citizen_level, null: false, default: 2
                 # enum: tier_one=0, tier_two=1, tier_three=2, infrastructure=3
  t.integer    :kind, null: false
                 # enum: scenic=0, road=1, food=2, stay=3, fuel=4, other=5

  t.string     :name, null: false
  t.decimal    :lat, precision: 9, scale: 6
  t.decimal    :lng, precision: 9, scale: 6
  t.string     :address

  t.time       :planned_start_at             # 只存时分 HH:MM；按旅游地 wall-clock 理解，无时区
  t.integer    :planned_duration_min

  t.text       :desc
  t.text       :tips

  t.jsonb      :details, default: {}, null: false

  t.timestamps
  t.index [:tour_id, :day_id, :position]
  t.index [:tour_id, :kind, :citizen_level]
end
```

#### `details` 按 `kind` 的约定

schema 约束靠 `Activity` 模型的应用层校验，不走 PG check constraint（保留灵活）。

| kind | details 键 |
|---|---|
| `scenic` | `best_light` (string), `altitude` (int m), `need_reservation` (bool), `ticket_info` (string), `recommend_stay_min` (int) |
| `road` | `from_name`, `to_name`, `km` (int), `drive_min` (int), `road_type`, `stop_points` (array of `{name, lat, lng}`), `limit_speed` (int), `day_only` (bool) |
| `food` | `cuisine`, `must_eat` (bool), `open_hours`, `price_pp` |
| `stay` | `sanitation` (enum: basic/standard/premium), `price_pp`, `amenities` (array of strings), `has_private_bath` (bool) |
| `fuel` | `brand`, `h24` (bool), `next_station_km` (int) |
| `other` | 自由字段 |

#### road vs scenic 的关系

`road` activity 表示**在这段路上的行动单元**，不是几何路径。

**规则：一切驾驶段都建 road activity**（否则 `Day#driving_minutes_total` 无法完整统计，宪法 §10 校验失灵）。

靠 `citizen_level` 区分两类 road：

| road 类型 | citizen_level | 例子 | 前端渲染 |
|---|---|---|---|
| 路本身是目的 | `tier_one` | 独库公路 D2 段、伊昭公路 | 一张图标卡片，有 desc/tips |
| 普通通勤 | `infrastructure` | 伊宁 → 那拉提的转场驾驶 | 简化为两 scenic 之间的箭头，默认折叠 |

这样 `Day#driving_minutes_total` = `activities.where(kind: :road).sum("(details->>'drive_min')::int")`，对应宪法 §10 完整覆盖。

几何折线（实际开车路径的坐标点）不存库，由前端基于相邻 activity 坐标实时调 AMAP。

### `conversations` 表改造

```ruby
# remove
t.references :guidebook, null: false

# add
t.references :tour, null: false
```

仍保持 `(tour_id, user_id)` 唯一（一个 tour × 一个 user = 一次对话）。

### `messages` 表

不改表结构（现有 `role`, `content`, `tool_calls`, `metadata` 四列已经够用）。

**新语义**：
- `role = user`：用户的自然语言输入
- `role = assistant`：`content` 是 assistant 的自然语言部分；`tool_calls` 是 JSON 数组，记录该消息里发起的工具调用
- 新增 `role = tool` ：（enum 新增 `tool=3`）：`content` 是工具执行结果的 JSON 字符串，`metadata` 记录 `tool_call_id` 与工具名

---

## 宪法的机器表示

### `Constitution::DEFAULTS`

```ruby
module Constitution
  DEFAULTS = {
    max_daily_driving_minutes:     420,   # §10
    max_mountain_road_minutes:     240,   # §10
    max_tier_one_per_day:          3,     # §11
    min_buffer_days:               1,     # §12
    min_daily_buffer_minutes:      90,    # §12
    max_tier_two_food_per_tour:    3,     # §7
    max_fuel_emergency_per_tour:   1,     # §9
    max_yurt_nights:               1,     # §8
  }.freeze
end
```

### `Tour::ConstitutionCheck`（PORO，住 `app/models/tour/constitution_check.rb`）

```ruby
class Tour::ConstitutionCheck
  Violation = Struct.new(:level, :rule, :scope, :message, :suggestion, keyword_init: true)

  def self.for(tour)
    new(tour).violations
  end

  def initialize(tour)
    @tour = tour
    @rules = tour.constitution.deep_symbolize_keys
  end

  def violations
    [
      check_daily_driving,
      check_tier_one_per_day,
      check_buffer_days,
      check_tier_two_food,
      check_yurt_nights,
    ].flatten.compact.reject { |v| overridden?(v) }
  end

  private
    def overridden?(violation)
      @tour.constraint_overrides.any? { |o| same_scope?(o, violation) }
    end

    # check_* 方法返回 Violation 数组
end
```

**为什么住 `app/models/`？** STYLE.md 偏好 "vanilla Rails"，明确讲 "don't treat services as special artifacts"。`ConstitutionCheck` 是跟 Tour 绑定的领域概念，放 `app/models/tour/constitution_check.rb` 与现有 `app/models/guidebook/generation.rb` 的嵌套模式一致。本重构**顺带删除整个 `app/services/` 目录**（见迁移清单）。

每个 `check_*` 方法返回违规列表；所有检查汇合后过滤 `constraint_overrides`。

**Violation.level**：
- `:hard` → UI 红色 sticky banner + 对应 day 标红
- `:soft` → UI 黄色 inline hint

**硬约束不阻止保存**。用户 "承认" 违反 → 写入 `constraint_overrides` → UI 静音。对应宪法 §14-16 的弹性机制。

### Tour 与 Day 的聚合 API

不新建 Service / PORO：

```ruby
class Day < ApplicationRecord
  def driving_minutes_total
    activities.where(kind: :road).sum("(details->>'drive_min')::int")
  end

  def tier_one_count
    activities.where(citizen_level: :tier_one).count
  end
end

class Tour < ApplicationRecord
  def tier_two_food_count
    activities.where(kind: :food, citizen_level: :tier_two).count
  end

  def buffer_days_count
    days.where(buffer_day: true).count
  end
end
```

---

## AI 集成（tool-calling 替换 Markdown diff）

### 核心变化

- **去掉**：`system_prompt` 里 "输出三段式纯文本" 的文本协议、`valid_guidebook?` 的 markdown 合法性探测、`replay_history` 里 markdown 内容的回放
- **去掉**：`FrontmatterSchema.to_prompt_description`、`FrontmatterParser`、前端 `DiffModal`、`app/tools/geocode_tool.rb`、整个 `app/services/` 目录
- **新增**：`AITools::*` 工具类（住 `app/ai_tools/`），AI 通过调用工具变更 Tour / Day / Activity；新写 `PoiSearch` 类（住 `app/models/poi_search.rb`，PORO）作为 AMAP `place/text` 客户端
- **保留**：`Conversation` / `Message` 两张表作为消息落库介质（纯数据表，语义延续）
- **重写**：`ChatChannel`（频道名从 `chat_guidebook_*` 改为 `chat_tour_*`；事件语义全换）、`useChat.js`（reducer 处理 tool-call 事件而非 markdown chunk）、`ChatStreamJob`（从 markdown 流式改为工具调用流式）

### 工具清单

| 工具 | 参数 | 语义 |
|---|---|---|
| `add_activity` | `tour_id, day_index \| :backlog, position?, kind, citizen_level, name, lat, lng, planned_start_at?, planned_duration_min?, details` | 新建行 |
| `move_activity` | `activity_id, to_day_index \| :backlog, to_position` | 拖动分配 |
| `update_activity` | `activity_id, patch` | 改详情 |
| `delete_activity` | `activity_id` | 删 |
| `reorder_day` | `day_id, activity_ids[]` | 批量排序 |
| `create_day` | `tour_id, day_index, title?, date?, buffer_day?` | 加一天 |
| `update_day` | `day_id, patch` | 改 day 元数据（theme、buffer_day…）|
| `delete_day` | `day_id` | 删一天（会把下属 activity 移入 backlog）|
| `run_constitution_check` | `tour_id` | 返回 `Tour::ConstitutionCheck.for(tour)` |
| `acknowledge_violation` | `tour_id, rule, scope, reason` | 写入 `constraint_overrides` |
| `update_constitution` | `tour_id, patch` | 修订本程宪法（如 `{max_mountain_road_minutes: 300}`）。AI 可在对话里提议，用户同意后调用 |
| `search_poi` | `query, region_hint?, near_lat?, near_lng?` | 走 AMAP 模糊搜索，返回候选 POI 列表 `[{name, lat, lng, address}]`。**不创建 Activity**，只给 AI 候选集 |

**全部工具都以 `AITools::` 命名空间重新建类**，住在顶级 `app/ai_tools/`，统一继承 `RubyLLM::Tool`。老的 `app/tools/geocode_tool.rb` 一并删除，坐标查询能力并入 `AITools::SearchPoi`（`search_poi("乌鲁木齐")` 返回的候选第一项即精确坐标，覆盖原 geocode 的窄场景）。

Zeitwerk 默认会把 `ai_tools` inflect 成 `AiTools`，要保持大写 `AI` 命名，`config/initializers/inflections.rb` 里注册 acronym：

```ruby
ActiveSupport::Inflector.inflections(:en) do |inflect|
  inflect.acronym "AI"
end
```

**底层 AMAP 客户端**换成新写的 `PoiSearch`（`app/models/poi_search.rb`，纯 PORO），走 AMAP `v5/place/text` 端点返回 POI 列表。老的 `Geocoder` 连同整个 `app/services/` 目录一并删除 —— 接口语义已经不符合新产品需求，且 STYLE.md 不鼓励 services 目录存在。

### `planned_start_at` 的传参

AI 传 **`"HH:MM"` 字符串**（如 `"10:00"`）。没有日期、没有时区 —— 日期由 `day_id` 隐含，时区不存在。服务端直接存为 `time` 类型。

### `ChatStreamJob` 重写思路

`perform(conversation_id, tour_id, user_id)` — 不再有 `mode` 参数（auto/ask/plan 模式在 markdown 路径上才有意义，新架构废弃）。

```ruby
def perform(conversation_id, tour_id, user_id)
  conversation = Conversation.find(conversation_id)
  tour         = Tour.find(tour_id)
  channel      = "chat_tour_#{tour_id}_user_#{user_id}"

  chat = build_chat(tour)
  replay_history(chat, conversation.messages.order(:created_at)[0..-2])

  latest = conversation.messages.order(:created_at).last

  chat.ask(latest.content) do |event|
    case event
    in { type: :tool_call, name:, arguments:, id: }
      ActionCable.server.broadcast(channel, { type: "tool_call_start", name:, arguments:, id: })
    in { type: :tool_result, id:, result: }
      ActionCable.server.broadcast(channel, { type: "tool_call_result", id:, result: })
    in { type: :text, delta: }
      ActionCable.server.broadcast(channel, { type: "assistant_text", delta: })
    end
  end

  save_and_broadcast_complete(conversation, tour, channel, chat.last_response)
end
```

（上面是 pseudocode；具体 RubyLLM tool-use API 形态在 implementation plan 里查当前 gem 版本。）

### System prompt 骨架

```text
你是一个旅行规划助手。当前 Tour: #{tour.title}。

你通过调用以下工具修改行程，不要直接输出 JSON 或 Markdown。

## Tour 状态
- Days: #{tour.days.count}
- Activities: 已分配 #{assigned_count}，backlog #{backlog_count}

## 宪法约束
#{tour.constitution.map { |k, v| "- #{k}: #{v}" }.join("\n")}

## 工具
#{AITools::Schema.to_prompt_description}

## 交互原则
- 先调用工具修改状态，再用自然语言简要解释
- 需要时调用 run_constitution_check 验证，违反硬约束要主动提议修正
- 需要 POI 或坐标时调用 search_poi，不要编造经纬度；从返回的候选里选一条 add_activity
```

### 前端事件与 reducer

ActionCable 事件从 `chunk / complete / error` 换成 `tool_call_start / tool_call_result / assistant_text / complete / error`。

`useChat.js` 的 reducer 新状态：

```
{
  messages: [{ role, content, tool_calls: [{ id, name, arguments, result, status }] }],
  streaming: bool,
  pending_tool_calls: { [id]: { name, arguments } }
}
```

每条 `tool_call_result` 也触发 Inertia 层的 Tour 重拉（或者直接 patch 本地状态）—— 这个实现细节在 planning 阶段决定。

---

## 时间

**系统不处理时区**。所有时间按 "旅游地 wall-clock" 理解 —— 数据库里存的 `10:00` 就是旅游地的 10:00，前端拿到 `10:00` 就直接展示 `10:00`，AI 说 `10:00` 就写 `10:00`。

| 层 | 规则 |
|---|---|
| DB | `activities.planned_start_at` 用 `t.time`，只存时分（HH:MM）|
| `days.date` | `t.date`，无时区 |
| AI 输入输出 | `"HH:MM"` 字符串 |
| 前端 | 直接按字符串渲染，无 `Intl.DateTimeFormat` 转换 |

这个取舍让宪法第一条 "本宪法所有时间均为北京时间" 自然落地 —— 没有另一个时区存在，就无法被打破。多人协作时所有成员看到同一份时间，也对应宪法原意。

后续如果要支持 "多时区显示"（用户在家乡时区同步查行程），再引入 `tours.timezone` 字段 —— 本 spec 不做。

---

## 迁移（一次性硬切）

**前提**：生产仅 5 个 guidebook，无真实用户数据保全需求 → 不做数据迁移，直接 wipe + 新模型上线。

### DB migration（单次 up 不可逆；按 "只有 5 条测试数据" 的前提接受风险）

```ruby
# 1. 新表
create_table :tours do ... end
create_table :tour_memberships do ... end
create_table :days do ... end
create_table :activities do ... end

# 2. 清洗 conversations 和 messages（因为它们指向 guidebook_id，而所有老 guidebook 会 drop）
execute "DELETE FROM messages WHERE conversation_id IN (SELECT id FROM conversations)"
execute "DELETE FROM conversations"

# 3. conversation 绑定改到 tour
remove_reference :conversations, :guidebook, foreign_key: true
add_reference    :conversations, :tour, null: false, foreign_key: true
add_index        :conversations, [:tour_id, :user_id], unique: true

# 4. messages 新增 tool role
# （Rails enum 的 integer 已经支持 0/1/2，新增 3 不改表结构）

# 5. drop 老表
drop_table :guidebook_memberships
drop_table :guidebooks
```

**Active Storage attachment**：`guidebooks.source_document` → 改成 `tours.source_document`（`has_one_attached :source_document`）。migration 里 `DELETE FROM active_storage_attachments WHERE record_type = 'Guidebook'` 清空。

### 代码删除清单

```
app/models/guidebook.rb
app/models/guidebook/generation.rb
app/models/guidebook_membership.rb
app/services/                                          # 整个目录，见下方迁移说明
app/tools/geocode_tool.rb                              # 重写入 AITools::SearchPoi
app/controllers/guidebooks_controller.rb
app/controllers/guidebook_memberships_controller.rb
app/controllers/conversations/messages_controller.rb  # 同名重写（新语义）
app/views/guidebooks/...                               # Inertia 入口对应的 JSX
app/javascript/pages/Guidebook/*
app/javascript/components/DiffModal.jsx
app/javascript/components/ChatPanel.jsx                # 同名重写
app/javascript/hooks/useChat.js                        # 同名重写
spec/models/guidebook*
spec/requests/guidebooks*
spec/services/                                         # 整个目录
spec/tools/geocode_tool_spec.rb                        # 若存在
spec/factories/guidebooks.rb
spec/factories/guidebook_memberships.rb
config/routes.rb 内的 `resources :guidebooks` 及其嵌套                 # 一同移除
```

**`app/services/` 目录整删前的一次迁移**：该目录下的 `email_verification/rate_limit.rb` 不属于本次重构的移除对象，先挪到 `app/models/email_verification/rate_limit.rb`（与现有 `app/models/email_verification.rb` 并列成 `EmailVerification::RateLimit`，Zeitwerk 自动识别嵌套）。挪完后 `app/services/` 剩下的 `frontmatter_parser.rb` / `frontmatter_schema.rb` / `geocoder.rb` 正好都是本次要删的，直接 `rm -r app/services/ spec/services/`。

### 代码新增清单

```
app/models/tour.rb
app/models/tour_membership.rb
app/models/day.rb
app/models/activity.rb
app/models/concerns/constitution.rb        # DEFAULTS 常量
app/models/tour/constitution_check.rb      # Tour::ConstitutionCheck PORO
app/models/poi_search.rb                   # PoiSearch，AMAP v5/place/text 客户端
app/models/email_verification/rate_limit.rb  # 从 app/services/ 挪过来（非新增逻辑）
app/ai_tools/base.rb                       # 基类或 module，包装 RubyLLM::Tool
app/ai_tools/add_activity.rb
app/ai_tools/move_activity.rb
app/ai_tools/update_activity.rb
app/ai_tools/delete_activity.rb
app/ai_tools/reorder_day.rb
app/ai_tools/create_day.rb
app/ai_tools/update_day.rb
app/ai_tools/delete_day.rb
app/ai_tools/run_constitution_check.rb
app/ai_tools/acknowledge_violation.rb
app/ai_tools/update_constitution.rb        # 让 AI 可提议修宪
app/ai_tools/search_poi.rb                 # 替代 app/tools/geocode_tool.rb
app/ai_tools/schema.rb                     # AITools::Schema.to_prompt_description
config/initializers/inflections.rb         # 注册 "AI" 为 acronym
app/controllers/tours_controller.rb
app/controllers/tours/constitutions_controller.rb # 宪法确认 / 修宪屏的后端
app/controllers/tour_memberships_controller.rb
app/controllers/days_controller.rb
app/controllers/activities_controller.rb
app/controllers/conversations_controller.rb      # 同名重写
app/controllers/conversations/messages_controller.rb  # 同名重写
app/jobs/chat_stream_job.rb                       # 同名重写
app/javascript/pages/Tour/Show.jsx                # Planner 主界面
app/javascript/pages/Tour/Constitution.jsx        # 宪法确认 / 修宪屏
app/javascript/components/planner/Map.jsx
app/javascript/components/planner/BacklogList.jsx
app/javascript/components/planner/DayColumn.jsx
app/javascript/components/planner/ActivityCard.jsx
app/javascript/components/planner/ConstitutionBanner.jsx
app/javascript/components/ChatPanel.jsx            # 新版 tool-call UI
app/javascript/hooks/useChat.js                    # 新版 reducer
config/routes.rb 重写
spec/factories/{tours,days,activities,tour_memberships}.rb
spec/models/* 新增（含 `spec/models/tour/constitution_check_spec.rb`、`spec/models/poi_search_spec.rb`）
spec/requests/* 新增
spec/ai_tools/*_spec.rb                    # 每个工具一个
```

### Routes

```ruby
Rails.application.routes.draw do
  resources :tours do
    resource  :constitution, only: [:show, :update]                  # 新 Tour 首进入 + 随时修宪
    resources :members, controller: :tour_memberships, only: [:create, :update, :destroy]
    resources :days, only: [:create, :update, :destroy] do
      resources :activities, only: [:create]
    end
    resources :backlog_activities, only: [:create], controller: :activities
    resource  :conversation, only: [:show, :destroy] do
      resources :messages, only: [:create]
    end
  end
  resources :activities, only: [:update, :destroy] do
    resource :position, only: [:update], controller: :activity_positions
  end
end
```

- `constitutions#show` 渲染宪法确认屏；`constitutions#update` 处理修宪 PATCH。`ToursController#create` 成功后默认重定向到 `tour_constitution_path(tour)`，首次进入即此屏（Wireframe Screen 2）。
- `activity_positions#update` 对应 CRUD-over-custom-actions 风格（STYLE.md §CRUD）：一次请求携带 `to_day_id`, `to_position` 完成拖拽。

### 代码迁移顺序（写 spec 时定方向，实际步序在 implementation plan）

1. DB migration + 新模型（models + factories + model specs）
2. `Tour::ConstitutionCheck` PORO + spec
3. AI 工具 POROs + spec
4. `ChatStreamJob` 重写 + request spec（mock LLM）
5. Controllers + request specs
6. 前端 Planner UI 与 Chat 重写
7. 删除老代码 + 老路由 + 老 specs
8. 整体手工验收 + `bin/rubocop` / `bin/brakeman` / `bin/importmap audit` / `bundle exec rspec` / `npm test`

### 回退

不支持原地回退（drop 了 guidebooks）。若上线后发现问题，回退靠 git revert PR + 重跑 DB migration down（需事先写 `down` 方法 drop 新表 + 重建 guidebooks；或直接 restore DB 备份）。上线前必须备份 DB。

---

## 测试策略

遵循现有 CLAUDE.md 测试约定：

- 请求 spec 用 `login_as(user)` helper（`post "/login_test"` 路由已有）
- factories 放 `spec/factories/`，名称：`:tour`（默认 `author: create(:user)`）、`:day`、`:activity`、`:tour_membership`
- WebMock 全局启用：AI tool-calling 的 request spec 用 WebMock stub `chat.completions` 端点；`AITools::SearchPoi` 背后的 AMAP 调用同样 stub

**关键 spec 覆盖面**：

| spec 文件 | 断言要点 |
|---|---|
| `tour_spec.rb` | `author/members/editable_by?/visible_to?`；`constitution` 建 tour 时深拷贝 `DEFAULTS` |
| `day_spec.rb` | `driving_minutes_total`、`tier_one_count` 聚合；`(tour_id, day_index)` 唯一 |
| `activity_spec.rb` | `kind` / `citizen_level` 枚举；`details` 按 kind 的应用层校验；`day_id = null` 为合法 backlog |
| `tour/constitution_check_spec.rb` | 每条 DEFAULTS 规则对应一组正反用例；`constraint_overrides` 抑制 |
| `ai_tools/*_spec.rb` | 每个工具的参数合法性与副作用 |
| `chat_stream_job_spec.rb` | stub LLM 返回工具调用序列，断言 DB 产生预期 Activity/Day 变更与 ActionCable 广播 |
| `activities_controller_spec.rb` 等 | 权限（editor 可改、reader 只读、非成员 404） |
| `tour_memberships_controller_spec.rb` | role 转换、author 不能被移除 |

### 前端测试

- Vitest：`useChat` reducer 的工具调用事件处理
- Planner 组件 render 测试（各 citizen_level 的 marker 样式）

---

## 范围边界（YAGNI）— 明确不做

- `Location` 表 / POI 收藏夹 / 跨 tour 复用
- Tour 模板（复用一份行程到另一个 tour）
- 宪法在保存时硬阻止（只做 soft-validation）
- 分享链接 / 公开路书 / markdown export
- 路径折线缓存 / 离线地图
- 版本历史 / 撤销栈（undo/redo）
- 老 guidebook 数据的自动迁移
- 老 ChatStreamJob 的兼容/并行路径
- 宪法的 "第五章节奏曲线" / "第六章决策机制" 的机器表示（目前宪法 §1-§13 落地，§14 弹性机制通过 `constraint_overrides` 落地，§17-§23 不落地）

---

## 开放问题（实现前可再议）

1. **`constraint_overrides` 的 UI 入口**：是在每个 soft-violation 边上给 "承认" 按钮，还是专门一个 "宪法豁免" 面板？本 spec 不定，implementation plan 里细化。
2. **路径折线懒加载策略**：每次 day 变化都去 AMAP 拉，还是前端本地缓存？implementation plan 再定。
3. **`chat_tour_#{tour_id}_user_#{user_id}` 频道的权限**：follow 现有 `ChatChannel` 的 authorize 模式，本 spec 不重述。

---

## 附：宪法原文分章映射

| 宪法章条 | 本 spec 的落点 |
|---|---|
| §1 三级时间单元 | `Tour` / `Day` / `Activity` 三张表 |
| §2 「行」定义（移动 + 停留） | `activities.kind ∈ {scenic, road, food, stay, fuel, other}`；road 与 scenic 拆 |
| §3 「日」节奏参考 | 不入 schema，作为前端展示的时间轴刻度 |
| §4 公民等级 | `activities.citizen_level` 枚举 |
| §5-§9 各类公民规则 | 由 `Tour::ConstitutionCheck` 的 `check_*` 方法实现 |
| §10-§12 硬约束 | `Constitution::DEFAULTS` 的 max_* 字段 + 对应 check |
| §13 安全红线 | 不入 schema（团队现场决策） |
| §14-§16 弹性机制 | `constraint_overrides` + soft-validation |
| §17 节奏曲线 | 不入 schema（产品建议，不强制） |
| §18 方向性 | 不入 schema |
| §19-§21 决策机制 | 不入 schema |
| §22-§23 附则 | `tours.constitution` 深拷贝快照对应 "修宪只影响当前程" |
