# 活动卡片右键快捷菜单 — 设计文档

**日期**: 2026-05-30
**状态**: 设计已评审，待进入实施规划

---

## 1. 范围声明

### Mission

让作者在 Planner 里对单张活动卡片直接发起常用操作（编辑/记账/克隆/删除/移到候选池），无需先打开详情抽屉再翻找按钮。

### In-Scope

- **触发对象**: 仅 `ActivityCard`（日程列 `DayColumn` + 候选池 `BacklogList` 中的卡片）
- **触发方式**:
  - 桌面：鼠标右键（`onContextMenu`）
  - 触屏：长按 ~500ms（`useLongPress`）
- **菜单项（5 个，按上下文自适应）**: 编辑、记账、克隆、移到候选池、删除
- **权限**: 仅 `canEdit`（作者/编辑者）显示；只读用户（reader）不挂载菜单，浏览器原生右键菜单不受影响
- **后端**: 复用现有全部 endpoint，**无新增路由 / 无 controller 改动 / 无 migration**

### Out-of-Scope（显式排除）

- 不改动卡片左键行为（仍打开只读详情抽屉 `ActivityDetailDrawer`）
- 不删除/改动详情抽屉、编辑抽屉里现有的按钮（菜单是**增量快捷入口**，不替换既有路径）
- 不引入第三方 context-menu 库（避免给 dependency-conscious 仓库加依赖）
- 不做菜单项的二级子菜单、键盘快捷键、批量多选操作（长尾，后续再说）
- 触屏长按后若手指继续移动可能触发 dnd-kit 拖拽 —— v1 不做额外拦截（见 §6 边界情况）

---

## 2. 关键决策（评审已确认）

| 决策点 | 选定方案 |
|---|---|
| “编辑”菜单项行为 | **直接打开编辑表单**（`openEdit`），跳过只读详情抽屉 |
| 适用卡片范围 | 日程卡片 + 候选池卡片**都支持，自动适配** |
| 触发方式 | **桌面右键 + 触屏长按** |
| 菜单渲染方式 | **单一受控 Mantine `Menu`**，锚定到光标坐标（方案 A） |

**方案 A vs B/C**：A（单实例 + 坐标锚定 + 回调上抛）胜出。B（每卡一个 Menu）会产生 50+ 实例且锚到卡片而非光标；C（`mantine-contextmenu`）为约 80 行可自写的功能新增依赖，不值当。

---

## 3. 菜单项规格（上下文自适应）

卡片是否在某一天由 `activity.day_id` 决定（`day_id == null` ⇒ 在候选池）。

| 顺序 | 标签 | 图标 (Tabler) | 日程卡片 | 候选池卡片 | 触发的 handler（除注明外均复用 `Show.jsx` 现有函数） |
|---|---|---|---|---|---|
| 1 | 编辑 | `IconPencil` | ✓ | ✓ | `openEdit(id)` → 直接进编辑表单 |
| 2 | 记账 | `IconCoin` | ✓ | — 隐藏 | `openAddExpenseForActivity(id)` |
| 3 | 克隆 | `IconCopy` | ✓ | ✓ | `handleCloneActivity(id)`（已带 `cloningRef` 防双击 + undo） |
| — | （分隔线 `Menu.Divider`） | | | | |
| 4 | 移到候选池 | `IconInbox` | ✓ | — 隐藏 | `performMove(id, null, 1)`（复用拖拽逻辑，乐观更新 + undo） |
| 5 | 删除 | `IconTrash`（红） | ✓ | ✓ | **新增** `handleDeleteActivity(id)` |

- 候选池卡片隐藏“记账”（沿用现有 `canEdit && !isBacklog` 禁用规则）与“移到候选池”（已在池中，无意义）。
- 标签为纯中文；图标用 `@tabler/icons-react` 的 functional `leftSection`（符合仓库 UI 约定：纯中文文案 + Tabler 功能图标，无 emoji 装饰）。
- “候选池”图标复用 `BacklogList` 已用的 `IconInbox`，保持一致。
- “删除”单独置于分隔线下、红色，降低误触破坏性操作的概率。

---

## 4. 组件与数据流

### 4.1 新增文件

**`app/javascript/hooks/useLongPress.js`** — 触屏长按检测（Mantine hooks 无现成实现）。

- 仅在 `e.pointerType === 'touch'` 时启动 500ms 计时器（鼠标走右键，不走长按）。
- `pointermove` 超过 ~8px 容差 ⇒ 视为拖拽/滚动，清除计时器（drag 阈值是 5px，长按需要“静止”，二者天然互斥）。
- `pointerup` / `pointerleave` / `pointercancel` ⇒ 清除计时器。
- 通过 `firedRef` 暴露“本次是否已触发长按”，供卡片吞掉随后那次 `onClick`（避免长按后又打开详情抽屉）。
- 返回 `{ onPointerDown, onPointerMove, onPointerUp, onPointerLeave, onPointerCancel, firedRef }`。

**`app/javascript/components/planner/ActivityContextMenu.jsx`** — 单一受控菜单。

- Props: `{ state, onClose, onEdit, onAddExpense, onClone, onMoveToBacklog, onDelete }`，其中 `state = { activity, x, y } | null`。
- 渲染一个 `position: fixed`、0 尺寸的锚点 `div`（`left: x, top: y`）作为 `Menu.Target`；`opened={!!state}`，`onChange`/`onClose` 清空 state（覆盖点击外部 + Esc 关闭）。
- 依据 `state.activity.day_id` 决定是否渲染“记账”“移到候选池”。
- 每个 `Menu.Item` 点击：调用对应 handler，然后 `onClose()`。

