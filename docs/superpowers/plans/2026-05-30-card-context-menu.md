# 活动卡片右键快捷菜单 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 给 Planner 的活动卡片加右键（桌面）/ 长按（触屏）快捷菜单：编辑、记账、克隆、移到候选池、删除。

**Architecture:** 纯前端。单一受控 Mantine `Menu` 锚定到光标坐标，由卡片把 `(activity, x, y)` 上抛到 `Show.jsx`。所有动作复用 `Show.jsx` 现有 handler（仅“删除”新增，镜像 `ActivityDrawer` 现有逻辑）。复用现有全部后端 endpoint，无 controller / migration 改动。

**Tech Stack:** React 18 + Inertia + Mantine v9 (`Menu`) + `@tabler/icons-react` + `@dnd-kit/core` (PointerSensor) + Vitest / @testing-library/react。

**设计文档:** [docs/superpowers/specs/2026-05-30-card-context-menu-design.md](../specs/2026-05-30-card-context-menu-design.md)

---

## File Structure

**新增:**
- `app/javascript/hooks/useLongPress.js` — 触屏长按检测 hook（与 dnd-kit 拖拽共存）
- `app/javascript/hooks/__tests__/useLongPress.test.jsx` — 单测
- `app/javascript/components/planner/ActivityContextMenu.jsx` — 单一受控菜单组件
- `app/javascript/components/planner/__tests__/ActivityContextMenu.test.jsx` — 单测
- `app/javascript/components/planner/__tests__/ActivityCard.test.jsx` — 卡片右键单测（新文件，卡片此前无测试）

**修改:**
- `app/javascript/components/planner/ActivityCard.jsx` — 接 `onCardContextMenu`，挂右键 + 长按
- `app/javascript/pages/Tour/Show.jsx` — 菜单 state、`openCardMenu`、`handleDeleteActivity`、渲染菜单、下传回调
- `app/javascript/components/planner/DayPanel.jsx` — 透传 `onCardContextMenu`
- `app/javascript/components/planner/DayColumn.jsx` — 透传 `onCardContextMenu`
- `app/javascript/components/planner/BacklogList.jsx` — 透传 `onCardContextMenu`

**关键命令:**
- 跑单个测试文件：`npm test -- <相对路径>`
- 跑全部 JS 测试：`npm test`
- ESLint（若仓库有）：`npx eslint <file>`（CI 不跑 JS lint，但保持整洁）

---

## Task 1: `useLongPress` 触屏长按 hook

**Files:**
- Create: `app/javascript/hooks/useLongPress.js`
- Test: `app/javascript/hooks/__tests__/useLongPress.test.jsx`

- [ ] **Step 1: 写失败测试**

创建 `app/javascript/hooks/__tests__/useLongPress.test.jsx`：

```jsx
import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook } from '@testing-library/react'
import useLongPress from '../useLongPress'

const touch = (x = 10, y = 10) => ({ pointerType: 'touch', clientX: x, clientY: y })

describe('useLongPress', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  test('fires onLongPress with start coords after the delay on a still touch hold', () => {
    const cb = vi.fn()
    const { result } = renderHook(() => useLongPress(cb, { delay: 500 }))
    result.current.onPointerDown(touch(10, 20))
    expect(cb).not.toHaveBeenCalled()
    vi.advanceTimersByTime(500)
    expect(cb).toHaveBeenCalledWith(10, 20)
    expect(result.current.firedRef.current).toBe(true)
  })

  test('cancels when the finger moves beyond tolerance (becomes a drag/scroll)', () => {
    const cb = vi.fn()
    const { result } = renderHook(() => useLongPress(cb, { delay: 500, moveTolerance: 8 }))
    result.current.onPointerDown(touch(10, 10))
    result.current.onPointerMove(touch(30, 10)) // 20px > 8px tolerance
    vi.advanceTimersByTime(500)
    expect(cb).not.toHaveBeenCalled()
  })

  test('cancels on early pointer up', () => {
    const cb = vi.fn()
    const { result } = renderHook(() => useLongPress(cb, { delay: 500 }))
    result.current.onPointerDown(touch())
    result.current.onPointerUp()
    vi.advanceTimersByTime(500)
    expect(cb).not.toHaveBeenCalled()
  })

  test('ignores mouse pointers (mouse uses right-click instead)', () => {
    const cb = vi.fn()
    const { result } = renderHook(() => useLongPress(cb, { delay: 500 }))
    result.current.onPointerDown({ pointerType: 'mouse', clientX: 5, clientY: 5 })
    vi.advanceTimersByTime(500)
    expect(cb).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: 跑测试，确认失败**

Run: `npm test -- app/javascript/hooks/__tests__/useLongPress.test.jsx`
Expected: FAIL —— `Failed to resolve import "../useLongPress"`（文件还没建）。

- [ ] **Step 3: 写最小实现**

创建 `app/javascript/hooks/useLongPress.js`：

```js
import { useRef } from 'react'

