# Tranche B — Planner 打磨 + 全程年表视图

**Status**: Design approved 2026-04-16 · awaiting implementation plan
**Source**: 接 Tranche A 落地后的 polish 阶段
**Scope**: 5 个子块——drag 可靠性、drop preview、backlog 筛选、day header 元数据、全程年表页
**参考原型**: `docs/superpowers/specs/2026-04-15-tour-day-activity-remodel-wireframes.html`（Screen 5 Planner · Screen 11 全程年表）

---

## 背景

Tranche A 修完 3 件 Critical 阻塞项（activity 编辑、宪法违反闭环、membership UI），Planner 达到 MVP 可用。Tranche B 把剩下的打磨做完：

- **拖拽体验**：目前拖拽过程没有 ghost card，失败靠 `alert()` 打断，长距离拖拽要手动滚动
- **Drop 精度**：拖到 day column 时只有整列变蓝，不知道会插到第几位
- **Backlog 可用性**：wireframes 设计了 kind + level 两个筛选下拉，当前没实现
- **Day header 信息稀薄**：只有 `D1 | 2024-05-01`，原型里还有 intensity 色点、星期、theme 副标题
- **年表视图缺失**：wireframes 的 Screen 11（全程横向时间线 + 节奏条 + 汇总条）完全没做——这是产品目标点 2 "年表化显示每日行程"的直接体现

Tranche C 的 AI onboarding 不在本 spec 范围。

---

## 0 · 子块依赖关系

```
Section 1 (Drag 可靠性)
    └── Section 2 (Drop preview) — 共享 ActivityCard dnd hooks

Section 3 (Backlog 筛选) — 独立

Section 4 (Day header 元数据) — 独立，但被 Section 5 复用
    └── Section 5 (全程年表页) — 依赖 intensity_derived
```

交付顺序建议：1 → 2 → 3 → 4 → 5。每 Section 独立 commit、独立可发布。

---

## 1 · Drag 可靠性

### 1.1 DragOverlay（ghost card 跟光标）

`Show.jsx` 里 `DndContext` 追踪 `activeId`，`onDragStart` 设 `activeId = active.id`，`onDragEnd` / `onDragCancel` 清掉。`<DragOverlay>` 根据 activeId 查找 `activities` 找到被拖的 activity，渲染一份 `<ActivityCardOverlay>`——结构与 `ActivityCard` 一致但：

- 不使用 `useDraggable` / `useDroppable` hooks
- 不接收 `onClick` / `readOnly`（overlay 不响应事件）
- 多 `boxShadow: '0 4px 12px rgba(0,0,0,0.15)'` 和 `transform: 'rotate(2deg)'` 让它"浮起来"

原卡片保持现有的 `opacity: 0.4` 淡化。

### 1.2 自动滚动

`DndContext` 传 `autoScroll={{ acceleration: 10, threshold: { x: 0.15, y: 0.15 } }}`。关键是 `x: 0.15`——days timeline 是横向滚动容器，默认阈值只适合纵向。拖到可见区域外 15% 的位置时，容器自动滚动让目标区域进入视野。

### 1.3 乐观更新 + 回滚

Show.jsx 维护 `localOverrides` map: `{ [activityId]: { day_id, position } }`。渲染前合并：

```
displayActivities = activities.map(a =>
  localOverrides[a.id] ? { ...a, ...localOverrides[a.id] } : a
)
```

`handleDragEnd` 流程：
1. 立即 `setLocalOverrides(prev => ({ ...prev, [activityId]: { day_id: toDayId, position: toPosition } }))`——UI 立刻显示新位置
2. 发 `router.patch('/activities/:id/position', ...)` 到服务端
3. `onSuccess`：清掉该 activity 的 override（服务端 props 已更新，让它接管）
4. `onError`：清掉该 activity 的 override（回到原位）+ 弹 toast

中间可能出现一瞬间"位置跳"——服务端的 `ActivityPositionsController` 会 re-shift 其他 activity 的 position。这个跳是不可避免的小瑕疵，只要 `onSuccess` 尽快到来就不明显。

**不处理**并发拖拽（多个 drag 同时 in-flight）——dnd-kit 本身禁止多手指/多指针并发。

### 1.4 Toast 错误替代 alert

去掉 `handleDragEnd` 里的 `alert('拖拽未保存，请重试')`。改用 `notifications.show({ message: '拖拽未保存，请重试', color: 'red' })`——`@mantine/notifications` 已在 Tranche A Task 6 装好，`<Notifications />` 已挂在 `inertia.jsx`。

