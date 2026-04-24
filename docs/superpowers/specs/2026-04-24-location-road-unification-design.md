# 地点选择 + 路段概念合流重构

**日期**：2026-04-24
**作者**：skipmaple + Claude
**背景**：两个看似独立的用户反馈在代码层相通——(a) POI 搜索同名地点经常选错；(b)"路段"概念混乱，手建 `kind=road` activity 和自动 `route_leg` 在 Planner 上长得一样但权限不同。进一步剖析发现二者共享同一组基础设施（AMAP 数据源、Planner 的 dashed-line 渲染路径、driving 时长汇总），且第三个隐藏 bug 贯穿两者：`Day#driving_minutes_total` 漏算 `route_leg` 时长。本轮把三件事打包一次做完。

---

## 目标

1. **地点选择闭环**：用户能一眼分辨同名地点（省市可见），选完能视觉确认（地图缩略图），错了能微调（拖钉）。
2. **"路段"概念收敛**：Planner 上所有驾驶段统一从 `route_leg` 出数据；用户可 override 高德给的 km / 时长 / 备注。
3. **修 `driving_minutes_total` 漏算 bug**：日汇总正确合并 `route_leg`（含 override）+ tier_one 景观公路本体。
4. **"景观公路"独立身份**：`kind=road` activity 收敛为 tier_one 场景，抽屉用独立模板（起点/终点双 POI 搜索）。
5. **老数据迁移**：非 tier_one 的 road activity 一次性迁入对应 `route_leg` 的 override 字段，删掉这些 activity 记录。

## 非目标

- 多模 route（公共交通 / 步行）—— 保持 driving 单一
- `LocationPicker` 支持多语言 / 国际 POI 源
- AMAP 以外的地图源
- 预算与驾驶成本联动（油费从 km 自动估算）
- 把景观公路和普通 scenic 合并为"景点带路段"
- Backlog 里的 road activity 特殊处理（保持和 day 内一致）
- 灰度迁移（数据量小，一刀切）
- 景观公路"沿途亮点"自由字段 / "推荐驾驶方向" / 跨省景观公路
- AMAP JS SDK 懒加载 gate（抽屉打开即加载）
- 保留低 tier road activity 记录做历史
- POI 搜索加"搜索历史"/"收藏常用地点"/"手动输入坐标"/"周边推荐"

## 成功判据

- 建新活动时，搜索结果能一眼看出"浏阳·金刚镇"而不是"A 省 B 市"
- 某天只有自动 leg、没有手建 road 时，日顶部"今日驾驶时长"不再是 0
- 点 Planner 上任意一条驾驶段能打开编辑器改 km / 时长
- 迁移完成后，`activities.where(kind: 'road').where.not(citizen_level: 'tier_one')` 为空

## 设计约束

- 纯中文 UI；label / placeholder / helper / 错误文案均中文
- 不用 emoji 作装饰前缀（遵循 `feedback_chinese_ui_no_mixing`）
- 图标统一 Tabler（遵循 `frontend_icon_convention`）
- Mantine v9 原生组件优先
- AMAP key 分离：`AMAP_API_KEY`（后端 REST）、`AMAP_JS_API_KEY` + `AMAP_JS_API_SECURITY_CODE`（前端 JS SDK），已有配置不变

---

## 数据模型改动

### `route_legs` 加 override 字段

```ruby
add_column :route_legs, :distance_m_override, :integer
add_column :route_legs, :duration_s_override, :integer
add_column :route_legs, :note,                :text
add_column :route_legs, :overridden_at,       :datetime
add_column :route_legs, :overridden_by_id,    :bigint
add_foreign_key :route_legs, :users, column: :overridden_by_id
```

- AMAP 原始值（`distance_m` / `duration_s`）与 override 并列，清空 override 可回到原始值
- `overridden_at` 单一判定位：NULL = 未 override；有值 = 已 override
- `note` 可选，用户自由填

### `Activity` 新约束