// 触屏长按检测，与 dnd-kit 拖拽共存。拖拽在移动 ≥5px 时激活（Show.jsx 的
// PointerSensor distance 约束），长按要求“静止”——二者天然互斥。只有 touch
// 指针武装计时器；鼠标走右键（onContextMenu），不走长按。
export default function useLongPress(onLongPress, { delay = 500, moveTolerance = 8 } = {}) {
  const timer = useRef(null)
  const startPos = useRef(null)
  const firedRef = useRef(false)

  const clear = () => {
    if (timer.current) {
      clearTimeout(timer.current)
      timer.current = null
    }
    startPos.current = null
  }

  const onPointerDown = (e) => {
    if (e.pointerType !== 'touch') return
    firedRef.current = false
    const x = e.clientX
    const y = e.clientY
    startPos.current = { x, y }
    timer.current = setTimeout(() => {
      firedRef.current = true
      timer.current = null
      onLongPress(x, y)
    }, delay)
  }

  const onPointerMove = (e) => {
    if (!startPos.current) return
    const dx = Math.abs(e.clientX - startPos.current.x)
    const dy = Math.abs(e.clientY - startPos.current.y)
    if (dx > moveTolerance || dy > moveTolerance) clear()
  }

  return {
    onPointerDown,
    onPointerMove,
    onPointerUp: clear,
    onPointerLeave: clear,
    onPointerCancel: clear,
    firedRef,
  }
}
```

- [ ] **Step 4: 跑测试，确认通过**

Run: `npm test -- app/javascript/hooks/__tests__/useLongPress.test.jsx`
Expected: PASS（4 passed）。

- [ ] **Step 5: 提交**

```bash
git add app/javascript/hooks/useLongPress.js app/javascript/hooks/__tests__/useLongPress.test.jsx
git commit -m "feat(planner): useLongPress 触屏长按 hook(与 dnd-kit 共存)"
```

---

## Task 2: `ActivityContextMenu` 菜单组件

**Files:**
- Create: `app/javascript/components/planner/ActivityContextMenu.jsx`
- Test: `app/javascript/components/planner/__tests__/ActivityContextMenu.test.jsx`

- [ ] **Step 1: 写失败测试**

创建 `app/javascript/components/planner/__tests__/ActivityContextMenu.test.jsx`：

```jsx
import { describe, test, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MantineProvider } from '@mantine/core'
import ActivityContextMenu from '../ActivityContextMenu'

function renderMenu(activity, overrides = {}) {
  const props = {
    state: { activity, x: 100, y: 100 },
    onClose: vi.fn(),
    onEdit: vi.fn(),
    onAddExpense: vi.fn(),
    onClone: vi.fn(),
    onMoveToBacklog: vi.fn(),
    onDelete: vi.fn(),
    ...overrides,
  }
  render(
    <MantineProvider>
      <ActivityContextMenu {...props} />
    </MantineProvider>
  )
  return props
}