### 1.5 文件清单

**修改**：
- `app/javascript/pages/Tour/Show.jsx` — 加 `activeId` / `localOverrides` state、改 `<DndContext>` props、加 `<DragOverlay>`、改写 `handleDragEnd`
- `app/javascript/components/planner/ActivityCard.jsx` — 导出一个 `ActivityCardOverlay` named export（或在 Show.jsx 里内联一个简化版）
- `app/javascript/pages/Tour/__tests__/Show.test.jsx` — 扩展 `@dnd-kit/core` mock 加 `DragOverlay`

**新建**：无

### 1.6 测试

Vitest 新增（在 Show.test.jsx）：
- DragOverlay 在 activeId set 时渲染 ghost card（mock DragOverlay 返回 children）
- 乐观更新：派发 onDragEnd 后 UI 立刻反映新 day_id（不等 router mock 返回）
- onError 回调回滚 localOverrides + 调 notifications.show（mock @mantine/notifications）

---

## 2 · Drop preview 插入线

### 2.1 行为

拖拽过程中，`ActivityCard` 的 `isOver` 为 true 时，在卡片**顶部**渲染一条蓝色细线（3px），视觉语义："松手会插到此卡之前"。

容器级别（`BacklogList` / `DayColumn`）的 `isOver` 蓝底保留但调**淡**——从 `#e8f0fb` 改到 `#f0f7ff`。作用是"告诉你这个列接受 drop"，不和 insert line 抢视觉焦点。空 day column（无 card 可触发卡片级 isOver）时，容器级蓝底是唯一指示，此时松手按容器 `data.position` 插到末尾。

### 2.2 实现要点

`ActivityCard` 根 div `position: relative`。`isOver` 为 true 时渲染一个绝对定位 div：
- `top: -3`（贴在卡片上边界上方，不挤压布局）
- `height: 3px`
- `background: #1677ff`
- `borderRadius: 2px`
- `boxShadow: 0 0 6px rgba(22, 119, 255, 0.4)`
- `pointerEvents: 'none'`（不拦截拖拽事件）
- `data-testid="drop-indicator"` 方便测试

去掉 `ActivityCard` 当前 style 里的 `background: isOver ? '#dbeafe' : ...`——背景改为纯色（tier_one 的 `#fffaf0`、road-infra 的 `#f5f5f5`、默认 `#fafafa`）。

### 2.3 文件清单

**修改**：
- `app/javascript/components/planner/ActivityCard.jsx` — 加 insert indicator 渲染 + 去掉 isOver 背景
- `app/javascript/components/planner/BacklogList.jsx` — isOver 背景色 `#e8f0fb` → `#f0f7ff`
- `app/javascript/components/planner/DayColumn.jsx` — 同上
- `app/javascript/components/planner/__tests__/ActivityCard.test.jsx` — 加 insert-indicator 测试（需局部 mock `useDroppable` 返回 `{ isOver: true }`）

### 2.4 测试

- `ActivityCard` 在 `isOver: true` 时渲染 `data-testid="drop-indicator"`
- `isOver: false` 时不渲染
- 拖拽源 card（`isDragging: true`）有 `opacity: 0.4` 保持不变

---

## 3 · Backlog 筛选

### 3.1 UI

`Backlog（候选池）` 标题下方、`+ 加一个` 按钮上方，水平放两个 Mantine `Select`（size="xs", width=100）：
- **按类型**：所有类型 / 景 / 路 / 食 / 住 / 油 / 其他
- **按等级**：所有等级 / 一等 / 二等 / 三等 / 基础

任一选中后生效；再次选回"所有"解除该筛选。两个筛选是**AND**关系。

标题旁显示 `filtered.length/total.length` 的计数（只在任一筛选激活时显示）。

### 3.2 状态

纯前端 `useState`——刷新页面重置（YAGNI：不存 URL 也不存 localStorage）。

### 3.3 空态

- `activities.length === 0`（真的没候选）→ "尚无候选。可手动添加或让 AI 帮忙。"
- `filtered.length === 0 && activities.length > 0`（被筛掉了）→ "无匹配的候选。调整筛选或清空条件。"

### 3.4 Drop target 语义

筛选不影响 backlog 作为 drop target。`useDroppable` 的 `data.position` 用 `activities.length + 1`（真实总数），不是 `filtered.length + 1`——否则拖进来后会被插到被筛掉的 activity 后面，backend position 乱掉。

