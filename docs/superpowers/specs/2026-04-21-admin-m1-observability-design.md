# Admin M1 — 观测面板设计（Observability）

**Status:** Design
**Date:** 2026-04-21
**Scope:** Admin 一体化面板的第一期 —— "看得见"（观测 + 最小 LLM 成本追踪）。不含操作能力（impersonate / 禁用 / 删除都在 M2+）。

---

## 1. 背景与目标

当前产品运行"裸奔"：

| 维度 | 现状 |
|---|---|
| 用户/权限 | 只有 `User`，无管理员角色；Tour 层有 `author / editor / reader` |
| 内容治理 | 零（无举报、禁用、下架） |
| 可观测性 | 零（不知道 DAU/WAU、注册来源、留存） |
| 成本监控 | 零（LLM token/成本未入库，SiliconFlow 账单是黑盒） |
| 运维工具 | 零（无 feature flag、公告位、impersonate、维护模式） |
| 审计 | 零 |
| 支持能力 | 零 |

**M1 目标**：建立 admin 地基（角色、路由、鉴权、布局），让开发者"看得见"平台的用户、内容、LLM 消费态势。所有敏感操作（impersonate、禁用、删除）留到 M2。

**产出价值**：
1. 回答"谁在用、用多少"（用户/Tour 列表）
2. 回答"LLM 每天烧多少、谁烧得多"（30 天成本排行 + 趋势图）
3. 为 M2-M4 的运维工具提供骨架（侧栏导航、详情页、鉴权、日志）

**一体化 admin 的四期规划**（本 spec 只覆盖 M1）：

| 期 | 模块 | 主要内容 |
|---|---|---|
| **M1（本期）** | 观测 | Dashboard、Users 列表+详情、Tours 列表+详情、LLM 用量采集 |
| M2 | 支持 | Impersonate、禁用账号、删除 Tour、用户/Tour 详情补齐操作按钮 |
| M3 | 成本控制 | 单用户 token 上限、模型开关、feature flag、公告位、维护模式 |
| M4 | 治理 | Audit log、数据导出、账户注销 |

---

## 2. 架构与鉴权

### 2.1 路由

`config/routes.rb` 追加：

```ruby
namespace :admin do
  root to: "dashboard#show"
  resources :users, only: [:index, :show]
  resources :tours, only: [:index, :show]
end
```

### 2.2 控制器层级

- `Admin::BaseController < ApplicationController`：定义 `before_action :require_admin!`
- `require_admin!`：非 admin **一律返回 404**（`raise ActionController::RoutingError.new("Not Found")`）。不是 302 也不是 403 —— 不暴露 admin 入口存在
- 所有 admin 控制器继承 Base：
  - `Admin::DashboardController#show`
  - `Admin::UsersController#index` / `#show`
  - `Admin::ToursController#index` / `#show`

### 2.3 日志与 Sentry

M1 不建 audit log 表（M4 再做），但做两件低成本 placeholder：

- `Admin::BaseController` 加 `before_action :log_admin_access`：
  ```ruby
  Rails.logger.info("[admin] user=#{current_user.id} action=#{controller_name}##{action_name} params=#{filtered_params}")
  ```
- Sentry breadcrumb：每次 admin 控制器动作 `Sentry.add_breadcrumb(category: "admin", message: "...")`，出错可追溯

### 2.4 前端

- `app/javascript/pages/Admin/` 下 5 个页面：
  - `Dashboard.jsx`
  - `UsersIndex.jsx` / `UsersShow.jsx`
  - `ToursIndex.jsx` / `ToursShow.jsx`
- 共享 layout：`app/javascript/components/admin/AdminShell.jsx`
  - Mantine `AppShell`
  - 顶部栏：Admin 徽章 + 用户菜单 + "返回前台"链接（`/`）
  - 侧栏 3 项导航（Dashboard / 用户 / Tour），带 active 态
  - 所有 admin 页面顶层包 AdminShell
