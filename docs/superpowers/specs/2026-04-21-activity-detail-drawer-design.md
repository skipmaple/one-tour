# Activity 详情抽屉（ActivityDetailDrawer）

**Status**: Design approved 2026-04-21 · awaiting implementation plan
**Scope**: 新的"活动详情查看"抽屉，作为所有角色（author / editor / reader）点击活动卡片的统一入口；内含"记一笔"快捷入口和"编辑"次级入口；同步放开 reader 对活动详情的访问权限
**Source**: 2026-04-21 brainstorming（用户发现 reader 点卡片无反应、editor 也没有纯查看视角、且没有直接从 activity 记账的快捷路径）

---

## 背景

三个相互关联的缺口一次性解决：

1. **Reader 点击活动卡片无反应** — `ActivityCard#handleBodyClick` 有 `readOnly` gate，reader 看不到活动详情（只能看到卡片上裸露的 4 格 meta）
2. **Editor 没有"纯查看"视角** — 点卡片直接进编辑抽屉，想扫一眼信息也要进入带 tabs、带验证、带保存按钮的编辑态
3. **从 activity 无快捷记账入口** — 要从"活动卡片"走到"给这个活动记一笔"需 ExpenseDrawer → 记一笔 → dialog 里再选 activity，三步

---

## 1 · 决策汇总

| 决策点 | 选择 | 理由 |
|---|---|---|
| 解决方式 | **新建独立"详情抽屉"组件**，和既有 ActivityDrawer 并存 | 单一组件承担"查看+编辑"两种态会让 600 行的 ActivityDrawer 继续肥大；查看和编辑的心智不同，强行合并拖累两边 |
| 卡片点击路由 | **所有角色点 → 详情抽屉**（editor 从详情点"编辑"再进编辑抽屉）| "记一笔"有唯一 home；editor 多一步点击换回"纯查看"能力；避免编辑/查看心智混叠 |
| 内容布局 | **单栏滚动 6 段**（头部 / 地点+小地图 / 介绍 / 图集 / 参与人 / 账单）| 查看场景强调"扫一眼全貌"；tabs 把内容藏在点击后面反模式 |
| "记一笔"位置 | **Header + 账单段落底部**两处都放 | 可发现性优先于视觉最小；header 常驻不依赖滚动，段落内按钮在语境上紧挨已有账单 |
| "编辑"位置 | **Header 右上 subtle 按钮** | 次级操作，不与主 CTA"记一笔"争；editor 之前"点卡片直接进编辑"的习惯改变，用顶部按钮承接 |
| 可选内容 | **含小地图，不含路线 leg** | 地图给读者地点感，成本低复用现有 AMap；路线 leg 依赖"上下站"上下文，在单活动详情里意义模糊 |
| 数据来源 | **全部来自 Tour/Show 既有 payload** | 无新 API、无 backend 改动 |
| 权限 | **`canEdit` 前端 gate 即可**；后端现有 `require_editor` 兜底 | 和既有约定一致 |

---

## 2 · UI 结构

### 入口 / 路由变更

- 卡片点击：所有角色 → 详情抽屉（原先 editor 进编辑抽屉、reader 无反应，**两条路径都改走详情**）
- `ActivityCard` 内部 `handleBodyClick` 的 `readOnly` gate 移除（reader 的 `onClick` 不再被吞）
- Tour/Show.jsx 新增 `detailViewer = { open, activityId }` state，和既有 `editor` state 互斥（打开详情时关编辑，点详情里的"编辑"时关详情开编辑）

### 抽屉壳

- 新组件：`app/javascript/components/planner/ActivityDetailDrawer.jsx`
- Mantine `<Drawer position="right" size={480}>`（比编辑抽屉的 520 窄一点，视觉上标识"这不是编辑抽屉"）
- Header 区和内容区，无底部 footer
- Esc / 点击遮罩 / 点 [X] 关闭