### 3.5 ReadOnly 模式

reader 也能筛选（看数据用的）。readOnly 只影响"+ 加一个"按钮和 activity 卡的点击行为，和 backlog 本身无关。

### 3.6 文件清单

**修改**：
- `app/javascript/components/planner/BacklogList.jsx` — 加两个 Select + useState + useMemo filter

**新建**：
- `app/javascript/components/planner/__tests__/BacklogList.test.jsx` — 目前没有这个测试文件

### 3.7 测试

4 条 vitest：
- 无筛选渲染所有 activity
- 按 kind 筛选只渲染匹配的
- 按 level 筛选只渲染匹配的
- 过滤结果为空时显示"无匹配的候选"提示

Mantine Select 测试时建议用 `userEvent.click` + 点 option（不是 fireEvent.change），参考 ActivityDrawer 测试里的先例。

---

## 4 · Day header 元数据

### 4.1 列头三要素

Day 列头重新设计为两行：

```
● D1 · 05-01 周三
  抵达伊宁（适应日）
```

- 第一行：intensity dot（彩色圆点，直径 10px）· `D{day_index}` · 日期 · 星期
- 第二行：`theme` 字段（有值才显示；没有则第一行独占）

整个 header 区域 `cursor: pointer`，点击打开 `DayEditModal`（reader 模式下 pointer → default，点击无反应）。

### 4.2 Intensity 派生（后端）

新建 `Day#intensity_derived(violations)` 方法——参数是预先计算好的 `Tour::ConstitutionCheck` 结果数组，避免 N+1：

派生规则（优先级从上到下）：
1. `buffer_day == true` → `:green`（压倒一切）
2. violations 里有 hard 且 scope 指向本 day（`day_id == id` 或 `day_index == day_index`——同时兼容现存两种 scope 键） → `:red`
3. `driving_minutes_total < 120` → `:green`
4. `driving_minutes_total <= 360` → `:yellow`
5. 其他 → `:red`

返回 `:green` / `:yellow` / `:red` symbol。**不写回 DB**——纯读方法。

已承认的违反（Tranche A 的 constraint_overrides 机制）自动处理——`Tour::ConstitutionCheck` 已在内部 `reject { |v| overridden?(v) }`，所以传给 `intensity_derived` 的 violations 已经不含被承认的违反。承认过的 hard violation 不会再把 day 染红。

现存的 `days.intensity` integer 列保留不动，目前前端不读——预留给后续 manual override。

### 4.3 前端 props 结构

`ToursController#show` 改造 `days.as_json`：

```ruby
tour_violations = Tour::ConstitutionCheck.for(@tour).map(&:to_h)
render inertia: "Tour/Show", props: {
  ...
  days: @tour.days.map { |d| d.as_json.merge("intensity_derived" => d.intensity_derived(tour_violations).to_s) },
  violations: tour_violations,
  ...
}
```

Timeline controller（Section 5）也复用这一逻辑——可以抽成 `Tour#days_with_intensity` 或模型层 helper。

### 4.4 DayEditModal

Mantine Modal，title="编辑 Day {n}"，size="sm"。字段：

- `theme` — Textarea, minRows=1, maxRows=3, label="主题 / 副标题", placeholder="例如：抵达伊宁（适应日）"
- `date` — DateInput (Mantine), label="日期", optional
- `buffer_day` — Checkbox, label="机动日（缓冲，不排入核心 activity）"
- 底部：左侧 `删除本日`（红色 subtle，带确认）· 右侧 `取消` / `保存`

保存走 `router.patch('/tours/:tour_id/days/:day_id', { day: {...} }, { only: ['days', 'activities', 'violations'] })`。删除走 `router.delete('/tours/:tour_id/days/:day_id', { only: ['days', 'activities', 'violations'] })`——确认 modal 先弹 modals.openConfirmModal。

### 4.5 DaysController 支持

现有 `DaysController` 在 routes 里已暴露 update / destroy，检查 controller 是否允许 permit `theme`, `date`, `buffer_day`。不允许就在 `day_params` 里加。

### 4.6 文件清单