- 图标：全部用 `@tabler/icons-react`（符合 frontend_icon_convention 记忆）
  - Dashboard: `IconLayoutDashboard`
  - 用户: `IconUsers`
  - Tour: `IconMap`
  - 返回: `IconArrowBack`

### 2.5 Inertia 响应

- 所有 index/show 通过 `render inertia: "Admin/PageName", props: {...}`
- 分页状态在 URL query（`?page=2&q=xxx&sort=cost_desc`），刷新不丢状态
- 搜索/排序走 GET 参数，`router.get` 或 `Link` 链接触发，不用 fetch

---

## 3. 数据模型

### 3.1 Migration 1 —— `users.role` 枚举

```ruby
class AddRoleToUsers < ActiveRecord::Migration[8.0]
  def change
    add_column :users, :role, :integer, default: 0, null: false
    add_index  :users, :role
  end
end
```

Model：

```ruby
class User < ApplicationRecord
  enum :role, user: 0, admin: 1
end
```

提供 `User#admin?` 判断（enum 自动生成）。未来加 `support`、`readonly` 角色只需追加枚举值，不动 migration。

### 3.2 Migration 2 —— `messages` LLM 指标列

```ruby
class AddLlmMetricsToMessages < ActiveRecord::Migration[8.0]
  def change
    add_column :messages, :tokens_in,   :integer   # 可为 null
    add_column :messages, :tokens_out,  :integer
    add_column :messages, :cost_cents,  :integer   # 整数分，避免浮点
    add_index  :messages, :created_at              # Dashboard 按日聚合用
  end
end
```

- 只对 `role: :assistant` 的消息写入（user/system 消息这三列永远 null）
- 不写 null constraint，用 model scope 区分：
  ```ruby
  scope :billable, -> { where(role: :assistant).where.not(tokens_out: nil) }
  ```
- 历史消息（M1 上线前已存在的）自动被 `billable` scope 排除

### 3.3 同步清理（User 关联死代码）

`app/models/user.rb` 里有 Guidebook → Tour 重命名后的遗留：

```ruby
has_many :guidebooks, foreign_key: :author_id, dependent: :destroy
has_many :guidebook_memberships, dependent: :destroy
```

但 `Guidebook` / `GuidebookMembership` 模型和表都已经被 `20260415172617_drop_guidebooks_and_memberships.rb` 删除。这两行现在是**死代码**（任何 `user.guidebooks` 调用会 NameError，`user.destroy` 也会因为 `dependent: :destroy` 需要加载 Guidebook 而炸 —— 只是目前没人删用户没暴露出来）。

M1 顺手替换为：

```ruby
has_many :tours, foreign_key: :author_id, dependent: :destroy
has_many :tour_memberships, dependent: :destroy
```

Admin 查询 "用户的 Tour" 就走 `user.tours`（作者身份）+ `user.tour_memberships` 关联的 Tour（成员身份）。不做这步清理，M1 的列表/详情查询写起来会很别扭。

### 3.4 不做的改动（YAGNI）

- ❌ `users.admin_notes` / `users.disabled_at` —— M2
- ❌ `messages.model_name` —— Q5 选 B 已拒（成本 B 方案已够 PM 视角）
- ❌ audit log 表 —— M4
- ❌ `users.last_sign_in_at` —— 衍生查询算（`MAX(messages.created_at)` / `MAX(tours.updated_at)`），DB 慢了再加

---

## 4. LLM 用量采集

### 4.1 定价表

`config/llm_pricing.yml`（新增）：

```yaml
# 单位：cents per million tokens（¥ 分/百万 token）
# 按 SiliconFlow 官价录入；更新本文件不需要 migration；capture 时按当时值算
kimi-k2:
  input_cents_per_mtok:  400    # 示例值，部署前核实
  output_cents_per_mtok: 1200
qwen3-235b:
  input_cents_per_mtok:  200
  output_cents_per_mtok: 800
# 找不到 model 时用 fallback，避免 job crash
_default:
  input_cents_per_mtok:  500
  output_cents_per_mtok: 1500
```