### Header
```
┌──────────────────────────────────────────────────┐
│  赛里木湖                                        │
│  D1 · scenic · tier_two · 14:00 · 2h            │
│                                                  │
│                     [+ 记一笔] [编辑] [X]        │
└──────────────────────────────────────────────────┘
```
- 活动名（`<Title order={3}>`）+ 元信息行（day_index 胶囊 / kind / citizen_level / 时间 / 时长）
- Backlog 活动（`day_id === null`）：day_index 胶囊替换为 "候选池"
- 按钮：
  - `[+ 记一笔]`：primary filled，`IconPlus` + 文字
  - `[编辑]`：subtle，`IconPencil` + 文字
  - `[X]`：Mantine Drawer `withCloseButton` 提供
- `canEdit=false`（reader）时 `[+ 记一笔]` 和 `[编辑]` 都不渲染，Header 只剩 [X]

### 内容段落（从上到下，单栏 Stack，段间 Divider）

**2.1 头部段落**（实际并入 Header 上方的 Title + 元信息，无独立 section；此条作为占位保留编号）

**2.2 地点**
- 地址（全角）+ 经纬度 + kind-specific 字段（altitude / ticket_info / price_pp / recommend_stay_min / km / drive_min / next_station_km —— 按 `detailsSchema[kind]` 渲染）
- 小地图：160px 高，复用 planner 主视图同款 AMap 组件，中心在 `activity.lat/lng`，zoom=14，单个 marker，`disableZoom disableDrag`
- 无坐标时：不渲染小地图，地址区显示 "（未定位）"

**2.3 介绍**
- `activity.desc` plain text，CSS `white-space: pre-wrap` 保留换行
- 空值：整段不渲染（无占位 "（无介绍）"）

**2.4 图集**
- 横向滚动缩略图行，每张 80px 见方
- 点击打开既有 `ActivityGalleryLightbox`（传 `activity_images` + 起始 index）
- 空列表：整段不渲染

**2.5 参与人**
- 标题 "参与人 · N 人"（N = `effectiveParticipants(activity, {author, members}).length`）
- `isFullRoster(activity) === true`（`participant_user_ids` 空）→ 一行文字 "默认全员（3 人：Alice / Bob / Cindy）"
- 非空 → 纵向列表，每行 `<UserLabel>`（头像 + 姓名 + 作者标签）
- 只读；改参与人走 [编辑] → ActivityDrawer 的"参与人" tab

**2.6 账单**
- 标题 "账单 · 共 ¥X · N 笔"（X 和 N 由 `tour.expenses.filter(e => e.scope === 'activity' && e.activity_id === activity.id)` 计算）
- 列表：每条 expense 一行，内容 `¥{amount} {category} {payer.name}付 · {split_summary}`
- 点击某条 → 打开 ExpenseDrawer 并聚焦该条（见 §4 数据流）
- 空状态：文字 "还没有花销记录。"
- 段落底部 `[+ 记一笔]`：primary filled block button，横跨整行，`IconPlus` + 文字
  - `canEdit=false`（reader）→ 不渲染
  - `canEdit=true` 且活动在 backlog（`day_id === null`）→ disabled + tooltip "候选池活动无法记账，请先排入某一天"

### 权限矩阵

| 操作 | author | editor | reader |
|---|:---:|:---:|:---:|
| 点卡片打开详情抽屉 | ✓ | ✓ | **✓**（新）|
| 查看所有内容段落 | ✓ | ✓ | **✓**（新）|
| Header `[+ 记一笔]` 可见 | ✓ | ✓ | ✗ |
| Header `[编辑]` 可见 | ✓ | ✓ | ✗ |
| 账单段落 `[+ 记一笔]` 可见 | ✓ | ✓ | ✗ |
| 点击某条 expense 跳 ExpenseDrawer | ✓ | ✓ | ✓ |

---

## 3 · 数据流

### 无新 API
- `activity`、`days`、`activity_images`、`members`、`author`、`expenses` 全部来自 Tour/Show 已有 payload
- 后端零改动

### Tour/Show.jsx 新状态
```jsx
const [detailViewer, setDetailViewer] = useState({ open: false, activityId: null })
// 既有
const [editor, setEditor] = useState({ open: false, mode: 'create', activityId: null, ... })
const [expenseDrawerOpen, setExpenseDrawerOpen] = useState(false)
const [editingExpenseId, setEditingExpenseId] = useState(null)
```