**修改**：
- `app/models/day.rb` — 加 `#intensity_derived(violations)` 方法
- `app/controllers/tours_controller.rb` — show action 里 days.as_json 带 intensity_derived
- `app/controllers/days_controller.rb` — 确认 permit 列表包含 theme/date/buffer_day（不在则加）
- `app/javascript/components/planner/DayColumn.jsx` — 列头重绘（intensity dot + 日期/星期 + theme + onClick）
- `app/javascript/pages/Tour/Show.jsx` — 加 editingDay state + 渲染 DayEditModal

**新建**：
- `app/javascript/components/planner/DayEditModal.jsx`
- `app/javascript/components/planner/__tests__/DayEditModal.test.jsx`
- `spec/models/day_spec.rb`（如果还不存在）+ intensity_derived 测试
- `spec/requests/tours_spec.rb` 加 day intensity_derived 出现在 show props 的断言

### 4.7 测试

**Ruby**：
- `Day#intensity_derived`：buffer_day 永远 green、hard violation 永远 red（即使 buffer_day=false）、驾驶时间分档（<120 green / 120-360 yellow / >360 red）、buffer_day vs hard violation 的优先级（spec 里 buffer_day 赢）

**JS**：
- DayColumn 渲染 intensity dot（按 prop 颜色）
- theme 有值时显示第二行、无值时不显示
- 点击 header 调用 onEditDay callback
- readOnly 时点击无反应
- DayEditModal 4 条：渲染已填字段、保存调 router.patch、删除调 router.delete、确认取消保留原值

---

## 5 · 全程年表页 `/tours/:id/timeline`

### 5.1 页面布局（自上而下）

```
┌──────────────────────────────────────────────────────────┐
│ [Planner] [年表] [宪法]  ← TourTabs                      │
├──────────────────────────────────────────────────────────┤
│ 【10 天】 【34 activity】 【18 一等·≤3/日】 【1 buffer·≥1/程 ✅】 【1 hard · 2 soft】 │  ← SummaryBar
├──────────────────────────────────────────────────────────┤
│ [D1绿][D2黄][D3红⛔][D4黄][D5黄][D6绿buffer][D7黄][D8红][D9黄][D10绿]  │  ← RhythmBar
├──────────────────────────────────────────────────────────┤
│ ┌──D1──┐┌──D2──┐┌──D3──┐┌──D4──┐┌──D5──┐┌──D6──┐...     │
│ │ 10:00││ 10:00││ 09:30││ 10:30││ 10:00││  机动 ││...     │  ← Days timeline
│ │ 早餐 ││ 早餐 ││ 早餐 ││ 巴→那││ 短途 ││  日   ││...     │    (横向滚动)
│ │ ...  ││ ...  ││ ...  ││ ...  ││ ...  ││       ││...     │
│ └──────┘└──────┘└──────┘└──────┘└──────┘└──────┘         │
├──────────────────────────────────────────────────────────┤
│ D2 详情（点击列头展开）                                  │
│ 08:00 │ (体感 6 点)                                      │
│ 10:00 │ [三等·食 早餐 60 min]                            │
│ 11:00 │ [基础·路 伊宁→赛里木湖 150 min]                  │
│ 14:00 │ [一等·景 赛里木湖 240 min]                       │  ← DayDetailPanel
│ ...                                                      │
│ 当日汇总：驾驶 390/420 min ✓ · 一等 2/3 ✓               │
└──────────────────────────────────────────────────────────┘
```

### 5.2 SummaryBar

5 个数字单元（参考 wireframes line 1736-1742）：

| 单元 | 来源 |
|---|---|
| `{days.count}` 天 | `@tour.days.count` |
| `{activities.count}` 个 Activity | `@tour.activities.count` |
| `{tier_one_count}` 个一等 · ≤ {max}/日 | 从 constitution 查 `max_tier_one_per_day` |
| `{buffer_count}` 个 buffer day · ≥ {min}/程 | 从 constitution 查 `min_buffer_days`；符合打 ✅ |
| `{hard_count} hard · {soft_count} soft` 宪法违反 | 从 violations 数 |

有违反时第 5 单元文字变红（`color: var(--red)`）。

### 5.3 RhythmBar

一条水平色块。每天一个 slot（flex: 1）：
- 背景色按 `intensity_derived`：green `#e8f5e9`、yellow `#fff8e1`、red `#ffebee`
- slot 内文字：`D{n}` + meta（`buffer_day` → "机动"/"适应日"、有硬违反 → "⛔"、否则 → `{drive_h}h`）
- `buffer_day` slot 边框虚线
- 有硬违反的 slot 加 `outline: 2px solid var(--red)`
- 点击 slot → 滚动 days timeline 到对应 day column（`scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' })`）+ 设为选中态
- 点击 slot 同时触发下方 DayDetailPanel 展开该日