### 4.2 `LlmPricing` 模块

`app/models/llm_pricing.rb`（约 30 行）：

```ruby
class LlmPricing
  CONFIG_PATH = Rails.root.join("config/llm_pricing.yml")

  class << self
    def lookup(model_name)
      pricing[model_name] || begin
        Rails.logger.warn("[llm_pricing] unknown model=#{model_name}, using _default")
        pricing["_default"]
      end
    end

    private

    def pricing
      @pricing ||= YAML.load_file(CONFIG_PATH)
    end
  end
end
```

- 进程级缓存（`@pricing ||=`）；改配置需要重启（生产可接受）
- `lookup` 永不返回 nil（`_default` 兜底）

### 4.3 `ChatStreamJob` 改动

流结束、创建 assistant `Message` 的地方，读 RubyLLM 最终响应的 `usage`，换算 `cost_cents`，写入 Message：

```ruby
# 位置：ChatStreamJob 创建 assistant Message 之前
usage = (final_response.usage || {}).with_indifferent_access
model = final_response.model || ENV.fetch("LLM_MODEL_NAME", "kimi-k2")
pricing = LlmPricing.lookup(model)

input_tokens  = usage[:input_tokens]  || usage[:prompt_tokens]
output_tokens = usage[:output_tokens] || usage[:completion_tokens]

cost_cents =
  if input_tokens && output_tokens
    (
      input_tokens  * pricing[:input_cents_per_mtok]  +
      output_tokens * pricing[:output_cents_per_mtok]
    ) / 1_000_000.0
  end

Message.create!(
  conversation: conversation,
  role: :assistant,
  content: full_content,
  tokens_in:  input_tokens,
  tokens_out: output_tokens,
  cost_cents: cost_cents&.round
)
```

**RubyLLM 的实际 usage API 形态（input_tokens vs prompt_tokens）在实施时以 gem 源码为准**；spec 做兼容处理（两种键都 try）。

### 4.4 失败容忍

- RubyLLM 响应里 usage 缺失 / 格式不对时：三列写 null，`Rails.logger.warn`，**不 raise**，聊天不受影响
- pricing.yml 找不到 model：走 `_default`，`Rails.logger.warn`（Sentry 只 breadcrumb 不 error —— 不是业务错误）
- Dashboard/列表查询用 `Message.billable` scope，null 记录自动排除

### 4.5 不补历史

新数据前向累积。M1 上线前产生的 assistant 消息三列永远是 null，Dashboard "近 30 天" 的数据在 M1 上线的头 30 天会偏低，逐渐"热起来"。这是设计预期，不做回填任务。

---

## 5. 页面详细设计

### 5.1 `/admin` Dashboard

**顶部**：3 个时间 Tab —— 今天 / 近 7 天 / 近 30 天（默认 **近 7 天**）。所有卡片/图数据随 Tab 刷新（走 `?range=7d` GET 参数）。

**6 张 KPI 卡**（Mantine `SimpleGrid cols={{ base: 2, sm: 3 }}`）：

| 卡片 | 图标 | 数据源 |
|---|---|---|
| 新增用户 | `IconUserPlus` | `User.where(created_at: range).count` |
| 活跃用户 | `IconUsersGroup` | 时段内建/改 Tour 或发过消息的去重用户数（定义见下） |
| 新增 Tour | `IconMapPlus` | `Tour.where(created_at: range).count` |
| 活跃 Tour | `IconMap` | `Tour.where(updated_at: range).count` |
| LLM 消息 | `IconMessageDots` | `Message.billable.where(created_at: range).count` |
| LLM 成本 | `IconCurrencyYen` | `Message.billable.where(created_at: range).sum(:cost_cents)`，显示为 `¥XX.XX` |

**活跃用户定义**（SQL 化的精确版）：

```ruby
user_ids = User.joins(:tours).where(tours: { updated_at: range }).ids
user_ids += Message.billable.where(created_at: range)
                   .joins(conversation: :user).pluck("users.id")
user_ids.uniq.count
```