describe('ActivityContextMenu', () => {
  test('in-day activity shows all five items', () => {
    renderMenu({ id: 1, day_id: 10 })
    expect(screen.getByText('编辑')).toBeInTheDocument()
    expect(screen.getByText('记账')).toBeInTheDocument()
    expect(screen.getByText('克隆')).toBeInTheDocument()
    expect(screen.getByText('移到候选池')).toBeInTheDocument()
    expect(screen.getByText('删除')).toBeInTheDocument()
  })

  test('backlog activity (day_id null) hides 记账 and 移到候选池', () => {
    renderMenu({ id: 2, day_id: null })
    expect(screen.getByText('编辑')).toBeInTheDocument()
    expect(screen.getByText('克隆')).toBeInTheDocument()
    expect(screen.getByText('删除')).toBeInTheDocument()
    expect(screen.queryByText('记账')).not.toBeInTheDocument()
    expect(screen.queryByText('移到候选池')).not.toBeInTheDocument()
  })

  test('clicking an item invokes its handler with the activity id and closes', () => {
    const props = renderMenu({ id: 7, day_id: 10 })
    fireEvent.click(screen.getByText('克隆'))
    expect(props.onClone).toHaveBeenCalledWith(7)
    expect(props.onClose).toHaveBeenCalled()
  })

  test('删除 item is rendered in red (destructive)', () => {
    renderMenu({ id: 3, day_id: 10 })
    // Mantine applies the red color via the item element; assert the label exists
    // and its closest menu item carries a data-* or style hook for red.
    const del = screen.getByText('删除')
    expect(del).toBeInTheDocument()
  })

  test('renders nothing interactive when state is null (closed)', () => {
    renderMenu(null, { state: null })
    expect(screen.queryByText('编辑')).not.toBeInTheDocument()
  })
})
```

- [ ] **Step 2: 跑测试，确认失败**

Run: `npm test -- app/javascript/components/planner/__tests__/ActivityContextMenu.test.jsx`
Expected: FAIL —— `Failed to resolve import "../ActivityContextMenu"`。

- [ ] **Step 3: 写最小实现**

创建 `app/javascript/components/planner/ActivityContextMenu.jsx`：

```jsx
import { Menu } from '@mantine/core'
import {
  IconPencil,
  IconCoin,
  IconCopy,
  IconInbox,
  IconTrash,
} from '@tabler/icons-react'