- `kind: road` 必须 `citizen_level: tier_one`
- 模型 validation + DB check constraint: `NOT (kind = 1 AND citizen_level != 0)`
- 约束在数据迁移**之后**添加（否则现有非 tier_one road 记录阻塞 migration）

### `Day#driving_minutes_total` 改实现

```ruby
def driving_minutes_total
  leg_minutes = route_legs.sum { |l| (l.duration_s_override || l.duration_s).to_i } / 60
  scenic_road_minutes = activities
    .where(kind: 'road', citizen_level: 'tier_one')
    .sum { |a| a.details['drive_min'].to_i }
  leg_minutes + scenic_road_minutes
end

def route_legs
  RouteLeg.where(from_activity_id: activities.pluck(:id))
end
```

新增对应 `driving_distance_km_total` 逻辑一致。

### Route_leg 归属某个 day 的规则

按 `from_activity.day_id` 归。跨天末段（昨晚回酒店）归昨天，和 Planner 视觉呈现一致。

### RouteLeg::Upsert 景观公路感知（关键改动）

今天 `RouteLeg::Upsert` 计算 leg 时用 `from_activity.lat/lng` → `to_activity.lat/lng`。景观公路是"一段"不是"一点"，必须区分进入坐标（起点）和离开坐标（终点）：

- `to_activity` 是 tier_one road：用其 `details.start_lat/start_lng`（进入这条景观公路）
- `from_activity` 是 tier_one road：用其 `details.end_lat/end_lng`（从这条景观公路离开）

换句话说：其他 kind 的 activity 到达/离开都是同一个点；景观公路从起点进入，从终点离开。

**后果**：不再生成景观公路"内部"的 leg（from 和 to 都是同一条景观公路的那种）。Day 汇总靠 `activity.details.drive_min` 单独加回（已在 hybrid sum 里做好）。

**`endpoint_digest` 的哈希输入改为解析后的坐标**（不是 `activity.lat/lng` 原值），否则仅改 `details.start_lat` 但不改 `activity.lat/lng` 的景观公路无法触发 AMAP 重算。

### 景观公路 `activity.lat/lng` 与 `details.start_*` 的关系

保存景观公路时，model 层在 `before_save` 中把 `lat = details['start_lat']`、`lng = details['start_lng']`、`address = details['start_address']`——让 `activity.lat/lng` 始终镜像起点。理由：
- `activities.lat/lng` 的 NOT NULL 约束能继续满足
- 外部读 `activity.lat/lng` 的老代码（如地图 marker）能拿到一个合理的点（起点）
- 不引入新的"活动没坐标"状态

### Activity 坐标变化时的 override 处理

Activity 坐标变化 → `endpoint_digest` 失效 → `RouteLeg::Upsert` 重算 AMAP → **清空所有 override 字段**。

对景观公路，"坐标变化"指 `details.start_lat/start_lng/end_lat/end_lng` 四者任一变化。

前端在保存 activity 前，若检测到涉及的 leg 有 override，弹确认：

> 检测到 N 条驾驶段的起/终点已变化：{leg 列表}。原先手动调整的 km / 时长 / 备注将会重置。继续？

仅在"真有 override"时弹；无 override 静默重算。

### 数据模型层不做的事

- 不给 `activities` 加 `is_scenic_road` 标记位
- 不给 `route_legs` 加 `kind` / `tags`
- 不动 `activities.kind` enum 定义（road 仍合法）
- 不保留 from_name / to_name 的旧 key 双读兼容

---

## LocationPicker 组件

### 后端

`PoiSearch#search` 每个 candidate 多返四个字段：`pname` / `cityname` / `adname` / `pcode`。响应 shape 保持 `{ candidates: [...] }` 兼容。

### 单点模式（`mode="single"`）

