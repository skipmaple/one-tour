# Tranche D-2 — Drag validation + Undo toast 贯穿 + useChat 历史

**Status**: Design approved 2026-04-16 · awaiting implementation plan
**Source**: Tranche D backlog · Screen 5 G5-a/G5-b/G5-d + Ops-A
**Scope**: 4 个子模块——hover 超时预警、buffer day 二次确认、全局 undo stack、useChat 刷新加载历史
**参考原型**: `docs/superpowers/specs/2026-04-15-tour-day-activity-remodel-wireframes.html` Screen 5

---

## 背景

Tranche A/B/C/D-1 落地后，Planner 已经可以拖拽、AI 多轮对话、地图带连线。但仍有 4 件让用户"不敢用力玩"的缺失：

1. **G5-a 拖拽前没有警告** — 把 6h 的活动拖到已经有 6h 驾驶的 D3，落下后才看到 "12h ⛔" 红色 banner。原型要求 hover 时即时预警，避免无效拖拽。
2. **G5-b 拖到 buffer day 没二次确认** — buffer_day 是 "刻意预留的空白"，落下后默默把 day 变成实日，用户失去缓冲意图。
3. **G5-d 全局 undo 缺失** — wireframe 把 undo toast 列为贯穿机制覆盖所有 CRUD（add/update/delete/move）。当前所有 mutation 都是不可撤销的——AI 批量操作还能撤销，但用户也只能多轮问 AI 调整。
4. **Ops-A useChat 刷新丢 transcript** — 前端 messages 数组始终从 `[]` 开始，刷新后显示 "还没有对话"，即便 DB 有完整历史。后端 ChatStreamJob#replay_history 依旧 replay，所以 AI 上下文连续，但用户看不到历史断层。

D-2 把这 4 件做完。

---

## 0 · 子块依赖关系

```
Ops-A (useChat 历史) — 独立，最先做（最简）

G5-a (hover 预警) — 独立 (Show.jsx + DayColumn.jsx)

G5-b (buffer 二次确认) — Show.handleDragEnd 改造，与 G5-a 共享 onDragEnd 入口

G5-d (Undo stack) — 横跨多 mutation 路径，体量最大
    ├─ Backend: 改 ActivitiesController#create / DaysController#create 返 JSON 含 id
    ├─ Frontend infra: useUndoStack hook + Provider + Cmd+Z keybinding
    └─ Wire-up: 5 个 mutation 调用点接入 push
```

交付顺序：Ops-A → backend controller create → useUndoStack infra → G5-a → G5-b → 5 mutation wire-up。每步独立 commit、独立可发布。

---

## 1 · Ops-A · useChat 历史加载

### 1.1 行为

`useChat({ tourId })` 在 mount 后向 `GET /tours/:id/conversation`（已有 `ConversationsController#show`）拉取历史 messages，dispatch `load_history` 替换初始空 `messages` 数组。

### 1.2 现状

- `ConversationsController#show`（`app/controllers/conversations_controller.rb`）已存在，返 `{ conversation, messages: [...] }`。
- 现有 `useChat.js` 只在 mount 时订阅 ActionCable，不 fetch 历史。
- ChatStreamJob#replay_history 后端无障碍——前端只是不显示。

### 1.3 实现

`useChat.js` 加 mount-time fetch：

```js
useEffect(() => {
  if (!tourId) return
  fetch(`/tours/${tourId}/conversation`, { headers: { Accept: 'application/json' } })
    .then(res => res.ok ? res.json() : null)
    .then(data => {
      if (data?.messages) dispatch({ type: 'load_history', messages: data.messages })
    })
    .catch(() => { /* silent — chat just starts empty */ })
}, [tourId])
```

reducer 加新 action：

```js
case 'load_history':
  return { ...state, messages: action.messages }
```

### 1.4 边界

- **Sentinel 过滤**：现有 ChatPanel `MessageBubble` 已经跳过 `__onboarding_start__`，加载历史后 sentinel 也不会显示。
- **Reader 模式**：reader 调 fetch 时拿到自己的（独立）conversation，可能为空。fetch 失败静默——chat 起始还是空状态。
- **role enum 序列化**：Rails enum `:user, :assistant, :system` 默认序列化成 integer，但 `Message#as_json` 应该返字符串（验证：可能需要 model 层覆盖 `as_json` 或加 `attributes_for_serialization`）。Plan 阶段先 grep 确认。
- **ActionCable 与 history 同步**：history fetch 完后，新到的 ActionCable 消息按现有逻辑 push 到 messages。无 race condition——history 加载只发生在 mount 一次。