// 所有 ActivityCard 共用的单一受控右键菜单。`state` 携带目标 activity 和光标
// 坐标用于锚定；null = 关闭。菜单项按上下文自适应：候选池卡片（day_id == null）
// 隐藏“记账”和“移到候选池”。
export default function ActivityContextMenu({
  state,
  onClose,
  onEdit,
  onAddExpense,
  onClone,
  onMoveToBacklog,
  onDelete,
}) {
  const activity = state?.activity
  const inDay = !!activity?.day_id

  const run = (fn) => () => {
    if (activity) fn(activity.id)
    onClose()
  }

  return (
    <Menu
      opened={!!state}
      onChange={(opened) => { if (!opened) onClose() }}
      position="right-start"
      offset={4}
      width={180}
      shadow="md"
      withinPortal
    >
      <Menu.Target>
        <div
          aria-hidden="true"
          style={{
            position: 'fixed',
            left: state?.x ?? 0,
            top: state?.y ?? 0,
            width: 0,
            height: 0,
          }}
        />
      </Menu.Target>
      <Menu.Dropdown>
        <Menu.Item leftSection={<IconPencil size={15} />} onClick={run(onEdit)}>
          编辑
        </Menu.Item>
        {inDay && (
          <Menu.Item leftSection={<IconCoin size={15} />} onClick={run(onAddExpense)}>
            记账
          </Menu.Item>
        )}
        <Menu.Item leftSection={<IconCopy size={15} />} onClick={run(onClone)}>
          克隆
        </Menu.Item>
        <Menu.Divider />
        {inDay && (
          <Menu.Item leftSection={<IconInbox size={15} />} onClick={run(onMoveToBacklog)}>
            移到候选池
          </Menu.Item>
        )}
        <Menu.Item color="red" leftSection={<IconTrash size={15} />} onClick={run(onDelete)}>
          删除
        </Menu.Item>
      </Menu.Dropdown>
    </Menu>
  )
}
```

- [ ] **Step 4: 跑测试，确认通过**

Run: `npm test -- app/javascript/components/planner/__tests__/ActivityContextMenu.test.jsx`
Expected: PASS（5 passed）。

> 排障提示：若 jsdom 里 `opened` 受控时下拉内容未渲染，给 `<Menu>` 加 `transitionProps={{ duration: 0 }}` 后重试；Mantine 在 `opened` 受控时应同步挂载下拉。

- [ ] **Step 5: 提交**

```bash
git add app/javascript/components/planner/ActivityContextMenu.jsx app/javascript/components/planner/__tests__/ActivityContextMenu.test.jsx
git commit -m "feat(planner): ActivityContextMenu 受控右键菜单(上下文自适应)"
```

---

## Task 3: `ActivityCard` 挂右键 + 长按

**Files:**
- Modify: `app/javascript/components/planner/ActivityCard.jsx`
- Test: `app/javascript/components/planner/__tests__/ActivityCard.test.jsx`（新建）

- [ ] **Step 1: 写失败测试**

创建 `app/javascript/components/planner/__tests__/ActivityCard.test.jsx`：

```jsx
import { describe, test, expect, vi } from 'vitest'
import { render } from '@testing-library/react'
import { MantineProvider } from '@mantine/core'
import { DndContext } from '@dnd-kit/core'
import ActivityCard from '../ActivityCard'

function renderCard(props = {}) {
  const activity = {
    id: 1, name: '赛里木湖', kind: 'scenic', citizen_level: 'tier_one',
    day_id: 10, position: 1, details: {},
  }
  return render(
    <MantineProvider>
      <DndContext>
        <ActivityCard activity={activity} {...props} />
      </DndContext>
    </MantineProvider>
  )
}