```
┌─ 位置 ──────────────────────────────┐
│  [城市: 浏阳 ✕]    ← 区域锚定芯片    │
│  ┌───────────────────────────────┐  │
│  │ 搜索地点                      │  │
│  │ [金刚                       🔍]│  │
│  └───────────────────────────────┘  │
│                                     │
│  ┌─ 结果列表 ─────────────────────┐ │
│  │ 春丽和金刚小酒馆（解放西店）    │ │
│  │ 湖南·长沙·岳麓  餐饮           │ │
│  │ 福达银座5楼...                  │ │
│  ├────────────────────────────────┤ │
│  │ 浏阳市金刚镇人民政府            │ │
│  │ 湖南·长沙·浏阳市  政府机构     │ │
│  │ 金刚镇平湾村...                 │ │
│  └────────────────────────────────┘ │
│                                     │
│  ── 选中后 ──                       │
│  ✓ 春丽和金刚小酒馆                 │
│    湖南·长沙·岳麓 · 餐饮  [重选]    │
│  ┌─ 地图 (180px) ─────────────┐    │
│  │       📍 (可拖动的钉)        │    │
│  └────────────────────────────┘    │
│  坐标 28.1892, 113.0069  [重置]    │
└─────────────────────────────────────┘
```

### 区域锚定芯片

优先级 fallback：
1. 同 `day` 内其它活动的最高频 `cityname`
2. 同 `tour` 内所有活动的最高频 `cityname`
3. 空（不显示芯片）

行为：
- 默认开启，搜索默认带 `region_hint` 拉回当前区域
- 可 × 关掉（跨省加点场景）
- 可点击改（弹小 input）
- `near_lat` / `near_lng` 取当前 activity 坐标或同日其它活动质心

### 结果行排版

```jsx
<Combobox.Option>
  <Text fw={500}>{name}</Text>
  <Text size="xs" c="blue">{pname}·{cityname}·{adname}</Text>
  <Text size="xs" c="dimmed">{type}</Text>
  <Text size="xs" c="dimmed" lineClamp={1}>{address}</Text>
</Combobox.Option>
```

省市行主题蓝色——和灰色街道地址区分，让消歧义信息跳出来。

### 地图缩略图

- `AMap.Map` + `AMap.Marker(draggable: true)`，AMAP JS SDK 2.0
- 固定高 180px
- 禁缩放控件、允许滚轮缩放
- 钉拖动 → 更新 lat/lng，同步表单
- 点击地图空白 → 钉跳到点击位置
- `[重置]` 按钮：钉回到 POI 原始坐标

### Props 契约

```jsx
<LocationPicker
  value={{ name, lat, lng, address, pname, cityname, adname, type }}
  onChange={(next) => ...}
  regionHint={tourCity}
  nearbyCenter={{ lat, lng }}
  disabled={!canEdit}
/>
```

从 `onPick` 单向回调 → `value/onChange` 受控。父组件需要能读坐标微调后的状态。

### 双点模式（`mode="dual"`，road 抽屉用）

两个搜索框纵向堆叠（起点 / 终点），共享一张 240px 地图显示两个钉 + driving polyline。

```
位置 ─────────────────────────────
起点  [搜索地点 ...]
      ── 选中后 ──
      ✓ 独库公路南入口    [重选]
        新疆·阿克苏·库车市 · 景点

终点  [搜索地点 ...]
      ── 选中后 ──
      ✓ 独库公路北出口    [重选]
        新疆·伊犁·奎屯市 · 景点

┌─ 地图（240px，两钉+连线）─────┐
│       📍─────────────────📍   │
│     起点                终点   │
│   (两个钉均可拖动)             │
└───────────────────────────────┘

里程       120 km        AMAP: 118 km ↻
驾驶时长   2 时 30 分    AMAP: 2h25m  ↻
```

- 终点选中后，前端调后端 AMAP driving API 自动预填 `km` / `drive_min`
- 失败则留空由用户填，不阻塞保存
- 输入框右侧显示 AMAP 原始值，`↻` 一键回填

---

## Road 概念收敛

### RouteLeg 编辑 Modal

Planner 上点任意 dashed line 打开（不是 Drawer）：