### 1.5 文件清单

**修改**：
- `app/javascript/hooks/useChat.js` — useEffect mount fetch + reducer load_history case
- `app/javascript/hooks/__tests__/useChat.test.js` — 新建（如不存在）+ 历史加载测试
- 可能 `app/models/message.rb` — 如果 enum role 序列化是 integer，加 `as_json` override 返字符串

### 1.6 测试

Vitest：
- `useChat` mount 后 fetch /tours/:id/conversation 被调（mock fetch）
- fetch 返回 messages 后 reducer 接收 load_history 替换数组
- fetch 失败时 messages 仍是空（不抛错）

---

## 2 · G5-a · Hover 超时预警

### 2.1 行为

拖拽过程中 hover 到某个 Day column 上方时，**不等落下**，前端立即计算"如果加入这个 activity，driving_minutes 会不会超 `max_daily_driving_minutes`"。如果会，DayColumn 立即变红色 + 显示浮动 warning。

### 2.2 触发

`Show.jsx` 的 `<DndContext>` 加 `onDragOver={({ active, over }) => updateDragWarning(active, over)}`。

`updateDragWarning` 计算：

```js
function updateDragWarning(active, over) {
  if (!over) { setDragWarning(null); return }
  const targetDayId = over.data.current?.dayId
  if (!targetDayId) { setDragWarning(null); return }  // backlog never overflows

  const activityId = Number(String(active.id).replace(/^activity-/, ''))
  const draggedActivity = displayActivities.find(a => a.id === activityId)
  if (!draggedActivity) { setDragWarning(null); return }

  // Skip if dropping back into same day (no net change)
  if (draggedActivity.day_id === targetDayId) { setDragWarning(null); return }

  const targetDayActs = displayActivities.filter(a => a.day_id === targetDayId)
  const currentDriveMin = targetDayActs.reduce((sum, a) =>
    sum + (parseInt(a.details?.drive_min || 0, 10) || 0), 0)
  const incomingDriveMin = parseInt(draggedActivity.details?.drive_min || 0, 10) || 0
  const total = currentDriveMin + incomingDriveMin
  const limit = tour.constitution.max_daily_driving_minutes || 420

  if (total > limit) {
    setDragWarning({ dayId: targetDayId, current: currentDriveMin, incoming: incomingDriveMin, limit, total })
  } else {
    setDragWarning(null)
  }
}
```

`onDragEnd` / `onDragCancel` 清空 `setDragWarning(null)`。

### 2.3 DayColumn 渲染

DayColumn 接收新 prop `dragWarning: { current, incoming, limit, total } | null`（Show.jsx 把 `dragWarning?.dayId === day.id ? dragWarning : null` 传给每个 DayColumn）。

当 prop 非 null：
- Body container `border: '1px solid var(--mantine-color-red-6)'`
- header 下方插入浮动 warning：

```jsx
{dragWarning && (
  <div style={{
    padding: '4px 8px',
    background: '#fef0f0',
    border: '1px solid #c33',
    color: '#c33',
    fontSize: 11
  }}>
    ⚠ 加入后驾驶 {Math.round(dragWarning.total)}/{dragWarning.limit} min
  </div>
)}
```

### 2.4 边界

- **不做 tier_one 上限的预警**：YAGNI。driving 是最常超的；tier_one 超了会在落下后 banner 提示。
- **同 day 内移动不预警**：净 driving 不变（只是 position 调整），跳过 check。
- **拖到 backlog 不预警**：backlog 没有"上限"概念。
- **dragWarning 性能**：`onDragOver` 在 dnd-kit 中节流到大约每帧一次，setDragWarning 触发 React reconcile 但只影响一个 DayColumn，可接受。

### 2.5 文件清单

**修改**：
- `app/javascript/pages/Tour/Show.jsx` — `dragWarning` state + `updateDragWarning` + DndContext onDragOver
- `app/javascript/components/planner/DayColumn.jsx` — 接 `dragWarning` prop + 红框 + warning banner

### 2.6 测试

Vitest：
- DayColumn 接 dragWarning prop 后渲染 warning banner
- DayColumn dragWarning 为 null 时不渲染

---

## 3 · G5-b · Drop 到 buffer_day 二次确认

### 3.1 行为

`Show.handleDragEnd` 检测 `targetDay.buffer_day === true` 时，**不立即拖**，弹 `modals.openConfirmModal` 二次确认。用户 confirm 后顺序：(1) PATCH /days/:id { buffer_day: false } (2) PATCH /activities/:id/position。

### 3.2 实现