（实现时可以合并成一条 UNION 查询优化；概念上"任何时段内的产出行为都算活跃"。）

**1 张趋势图**（Mantine `LineChart` 或 recharts）：

- X 轴：按日分桶（`DATE_TRUNC('day', created_at)`）
- Y 轴双线：
  - 左轴 = 每日消息数
  - 右轴 = 每日成本 ¥
- 时间范围跟 Tab
- 空数据/单点时显示占位文案，不画歪图

**Empty state**：全是 0 时显示"本时段暂无数据，产品刚启动/切换时段试试"，不展示一排 0 卡片。

### 5.2 `/admin/users` 列表

**列**（Mantine `Table`）：

| 列 | 说明 |
|---|---|
| ID | 用户 id（单调增） |
| 头像 + 姓名 | `Avatar` + name |
| 邮箱 |  |
| 注册时间 | `created_at`，相对时间（"3 天前"）+ 悬浮 tooltip 显示精确日期 |
| Tour 数 | 该用户作者 + 成员身份的 Tour 去重数 |
| 30d 消息 | 该用户对话里 assistant 消息数（最近 30 天） |
| **30d Token** | `tokens_in + tokens_out` sum |
| **30d 成本 ¥** | `cost_cents` sum，显示为 `¥XX.XX` |
| 最近活跃 | max(自己的 Tour updated_at, 自己发的 message created_at) |

**交互**：

- 顶部搜索框：`q` 参数，match `name ILIKE %q%` 或 `email ILIKE %q%`，300ms 防抖
- 表头点击排序：所有列都可以，默认按 **30d 成本 desc**（一眼看谁烧钱，PM 第一痛点）
- `Pagy` 分页，25/页
- 点击行 → `/admin/users/:id`

**查询性能**（避免 N+1）：

```ruby
# 伪码
User.left_joins(tours: ..., messages_via_conversations: ...)
    .select(<<~SQL)
      users.*,
      COUNT(DISTINCT tours.id) AS tours_count,
      COUNT(DISTINCT messages.id) FILTER (
        WHERE messages.role = 1 AND messages.created_at > ?
      ) AS messages_30d,
      SUM(messages.tokens_in + messages.tokens_out) FILTER (...) AS tokens_30d,
      SUM(messages.cost_cents) FILTER (...) AS cost_30d_cents
    SQL
    .group("users.id")
```

实施时若 ORM 表达太绕，允许直接 `ActiveRecord::Base.connection.select_all(sql)` + 手动映射。关键是一次查询，不要逐用户循环。

### 5.3 `/admin/users/:id` 详情

4 段自上而下：

**1. Profile 卡**：
- 头像、姓名、邮箱、注册时间、role（徽章：`user` / `admin`）
- OAuth 提供商列表（从 `oauth_identities`）
- 一行 meta：`ID #{id}` · `最近活跃 #{last_active}`

**2. 生涯统计**（`lifetime_stats`，4 张小卡）：
- 总 Tour 数、总消息数、总 token、总成本 ¥

**3. Tour Tab 组**（两个 Tab：`我的 Tour` / `参与的 Tour`）：
- 列：标题、角色（作者/editor/reader）、Day 数、更新时间
- 点击跳 `/admin/tours/:id`
- 每 Tab 最多 20 条（够 M1）；超出显示"共 XX 条，搜索 Tour 列表查看完整"

**4. 最近 20 条消息**：
- 该用户 `Conversation` 里的消息（含其自己发的 + 收到的 assistant 回复）
- 每条显示：role 徽章、content 前 200 字符（超出省略号）、token（如果是 assistant）、成本 ¥、时间
- 用于支持场景看"用户在聊什么"
- **隐私提醒**：Conversation 正文已经是"敏感度中等"数据，admin 能看是默认 trust 模型（solo dev 场景）；M4 若有多 admin 再讨论是否脱敏

**Toolbar**：只有"← 返回列表"链接；M2 才加 impersonate / 禁用按钮。