### 5.4 Days timeline（主体）

横向滚动容器。每个 day 一列（`TimelineDayColumn.jsx`）：

- **Header**（紧凑两行）：
  ```
  D{n} · {date} {weekday}
  {theme}
  ```
  buffer_day 时 header 加 "buffer" 灰色小 badge；选中态（shared state with RhythmBar）加蓝色外边框。

- **Body**：按 `position` 顺序列出 activity（而不是按 `planned_start_at` 排序——以编辑顺序为准）。每张"精简卡"：
  ```
  {time} · {duration}min
  {等级·kind} {name}
  ```
  citizen_level 着色：tier_one 黄底、tier_two 正常、tier_three 灰、infrastructure 灰+italic

- **Footer**：
  ```
  驾驶 ████░ 6/7h ✓
  核心 ██░ 2/3
  ```
  复用 Planner DayColumn 的 progressBar 函数

- **点击 activity 卡** → `router.visit('/tours/${tour.id}#activity-${a.id}')` 跳 Planner，Planner 解析 hash 自动打开 ActivityDrawer（edit 模式）
- **点击 header**（非卡片区域）→ 选中该 day + 展开 DayDetailPanel

### 5.5 DayDetailPanel

Timeline 下方。只在有选中 day 时渲染。

两列 grid：
- 左列 60px：时间刻度（08:00, 10:00, 11:00, ...）——取当天所有 activity 的 `planned_start_at` 集合 + 最早时刻前一小时作为起点、最晚时刻后两小时作为终点，每小时一行
- 右列：按刻度对齐贴 activity（若某刻度上没 activity 就空白）
- 起点前一格如果 < 08:00，显示 italic 灰色注释："（体感才早上 6 点，太阳还没升；伊犁比北京晚约 2h）"——**非必须**（YAGNI），不实现

底部一行汇总：`驾驶 {total}/{max} min ✓|⛔ · 一等 {count}/{max} ✓|⛔`。值取 `Day#driving_minutes_total` / `Day#tier_one_count`，上限从 `tour.constitution` 查。

### 5.6 TourTabs 顶部导航

复用组件：`<TourTabs tour={tour} active="planner" | "timeline" | "constitution" />`。

样式：Mantine `Tabs`（或手撸简版）。Router 用 Inertia `<Link>` 触发 page transition，不是 `router.visit`（避免闪动）。

插入到 3 个页面的顶部：
- `Planner Show.jsx` — 在 `ConstitutionBanner` 上方、tour title + 成员 button 这行之后
- `Tour/Timeline.jsx` — 页面顶部（members button 不放 Timeline，简化）
- `Tour/Constitution.jsx` — 页面顶部

### 5.7 Controller + routes

- `config/routes.rb` 在 `resources :tours do` 块里加：
  ```ruby
  resource :timeline, only: [:show], controller: "tours/timelines"
  ```
- 新建 `app/controllers/tours/timelines_controller.rb`：
  - `before_action :require_login, :set_tour`
  - `show` 检查 `@tour.visible_to?(current_user)`（reader + editor + author 都可看）
  - Render `inertia: "Tour/Timeline"` with props：
    - `tour`
    - `days`（带 intensity_derived + theme）
    - `activities`
    - `violations`
    - `summary`: `{day_count, activity_count, tier_one_total, tier_one_limit, buffer_count, buffer_min, hard_count, soft_count}`

Summary 的计算最好放 Tour 模型或 PORO（`Tour::TimelineSummary.for(tour)`）避免把业务逻辑塞 controller。

### 5.8 Reader 模式

Timeline 页**不区分**权限——所有 viewer 看到相同内容。Timeline 本身 view-only，点击 activity 跳 Planner，Planner 按自己的 readOnly 逻辑处理。

### 5.9 性能

10 天 × ~30 activity 量级——不虚拟化。DndContext 不挂在 Timeline（没有拖拽）。

### 5.10 文件清单

**后端**：
- `app/controllers/tours/timelines_controller.rb` 新建
- `app/models/tour/timeline_summary.rb` 新建（PORO，包一个类方法 `.for(tour)`）
- `config/routes.rb` 加 `resource :timeline`
- `spec/requests/timelines_spec.rb` 新建
- `spec/models/tour/timeline_summary_spec.rb` 新建