```js
function handleDragEnd({ active, over }) {
  setActiveId(null)
  setDragWarning(null)
  if (!over || active.id === over.id) return

  const activityId = Number(String(active.id).replace(/^activity-/, ''))
  const data = over.data.current || {}
  const toDayId = data.dayId ?? null
  const toPosition = data.position ?? 1

  const targetDay = days.find(d => d.id === toDayId)
  if (targetDay?.buffer_day) {
    modals.openConfirmModal({
      title: '把 activity 放进机动日？',
      children: (
        <Text size="sm">
          D{targetDay.day_index} 是机动日（缓冲）。继续放入会让 D{targetDay.day_index} 不再是机动日，确认吗？
        </Text>
      ),
      labels: { confirm: '继续放入', cancel: '取消' },
      confirmProps: { color: 'orange' },
      onConfirm: () => {
        router.patch(`/tours/${tour.id}/days/${toDayId}`, { day: { buffer_day: false } }, {
          preserveScroll: true,
          only: ['days', 'violations'],
          onSuccess: () => performMove(activityId, toDayId, toPosition),
          onError: () => notifications.show({ message: '修改 buffer 失败，未拖动', color: 'red' })
        })
      }
    })
    return
  }

  performMove(activityId, toDayId, toPosition)
}

function performMove(activityId, toDayId, toPosition) {
  // 现有 lazy-update + router.patch 逻辑提取到这里 + Section 6 接 undoStack.push
  ...
}
```

### 3.3 原子性

两个请求顺序非原子：中间失败（很少） = day buffer_day=false 但 activity 没拖过去。后果：用户下次再拖到该 day 不会再问（已不是 buffer），无显著用户损失。错误 toast 提示用户。

### 3.4 与 undo 协作

Undo 仅反向 activity 位置，**不**反向 buffer_day（设计选择，避免 modal 套 modal）。toast 文案体现："已移动 X · 撤销不会还原 D6 的 buffer 状态"。用户从 DayEditModal 自己改回 buffer_day。

### 3.5 文件清单

**修改**：
- `app/javascript/pages/Tour/Show.jsx` — handleDragEnd 内的 buffer 检测分支 + performMove 提取
- `app/javascript/pages/Tour/__tests__/Show.test.jsx` — 拖到 buffer day 触发 modal 测试

### 3.6 测试

Vitest：
- handleDragEnd 拖到 buffer_day=true 的 day → modals.openConfirmModal 被调
- onConfirm → router.patch /days/:id 被调（mock）

---

## 4 · G5-d · 全局 Undo Stack

### 4.1 架构

**纯前端内存**，刷新清空。3 个 React 公共件：

- `UndoStackProvider`（React Context）— 维护 stack array
- `useUndoStack()` hook — 暴露 `push(entry)` / `executeTop()` / `stack`
- 全局 `keydown` listener（Provider 内）— 监听 Cmd+Z / Ctrl+Z → `executeTop()`

stack item 形态：

```typescript
{
  label: string,                    // shown in toast: "修改 赛里木湖"
  undoFn: () => Promise<void>,       // reverse action; rejects on failure
  ts: number,                       // Date.now() — for unique toast id
}
```

上限 10 项（满了 shift 最老的）。

### 4.2 Toast 实现（用 Mantine notifications ReactNode message）

经 Context7 调研确认：Mantine `notifications.show({ message: ReactNode })` 接受任何 React 节点。`useUndoStack.push` 内部生成 toast 含 "撤销" 按钮：

```jsx
function showUndoToast({ label, executeUndo }) {
  const id = `undo-${Date.now()}-${Math.random().toString(36).slice(2)}`
  notifications.show({
    id,
    autoClose: 5000,
    withCloseButton: true,
    message: (
      <Group gap="xs" justify="space-between" wrap="nowrap">
        <Text size="sm">{label}</Text>
        <Button
          variant="subtle"
          size="compact-xs"
          onClick={() => {
            notifications.update({
              id, loading: true, autoClose: false,
              message: <Text size="sm">撤销中…</Text>
            })
            executeUndo()
              .then(() => notifications.update({
                id, loading: false, color: 'green', autoClose: 1500,
                message: <Text size="sm">{label} · 已撤销</Text>
              }))
              .catch(err => notifications.update({
                id, loading: false, color: 'red', autoClose: 3000,
                message: <Text size="sm">撤销失败：{err.message}</Text>
              }))
          }}
        >
          撤销
        </Button>
      </Group>
    ),
  })
  return id
}
```

`executeUndo()` 来自 `useUndoStack.executeTop`：pop top 并执行其 undoFn，返回 Promise。