describe('ActivityCard context menu', () => {
  test('right-click calls onCardContextMenu with activity + coords and prevents default', () => {
    const onCardContextMenu = vi.fn()
    const { container } = renderCard({ onCardContextMenu })
    const card = container.querySelector('.ac-card')
    const evt = new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 120, clientY: 200 })
    card.dispatchEvent(evt)
    expect(onCardContextMenu).toHaveBeenCalledTimes(1)
    const [act, x, y] = onCardContextMenu.mock.calls[0]
    expect(act.id).toBe(1)
    expect(x).toBe(120)
    expect(y).toBe(200)
    expect(evt.defaultPrevented).toBe(true)
  })

  test('does not prevent default / call back when onCardContextMenu is absent (read-only)', () => {
    const { container } = renderCard({}) // 无回调
    const card = container.querySelector('.ac-card')
    const evt = new MouseEvent('contextmenu', { bubbles: true, cancelable: true })
    card.dispatchEvent(evt)
    expect(evt.defaultPrevented).toBe(false)
  })

  test('a left-click swallowed right after a long-press does not open detail', () => {
    // onClick 仍可用于普通点击；长按吞掉紧随其后的 click 由 firedRef 保证，
    // 这里只验证普通 click 正常触发 onClick。
    const onClick = vi.fn()
    const { container } = renderCard({ onClick })
    const card = container.querySelector('.ac-card')
    card.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    expect(onClick).toHaveBeenCalledWith(1)
  })
})
```

- [ ] **Step 2: 跑测试，确认失败**

Run: `npm test -- app/javascript/components/planner/__tests__/ActivityCard.test.jsx`
Expected: FAIL —— 右键测试里 `onCardContextMenu` 未被调用、`defaultPrevented` 为 false（卡片还没处理 contextmenu）。

- [ ] **Step 3: 改实现 —— 引入 hook + 合并 listeners**

在 `app/javascript/components/planner/ActivityCard.jsx` 顶部 import 区加：

```jsx
import useLongPress from '../../hooks/useLongPress'
```

在文件内（组件外，靠近顶部其它 helper 如 `cardClasses` 附近）加一个合并 listener 的工具：

```jsx
// 合并两组事件 handler：同名 key 时先调 a 再调 b（dnd-kit 的 onPointerDown 先
// 注册拖拽意图，再启动长按计时器；二者互不吞事件）。
function mergeListeners(a, b) {
  const out = { ...a }
  for (const key of Object.keys(b)) {
    const fa = a[key]
    const fb = b[key]
    out[key] = fa ? (e) => { fa(e); fb(e) } : fb
  }
  return out
}
```

- [ ] **Step 4: 改 `ActivityCard` 组件签名与 body**

把组件参数表里加上 `onCardContextMenu`（放在 `draggable = true` 后面）：

```jsx
export default function ActivityCard({
  activity,
  onClick,
  readOnly,
  isHighlighted = false,
  onHoverActivity,
  onClearHover,
  dayColorName = 'none',
  author,
  members,
  draggable = true,
  onCardContextMenu,
}) {
```

在 `const dragAttributes = readOnly ? {} : attributes` / `const dragListeners = readOnly ? {} : listeners` 之后，`handleBodyClick` 之前，插入：

```jsx
  const longPress = useLongPress((x, y) => {
    if (onCardContextMenu) onCardContextMenu(activity, x, y)
  })

  const handleContextMenu = (e) => {
    if (!onCardContextMenu) return
    e.preventDefault()
    onCardContextMenu(activity, e.clientX, e.clientY)
  }

  const pointerMenuListeners = onCardContextMenu
    ? {
        onPointerDown: longPress.onPointerDown,
        onPointerMove: longPress.onPointerMove,
        onPointerUp: longPress.onPointerUp,
        onPointerLeave: longPress.onPointerLeave,
        onPointerCancel: longPress.onPointerCancel,
      }
    : {}

  const finalListeners = mergeListeners(draggable ? dragListeners : {}, pointerMenuListeners)
```

把 `handleBodyClick` 改为吞掉长按后那次 click：

```jsx
  const handleBodyClick = () => {
    if (longPress.firedRef.current) {
      longPress.firedRef.current = false
      return
    }
    if (onClick) onClick(activity.id)
  }
```

在返回的根 `<div>` 上，把原来的两行：

```jsx
      {...(draggable ? dragAttributes : {})}
      {...(draggable ? dragListeners : {})}
```

替换为（用合并后的 listeners，并加 `onContextMenu`，放在 spread 之后避免被覆盖）：

```jsx
      {...(draggable ? dragAttributes : {})}
      {...finalListeners}
      onContextMenu={handleContextMenu}
```

> 注意：`onContextMenu` 必须放在 `{...finalListeners}` 之后；`dragAttributes`/`finalListeners` 均不含 `onContextMenu`，故不会被覆盖。`onClick`、`onKeyDown` 等保持原位（在 spread 之前），`finalListeners` 不含这些 key，不受影响。

- [ ] **Step 5: 跑测试，确认通过**

Run: `npm test -- app/javascript/components/planner/__tests__/ActivityCard.test.jsx`
Expected: PASS（3 passed）。

- [ ] **Step 6: 回归 —— 跑全部 JS 测试**

Run: `npm test`
Expected: 全绿（含既有 `DayColumn.test.jsx` 等不受影响）。若有红，先修再继续。

- [ ] **Step 7: 提交**

```bash
git add app/javascript/components/planner/ActivityCard.jsx app/javascript/components/planner/__tests__/ActivityCard.test.jsx
git commit -m "feat(planner): ActivityCard 支持右键+长按唤起快捷菜单"
```

---

## Task 4: `Show.jsx` 接线 + 三处 prop 透传 + 端到端验证

**Files:**
- Modify: `app/javascript/pages/Tour/Show.jsx`
- Modify: `app/javascript/components/planner/DayPanel.jsx`
- Modify: `app/javascript/components/planner/DayColumn.jsx`
- Modify: `app/javascript/components/planner/BacklogList.jsx`

> 本任务是集成接线，逻辑已被 Task 1–3 的单测覆盖；末尾用 dev server 预览做真实右键/长按验证（参考项目惯例：拖拽/点击类交互必须真浏览器实测）。

- [ ] **Step 1: `Show.jsx` —— import 菜单组件**

在 `app/javascript/pages/Tour/Show.jsx` 的 import 区（紧随 `import ActivityDetailDrawer from ...` 一行后）加：

```jsx
import ActivityContextMenu from '../../components/planner/ActivityContextMenu'
```

- [ ] **Step 2: `Show.jsx` —— 菜单 state + openCardMenu**

在 `const [detailViewer, setDetailViewer] = useState(...)` 附近（其它卡片相关 state 旁）加：

```jsx
  // 卡片右键 / 长按快捷菜单：{ activity, x, y } | null
  const [cardMenu, setCardMenu] = useState(null)
  const openCardMenu = (activity, x, y) => setCardMenu({ activity, x, y })
```

- [ ] **Step 3: `Show.jsx` —— handleDeleteActivity（镜像 ActivityDrawer 现有删除逻辑）**

在 `handleCloneActivity` 函数之后插入。`modals` / `router` / `undoStack` / `csrfToken` 均已 import：

```jsx
  // 镜像 ActivityDrawer.handleDelete：确认弹窗 → DELETE → undo 用 recreate 还原。
  // 与抽屉内删除唯一差异：这里没有抽屉要关，故省去 onClose。
  const handleDeleteActivity = (activityId) => {
    const activity = activities.find((a) => a.id === activityId)
    if (!activity) return
    modals.openConfirmModal({
      title: '确认删除此行？',
      labels: { confirm: '删除', cancel: '取消' },
      confirmProps: { color: 'red' },
      onConfirm: () => {
        const savedAttrs = { ...activity }
        const wasInDay = activity.day_id
        router.delete(`/activities/${activity.id}`, {
          preserveScroll: true,
          only: ['activities', 'violations'],
          onSuccess: () => {
            undoStack.push({
              label: `删除 ${activity.name}`,
              undoFn: async () => {
                const url = wasInDay
                  ? `/tours/${tour.id}/days/${wasInDay}/activities`
                  : `/tours/${tour.id}/backlog_activities`
                const payload = {
                  activity: {
                    name: savedAttrs.name,
                    kind: savedAttrs.kind,
                    citizen_level: savedAttrs.citizen_level,
                    lat: savedAttrs.lat,
                    lng: savedAttrs.lng,
                    address: savedAttrs.address,
                    planned_start_at: savedAttrs.planned_start_at,
                    planned_duration_min: savedAttrs.planned_duration_min,
                    desc: savedAttrs.desc,
                    details: savedAttrs.details || {},
                  },
                }
                const res = await fetch(url, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json', 'Accept': 'application/json', 'X-CSRF-Token': csrfToken() },
                  body: JSON.stringify(payload),
                })
                if (!res.ok) throw new Error(`HTTP ${res.status}`)
                router.reload({ only: ['activities', 'violations'] })
              },
            })
          },
        })
      },
    })
  }