**前端**：
- `app/javascript/pages/Tour/Timeline.jsx` 新建
- `app/javascript/components/timeline/TourSummaryBar.jsx` 新建
- `app/javascript/components/timeline/RhythmBar.jsx` 新建
- `app/javascript/components/timeline/TimelineDayColumn.jsx` 新建
- `app/javascript/components/timeline/DayDetailPanel.jsx` 新建
- `app/javascript/components/tour/TourTabs.jsx` 新建
- `app/javascript/pages/Tour/Show.jsx` 顶部插 TourTabs
- `app/javascript/pages/Tour/Constitution.jsx` 顶部插 TourTabs

各自 `__tests__/` 下的 vitest。

### 5.11 Hash anchor 对接 Planner

`Show.jsx` 在 mount 时检查 `window.location.hash`，若匹配 `#activity-{id}` 就自动 `openEdit(id)`。该 hash 的功能非 Timeline 强依赖——没对接也不影响 Timeline 本身使用。

---

## 6 · 共用约束 / 边界

- 所有新 controller action `require_login` + 适当的 `visible_to?` / `editable_by?` 检查
- 不引入新 npm 依赖——Mantine 9 的 Tabs、DateInput（在 `@mantine/dates`，Tranche A 已装）够用；`@mantine/dates` 若未装则这是唯一新增
- 不引入新 Ruby gem
- 每个新 controller 至少 3 条 request spec（happy / not-visible / 404）；每个新 React 组件 ≥ 3 条 vitest
- 新增 DateInput 要检查 `@mantine/dates` 是否在 package.json；不在则补装 + 全局 `DatesProvider` 挂到 `inertia.jsx`
- **不做的**：
  - Timeline 里拖拽编辑
  - Rhythm bar 的 tooltip
  - DayDetailPanel 的"体感时间"提示
  - Intensity 手动 override UI
  - Backlog 筛选持久化（URL / localStorage）
  - Timeline 移动端响应式（wireframes 说 <1024px 可看 Timeline，但本 spec 不特殊处理——桌面端 responsive 自适应）
  - Reader 的 Timeline 特殊视图

---

## 7 · 数字预估

| 新增 | 修改 |
|---|---|
| 5 JSX 组件（Timeline 系列）+ 1 JSX（TourTabs）+ 1 JSX（DayEditModal）| 5 JSX（Show, Constitution, BacklogList, DayColumn, ActivityCard）|
| 5 .test.jsx | 2 .test.jsx（ActivityCard, Show）|
| 1 Ruby controller + 1 PORO + 2 specs | 3 Ruby（tours_controller, days_controller, day model）+ 2 specs |
| 1 Inertia 页（Timeline.jsx）| routes, inertia.jsx（若装 @mantine/dates）|
| **总**: ~13 新文件 | ~10 修改文件 |

RSpec 预期 +8（Day intensity_derived ×5、TimelineSummary ×3、timelines#show ×3、tours show intensity_derived prop ×1）。Vitest 预期 +18（BacklogList ×4、DayColumn header ×4、DayEditModal ×4、ActivityCard drop-indicator ×2、Show drag overlay ×3、Timeline 组件 ×各 3）。

---

## 8 · 交付顺序建议（实施计划阶段细化）

1. **Section 1 · Drag 可靠性** — 纯前端改造 Show.jsx + ActivityCard；最容易独立 review
2. **Section 2 · Drop preview 插入线** — ActivityCard 加一段条件渲染，立即让 #1 的拖拽体验更完整
3. **Section 3 · Backlog 筛选** — 独立前端 + 测试，不碰后端
4. **Section 4 · Day header 元数据 + DayEditModal** — 先落地 `Day#intensity_derived` 后端（含 spec），再前端；含 `@mantine/dates` 如需补装
5. **Section 5 · 全程年表页** — 最大块：后端 TimelineSummary PORO + controller + route + 5 个前端组件 + TourTabs。分 5.1-5.11 子步骤细化到 plan

每 Section 一个 commit（Section 5 可能拆多个）。

---

## 附：已知后续（**不**在本 spec）

- Tranche C: AI 多轮 onboarding、backlog 空态双 CTA、自动建 D1
- Timeline 拖拽编辑 · Rhythm bar tooltip · 体感时间提示
- Intensity 手动 override
- Backlog 筛选持久化
- Timeline 移动端专门视图（< 1024px）