### 4.3 Cmd+Z 全局快捷键

Provider 内 useEffect 注册：

```js
useEffect(() => {
  function handleKeydown(e) {
    if ((e.metaKey || e.ctrlKey) && e.key === 'z' && !e.shiftKey) {
      // Ignore when focus is in input / textarea / contenteditable
      const tag = e.target.tagName?.toLowerCase()
      if (tag === 'input' || tag === 'textarea' || e.target.isContentEditable) return
      e.preventDefault()
      executeTop()
    }
  }
  window.addEventListener('keydown', handleKeydown)
  return () => window.removeEventListener('keydown', handleKeydown)
}, [])
```

**关键**：input/textarea/contenteditable 焦点时不拦截——避免与文本编辑的原生 undo 冲突。

### 4.4 5 个 mutation 调用点接入

| Forward action | Reverse undoFn | 改造点 |
|---|---|---|
| Drag move_activity | PATCH /activities/:id/position with prevDayId/prevPosition | Show.handleDragEnd → performMove |
| Activity create | DELETE /activities/:id (id from create JSON response) | ActivityDrawer.handleSave (create 分支) |
| Activity update | PATCH /activities/:id with prevAttrs (snapshot) | ActivityDrawer.handleSave (edit 分支) |
| Activity delete | POST /tours/:id/activities or /backlog_activities with savedAttrs | ActivityDrawer.handleDelete |
| Day update | PATCH /tours/:id/days/:id with prevAttrs | DayEditModal.handleSave |

**Day delete 不入 stack** — toast 只展示 "已删除 D{n}（不可撤销）"，无 push。

**Day create 不入 stack** — Tranche C 决定 D1 自动创建，UI 创建 day 几乎只在 AddDayButton 一处，YAGNI 简化。

**AcknowledgeViolation 不入 stack** — 避免误撤销静音，需要刻意通过 Constitution 页"已承认列表"撤销。

### 4.5 反向操作的 prevAttrs 快照

每个 mutation 调用点在调用 router 之前快照前态：

**Drag**：在 `performMove` 入口快照 `prevAttrs = { day_id: draggedActivity.day_id, position: draggedActivity.position }`。

**Activity update**：在 `ActivityDrawer.handleSave` 入口快照 `prevAttrs = { ...activity }` 浅拷贝（details 是简单 hash，浅拷贝足够）。

**Activity delete**：在 `ActivityDrawer.handleDelete` 入口快照 `savedAttrs = { ...activity, day_id: activity.day_id, position: activity.position }`。reverse POST 时如有 `day_id` 用 `/days/:id/activities`，否则 `/backlog_activities`。

**Day update**：在 `DayEditModal.handleSave` 入口快照 `prevAttrs = { theme: day.theme, date: day.date, buffer_day: day.buffer_day }`。

**Activity create**：无需 prevAttrs，reverse 只需 `id`（来自 controller create JSON 响应，见 §4.6）。

### 4.6 后端改动：controller create 返 JSON 含 id

当前 `ActivitiesController#create` / `DaysController#create` 都 `redirect_to tour_path(@tour)`。Inertia router.post 的 `onSuccess` 回调拿不到新对象 id（Inertia 只刷新 props）。

**改造**：create action 用 `respond_to` 区分 Inertia 请求 vs JSON fetch：

```ruby
# ActivitiesController#create (inside the day)
def create
  ...
  @activity = ...create!(...)
  respond_to do |format|
    format.json { render json: { id: @activity.id, position: @activity.position } }
    format.html { redirect_to tour_path(@activity.tour) }
  end
end
```

ActivityDrawer create 路径改用 `fetch` POST + 解析返回 id：

```js
async function createActivity(payload) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Accept': 'application/json', 'X-CSRF-Token': csrfToken() },
    body: JSON.stringify(payload)
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const { id } = await res.json()
  // Trigger Inertia partial reload to refresh activities/days props
  router.reload({ only: ['activities', 'violations'] })
  return id
}
```

push undo entry 拿到 id：

```js
const newId = await createActivity(payload)
undoStack.push({
  label: `新建 ${formValues.name}`,
  undoFn: () => fetch(`/activities/${newId}`, { method: 'DELETE', headers: { 'X-CSRF-Token': csrfToken() } })
    .then(res => res.ok ? router.reload({ only: ['activities', 'violations'] })
                        : Promise.reject(new Error(`HTTP ${res.status}`)))
})
```

DaysController 同改。

**Spec assertion**: `spec/requests/activities_spec.rb` 加 "create with Accept: application/json returns id" 测试。

### 4.7 文件清单