### 5.4 `/admin/tours` 列表

**列**：

| 列 | 说明 |
|---|---|
| ID |  |
| 标题 | `tour.title` |
| 作者 | name + 邮箱；点击 name 跳到 user detail |
| 成员数 | `tour_memberships.count + 1`（含作者） |
| Day 数 | `tour.days.count` |
| Activity 数 | 所有 Day 下 Activity 的总数 |
| 创建时间 |  |
| 最近更新 | `tour.updated_at` |

**交互**：

- 搜索框：`q` match `title ILIKE %q%`
- 排序默认 `最近更新 desc`
- 25/页，点击行 → `/admin/tours/:id`

### 5.5 `/admin/tours/:id` 详情

4 段：

**1. Tour 卡**：
- 标题、作者（链接到 user detail）、起止日期（`start_date` / `end_date`）、创建时间、最近更新
- Day/Activity/成员计数

**2. 成员列表**：
- 表格：name / email / role（reader/editor） / 加入时间
- 作者单独一行在顶部（徽章"作者"）

**3. Day 摘要**：
- 表格：Day 序号 / 日期 / Activity 数 / 最后更新
- 不展开 Activity 详情（要看就跳回前台 Planner 页）

**4. 对话统计**：
- 本 Tour 对应 Conversation 的：总消息数、总 token、总成本 ¥、最后消息时间
- 不展示正文（想看去对应用户的 detail）

**Toolbar**：返回列表；M2 加删除按钮。

---

## 6. Bootstrap

### 6.1 第一个 admin 怎么来

Rake 任务 `lib/tasks/admin.rake`：

```ruby
namespace :admin do
  desc "Grant admin role: rake admin:grant EMAIL=x@y.com"
  task grant: :environment do
    email = ENV.fetch("EMAIL")
    user = User.find_by!(email: email)
    user.update!(role: :admin)
    puts "✔ #{user.email} → admin"
  end

  desc "Revoke admin: rake admin:revoke EMAIL=x@y.com"
  task revoke: :environment do
    email = ENV.fetch("EMAIL")
    user = User.find_by!(email: email)
    user.update!(role: :user)
    puts "✔ #{user.email} → user"
  end
end
```

### 6.2 生产首授命令

```bash
mise exec -- bundle exec kamal app exec --reuse \
  'bin/rails admin:grant EMAIL=skipmaple@gmail.com'
```

**不做 ENV var 方案**（`ADMIN_EMAIL=...` 自动 grant）：复杂度等价但改 admin 集合需要重新部署，反而不灵活。

### 6.3 开发环境

`db/seeds.rb` 里如果已有示例 user，追加一行把第一个 user 设成 admin，方便本地点开就能看：

```ruby
User.first&.update!(role: :admin) if Rails.env.development?
```

---

## 7. 测试策略

### 7.1 请求规格（`spec/requests/admin/`）

- `base_controller_spec.rb`：
  - 未登录访问 `/admin` → 404（不是 302）
  - 登录非 admin → 404
  - 登录 admin → 200
  - 测试公用：提供 `login_as_admin` helper
- `dashboard_controller_spec.rb`：
  - Inertia props 包含 6 张 KPI 数值
  - 切 `?range=7d` / `30d` 数值随之变
  - 趋势图数据结构（数组 of `{ date:, messages:, cost_cents: }`）
- `users_controller_spec.rb`：
  - 列表分页
  - 搜索 `q=abc` 过滤 name/email
  - 排序 `sort=cost_desc`
  - `show` 返回 lifetime_stats + tours + recent_messages
- `tours_controller_spec.rb`：
  - 列表分页/搜索/排序
  - `show` 返回成员 + day 摘要 + conversation stats

### 7.2 模型规格

- `spec/models/user_spec.rb` 补：
  - `role` enum 默认值 = `user`
  - `admin?` 切换
- `spec/models/message_spec.rb` 补：
  - `billable` scope：只返回 `role: assistant` 且 `tokens_out` 非 null 的记录