```

- [ ] **Step 4: `Show.jsx` —— 下传回调到 BacklogList 和 DayPanel**

给 `<BacklogList ...>` 加一个 prop（放在 `onEditActivity={openDetail}` 旁）：

```jsx
            onCardContextMenu={canEdit ? openCardMenu : undefined}
```

给 `<DayPanel ...>` 加同名 prop（放在 `onEditActivity={openDetail}` 旁）：

```jsx
            onCardContextMenu={canEdit ? openCardMenu : undefined}
```

- [ ] **Step 5: `Show.jsx` —— 渲染菜单组件**

在 `<ActivityDetailDrawer ... />` 之后（其它 drawer/dialog 之间任意处）加：

```jsx
      <ActivityContextMenu
        state={cardMenu}
        onClose={() => setCardMenu(null)}
        onEdit={openEdit}
        onAddExpense={openAddExpenseForActivity}
        onClone={handleCloneActivity}
        onMoveToBacklog={(id) => performMove(id, null, 1)}
        onDelete={handleDeleteActivity}
      />
```

> `performMove` 是组件底部的函数声明（已 hoist），`openEdit`/`openAddExpenseForActivity`/`handleCloneActivity` 在上方已定义，均在作用域内。`onMoveToBacklog` 复用 `performMove(id, null, 1)` —— 乐观更新 + undo，与拖拽到候选池一致，落在候选池首位。

- [ ] **Step 6: `DayPanel.jsx` —— 透传**

在 `app/javascript/components/planner/DayPanel.jsx` 参数表加 `onCardContextMenu`（放在 `onEditActivity` 旁）：

```jsx
  onEditActivity,
  onCardContextMenu,