**新建：**
- `app/javascript/hooks/useUndoStack.js`（Provider + hook + Cmd+Z keybinding + showUndoToast）
- `app/javascript/hooks/__tests__/useUndoStack.test.js`（4-5 条 hook 单测）

**修改（前端）：**
- `app/javascript/entrypoints/inertia.jsx` — 挂 `<UndoStackProvider>` 在 Mantine 之内
- `app/javascript/pages/Tour/Show.jsx` — performMove 提取 + push undo
- `app/javascript/components/activity-editor/ActivityDrawer.jsx` — create 改用 fetch + 3 处 push undo
- `app/javascript/components/planner/DayEditModal.jsx` — update 处 push undo
- `app/javascript/pages/Tour/__tests__/Show.test.jsx` — undo push 测试

**修改（后端）：**
- `app/controllers/activities_controller.rb` — create action `respond_to` 加 JSON
- `app/controllers/days_controller.rb` — 同
- `spec/requests/activities_spec.rb` — JSON create 返 id 断言
- `spec/requests/days_spec.rb` — 同

### 4.8 测试

**Vitest（useUndoStack）：**
- push 累加到 stack
- push 第 11 项时第 1 项被 shift（cap=10）
- executeTop 调 top 的 undoFn 并 pop
- executeTop 在空 stack 时 no-op
- Cmd+Z keydown 触发 executeTop（mock event）
- 焦点在 input 时 Cmd+Z 不拦截

**Vitest（mutation 接入）：**
- ActivityDrawer 删除 activity 后 stack 长度 +1，entry label 含 activity name
- DayEditModal 保存后 stack 长度 +1
- Drag move 后 stack 长度 +1

**RSpec：**
- POST /tours/:id/days/:day_id/activities Accept: application/json → 返 `{ id, position }`
- POST /tours/:id/days Accept: application/json → 返 `{ id }`

---

## 5 · 共用约束 / 边界

- 不引入新 npm 依赖（Mantine notifications + modals 已有，useReducer 内置）
- 不引入新 Ruby gem
- Reader 模式：Cmd+Z 触发但 mutation 失败（reader 没编辑权）→ toast 错误提示
- Undo stack 不持久化，不跨 user/tour/session
- **不做的**：
  - 完整 redo stack（YAGNI，单步撤销 80% 用例）
  - AI 批量操作的 undo（spec 里明示）
  - AcknowledgeViolation undo（避免误撤销静音）
  - Day delete undo（实现复杂度高，rare）
  - Day create undo（场景太少）
  - hover 预警的 tier_one 超限（YAGNI，driving 最常）
  - hover 预警的实时浮动 ConstitutionBanner（保持现有"落下后 banner"）
  - useChat 历史的分页 / 增量加载（现有 conversation 体量小）
  - Buffer day undo 自动还原 buffer_day（用户手动改）
  - input/textarea 焦点的 Cmd+Z fallback 到 undo stack（让原生编辑优先）

---

## 6 · 数字预估

| | 数量 |
|---|---|
| 新文件 | 3 |
| 修改文件 (前端) | 7 |
| 修改文件 (后端) | 4 |
| Vitest 新增 | ~12 |
| RSpec 新增 | 2 |
| **工作量** | **~12-16h（2 个工作日）** |

---

## 7 · 交付顺序建议

6 commit：

1. **Ops-A useChat 历史加载** — 独立，最简单 (~2h)
2. **Backend controller create action 改 JSON 返回** + spec ×2 — 后端独立 (~1.5h)
3. **useUndoStack hook + Provider + Cmd+Z + showUndoToast** + Vitest — 基础设施 (~3h)
4. **G5-a hover 超时预警** — Show.jsx + DayColumn.jsx + Vitest (~2h)
5. **G5-b buffer 二次确认** — Show.jsx 内 buffer 分支 + performMove 提取 + Vitest (~2h)
6. **5 个 mutation 调用点接入 undoStack.push** — ActivityDrawer + DayEditModal + Show.handleDragEnd + Vitest (~3h)

每段独立 commit，独立可发布。第 1-2 是无破坏性修改，3-6 是新功能逐层叠加。

---

## 附：已知后续（不在本 spec）

- Redo stack（如果需要）
- AI 批量操作的服务端 undo（Tranche E 候选）
- AcknowledgeViolation 的 toast undo（暂走 Constitution 页"已承认列表"撤销）
- Day delete 的 undo（实现复杂，rare 场景）
- 拖拽 hover 时实时计算 ConstitutionBanner（深度集成 ConstitutionCheck，超出 D-2 范围）