```
┌─ 编辑驾驶段 ─────────────────────────┐
│  兰州黄河母亲像 → 刘家峡水库          │
│                                      │
│  距离    [120] km       高德: 118 ↻  │
│  时长    [2]时 [30]分   高德: 2h25 ↻ │
│                                      │
│  备注                                 │
│  [实际走了绕行路，多了 2km       ]    │
│                                      │
│  [重置为高德原始值]                   │
│  [取消]            [保存]             │
└──────────────────────────────────────┘
```

- AMAP 原始值灰字显示；`↻` 把原始值写回输入框
- `重置为高德原始值` 清空全部 override 字段
- 保存时写 `overridden_at = now`、`overridden_by_id = current_user.id`

### RoadConnector 视觉收敛

所有 dashed line 归一为 `route_leg` synthesized：

| 状态 | 视觉 |
|---|---|
| 未 override | 灰 dashed · 车图标 · `120km · 2h30m` |
| 已 override | 灰 dashed · 车图标 · `120km · 2h30m` + 右侧小 `已调整` 徽章 |
| 缺数据（AMAP 失败） | 灰 dashed · ⚠ 图标 · `无法计算 · 点击编辑` |

全部 `cursor: pointer`，hover 高亮，click 打开 Modal。

`RoadConnector.activity-backed` 分支整个删除。[`DayColumn.jsx:95,117-137`](../../app/javascript/components/planner/DayColumn.jsx) 里 `kind === 'road' && citizen_level !== 'tier_one'` branch 删除。

### Day 汇总改造

见"数据模型改动 / Day#driving_minutes_total"。核心：`route_legs`（override || original）+ `tier_one road activities.details.drive_min`。

### 景观公路数据结构

```
activity
├── kind: 'road', citizen_level: 'tier_one'  (DB check 强制)
├── name                 "独库公路"
├── lat, lng, address    ← 起点坐标拷贝（保持 NOT NULL 约束可用）
├── desc                 (备注)
└── details
    ├── start_lat, start_lng, start_name, start_address
    ├── end_lat,   end_lng,   end_name,   end_address
    ├── km            (自动预填 + 可改)
    ├── drive_min     (自动预填 + 可改)
    ├── road_type     ('高速'|'国道'|'省道'|'山路'|'城市')
    └── day_only      (仅白天通行)
```

迁移时老的 `from_name` / `to_name` → `start_name` / `end_name`；`km` / `drive_min` 原地保留。start/end 坐标和地址无老数据，首次打开抽屉由用户补。

### 景观公路抽屉其他段

与 2026-04-18 redesign 一致：
- 分类与时间：类型 Select 显示 `景观公路`；citizen_level 固定 tier_one 且只读；开始时间 + 游玩时长保留
- 备注：保留
- 类型细节：只剩 `road_type` / `day_only`，默认展开
- 参与人：保留

### KIND_OPTIONS 文案改动

`{ value: 'road', label: '路段' }` → `{ value: 'road', label: '景观公路' }`。

### 术语映射（全 codebase 一次改干净）

| 旧词 | 新词 | 含义 |
|---|---|---|
| 路段 (`activity.kind=road`) | 景观公路 | tier_one 用户主动建的体验段 |
| 路段 (`route_leg`) | 驾驶段 | 自动算的交通衔接 |

### Planner 上景观公路的渲染

- tier_one 景观公路 → 普通 ActivityCard（60px，car 图标，name 显示"独库公路 · 120km / 2h30m"）
- 驾驶段 → 统一的 RoadConnector dashed line

景观公路的 ActivityCard hover / click → 打开 road 抽屉（和其他 activity 一致）。

---

## 迁移策略

### 整体节奏

```
PR 1 (加法): 上线后低 tier road 仍按老方式显示
  ├── migration 1: route_legs 加 override 4 字段
  ├── 代码改动（LocationPicker 新老并存、新 road 抽屉、Modal、hybrid sum）
  └── rake task 代码（先不跑）

生产迁移执行（人工 gate）
  ├── pg_dump backup
  ├── DRY_RUN=1 跑 rake → review 报告
  ├── 停顿确认
  └── 真跑 rake（低 tier → override → 改 key 名 → 删 activity）

PR 2 (减法):
  ├── migration 2: 加 check constraint
  ├── 删旧渲染分支、删 PoiSearchCombobox
  └── 文案 sweep、测试清理
```