### 点卡片 handler
```jsx
// 现状
const onCardClick = (activityId) => setEditor({ open: true, mode: 'edit', activityId, ... })

// 改后
const onCardClick = (activityId) => setDetailViewer({ open: true, activityId })
```
同时 `ActivityCard.jsx` 内部放开 `readOnly` 对 `handleBodyClick` 的 gate（reader 点击不再被吞）。

### "[编辑]"按钮 → 抽屉切换
```jsx
const openEditFromDetail = (activityId) => {
  setDetailViewer({ open: false, activityId: null })
  setEditor({ open: true, mode: 'edit', activityId })
}
```
互斥切换，不允许两个 Mantine Drawer 同时开。

### "[+ 记一笔]"按钮（两处同一个 handler）
```jsx
const openAddExpenseForActivity = (activityId) => {
  setEditingExpenseId(null)                // 进 create 模式
  setAddExpenseForActivityId(activityId)   // 新增一个 state 传给 AddExpenseDialog
  setExpenseDrawerOpen(true)               // 打开 ExpenseDrawer 作为 Dialog 的 parent
}
```

**AddExpenseDialog 新增 `initialActivityId` prop**：dialog 的 useEffect 打开时若传了这个 prop 且处于 create 模式，初始 `activityId` 设为这个值（而不是 `nonBacklogActivities[0]?.id`）。

保存成功后 AddExpenseDialog 自动 `router.reload({ only: ['expenses'] })` → 详情抽屉的账单段落从刷新后的 `expenses` filter 重新渲染 → 新条目出现 + 汇总数字更新。详情抽屉保持打开。

### "点击某条 expense 条目跳 ExpenseDrawer" 聚焦行为

ExpenseDrawer 现有 `editingExpenseId` state 支持"编辑特定 expense"。详情抽屉点某条 expense 触发：
```jsx
setDetailViewer({ open: false, activityId: null })  // 关详情
setEditingExpenseId(expense.id)                     // 预选要编辑的
setExpenseDrawerOpen(true)                          // 开 ExpenseDrawer
```

**Fallback**：如果 ExpenseDrawer 的 `editingExpenseId` prop 暴露不干净（需要改造 >30min），降级为"只打开 ExpenseDrawer、不聚焦"——用户自己滚到对应条目。此降级在 implementation 时 dev 评估。

---

## 4 · Backlog activity 的约束

- Backlog（`day_id === null`）的 activity 详情抽屉照常打开
- Header 里 day_index 位置渲染 "候选池"
- 账单段落的 `[+ 记一笔]` **disabled + tooltip "候选池活动无法记账，请先排入某一天"**
- 后端 `Expense` 模型的 `activity_not_backlog` validation 已在（`app/models/expense.rb`），前端 UI 对齐这个约束

---

## 5 · 测试策略

### Ruby (RSpec) — 无新增必要
- 既有 `tours_spec`、`activities_spec`、`expenses_spec` 仍覆盖相关后端行为
- 可选：加一条 smoke "reader 可 GET tour page 并在 payload 里看到 activities"——若既有测试已隐含则省略

### JS (Vitest)

**新建 `app/javascript/components/planner/__tests__/ActivityDetailDrawer.test.jsx`**

每个段落 2-3 个 case + Header 权限 gate，合计约 14-18 个 case：

- Header 渲染：名称 / kind / day_index；`day_id=null` 时"候选池"标签
- Location：有坐标渲染 `<AMapEmbed>`；无坐标不渲染 map；不同 kind 的 detail fields 正确显示
- Desc：有值渲染，空值整段不渲染
- Gallery：有图渲染缩略图；空列表不渲染
- Participants：`participant_user_ids=[]` → "默认全员 · N 人" + 头像集；非空 → 显式列表
- Expenses：
  - 汇总 "共 ¥X · N 笔" 数字正确
  - 空态 "还没有花销记录"
  - canEdit=true 且非 backlog → 底部"[+ 记一笔]"按钮正常
  - canEdit=true 且 backlog → 按钮 disabled + tooltip
  - canEdit=false → 按钮不渲染，但列表可见