### 4.2 改动文件

**`ActivityCard.jsx`**
- 新增 prop `onCardContextMenu(activity, clientX, clientY)`。
- `handleContextMenu(e)`：若有 `onCardContextMenu` 则 `e.preventDefault()` 并上抛 `(activity, e.clientX, e.clientY)`；无则不拦截（只读用户保留浏览器原生菜单）。
- 用 `useLongPress` 触发同一个上抛回调；把长按的 pointer handlers 与 dnd-kit 的 `dragListeners` **组合**（先调 dnd-kit 的，再调长按的，互不吞事件）。
- `handleBodyClick` 开头：若 `firedRef.current` 为真则重置并 `return`，吞掉长按后那次点击。
- `ActivityCardOverlay`（拖拽残影）不挂菜单。

**`Show.jsx`**
- 新增菜单 state：`const [cardMenu, setCardMenu] = useState(null)`。
- 新增 `openCardMenu = (activity, x, y) => setCardMenu({ activity, x, y })`。
- 新增 `handleDeleteActivity(activityId)`：**逐字镜像** `ActivityDrawer.jsx` 现有的 `handleDelete` —— `modals.openConfirmModal({ title: '确认删除此行？', ... confirmProps:{color:'red'} })` → `router.delete('/activities/:id', { only:['activities','violations'] })` → `onSuccess` 里 `undoStack.push` 用 recreate 方式撤销（在 day ⇒ `POST /tours/:id/days/:dayId/activities`；在池 ⇒ `POST /tours/:id/backlog_activities`）。`undoStack`、`csrfToken` 在 `Show.jsx` 已 import。
- 渲染一次 `<ActivityContextMenu state={cardMenu} onClose={() => setCardMenu(null)} onEdit={openEdit} onAddExpense={openAddExpenseForActivity} onClone={handleCloneActivity} onMoveToBacklog={(id) => performMove(id, null, 1)} onDelete={handleDeleteActivity} />`。
- 向下传递回调：`onCardContextMenu={canEdit ? openCardMenu : undefined}`（只读用户拿到 `undefined`）。

**`DayPanel.jsx` / `DayColumn.jsx` / `BacklogList.jsx`**
- 各新增并透传一个 prop `onCardContextMenu`，路径与现有 `onEditActivity` 完全一致：
  - `Show.jsx → DayPanel → DayColumn → ActivityCard`
  - `Show.jsx → BacklogList → ActivityCard`

### 4.3 触发链路（数据流）

```
右键 / 长按 ActivityCard
  → onCardContextMenu(activity, x, y)
  → Show.openCardMenu → setCardMenu({activity,x,y})
  → <ActivityContextMenu> 在 (x,y) 打开，按 day_id 渲染条目
  → 点击某条 → 调用对应 Show handler（openEdit / openAddExpenseForActivity /
     handleCloneActivity / performMove(id,null,1) / handleDeleteActivity）→ onClose
```

---

## 5. dnd-kit 共存性分析

- 拖拽传感器：`PointerSensor` + `activationConstraint:{ distance: 5 }`（`Show.jsx:81-83`）。
- **右键**：dnd-kit `PointerSensor` 只响应主键（button 0），右键（button 2）不会启动拖拽；我们对 `onContextMenu` 做 `preventDefault` 屏蔽原生菜单。零冲突。
- **长按 vs 拖拽**：拖拽需“移动 ≥5px”，长按需“静止 ≥500ms”，二者互斥 —— 手指移动则清除长按计时器交给拖拽；手指静止则触发长按。组合 listeners 时先后调用即可。
- **左键单击 / 触屏轻点**：仍走 `onClick` 打开详情抽屉（既有行为不变）。

---

## 6. 边界情况

- **克隆双击**：已由 `cloningRef` 防护，菜单触发不额外处理。
- **删除确认**：保留 `确认删除此行？` 确认弹窗，红色确认按钮。
- **菜单关闭**：点击任意项后、点击外部、Esc 均关闭。
- **长按后又拖拽**（已知次要边界，v1 不处理）：长按触发并打开菜单后，手指仍按住，若继续移动可能被 dnd-kit 识别为拖拽。实际用户通常会抬手去点菜单项；Mantine 菜单走 portal 覆盖层。v1 接受此边界，验收时在触屏视口实测确认体验可接受。
- **只读用户**：不挂载任何 contextmenu/长按 handler，浏览器原生右键行为保留。

---

## 7. 测试（Vitest）

- **`ActivityCard`**：右键调用 `onCardContextMenu` 且 `preventDefault`；只读（无 `onCardContextMenu`）时不调用、不拦截。
- **`ActivityContextMenu`**：
  - 日程卡片（`day_id` 非空）渲染 5 项；
  - 候选池卡片（`day_id == null`）隐藏“记账”“移到候选池”，仅 3 项；
  - 点击各项调用对应 handler；“删除”为红色。
- **`useLongPress`**：触屏按住到时触发回调；移动超容差/提前抬手则取消；鼠标 pointer 不触发。
- 回归：跑 `npm test`，确认 `Show.test.jsx` / 现有卡片相关测试不被破坏。

---

## 8. 验收清单

- [ ] 桌面右键日程卡片 → 5 项菜单出现在光标处；逐项功能正确。
- [ ] 桌面右键候选池卡片 → 仅“编辑/克隆/删除”。
- [ ] 触屏长按卡片 → 菜单出现；轻点仍打开详情；拖拽不被长按干扰。
- [ ] 只读用户右键 → 无自定义菜单（浏览器原生行为）。
- [ ] `npm test` 全绿；新增 3 组单测通过。