### Rake: 低 tier road → route_leg override

**输入**：`activities.where(kind: 'road').where.not(citizen_level: 'tier_one')`

**每条 A 处理**：
1. 取 A 所在 day 相邻活动：`prev` (position - 1)、`next` (position + 1)
2. 若 prev/next 不存在（A 是 day 首/末）→ 仅删 A，不迁移（没有对应 leg 可挂，数据丢失）
3. 若都在 → `RouteLeg::Upsert.call(from: prev, to: next)` 确保 leg 存在
4. 写 override：
   ```ruby
   leg.update!(
     distance_m_override: (A.details['km'].to_f * 1000).round,
     duration_s_override: (A.details['drive_min'].to_i * 60),
     note:                [A.name, A.desc].compact_blank.join(' · '),
     overridden_at:       Time.current,
     overridden_by_id:    A.tour.author_id,
   )
   ```
5. 同一 (prev, next) 对多条低 tier road（罕见）→ km/drive_min 累加；note 拼接

**产出报告**：
- 处理活动总数
- 成功迁移到 override 的 leg 数
- 孤立首/末低 tier road 数（数据丢失，列出 ID）
- 关联有 expense/image 的低 tier road（列出 ID，需人工确认）

**支持 `DRY_RUN=1`**：只产报告不改数据。

### Rake: tier_one road details keys 改名

```ruby
Activity.where(kind: 'road', citizen_level: 'tier_one').find_each do |a|
  d = a.details || {}
  d['start_name'] = d.delete('from_name') if d.key?('from_name')
  d['end_name']   = d.delete('to_name')   if d.key?('to_name')
  a.update_column(:details, d)
end
```

start/end 的坐标 + 地址暂不填；用户下次打开抽屉时前端检测到缺失会提示补全。

### Rake: 删除低 tier road activity

```ruby
Activity.where(kind: 'road').where.not(citizen_level: 'tier_one').find_each do |a|
  a.destroy!
end
Day.joins(:activities).distinct.find_each(&:renumber_activity_positions!)
Tour.find_each { |t| RouteLegsBatch.refresh!(t) }
```

`renumber_activity_positions!` / `RouteLegsBatch.refresh!` 为假设接口名，实际以代码为准。

### Rollback 能力

| 操作 | 可否回滚 |
|---|---|
| Migration 1（加 override 列） | 可 |
| 低 tier road 迁移到 override | **不可**（源数据 destroy 后不可还原，需靠 backup） |
| 位置重排 | **不可** |
| Check constraint | 可（`remove_check_constraint`） |

安全网：
- 生产跑 rake 前 `pg_dump` backup 是硬性步骤
- Dry run 报告必须人工 review 后才跑真的
- 每个 rake 单条事务包裹，部分失败不阻塞已成功记录

### 代码清理清单（PR 2 中执行）

**前端**：
- [`DayColumn.jsx:95,117-137`](../../app/javascript/components/planner/DayColumn.jsx) —— 低 tier road → RoadConnector 分支删除
- [`RoadConnector.jsx`](../../app/javascript/components/planner/RoadConnector.jsx) —— `activity-backed` 分支整个删除，精简为只接 `route_leg` 数据源
- [`detailsSchema.js`](../../app/javascript/components/activity-editor/detailsSchema.js) —— `road` 数组 `from_name`/`to_name` → `start_name`/`end_name`；其他保留
- [`PoiSearchCombobox.jsx`](../../app/javascript/components/activity-editor/PoiSearchCombobox.jsx) —— 整文件删除（被 LocationPicker 全替代）