- Header buttons gate：
  - canEdit=true → `[+ 记一笔]` + `[编辑]` 都有
  - canEdit=false → 都隐藏，只剩 `[X]`
- 按钮行为（mock handler）：
  - 两处 `[+ 记一笔]` 点击都触发同一个 `onAddExpense(activityId)` prop
  - `[编辑]` 触发 `onEdit(activityId)` prop
  - 点击某条 expense 触发 `onFocusExpense(expenseId)` prop

**改 `app/javascript/components/planner/__tests__/ActivityCard.test.jsx`**
- 加一个 case：`readOnly=true` 下点卡片仍触发 `onClick` prop（验证 gate 移除）
- 删除或更新原"`readOnly=true` 不触发 onClick"的 case（如果有）

### 交付前手动 E2E（必跑，遵循 [memory note](~/.claude/projects/.../feedback_run_e2e_after_ui_fix.md)）

**以 Alice (author) 登录**：
1. 点 day column 里某活动卡片 → 详情抽屉打开，6 段内容正确
2. Header 可见 `[+ 记一笔]` + `[编辑]` + `[X]`
3. 账单段落初始为空态；点 `[+ 记一笔]` → AddExpenseDialog 弹出，activityId 已预选 → 提交 → dialog 关 + 账单段落出现新条目 + 汇总更新
4. 点账单里某条 expense → ExpenseDrawer 打开（聚焦或不聚焦均可）
5. 点 `[编辑]` → 详情抽屉关，编辑抽屉打开；编辑流程未变
6. 编辑保存 → 关编辑抽屉回 planner；再点卡片 → 详情抽屉刷新显示新数据
7. 点 backlog 里一个活动 → 详情抽屉打开；`[+ 记一笔]` 为 disabled + 正确 tooltip

**切到 Cindy (reader) 登录**：
8. 点同一个活动卡片 → 详情抽屉打开（**修复点**：修复前点击无反应）
9. Header 只剩 `[X]`
10. 6 个段落都可滚动查看
11. 账单列表可见，但底部无 `[+ 记一笔]` 按钮
12. 浏览器 console fetch 伪造 `POST /tours/:id/expenses` → 后端 403（既有 `require_editor` gate 兜底）

**Regression**：
13. 编辑抽屉既有功能完好（基础 / 图集 / 路线 / 参与人 tab + 保存 / 取消 / 删除 / 移回候选池）
14. 现有 `ExpenseDrawer` 顶部"记一笔"入口不受影响

### CI 本地校验（遵循 [CLAUDE.md#before-claiming-done](../../../CLAUDE.md)）
- `mise exec -- bundle exec rspec`
- `npm test`
- `mise exec -- bundle exec rubocop app/ config/ spec/ lib/`
- `mise exec -- bundle exec brakeman --no-pager`
- `npm audit`

---

## 6 · 不做的（显式 YAGNI）

- **不做 Playwright E2E 自动化** — 手动已覆盖关键路径；项目目前无 Playwright CI，本 PR 不负责搭建
- **不重构 ExpenseDrawer 支持 `focusExpenseId`** — 若现有 `editingExpenseId` prop 能干净复用就用；否则降级为"只打开不聚焦"
- **不处理"多人同时编辑"冲突** — 既有问题，不在本 PR 扩张
- **不加键盘快捷键**（Cmd+E 编辑等）— Mantine 默认的 Esc 关闭 + Tab 焦点管理足够
- **不做 Activity/Show 独立 Inertia 页面路由** — brainstorming 阶段评估过，离开 planner 上下文的 UX 代价大于收益
- **不展示 route legs** — 单活动详情里"到下一站"语境模糊，留给 planner 主视图
- **不在详情抽屉里展示统计汇总**（人均、去过次数等）— 超出本 PR 的"看清楚这个活动"目标
- **不改 ActivityDrawer 编辑抽屉** — 编辑路径完全保持现状，只是卡片不再直接打开它