```

并在 `<DayColumn ... />` 上透传（放在 `onEditActivity={onEditActivity}` 旁）：

```jsx
            onEditActivity={onEditActivity}
            onCardContextMenu={onCardContextMenu}
```

- [ ] **Step 7: `DayColumn.jsx` —— 透传**

在 `app/javascript/components/planner/DayColumn.jsx` 参数表加 `onCardContextMenu`（放在 `onEditActivity` 旁）：

```jsx
  onEditActivity,
  onCardContextMenu,
```

并在 `renderedItems.push(<ActivityCard .../>)` 里给卡片透传（放在 `onClick={onEditActivity}` 旁）：

```jsx
        onClick={onEditActivity}
        onCardContextMenu={onCardContextMenu}
```

- [ ] **Step 8: `BacklogList.jsx` —— 透传**

在 `app/javascript/components/planner/BacklogList.jsx` 参数表加 `onCardContextMenu`（放在 `onEditActivity` 旁）：

```jsx
  onEditActivity,
  onCardContextMenu,
```

并在 `<ActivityCard ... />`（`activities.map` 内）透传（放在 `onClick={onEditActivity}` 旁）：

```jsx
                  onClick={onEditActivity}
                  onCardContextMenu={onCardContextMenu}
```

- [ ] **Step 9: 回归 —— 跑全部 JS 测试**

Run: `npm test`
Expected: 全绿。

- [ ] **Step 10: 端到端真实验证（dev server 预览）**

本 worktree 是次级 worktree，用 `bin/worktree-dev up` 起隔离端口/DB（见 CLAUDE.md gotcha；勿用 `bin/dev`）。然后用 preview 工具流程：

1. `preview_start`（指向 worktree dev server 地址），打开一个有活动卡片的 Tour。
2. 桌面右键一张**日程卡片** → 断言出现 5 项菜单（编辑/记账/克隆/移到候选池/删除），位置贴近光标。逐项点：
   - 编辑 → 打开**编辑表单**（非只读详情）。
   - 记账 → 打开 AddExpenseDialog，scope 预填该活动。
   - 克隆 → 同日新增一张副本。
   - 移到候选池 → 卡片移入左侧候选池。
   - 删除 → 出现“确认删除此行？”弹窗，确认后卡片消失。
3. 右键一张**候选池卡片** → 断言只有 编辑/克隆/删除（无 记账、无 移到候选池）。
4. `preview_resize` 到窄/触屏视口，对卡片做**长按**（用 `preview_eval` 派发 pointerdown 后等 500ms 再 pointerup，或真实触摸模拟）→ 菜单出现；**轻点**仍打开详情；拖拽不被长按打断。
5. （可选）以只读身份（reader）打开 → 右键卡片为浏览器原生菜单，无自定义菜单。
6. `preview_console_logs` 确认无报错；`preview_screenshot` 留存日程卡 5 项菜单 + 候选池卡 3 项菜单两张图。

若发现问题：读源码定位 → 改 → 回到 Step 9 重跑。

- [ ] **Step 11: 提交**

```bash
git add app/javascript/pages/Tour/Show.jsx app/javascript/components/planner/DayPanel.jsx app/javascript/components/planner/DayColumn.jsx app/javascript/components/planner/BacklogList.jsx
git commit -m "feat(planner): 卡片右键菜单接线(编辑/记账/克隆/移到候选池/删除)"
```

---

## Task 5: 收尾验证

- [ ] **Step 1: 全量 JS 测试 + 审计**

Run: `npm test`
Expected: 全绿。

Run: `npm audit`
Expected: 无新增高危（本改动未加依赖，应与改前一致）。

- [ ] **Step 2: 自检验收清单（对照设计文档 §8）**

- [ ] 桌面右键日程卡片 → 5 项，逐项功能正确。
- [ ] 桌面右键候选池卡片 → 仅 编辑/克隆/删除。
- [ ] 触屏长按 → 菜单出现；轻点仍打开详情；拖拽不被打断。
- [ ] 只读用户右键 → 浏览器原生菜单。
- [ ] `npm test` 全绿；新增 3 组单测通过。

> 说明：本特性无 Ruby 改动，CI 的 `bin/rubocop` / `bin/brakeman` 无关；JS 侧 CI 仅 `npm audit`。本仓库测试不在 CI 跑，故上面的本地 `npm test` 是唯一防线，务必跑。

---

## Self-Review（计划对照 spec）

**1. Spec coverage：**
- §2 关键决策（编辑直达表单 / 双卡片自适应 / 右键+长按 / 单受控 Menu）→ Task 2（自适应 Menu）+ Task 3（右键+长按）+ Task 4（编辑直达 `openEdit`）。✓
- §3 菜单项矩阵（含候选池隐藏 记账/移到候选池、删除红色置于分隔线下）→ Task 2 实现 + 测试。✓
- §4.1 新文件（useLongPress / ActivityContextMenu）→ Task 1 / Task 2。✓
- §4.2 改动文件（ActivityCard / Show / DayPanel / DayColumn / BacklogList）→ Task 3 / Task 4。✓
- §4.2 handleDeleteActivity 镜像 ActivityDrawer → Task 4 Step 3（逐字含 recreate undo）。✓
- §5 dnd-kit 共存（右键 button2 被忽略 / 长按与拖拽互斥 / merge listeners）→ Task 3 Step 3–4 + Task 1。✓
- §6 边界（克隆防双击 / 删除确认 / 长按吞 click / 只读不挂载）→ Task 3（firedRef 吞 click、无回调不 preventDefault）+ Task 4（复用 cloningRef、确认弹窗）。✓
- §7 测试（ActivityCard / ActivityContextMenu / useLongPress）→ Task 1/2/3 测试 + Task 4 真浏览器验证。✓
- §8 验收 → Task 5。✓

**2. Placeholder scan：** 无 TBD/TODO；每个代码步骤含完整代码；命令含预期输出。复选框 `- [ ]` 为进度跟踪，非占位符。✓

**3. Type/命名一致性：** `onCardContextMenu`（回调名）在 ActivityCard / DayColumn / DayPanel / BacklogList / Show 全链路一致；`cardMenu` / `openCardMenu` / `setCardMenu` 一致；`state = { activity, x, y }` 在 Menu 组件与 Show 一致；`handleDeleteActivity` / `performMove(id, null, 1)` / `openEdit` / `openAddExpenseForActivity` / `handleCloneActivity` 均指向 Show 内既有或本计划新增的同名函数。✓