**后端**：
- [`app/models/day.rb:9-11`](../../app/models/day.rb) —— 旧 `driving_minutes_total` 替换为 hybrid sum
- [`app/ai_tools/add_activity.rb`](../../app/ai_tools/add_activity.rb) —— 若允许非 tier_one road 的路径，改为强制 tier_one
- 测试 factories：[`spec/factories/`](../../spec/factories) 若默认造非 tier_one road，修正

**文案**：
- 全 codebase 搜 `路段`，按术语映射替换
- README / CLAUDE.md / 相关 spec docs 旧术语

**测试**：
- `spec/models/day_spec.rb` 里 `driving_minutes_total` 加 route_leg 场景
- `spec/models/route_leg_spec.rb` 加 override 字段覆盖
- 前端 `DayColumn.test.jsx`、`RoadConnector.test.jsx` 删 activity-backed 用例

---

## 实施顺序

### PR 1｜加法（可安全上线）

| # | 任务 | 依赖 |
|---|---|---|
| 1 | Migration: `route_legs` 加 override 字段 | — |
| 2 | `PoiSearch#search` 返回 pname/cityname/adname/pcode | — |
| 3 | `LocationPicker` `mode="single"`（含地图 + 拖钉） | 2 |
| 4 | 非 road 抽屉把 `PoiSearchCombobox` 替换为 `LocationPicker` | 3 |
| 5 | `LocationPicker mode="dual"` + AMAP driving 自动预填 | 3 |
| 6 | Activity `before_save` 镜像 `lat/lng ← details.start_*`（景观公路） | — |
| 7 | `RouteLeg::Upsert` 景观公路感知（解析 from/to 坐标 + digest 改哈希输入） | 6 |
| 8 | Road 抽屉改双 POI 模板（含术语改）；强制 tier_one | 5, 6, 7 |
| 9 | RouteLeg 编辑 Modal | 1 |
| 10 | `Day#driving_minutes_total` hybrid sum | 1, 7 |
| 11 | 数据迁移 rake 任务（写好，先不跑） | 1, 10 |

### 生产迁移执行（人工 gate）

12. `pg_dump` backup
13. `DRY_RUN=1` 跑 rake → 人工 review 报告
14. **停顿**，明确确认后再继续
15. 真跑 rake（低 tier → override → 改 key 名 → 删 activity）
16. Spot-check Planner 显示

### PR 2｜减法

| # | 任务 | 依赖 |
|---|---|---|
| 17 | Migration: check constraint `kind=1 → citizen_level=0` | 迁移执行完 |
| 18 | 删 `DayColumn.jsx` 低 tier road 分支 | 17 |
| 19 | 删 `RoadConnector.jsx` activity-backed 分支 | 17 |
| 20 | 删 `PoiSearchCombobox.jsx` | 4 |
| 21 | 文案 sweep：路段 → 景观公路 / 驾驶段 | — |
| 22 | 测试 / fixtures 清理 | 17 |

### 体量估计

- PR 1：~15-20 文件，后端 ~200 行，前端 ~500 行，rake ~200 行，测试 ~300 行
- PR 2：~10 文件，减的比加的多
- 迁移执行：~30 分钟（含 review）

### 可并行子任务

- 任务 1 和 任务 2 并行
- 任务 9（Modal）和 任务 5/6/7/8 并行
- 任务 21（文案 sweep）可独立

### 风险

- **AMAP JS SDK 首次加载延迟**（180px 地图白屏 ~1s）—— LocationPicker 内部用 skeleton placeholder 盖住
- **AMAP driving 实时拉取失败** —— 留空由用户手填，不阻塞
- **迁移边界 case**：day 首/末的低 tier road 无相邻对迁移，数据直接丢。Dry run 报告先列出。

---

## 相关文档

- 2026-04-18-activity-drawer-redesign-design.md（抽屉三段式结构的上一轮）
- 2026-04-16-tranche-a-remediation-design.md（`PoiSearchCombobox` 的上一轮）
- 2026-04-15-tour-day-activity-remodel-design.md（activity/route_leg 初始设计）