- `spec/models/llm_pricing_spec.rb` 新建：
  - `lookup("kimi-k2")` 返回预期值
  - `lookup("unknown")` 返回 `_default` 且写 warn 日志
- `spec/jobs/chat_stream_job_spec.rb` 增加断言：
  - 流结束后 assistant Message 的三列被写入（mock 的 usage）
  - usage 缺失场景三列为 null，但 job 不 raise

### 7.3 JS 测试（Vitest）

- `AdminShell.test.jsx`：
  - 侧栏导航 3 项渲染
  - active 态切换（props.currentPath 驱动）
- 各页面**不单独写 JS 测试**（只读渲染），测试覆盖靠请求规格的 Inertia props 断言。

### 7.4 手工验收清单

实施完成后跑一遍：

- [ ] 非 admin 用户访问 `/admin` 收到 404（浏览器显示 Rails 404 页，不是 Inertia 错误）
- [ ] admin 访问 `/admin` 看到 Dashboard，6 张 KPI 有数
- [ ] 切换时间 Tab，数据变
- [ ] 趋势图渲染，鼠标 hover 显示具体日数据
- [ ] Users 列表默认按 cost_30d 降序
- [ ] Users 搜索框防抖正常（不每敲一下都刷）
- [ ] 点击行进详情，Profile/统计/Tour/消息 4 段都渲染
- [ ] Tours 列表默认按 updated_at 降序
- [ ] 点击 Tour 进详情，成员/Day/对话统计都渲染
- [ ] "返回前台"链接回到 `/`

---

## 8. 回滚策略

M1 完全**只读 + 加字段**，无破坏性改动：

- 3 个 migration 都是 `add_column` / `add_index`，`rollback` 干净
- `ChatStreamJob` 改动用 try/rescue 包住 usage 解析，业务链路不受影响
- admin 面板 bug 了 → 把 admin 的 role 改回 0（`rake admin:revoke`），admin 入口彻底消失

---

## 9. YAGNI 边界（M1 明确不做）

| 功能 | 归属 | 说明 |
|---|---|---|
| ❌ Impersonate | M2 | 敏感，需要 session-swap + 返程机制 |
| ❌ 禁用/封禁账户 | M2 | 需要设计 `disabled_at` + 登录拦截 |
| ❌ 删除 Tour / 用户 | M2 | 需要级联 + 软删除决策 |
| ❌ 单用户 LLM 限额 | M3 | 需要 quota 模型 + 超额反馈 |
| ❌ Feature flag | M3 | 小规模暂不需要 |
| ❌ 公告位 / 维护模式 | M3 | 无运营需求 |
| ❌ Audit log 表 | M4 | 等 M2 有真实敏感操作再设计 |
| ❌ 数据导出 | M4 | GDPR 相关，有用户要求再做 |
| ❌ IP 白名单 / 2FA | 不做 | solo 场景过度设计 |
| ❌ `messages.model_name` 列 | Q5 选 B 已拒 | 当前只跑 1-2 个模型，用不上 |
| ❌ 历史 LLM 数据回填 | 不做 | 新数据前向累积 |

---

## 10. 未决/后续观察点

实施过程中需要验证/讨论的点（不影响 M1 设计定稿）：

1. **RubyLLM 的 usage 字段键名**：`input_tokens` vs `prompt_tokens` 以 gem 实际输出为准，spec 做兼容
2. **Dashboard 查询性能**：M1 规模下 `MAX(updated_at)` 衍生查询足够快；如果用户表长到 10k+ 且 Dashboard 每次加载 >500ms，考虑加 `users.last_active_at` 冗余列（放 M2）
3. **SiliconFlow 定价**：pricing.yml 示例值必须部署前核实（OpenAI 兼容端的实际定价条目），上线后观察实际账单对账误差
4. **Admin 页面样式**：AdminShell 的配色用 Mantine 默认（不做暗色 admin 主题），上线后看体感是否过于"像前台"需不需要视觉区分
