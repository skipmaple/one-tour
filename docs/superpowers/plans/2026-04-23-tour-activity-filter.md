# Tour 活动搜索与过滤 · Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 Tour 详情页（Planner）Header 加入活动搜索 + 过滤条，三视图（Backlog / DayPanel / Map）联动 Hide 未匹配活动，URL 作状态权威源。

**Architecture:** 纯前端 React/Inertia 实现。单一 `useActivityFilter` hook 承担匹配谓词 + URL 同步；UI 组件 `ActivityFilterBar` 通过新增的 `useInjectHeaderLeftTools` slot 注入 AppShell.Header；Show.jsx 一处过滤，多处消费。Backlog 既有本地 `kindFilter + levelFilter` 拆除后由全局过滤取代（`levelFilter` 直接删除，已确认超出 MVP）。

**Tech Stack:** React 19 · Inertia `@inertiajs/react` 3.0 · Mantine 9 · @dnd-kit · @tabler/icons-react · Vitest 4

**Spec:** [docs/superpowers/specs/2026-04-23-tour-activity-filter-design.md](../specs/2026-04-23-tour-activity-filter-design.md)

---

## File Structure

**Create (4 files):**
- `app/javascript/hooks/useActivityFilter.js` — URL 同步 + 匹配谓词
- `app/javascript/hooks/__tests__/useActivityFilter.test.js` — hook 单测
- `app/javascript/components/planner/ActivityFilterBar.jsx` — Filter Bar UI
- `app/javascript/components/planner/__tests__/ActivityFilterBar.test.jsx` — 组件单测

**Modify (7 files):**
- `app/javascript/layouts/HeaderSlot.jsx` — 新增 Left Tools slot
- `app/javascript/layouts/__tests__/HeaderSlot.test.jsx` — Left slot 单测
- `app/javascript/layouts/AppShell.jsx` — 渲染 Left slot
- `app/javascript/pages/Tour/Show.jsx` — wire 过滤 + Filter Bar 注入
- `app/javascript/components/planner/BacklogList.jsx` — 移除本地 `kindFilter + levelFilter`，改为接收上游过滤后的 activities；加"筛选中"banner
- `app/javascript/components/planner/__tests__/BacklogList.test.jsx` — 更新受影响的测试
- `app/javascript/components/planner/DayPanel.jsx` + `DayColumn.jsx` — 空状态 + banner
- `app/javascript/components/planner/PlannerMap.jsx` — `matches` 谓词 + route_legs 两端 gate
- `app/javascript/components/planner/ActivityCard.jsx` — `draggable` prop

---

## Task 1: 扩展 HeaderSlot — 新增 Left Tools slot

**Files:**
- Modify: `app/javascript/layouts/HeaderSlot.jsx`
- Modify: `app/javascript/layouts/__tests__/HeaderSlot.test.jsx`
- Modify: `app/javascript/layouts/AppShell.jsx`

- [ ] **Step 1: 写失败测试（扩展现有 HeaderSlot.test.jsx）**

追加到 `app/javascript/layouts/__tests__/HeaderSlot.test.jsx` 末尾（在最后一个 `})`之前插入 describe 外的新 describe；保持原有测试不动）：

```jsx
import { HeaderSlotProvider, useInjectHeaderRight, useHeaderRightSlot, useInjectHeaderLeftTools, useHeaderLeftToolsSlot } from '../HeaderSlot.jsx'

function LeftConsumer() {
  const node = useHeaderLeftToolsSlot()
  return <div data-testid="left-slot-consumer">{node}</div>
}

function LeftInjector({ node }) {
  useInjectHeaderLeftTools(node)
  return null
}

describe('HeaderSlot · left tools', () => {
  it('starts with no left-slot content', () => {
    render(
      <HeaderSlotProvider>
        <LeftConsumer />
      </HeaderSlotProvider>,
    )
    expect(screen.getByTestId('left-slot-consumer')).toBeEmptyDOMElement()
  })

  it('shows injected left content', () => {
    render(
      <HeaderSlotProvider>
        <LeftConsumer />
        <LeftInjector node={<span data-testid="left-injected">tools</span>} />
      </HeaderSlotProvider>,
    )
    expect(screen.getByTestId('left-injected')).toBeInTheDocument()
  })

  it('clears left slot on unmount', () => {
    function Wrapper({ show }) {
      return (
        <HeaderSlotProvider>
          <LeftConsumer />
          {show && <LeftInjector node={<span data-testid="left-injected">tools</span>} />}
        </HeaderSlotProvider>
      )
    }
    const { rerender } = render(<Wrapper show />)
    expect(screen.getByTestId('left-injected')).toBeInTheDocument()
    rerender(<Wrapper show={false} />)
    expect(screen.queryByTestId('left-injected')).not.toBeInTheDocument()
  })

  it('left and right slots are independent', () => {
    render(
      <HeaderSlotProvider>
        <LeftConsumer />
        <Consumer />
        <LeftInjector node={<span data-testid="left-injected">L</span>} />
        <Injector node={<span data-testid="injected">R</span>} />
      </HeaderSlotProvider>,
    )
    expect(screen.getByTestId('left-injected')).toBeInTheDocument()
    expect(screen.getByTestId('injected')).toBeInTheDocument()
  })
})
```

同时修改已有 import 行（第 3 行）为：

```jsx
import { HeaderSlotProvider, useInjectHeaderRight, useHeaderRightSlot, useInjectHeaderLeftTools, useHeaderLeftToolsSlot } from '../HeaderSlot.jsx'
```

- [ ] **Step 2: 运行测试确认失败**

```bash
npm test -- layouts/__tests__/HeaderSlot
```

Expected: 4 个新测试全部 FAIL（导出不存在）；原 3 个测试 PASS。

- [ ] **Step 3: 扩展 HeaderSlot.jsx**

将 `app/javascript/layouts/HeaderSlot.jsx` 整个替换为：

```jsx
import { createContext, useContext, useEffect, useState } from 'react'

const HeaderSlotContext = createContext({
  right: null, setRight: () => {},
  leftTools: null, setLeftTools: () => {},
})

export function HeaderSlotProvider({ children }) {
  const [right, setRight] = useState(null)
  const [leftTools, setLeftTools] = useState(null)
  return (
    <HeaderSlotContext.Provider value={{ right, setRight, leftTools, setLeftTools }}>
      {children}
    </HeaderSlotContext.Provider>
  )
}

export function useHeaderRightSlot() {
  return useContext(HeaderSlotContext).right
}

export function useInjectHeaderRight(node) {
  const { setRight } = useContext(HeaderSlotContext)
  useEffect(() => {
    setRight(node)
    return () => setRight(null)
  }, [node, setRight])
}

export function useHeaderLeftToolsSlot() {
  return useContext(HeaderSlotContext).leftTools
}

export function useInjectHeaderLeftTools(node) {
  const { setLeftTools } = useContext(HeaderSlotContext)
  useEffect(() => {
    setLeftTools(node)
    return () => setLeftTools(null)
  }, [node, setLeftTools])
}
```

- [ ] **Step 4: 运行测试确认通过**

```bash
npm test -- layouts/__tests__/HeaderSlot
```

Expected: 7 个测试全部 PASS。

- [ ] **Step 5: 在 AppShell.jsx 渲染 Left slot**

修改 `app/javascript/layouts/AppShell.jsx`：

- 第 11 行 import 补 `useHeaderLeftToolsSlot`：
  ```jsx
  import { HeaderSlotProvider, useHeaderRightSlot, useHeaderLeftToolsSlot } from './HeaderSlot'
  ```
- 在 `const rightSlot = useHeaderRightSlot()` 下一行新增：
  ```jsx
  const leftToolsSlot = useHeaderLeftToolsSlot()
  ```
- 替换 `<Text fw={600} size="sm">{title}</Text>` 紧邻的 `<Box style={{ flex: 1 }} />` 为：
  ```jsx
  <Text fw={600} size="sm">{title}</Text>
  {leftToolsSlot}
  <Box style={{ flex: 1 }} />
  ```

最终第 86-89 行应是：
```jsx
<Text fw={600} size="sm">{title}</Text>
{leftToolsSlot}
<Box style={{ flex: 1 }} />
{rightSlot}
```

- [ ] **Step 6: 快速 smoke 测试（现有 AppShell 测试不应破坏）**

```bash
npm test -- layouts/__tests__/AppShell
```

Expected: 全部 PASS。

- [ ] **Step 7: Commit**

```bash
git add app/javascript/layouts/HeaderSlot.jsx \
        app/javascript/layouts/__tests__/HeaderSlot.test.jsx \
        app/javascript/layouts/AppShell.jsx
git commit -m "$(cat <<'EOF'
feat(layout): add HeaderSlot left-tools slot

Symmetric to existing right slot; AppShell renders injected tools
between title and flex spacer. Prepares for Planner activity filter
bar injection.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: `useActivityFilter` — 匹配逻辑（无 URL 同步）

**Files:**
- Create: `app/javascript/hooks/useActivityFilter.js`
- Create: `app/javascript/hooks/__tests__/useActivityFilter.test.js`

**Scope of this task:** 实现**纯匹配逻辑**：接收 `activities + filter state + tourMemberIds`，返回 `{ matches, activeCount, totalCount, active }`。**URL 读写在 Task 3 加入**。这个分拆让匹配逻辑可以独立单测，不依赖 Inertia 或 window。

- [ ] **Step 1: 写失败测试**

创建 `app/javascript/hooks/__tests__/useActivityFilter.test.js`：

```javascript
import { describe, it, expect } from 'vitest'
import { renderHook } from '@testing-library/react'
import { useActivityFilterCore } from '../useActivityFilter'

const tour = { authorId: 1, memberIds: [2, 3] } // tour members = [1, 2, 3]

const activities = [
  { id: 10, name: '赛里木湖', kind: 'scenic', details: { ticket_info: 80, note: '日出很美' }, participant_user_ids: [] },
  { id: 11, name: '早餐',     kind: 'food',   details: { price_pp: 30 },                       participant_user_ids: [2] },
  { id: 12, name: '独库公路', kind: 'road',   details: { km: 200 },                            participant_user_ids: [1, 2] },
  { id: 13, name: 'Hotel A',  kind: 'stay',   details: { note: 'good view' },                  participant_user_ids: [3] },
]

describe('useActivityFilterCore', () => {
  it('empty filter — all activities match', () => {
    const { result } = renderHook(() =>
      useActivityFilterCore({ activities, filter: { q: '', kind: [], uids: [] }, tour })
    )
    expect(activities.every(a => result.current.matches(a))).toBe(true)
    expect(result.current.active).toBe(false)
    expect(result.current.activeCount).toBe(4)
    expect(result.current.totalCount).toBe(4)
  })

  it('q matches name (substring, case-insensitive)', () => {
    const { result } = renderHook(() =>
      useActivityFilterCore({ activities, filter: { q: '赛里木', kind: [], uids: [] }, tour })
    )
    expect(result.current.matches(activities[0])).toBe(true)
    expect(result.current.matches(activities[1])).toBe(false)
  })

  it('q matches details string values (recursive)', () => {
    const { result } = renderHook(() =>
      useActivityFilterCore({ activities, filter: { q: '日出', kind: [], uids: [] }, tour })
    )
    expect(result.current.matches(activities[0])).toBe(true)
    expect(result.current.matches(activities[1])).toBe(false)
  })

  it('q ignores non-string details values (numbers, null)', () => {
    const { result } = renderHook(() =>
      useActivityFilterCore({ activities, filter: { q: '200', kind: [], uids: [] }, tour })
    )
    // details.km = 200 (number) — should NOT match
    expect(result.current.matches(activities[2])).toBe(false)
  })

  it('q case-insensitive on English', () => {
    const { result } = renderHook(() =>
      useActivityFilterCore({ activities, filter: { q: 'HOTEL', kind: [], uids: [] }, tour })
    )
    expect(result.current.matches(activities[3])).toBe(true)
  })

  it('q is trimmed; empty after trim = no filter', () => {
    const { result } = renderHook(() =>
      useActivityFilterCore({ activities, filter: { q: '   ', kind: [], uids: [] }, tour })
    )
    expect(activities.every(a => result.current.matches(a))).toBe(true)
    expect(result.current.active).toBe(false)
  })

  it('kind filter — single value', () => {
    const { result } = renderHook(() =>
      useActivityFilterCore({ activities, filter: { q: '', kind: ['food'], uids: [] }, tour })
    )
    expect(result.current.matches(activities[1])).toBe(true)
    expect(result.current.matches(activities[0])).toBe(false)
  })

  it('kind filter — multi value OR', () => {
    const { result } = renderHook(() =>
      useActivityFilterCore({ activities, filter: { q: '', kind: ['food', 'stay'], uids: [] }, tour })
    )
    expect(result.current.matches(activities[1])).toBe(true) // food
    expect(result.current.matches(activities[3])).toBe(true) // stay
    expect(result.current.matches(activities[0])).toBe(false) // scenic
  })

  it('uids — explicit participants intersection', () => {
    const { result } = renderHook(() =>
      useActivityFilterCore({ activities, filter: { q: '', kind: [], uids: [3] }, tour })
    )
    expect(result.current.matches(activities[3])).toBe(true)  // [3] ∩ {3} ≠ ∅
    expect(result.current.matches(activities[1])).toBe(false) // [3] ∩ {2} = ∅
  })

  it('uids — empty participants means all members (matches if any selected uid is a member)', () => {
    const { result } = renderHook(() =>
      useActivityFilterCore({ activities, filter: { q: '', kind: [], uids: [2] }, tour })
    )
    // activities[0].participant_user_ids = [] → treat as {1,2,3}; [2] ∩ {1,2,3} ≠ ∅ → match
    expect(result.current.matches(activities[0])).toBe(true)
  })

  it('uids — non-existent user_id is ignored', () => {
    const { result } = renderHook(() =>
      useActivityFilterCore({ activities, filter: { q: '', kind: [], uids: [999] }, tour })
    )
    // 999 is not a member; effective uids = [] → dimension inactive → all match
    expect(activities.every(a => result.current.matches(a))).toBe(true)
    expect(result.current.active).toBe(false)
  })

  it('uids — mixed valid + invalid', () => {
    const { result } = renderHook(() =>
      useActivityFilterCore({ activities, filter: { q: '', kind: [], uids: [2, 999] }, tour })
    )
    // effective uids = [2]
    expect(result.current.matches(activities[1])).toBe(true)  // [2] ∩ {2}
    expect(result.current.matches(activities[3])).toBe(false) // [2] ∩ {3} = ∅
  })

  it('AND across dimensions', () => {
    const { result } = renderHook(() =>
      useActivityFilterCore({ activities, filter: { q: '早', kind: ['food'], uids: [2] }, tour })
    )
    expect(result.current.matches(activities[1])).toBe(true) // '早餐' ∧ food ∧ uid=2
    expect(result.current.matches(activities[0])).toBe(false) // kind mismatch
    expect(result.current.matches(activities[2])).toBe(false) // q mismatch
  })

  it('activeCount reflects filtered total', () => {
    const { result } = renderHook(() =>
      useActivityFilterCore({ activities, filter: { q: '', kind: ['food'], uids: [] }, tour })
    )
    expect(result.current.activeCount).toBe(1)
    expect(result.current.totalCount).toBe(4)
    expect(result.current.active).toBe(true)
  })
})
```

- [ ] **Step 2: 运行测试确认失败**

```bash
npm test -- hooks/__tests__/useActivityFilter
```

Expected: 所有测试 FAIL（模块不存在）。

- [ ] **Step 3: 实现 `useActivityFilter.js`（先只导出 core）**

创建 `app/javascript/hooks/useActivityFilter.js`：

```javascript
import { useMemo } from 'react'

// Recursively collect string-typed values from a nested object/array.
// Non-strings (numbers, booleans, null, undefined) are ignored. This mirrors
// the spec's matching rule: q matches activity.name + details string values.
function collectStrings(value, acc) {
  if (value == null) return
  if (typeof value === 'string') { acc.push(value); return }
  if (Array.isArray(value)) { value.forEach(v => collectStrings(v, acc)); return }
  if (typeof value === 'object') {
    for (const k in value) collectStrings(value[k], acc)
  }
}

function buildSearchableText(activity) {
  const parts = [activity.name || '']
  collectStrings(activity.details, parts)
  return parts.join('\n').toLowerCase()
}

// `effective participants` for uids matching: empty list = all tour members.
// Mirrors Activity#effective_participant_ids on the backend.
function effectiveParticipantSet(activity, allMemberIdSet) {
  const explicit = activity.participant_user_ids
  if (explicit && explicit.length > 0) return new Set(explicit)
  return allMemberIdSet
}

function hasIntersection(setA, listB) {
  for (const v of listB) if (setA.has(v)) return true
  return false
}

export function useActivityFilterCore({ activities, filter, tour }) {
  const { q, kind, uids } = filter

  const allMemberIdSet = useMemo(
    () => new Set([tour.authorId, ...tour.memberIds]),
    [tour.authorId, tour.memberIds]
  )

  // Only keep uids that are actually Tour members (filters out stale/unknown).
  const effectiveUids = useMemo(
    () => uids.filter(u => allMemberIdSet.has(u)),
    [uids, allMemberIdSet]
  )

  // Pre-compute searchable text per activity to avoid recursion on each filter pass.
  const searchableByActivityId = useMemo(() => {
    const map = new Map()
    for (const a of activities) map.set(a.id, buildSearchableText(a))
    return map
  }, [activities])

  const qTrimmed = q.trim().toLowerCase()

  const active = qTrimmed !== '' || kind.length > 0 || effectiveUids.length > 0

  const matches = useMemo(() => {
    return (activity) => {
      if (qTrimmed) {
        const text = searchableByActivityId.get(activity.id) || ''
        if (!text.includes(qTrimmed)) return false
      }
      if (kind.length > 0) {
        if (!kind.includes(activity.kind)) return false
      }
      if (effectiveUids.length > 0) {
        const effSet = effectiveParticipantSet(activity, allMemberIdSet)
        if (!hasIntersection(effSet, effectiveUids)) return false
      }
      return true
    }
  }, [qTrimmed, kind, effectiveUids, searchableByActivityId, allMemberIdSet])

  const activeCount = useMemo(
    () => activities.filter(matches).length,
    [activities, matches]
  )

  return {
    matches,
    active,
    activeCount,
    totalCount: activities.length,
  }
}
```

- [ ] **Step 4: 运行测试确认通过**

```bash
npm test -- hooks/__tests__/useActivityFilter
```

Expected: 所有测试 PASS。

- [ ] **Step 5: Commit**

```bash
git add app/javascript/hooks/useActivityFilter.js \
        app/javascript/hooks/__tests__/useActivityFilter.test.js
git commit -m "$(cat <<'EOF'
feat(hooks): useActivityFilterCore matching predicate

Pure matching logic: AND across dimensions, OR within kind/uids.
'Empty participants = all members' semantic mirrors backend's
Activity#effective_participant_ids. URL sync comes in a follow-up.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: `useActivityFilter` — 增加 URL 同步 + debounce

**Files:**
- Modify: `app/javascript/hooks/useActivityFilter.js`
- Modify: `app/javascript/hooks/__tests__/useActivityFilter.test.js`

- [ ] **Step 1: 追加 URL 同步测试**

在 `app/javascript/hooks/__tests__/useActivityFilter.test.js` 顶部附近插入 Inertia mock（顶部 import 之后、describe 之前）：

```javascript
import { vi } from 'vitest'
import { act } from '@testing-library/react'

vi.mock('@inertiajs/react', () => ({
  router: { replace: vi.fn() },
  usePage: vi.fn(() => ({ url: '/tours/42' })),
}))

// useActivityFilter imports router and usePage — dynamic import after mock
const { useActivityFilter } = await import('../useActivityFilter')
```

（注意 top-level `await import` 要求 vitest 以 ESM 运行——此仓库 package.json 含 `"type": "module"`，已 OK。）

然后追加新 `describe` 块（紧接现有 `describe('useActivityFilterCore')` 后）：

```javascript
import { router, usePage } from '@inertiajs/react'

describe('useActivityFilter · URL sync', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
    usePage.mockReturnValue({ url: '/tours/42' })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('reads initial filter from URL params', () => {
    usePage.mockReturnValue({ url: '/tours/42?q=%E9%A4%90&kind=food,stay&uids=2,3' })
    const { result } = renderHook(() => useActivityFilter({ activities, tour }))
    expect(result.current.filter.q).toBe('餐')
    expect(result.current.filter.kind).toEqual(['food', 'stay'])
    expect(result.current.filter.uids).toEqual([2, 3])
  })

  it('defaults to empty filter when URL has no params', () => {
    const { result } = renderHook(() => useActivityFilter({ activities, tour }))
    expect(result.current.filter.q).toBe('')
    expect(result.current.filter.kind).toEqual([])
    expect(result.current.filter.uids).toEqual([])
  })

  it('setQ debounces 200ms then router.replace', () => {
    const { result } = renderHook(() => useActivityFilter({ activities, tour }))
    act(() => { result.current.setQ('餐') })
    expect(router.replace).not.toHaveBeenCalled()
    act(() => { vi.advanceTimersByTime(200) })
    expect(router.replace).toHaveBeenCalledWith(
      '/tours/42?q=%E9%A4%90',
      expect.objectContaining({ preserveState: true, preserveScroll: true, only: [] })
    )
  })

  it('setKind is immediate (no debounce)', () => {
    const { result } = renderHook(() => useActivityFilter({ activities, tour }))
    act(() => { result.current.setKind(['food']) })
    expect(router.replace).toHaveBeenCalledWith(
      '/tours/42?kind=food',
      expect.objectContaining({ preserveState: true, preserveScroll: true })
    )
  })

  it('setUids is immediate', () => {
    const { result } = renderHook(() => useActivityFilter({ activities, tour }))
    act(() => { result.current.setUids([2, 3]) })
    expect(router.replace).toHaveBeenCalledWith(
      '/tours/42?uids=2,3',
      expect.objectContaining({ preserveState: true, preserveScroll: true })
    )
  })

  it('reset clears all three params in one call', () => {
    usePage.mockReturnValue({ url: '/tours/42?q=a&kind=food&uids=2' })
    const { result } = renderHook(() => useActivityFilter({ activities, tour }))
    act(() => { result.current.reset() })
    expect(router.replace).toHaveBeenCalledWith(
      '/tours/42',
      expect.objectContaining({ preserveState: true, preserveScroll: true })
    )
  })

  it('empty string values drop the param from URL', () => {
    usePage.mockReturnValue({ url: '/tours/42?q=abc&kind=food' })
    const { result } = renderHook(() => useActivityFilter({ activities, tour }))
    act(() => { result.current.setQ('') })
    act(() => { vi.advanceTimersByTime(200) })
    expect(router.replace).toHaveBeenCalledWith(
      '/tours/42?kind=food',
      expect.anything()
    )
  })
})
```

- [ ] **Step 2: 运行测试确认失败**

```bash
npm test -- hooks/__tests__/useActivityFilter
```

Expected: core 测试仍 PASS；新 URL-sync 测试 FAIL（`useActivityFilter` 未导出）。

- [ ] **Step 3: 在 hook 文件追加 `useActivityFilter`**

编辑 `app/javascript/hooks/useActivityFilter.js`，在文件顶部 imports 后追加 inertia imports，在 `useActivityFilterCore` 函数之后追加新导出：

```javascript
// 顶部追加：
import { useCallback, useEffect, useRef, useState } from 'react'
import { router, usePage } from '@inertiajs/react'

// ... 已有 useActivityFilterCore ...

// URL parse/build helpers
function parseUrl(url) {
  const idx = url.indexOf('?')
  const path = idx === -1 ? url : url.slice(0, idx)
  const params = new URLSearchParams(idx === -1 ? '' : url.slice(idx + 1))
  return { path, params }
}

function filterFromParams(params) {
  const q = params.get('q') || ''
  const kindRaw = params.get('kind') || ''
  const uidsRaw = params.get('uids') || ''
  const kind = kindRaw ? kindRaw.split(',').filter(Boolean) : []
  const uids = uidsRaw ? uidsRaw.split(',').map(Number).filter(n => Number.isFinite(n)) : []
  return { q, kind, uids }
}

function buildUrl(path, { q, kind, uids }) {
  const params = new URLSearchParams()
  if (q) params.set('q', q)
  if (kind.length > 0) params.set('kind', kind.join(','))
  if (uids.length > 0) params.set('uids', uids.join(','))
  const qs = params.toString()
  return qs ? `${path}?${qs}` : path
}

const DEBOUNCE_MS = 200

export function useActivityFilter({ activities, tour }) {
  const { url } = usePage()
  const { path, params } = parseUrl(url)
  const urlFilter = filterFromParams(params)

  // Local state mirrors URL for immediate UI feedback; URL catches up after debounce.
  const [local, setLocal] = useState(urlFilter)

  // Re-sync from URL when URL changes externally (e.g. back button, another
  // hook navigation).
  const urlKey = `${urlFilter.q}|${urlFilter.kind.join(',')}|${urlFilter.uids.join(',')}`
  useEffect(() => {
    setLocal(urlFilter)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [urlKey])

  const pushUrl = useCallback((nextFilter) => {
    const nextUrl = buildUrl(path, nextFilter)
    router.replace(nextUrl, { preserveState: true, preserveScroll: true, only: [] })
  }, [path])

  const qDebounceRef = useRef(null)

  const setQ = useCallback((v) => {
    setLocal(prev => {
      const next = { ...prev, q: v }
      if (qDebounceRef.current) clearTimeout(qDebounceRef.current)
      qDebounceRef.current = setTimeout(() => pushUrl(next), DEBOUNCE_MS)
      return next
    })
  }, [pushUrl])

  const setKind = useCallback((v) => {
    setLocal(prev => {
      const next = { ...prev, kind: v }
      pushUrl(next)
      return next
    })
  }, [pushUrl])

  const setUids = useCallback((v) => {
    setLocal(prev => {
      const next = { ...prev, uids: v }
      pushUrl(next)
      return next
    })
  }, [pushUrl])

  const reset = useCallback(() => {
    const empty = { q: '', kind: [], uids: [] }
    setLocal(empty)
    pushUrl(empty)
    if (qDebounceRef.current) clearTimeout(qDebounceRef.current)
  }, [pushUrl])

  const core = useActivityFilterCore({ activities, filter: local, tour })

  return {
    filter: local,
    setQ,
    setKind,
    setUids,
    reset,
    ...core,
  }
}
```

- [ ] **Step 4: 运行测试确认通过**

```bash
npm test -- hooks/__tests__/useActivityFilter
```

Expected: 全部 PASS（core + URL sync 共 ~20 个测试）。

- [ ] **Step 5: Commit**

```bash
git add app/javascript/hooks/useActivityFilter.js \
        app/javascript/hooks/__tests__/useActivityFilter.test.js
git commit -m "$(cat <<'EOF'
feat(hooks): useActivityFilter URL-backed state

Wraps useActivityFilterCore with router.replace debounced on q
(200ms), immediate on kind/uids. Local state mirrors URL for snappy
UI; URL is the source of truth (back button, share, refresh).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: `ActivityFilterBar` 组件

**Files:**
- Create: `app/javascript/components/planner/ActivityFilterBar.jsx`
- Create: `app/javascript/components/planner/__tests__/ActivityFilterBar.test.jsx`

- [ ] **Step 1: 写失败测试**

创建 `app/javascript/components/planner/__tests__/ActivityFilterBar.test.jsx`：

```jsx
import { render, screen, fireEvent, within } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { MantineProvider } from '@mantine/core'
import ActivityFilterBar from '../ActivityFilterBar'

const members = [
  { user_id: 1, name: 'Alice', avatar_url: null },
  { user_id: 2, name: 'Bob',   avatar_url: null },
]
const author = { user_id: 1, name: 'Alice', avatar_url: null }

function renderBar(props = {}) {
  const defaultProps = {
    filter: { q: '', kind: [], uids: [] },
    setQ: vi.fn(),
    setKind: vi.fn(),
    setUids: vi.fn(),
    reset: vi.fn(),
    active: false,
    activeCount: 10,
    totalCount: 10,
    members,
    author,
  }
  return render(
    <MantineProvider>
      <ActivityFilterBar {...defaultProps} {...props} />
    </MantineProvider>
  )
}

describe('ActivityFilterBar', () => {
  it('renders search input and filter icon button', () => {
    renderBar()
    expect(screen.getByRole('textbox', { name: /搜索活动/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /筛选/ })).toBeInTheDocument()
  })

  it('hides count badge and reset button when no filter active', () => {
    renderBar({ active: false })
    expect(screen.queryByText(/\d+\s*\/\s*\d+/)).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '重置' })).not.toBeInTheDocument()
  })

  it('shows count "X / Y" and reset button when filter active', () => {
    renderBar({ active: true, activeCount: 3, totalCount: 10 })
    expect(screen.getByText('3 / 10')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '重置' })).toBeInTheDocument()
  })

  it('typing in search calls setQ', () => {
    const setQ = vi.fn()
    renderBar({ setQ })
    fireEvent.change(screen.getByRole('textbox', { name: /搜索活动/ }), {
      target: { value: '餐' },
    })
    expect(setQ).toHaveBeenCalledWith('餐')
  })

  it('filter value controls input (controlled component)', () => {
    renderBar({ filter: { q: '赛里木', kind: [], uids: [] } })
    expect(screen.getByRole('textbox', { name: /搜索活动/ })).toHaveValue('赛里木')
  })

  it('clicking reset calls reset()', () => {
    const reset = vi.fn()
    renderBar({ active: true, reset })
    fireEvent.click(screen.getByRole('button', { name: '重置' }))
    expect(reset).toHaveBeenCalled()
  })

  it('opens popover and shows Kind chips when filter button clicked', () => {
    renderBar()
    fireEvent.click(screen.getByRole('button', { name: /筛选/ }))
    expect(screen.getByText('景点')).toBeInTheDocument()
    expect(screen.getByText('路过')).toBeInTheDocument()
    expect(screen.getByText('吃饭')).toBeInTheDocument()
    expect(screen.getByText('住宿')).toBeInTheDocument()
    expect(screen.getByText('加油')).toBeInTheDocument()
    expect(screen.getByText('其他')).toBeInTheDocument()
  })

  it('popover clicks on Kind chip call setKind with updated list', () => {
    const setKind = vi.fn()
    renderBar({ setKind })
    fireEvent.click(screen.getByRole('button', { name: /筛选/ }))
    fireEvent.click(screen.getByText('吃饭'))
    expect(setKind).toHaveBeenCalledWith(['food'])
  })

  it('popover lists participants (author + members)', () => {
    renderBar()
    fireEvent.click(screen.getByRole('button', { name: /筛选/ }))
    expect(screen.getByText('Alice')).toBeInTheDocument()
    expect(screen.getByText('Bob')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: 运行测试确认失败**

```bash
npm test -- components/planner/__tests__/ActivityFilterBar
```

Expected: FAIL（模块不存在）。

- [ ] **Step 3: 实现 `ActivityFilterBar.jsx`**

创建 `app/javascript/components/planner/ActivityFilterBar.jsx`：

```jsx
import { Group, TextInput, ActionIcon, Popover, Stack, Chip, Checkbox, Badge, Button, Indicator, Avatar, Divider, Tooltip } from '@mantine/core'
import {
  IconSearch, IconFilter, IconX,
  IconMountain, IconRoad, IconToolsKitchen2, IconBed, IconGasStation, IconDots,
} from '@tabler/icons-react'
import { useState } from 'react'

const KIND_OPTIONS = [
  { value: 'scenic', label: '景点', Icon: IconMountain },
  { value: 'road',   label: '路过', Icon: IconRoad },
  { value: 'food',   label: '吃饭', Icon: IconToolsKitchen2 },
  { value: 'stay',   label: '住宿', Icon: IconBed },
  { value: 'fuel',   label: '加油', Icon: IconGasStation },
  { value: 'other',  label: '其他', Icon: IconDots },
]

export default function ActivityFilterBar({
  filter, setQ, setKind, setUids, reset,
  active, activeCount, totalCount,
  members, author,
}) {
  const [popoverOpen, setPopoverOpen] = useState(false)

  const allPeople = [
    { user_id: author.user_id, name: author.name, avatar_url: author.avatar_url, isAuthor: true },
    ...members
      .filter(m => m.user_id !== author.user_id)
      .map(m => ({ user_id: m.user_id, name: m.name, avatar_url: m.avatar_url, isAuthor: false })),
  ]

  const toggleUid = (uid) => {
    if (filter.uids.includes(uid)) {
      setUids(filter.uids.filter(u => u !== uid))
    } else {
      setUids([...filter.uids, uid])
    }
  }

  return (
    <Group gap="xs" wrap="nowrap">
      <Divider orientation="vertical" />

      <TextInput
        size="xs"
        w={180}
        value={filter.q}
        onChange={e => setQ(e.currentTarget.value)}
        placeholder="搜索活动名或备注"
        leftSection={<IconSearch size={14} />}
        rightSection={filter.q ? (
          <ActionIcon variant="subtle" size="xs" onClick={() => setQ('')} aria-label="清空搜索">
            <IconX size={12} />
          </ActionIcon>
        ) : null}
        aria-label="搜索活动"
      />

      <Popover
        opened={popoverOpen}
        onChange={setPopoverOpen}
        position="bottom-start"
        width={280}
        withArrow
        shadow="md"
      >
        <Popover.Target>
          <Tooltip label="筛选" withArrow>
            <Indicator color="red" size={8} offset={4} disabled={!active}>
              <ActionIcon
                variant={active ? 'light' : 'subtle'}
                size="md"
                onClick={() => setPopoverOpen(o => !o)}
                aria-label="筛选"
              >
                <IconFilter size={16} />
              </ActionIcon>
            </Indicator>
          </Tooltip>
        </Popover.Target>

        <Popover.Dropdown>
          <Stack gap="sm">
            <div>
              <div style={{ fontSize: 12, color: 'var(--mantine-color-gray-7)', marginBottom: 6 }}>类型</div>
              <Chip.Group multiple value={filter.kind} onChange={setKind}>
                <Group gap={4}>
                  {KIND_OPTIONS.map(({ value, label, Icon }) => (
                    <Chip key={value} value={value} size="xs">
                      <Group gap={4} wrap="nowrap">
                        <Icon size={12} />
                        <span>{label}</span>
                      </Group>
                    </Chip>
                  ))}
                </Group>
              </Chip.Group>
            </div>

            <div>
              <div style={{ fontSize: 12, color: 'var(--mantine-color-gray-7)', marginBottom: 6 }}>参与人</div>
              <Stack gap={4}>
                {allPeople.map(p => (
                  <Checkbox
                    key={p.user_id}
                    size="xs"
                    checked={filter.uids.includes(p.user_id)}
                    onChange={() => toggleUid(p.user_id)}
                    label={
                      <Group gap={6} wrap="nowrap">
                        <Avatar src={p.avatar_url} size={18} radius="xl" />
                        <span>{p.name}{p.isAuthor ? '（作者）' : ''}</span>
                      </Group>
                    }
                  />
                ))}
              </Stack>
            </div>
          </Stack>
        </Popover.Dropdown>
      </Popover>

      {active && (
        <>
          <Badge size="sm" variant="light" color="blue">{activeCount} / {totalCount}</Badge>
          <Button
            size="compact-xs"
            variant="subtle"
            onClick={reset}
            leftSection={<IconX size={12} />}
          >
            重置
          </Button>
        </>
      )}
    </Group>
  )
}
```

- [ ] **Step 4: 运行测试确认通过**

```bash
npm test -- components/planner/__tests__/ActivityFilterBar
```

Expected: 全部 PASS。

- [ ] **Step 5: Commit**

```bash
git add app/javascript/components/planner/ActivityFilterBar.jsx \
        app/javascript/components/planner/__tests__/ActivityFilterBar.test.jsx
git commit -m "$(cat <<'EOF'
feat(planner): ActivityFilterBar component

Controlled filter bar: search input + kind chip group (popover) +
participant checklist (popover) + count badge + reset. Tabler icons
throughout; Chinese labels; no emoji. Indicator dot shows red when
any dimension active.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: 拆除 BacklogList 本地过滤

**Files:**
- Modify: `app/javascript/components/planner/BacklogList.jsx`
- Modify: `app/javascript/components/planner/__tests__/BacklogList.test.jsx`

**Behavior preserved**: BacklogList 仍然接收 `activities`，但这次直接渲染（不过滤）。删除的 UI 元素：2 个 Select（kindFilter + levelFilter）、`KIND_FILTER_OPTIONS` + `LEVEL_FILTER_OPTIONS` 常量、`hasFilter` / `filtered` 相关分支。上游（Show.jsx，Task 9）会在后续 task 里传入过滤后的列表。

- [ ] **Step 1: 先更新 BacklogList.test.jsx — 删除本地过滤相关测试**

修改 `app/javascript/components/planner/__tests__/BacklogList.test.jsx`：

**删除**：
- 整个 `openAndSelect` helper（第 26-30 行）
- `test('filters by kind', ...)` 测试（第 39-45 行）
- `test('filters by level', ...)` 测试（第 47-52 行）
- `test('shows empty state when filter matches nothing', ...)` 测试（第 54-58 行）
- `test('filter hides all but "无匹配" does NOT show empty-CTA frame', ...)` 测试（第 140-159 行）

**保留**：其他所有测试不变（渲染、空态、拖拽折叠等）。

**新增**（在最后 test 之后追加）：

```jsx
test('renders activities as-is (no internal filtering)', () => {
  // Parent is now responsible for filtering; BacklogList just renders what it gets.
  renderIt([fixtures[0]])
  expect(screen.getByText('赛里木湖')).toBeInTheDocument()
  expect(screen.queryByText('早餐')).not.toBeInTheDocument()
  expect(screen.queryByText('独库公路')).not.toBeInTheDocument()
})

test('shows filter banner when filterActive=true', () => {
  render(
    <MantineProvider>
      <DndContext>
        <BacklogList activities={fixtures} filterActive />
      </DndContext>
    </MantineProvider>
  )
  expect(screen.getByText(/筛选中/)).toBeInTheDocument()
})

test('does NOT show filter banner when filterActive=false (default)', () => {
  renderIt(fixtures)
  expect(screen.queryByText(/筛选中/)).not.toBeInTheDocument()
})

test('shows "无匹配" inline message when activities is empty and filterActive', () => {
  render(
    <MantineProvider>
      <DndContext>
        <BacklogList activities={[]} filterActive />
      </DndContext>
    </MantineProvider>
  )
  expect(screen.getByText(/无匹配的活动/)).toBeInTheDocument()
})

test('filterActive forwards draggable=false to cards', () => {
  const { container } = render(
    <MantineProvider>
      <DndContext>
        <BacklogList activities={fixtures} filterActive />
      </DndContext>
    </MantineProvider>
  )
  // ActivityCard is expected to expose data-draggable attribute via Task 8
  const cards = container.querySelectorAll('.ac-card')
  cards.forEach(card => {
    expect(card.getAttribute('data-draggable')).toBe('false')
  })
})
```

- [ ] **Step 2: 运行测试确认先前测试通过 + 新测试失败**

```bash
npm test -- components/planner/__tests__/BacklogList
```

Expected: 既有 "filters by kind" 等被删；新 4 个测试全部 FAIL（`filterActive` prop 未实现，`data-draggable` 属性未实现）。

- [ ] **Step 3: 重写 BacklogList.jsx**

将 `app/javascript/components/planner/BacklogList.jsx` 整个替换为：

```jsx
import { Text, Button, Group, Stack, Alert } from '@mantine/core'
import { useDroppable } from '@dnd-kit/core'
import { IconInbox, IconFilterFilled } from '@tabler/icons-react'
import ActivityCard from './ActivityCard'
import PanelShell from './PanelLayout/PanelShell'

// Container-query styles for the 2-button footer. At narrow widths the
// buttons stack vertically (Chinese labels stay readable). When the panel
// is resized wider (≥ 200px inside content area), they flip to side-by-side
// for a more compact footer. Container queries are used over media queries
// because this panel can be dragged to any width independent of viewport.
const footerStyleRules = `
  .backlog-footer-container { container-type: inline-size; width: 100%; }
  .backlog-footer-buttons   { display: flex; flex-direction: column; gap: 4px; }
  @container (min-width: 200px) {
    .backlog-footer-buttons   { flex-direction: row; }
    .backlog-footer-buttons > button { flex: 1 1 0; min-width: 0; }
  }
`

export default function BacklogList({
  activities,
  onAddActivity,
  onEditActivity,
  onAskAI,
  readOnly,
  open = true,
  onToggle,
  canToggle = true,
  flexStyle,
  hoveredActivityIds = null,
  onHoverActivity,
  onClearHover,
  author,
  members,
  filterActive = false,
}) {
  // Droppable uses full activities.length so dropped items are appended to
  // the true end (not after the filtered subset — parent filters upstream).
  const { setNodeRef, isOver, active } = useDroppable({
    id: 'backlog',
    data: { dayId: null, position: activities.length + 1 }
  })

  // Three-state drop zone visual: idle (no drag) → active (drag in progress
  // but not hovering this droppable) → over (hovering this droppable).
  const dragState = active ? (isOver ? 'over' : 'active') : 'idle'

  const isEmpty = activities.length === 0

  return (
    <PanelShell
      title="候选池"
      icon={<IconInbox size={14} stroke={1.5} />}
      open={open}
      onToggle={onToggle}
      canToggle={canToggle}
      flexStyle={flexStyle}
    >
      <style>{footerStyleRules}</style>
      <div
        ref={setNodeRef}
        style={{
          padding: 12,
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          border: dragState === 'idle' ? 'none' : '2px dashed var(--mantine-color-gray-5)',
          borderRadius: 4,
          background:
            dragState === 'over' ? '#e7f5ff' :
            dragState === 'active' ? 'var(--mantine-color-gray-0)' :
            undefined,
          transition: 'border-color 120ms ease, background-color 120ms ease',
        }}
      >
        {filterActive && (
          <Alert
            color="blue"
            variant="light"
            icon={<IconFilterFilled size={14} />}
            mb="xs"
            p="xs"
            styles={{ message: { fontSize: 11 } }}
          >
            筛选中，清除后恢复拖拽
          </Alert>
        )}

        {isEmpty && filterActive && (
          <Text size="xs" c="dimmed" ta="center" py="md">无匹配的活动</Text>
        )}

        {isEmpty && !filterActive && readOnly && (
          <Text size="xs" c="gray.7">尚无候选</Text>
        )}

        {isEmpty && !filterActive && !readOnly && (
          <>
            <Stack
              gap="xs"
              p="md"
              justify="center"
              style={{
                flex: 1,
                border: '2px dashed ' + (dragState === 'idle' ? 'var(--mantine-color-gray-5)' : 'transparent'),
                borderRadius: 4,
                background: dragState === 'idle' ? '#fafafa' : 'transparent',
                transition: 'border-color 120ms ease, background-color 120ms ease',
              }}
            >
              <Text size="xs" c="gray.7" ta="center">先把想去的点塞进这里，再拖到右侧日。</Text>
            </Stack>
            <div className="backlog-footer-container" style={{ marginTop: 8 }}>
              <div className="backlog-footer-buttons">
                {onAddActivity && (
                  <Button size="sm" variant="default" fw={500} onClick={() => onAddActivity(null)}>
                    加候选
                  </Button>
                )}
                {onAskAI && (
                  <Button size="sm" variant="default" fw={700} onClick={onAskAI}>
                    AI 帮选
                  </Button>
                )}
              </div>
            </div>
          </>
        )}

        {!isEmpty && (
          <>
            <Stack gap={4}>
              {activities.map(a => (
                <ActivityCard
                  key={a.id}
                  activity={a}
                  onClick={onEditActivity}
                  readOnly={readOnly}
                  draggable={!filterActive}
                  isHighlighted={hoveredActivityIds != null && hoveredActivityIds.includes(a.id)}
                  onHoverActivity={onHoverActivity}
                  onClearHover={onClearHover}
                  author={author}
                  members={members}
                />
              ))}
            </Stack>

            {!readOnly && (onAddActivity || onAskAI) && (
              <div className="backlog-footer-container" style={{ marginTop: 'auto' }}>
                <div className="backlog-footer-buttons">
                  {onAddActivity && (
                    <Button size="compact-xs" variant="default" fw={500} onClick={() => onAddActivity(null)}>
                      加候选
                    </Button>
                  )}
                  {onAskAI && (
                    <Button size="compact-xs" variant="default" fw={700} onClick={onAskAI}>
                      AI 帮选
                    </Button>
                  )}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </PanelShell>
  )
}
```

**注意**: 本 task 假定 `ActivityCard` 即将接收 `draggable` prop（Task 8 会实现）。测试中检验 `data-draggable` 属性，也依赖 Task 8。所以 Step 4 中 `data-draggable` 相关测试还会 FAIL——这是期望的，留到 Task 8 完成后整体再绿。在本 task 里我们只要求"既有测试 + 前 3 个新测试"通过。

- [ ] **Step 4: 运行测试，验证除 draggable 相关外均通过**

```bash
npm test -- components/planner/__tests__/BacklogList
```

Expected: 除 `filterActive forwards draggable=false to cards` 外全部 PASS。那个测试会在 Task 8 后通过——本 task 接受这一个红。

- [ ] **Step 5: Commit**

```bash
git add app/javascript/components/planner/BacklogList.jsx \
        app/javascript/components/planner/__tests__/BacklogList.test.jsx
git commit -m "$(cat <<'EOF'
refactor(planner): strip BacklogList local filter; accept filterActive

Remove kindFilter + levelFilter Select UI and local state. Parent
(Show.jsx, in a follow-up) now pre-filters activities upstream.
levelFilter (citizen_level) is removed entirely — out of MVP.
Adds 'filter active' banner and empty state inline message.
Thread draggable prop to ActivityCard (next task wires pass-through).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: DayPanel / DayColumn — 过滤态 banner + 空状态

**Files:**
- Modify: `app/javascript/components/planner/DayColumn.jsx`
- Modify: `app/javascript/components/planner/__tests__/DayColumn.test.jsx`

先读 DayColumn.jsx 了解现状，再在合适位置加 `filterActive` prop 传递（与 BacklogList 对称）。

- [ ] **Step 1: 读现有 DayColumn**

```bash
npm test -- components/planner/__tests__/DayColumn --run --silent  # baseline
```

读取 `app/javascript/components/planner/DayColumn.jsx`；注意这个组件内部是否已经接收 activities 并 map 出卡片。如是，加 `filterActive` 逻辑类似 BacklogList。

- [ ] **Step 2: 写失败测试**

在 `app/javascript/components/planner/__tests__/DayColumn.test.jsx` 追加（沿用已有 render helper）：

```jsx
test('shows filter banner when filterActive=true', () => {
  // Use whatever render helper the file already defines; call with filterActive prop
  renderDayColumn({ activities: [], filterActive: true, day: { id: 1, day_index: 1 } })
  expect(screen.getByText(/筛选中/)).toBeInTheDocument()
})

test('filterActive=true + empty activities shows "该天无匹配"', () => {
  renderDayColumn({ activities: [], filterActive: true, day: { id: 1, day_index: 1 } })
  expect(screen.getByText(/该天无匹配/)).toBeInTheDocument()
})

test('filterActive=false + empty activities shows original empty-day copy', () => {
  renderDayColumn({ activities: [], filterActive: false, day: { id: 1, day_index: 1 } })
  expect(screen.queryByText(/该天无匹配/)).not.toBeInTheDocument()
})

test('filterActive forwards draggable=false to ActivityCard', () => {
  const { container } = renderDayColumn({
    activities: [{ id: 1, name: 'X', kind: 'scenic', day_id: 1, position: 1 }],
    filterActive: true,
    day: { id: 1, day_index: 1 },
  })
  const cards = container.querySelectorAll('.ac-card')
  cards.forEach(card => expect(card.getAttribute('data-draggable')).toBe('false'))
})
```

（如果该文件还没有 `renderDayColumn` helper，复用 BacklogList test 的模式——用 `MantineProvider` + `DndContext` 包裹。）

- [ ] **Step 3: 运行测试确认失败**

```bash
npm test -- components/planner/__tests__/DayColumn
```

Expected: 新 4 个测试 FAIL。

- [ ] **Step 4: 修改 DayColumn.jsx**

在 DayColumn 的 props 解构中加入 `filterActive = false`；在容器顶部（类似 BacklogList）加入 Alert banner。空活动分支改为：

```jsx
{filterActive && (
  <Alert color="blue" variant="light" icon={<IconFilterFilled size={14} />} mb="xs" p="xs"
         styles={{ message: { fontSize: 11 } }}>
    筛选中，清除后恢复拖拽
  </Alert>
)}
{activities.length === 0 && filterActive && (
  <Text size="xs" c="dimmed" ta="center" py="sm">该天无匹配</Text>
)}
{activities.length === 0 && !filterActive && (
  /* existing empty-day copy stays unchanged */
)}
```

map ActivityCard 时传 `draggable={!filterActive}`。

imports 补：
```jsx
import { Alert, Text } from '@mantine/core'
import { IconFilterFilled } from '@tabler/icons-react'
```
（已存在则不重复）

- [ ] **Step 5: 运行测试确认通过**（draggable-related 可能仍需等 Task 8）

```bash
npm test -- components/planner/__tests__/DayColumn
```

Expected: 前 3 个新测试 PASS；draggable 测试等 Task 8。

- [ ] **Step 6: Commit**

```bash
git add app/javascript/components/planner/DayColumn.jsx \
        app/javascript/components/planner/__tests__/DayColumn.test.jsx
git commit -m "$(cat <<'EOF'
feat(planner): DayColumn filter-active banner and empty state

Adds filterActive prop; when true, renders "筛选中" banner at top
and "该天无匹配" when the filtered activities list is empty.
Threads draggable=false to ActivityCard.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: PlannerMap — `matches` 谓词 + route_legs 两端 gate

**Files:**
- Modify: `app/javascript/components/planner/PlannerMap.jsx`
- Modify: `app/javascript/components/planner/__tests__/PlannerMap.test.jsx`

- [ ] **Step 1: 先读 PlannerMap.jsx 找到标记点和 route_legs 渲染位置**

```bash
grep -n 'marker\|route_leg\|RoadConnector\|activities\.map' app/javascript/components/planner/PlannerMap.jsx | head -20
```

记录：标记点渲染块行号 X、route_legs 渲染块行号 Y。

- [ ] **Step 2: 写失败测试**

在 `app/javascript/components/planner/__tests__/PlannerMap.test.jsx` 追加（沿用既有 render helper）：

```jsx
test('matches predicate hides unmatched activity markers', () => {
  const matches = (a) => a.id === 1  // only id=1 matches
  renderMap({
    activities: [
      { id: 1, name: 'A', lat: 30, lng: 100, day_id: 1, position: 1 },
      { id: 2, name: 'B', lat: 31, lng: 101, day_id: 1, position: 2 },
    ],
    matches,
  })
  // Implementation exposes marker via data-activity-id=<n>
  expect(document.querySelector('[data-activity-id="1"]')).toBeInTheDocument()
  expect(document.querySelector('[data-activity-id="2"]')).not.toBeInTheDocument()
})

test('matches predicate hides route_legs with at least one unmatched endpoint', () => {
  const matches = (a) => a.id === 1  // only id=1 matches
  renderMap({
    activities: [
      { id: 1, name: 'A', lat: 30, lng: 100, day_id: 1, position: 1 },
      { id: 2, name: 'B', lat: 31, lng: 101, day_id: 1, position: 2 },
    ],
    route_legs: [
      { id: 100, from_activity_id: 1, to_activity_id: 2, polyline: '...' },
    ],
    matches,
  })
  expect(document.querySelector('[data-route-leg-id="100"]')).not.toBeInTheDocument()
})

test('route_leg renders when both endpoints match', () => {
  const matches = () => true  // all match
  renderMap({
    activities: [
      { id: 1, name: 'A', lat: 30, lng: 100, day_id: 1, position: 1 },
      { id: 2, name: 'B', lat: 31, lng: 101, day_id: 1, position: 2 },
    ],
    route_legs: [
      { id: 100, from_activity_id: 1, to_activity_id: 2, polyline: '...' },
    ],
    matches,
  })
  expect(document.querySelector('[data-route-leg-id="100"]')).toBeInTheDocument()
})

test('defaults matches to () => true when prop omitted (backward compat)', () => {
  renderMap({
    activities: [
      { id: 1, name: 'A', lat: 30, lng: 100, day_id: 1, position: 1 },
    ],
  })
  expect(document.querySelector('[data-activity-id="1"]')).toBeInTheDocument()
})
```

- [ ] **Step 3: 运行测试确认失败**

```bash
npm test -- components/planner/__tests__/PlannerMap
```

Expected: 4 个新测试 FAIL（`matches` prop 未实现，`data-activity-id` / `data-route-leg-id` 未暴露）。

- [ ] **Step 4: 修改 PlannerMap.jsx**

在 props 解构中加入 `matches = () => true`。在标记点渲染处：

```jsx
{activities.filter(matches).map(a => (
  <Marker key={a.id} data-activity-id={a.id} /* ... existing props ... */ />
))}
```

（现有组件用的是 MapLibre 的自定义 marker；将 `data-activity-id={a.id}` 放到 marker 的 DOM 根元素上。如已有类似 data 属性则仅加过滤。）

在 route_legs 渲染处，先建 id→match 映射：

```jsx
const matchById = useMemo(() => {
  const m = new Map()
  for (const a of activities) m.set(a.id, matches(a))
  return m
}, [activities, matches])

{route_legs
  .filter(leg => matchById.get(leg.from_activity_id) && matchById.get(leg.to_activity_id))
  .map(leg => (
    <RoadConnector key={leg.id} data-route-leg-id={leg.id} /* ... */ />
  ))
}
```

（若 RoadConnector 不直接接 `data-route-leg-id`，在其外层包 `<g data-route-leg-id={leg.id}>` 或 `<div>`。）

- [ ] **Step 5: 运行测试确认通过**

```bash
npm test -- components/planner/__tests__/PlannerMap
```

Expected: 全部 PASS。

- [ ] **Step 6: Commit**

```bash
git add app/javascript/components/planner/PlannerMap.jsx \
        app/javascript/components/planner/__tests__/PlannerMap.test.jsx
git commit -m "$(cat <<'EOF'
feat(planner): PlannerMap accepts matches predicate

Markers and route_legs honor filter. route_leg renders only when
both endpoints match — avoids dangling half-segments. Defaults to
always-true predicate for backward compat.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 8: ActivityCard — `draggable` prop

**Files:**
- Modify: `app/javascript/components/planner/ActivityCard.jsx`
- Modify: `app/javascript/components/planner/__tests__/ActivityCard.test.jsx`

- [ ] **Step 1: 读 ActivityCard 找到 useDraggable / drag handle 位置**

```bash
grep -n 'useDraggable\|draggable' app/javascript/components/planner/ActivityCard.jsx
```

- [ ] **Step 2: 写失败测试**

在 `app/javascript/components/planner/__tests__/ActivityCard.test.jsx` 追加：

```jsx
test('draggable prop defaults to true; exposes data-draggable="true"', () => {
  const { container } = renderCard({ activity: sampleActivity })  // existing helper
  expect(container.querySelector('.ac-card').getAttribute('data-draggable')).toBe('true')
})

test('draggable=false → data-draggable="false" and disables drag handle', () => {
  const { container } = renderCard({ activity: sampleActivity, draggable: false })
  expect(container.querySelector('.ac-card').getAttribute('data-draggable')).toBe('false')
})

test('draggable=false: dnd-kit listeners are not attached', () => {
  // Specifically: useDraggable({disabled: true}) should mean no onPointerDown listener
  // We test by asserting that simulating drag start produces no active item — but
  // since we don't have DragOverlay wired here, we can at least assert the DOM
  // reflects the state via data-draggable.
  const { container } = renderCard({ activity: sampleActivity, draggable: false })
  expect(container.querySelector('.ac-card').getAttribute('data-draggable')).toBe('false')
})
```

（若 ActivityCard.test 还没有 `renderCard` helper 统一 fixture，参考 BacklogList.test 的模式自建。样本 activity：`{ id: 1, name: 'X', kind: 'scenic', day_id: null, position: 1 }`。）

- [ ] **Step 3: 运行测试确认失败**

```bash
npm test -- components/planner/__tests__/ActivityCard
```

Expected: 新测试 FAIL（属性不存在）。

- [ ] **Step 4: 修改 ActivityCard.jsx**

在 props 解构加 `draggable = true`。找到 `useDraggable({ id: ..., ... })` 调用，改为：

```jsx
const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
  id: `activity-${activity.id}`,
  disabled: !draggable,
  /* other existing fields */
})
```

在卡片根元素上加 `data-draggable={draggable ? 'true' : 'false'}`，并且当 `!draggable` 时不挂 `listeners` / `attributes`：

```jsx
<div
  className="ac-card ..."
  data-draggable={draggable ? 'true' : 'false'}
  ref={setNodeRef}
  {...(draggable ? attributes : {})}
  {...(draggable ? listeners : {})}
  /* ... */
>
```

- [ ] **Step 5: 运行测试确认通过**

```bash
npm test -- components/planner/__tests__/ActivityCard \
        && npm test -- components/planner/__tests__/BacklogList \
        && npm test -- components/planner/__tests__/DayColumn
```

Expected: Task 5 与 Task 6 中遗留的 draggable 测试连同 Task 8 新增测试全部 PASS。

- [ ] **Step 6: Commit**

```bash
git add app/javascript/components/planner/ActivityCard.jsx \
        app/javascript/components/planner/__tests__/ActivityCard.test.jsx
git commit -m "$(cat <<'EOF'
feat(planner): ActivityCard draggable prop

When draggable=false, disables useDraggable and strips pointer
listeners. Exposes data-draggable for test introspection. Callers
(BacklogList, DayColumn) set false while filter is active.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 9: Wire Tour/Show.jsx — 注入 Filter Bar + 过滤三视图数据

**Files:**
- Modify: `app/javascript/pages/Tour/Show.jsx`

- [ ] **Step 1: 插入 hook + filter bar injection**

在 `app/javascript/pages/Tour/Show.jsx` imports 区追加：

```jsx
import { useActivityFilter } from '../../hooks/useActivityFilter'
import ActivityFilterBar from '../../components/planner/ActivityFilterBar'
import { useInjectHeaderLeftTools } from '../../layouts/HeaderSlot'
```

在 `export default function Show({...})` 函数体靠前位置（`displayActivities` 计算之后）追加：

```jsx
// Activity filter — URL-backed; matches applied to Backlog/DayPanel/Map
const tourShape = useMemo(
  () => ({
    authorId: tour.author_id,
    memberIds: members.map(m => m.user_id),
  }),
  [tour.author_id, members]
)

const {
  filter, setQ, setKind, setUids, reset,
  active: filterActive, matches, activeCount, totalCount,
} = useActivityFilter({ activities: displayActivities, tour: tourShape })

const filterBarNode = useMemo(() => (
  <ActivityFilterBar
    filter={filter}
    setQ={setQ}
    setKind={setKind}
    setUids={setUids}
    reset={reset}
    active={filterActive}
    activeCount={activeCount}
    totalCount={totalCount}
    members={members}
    author={author}
  />
), [filter, setQ, setKind, setUids, reset, filterActive, activeCount, totalCount, members, author])

useInjectHeaderLeftTools(filterBarNode)
```

- [ ] **Step 2: 过滤 activities 下发**

将 `const backlog = displayActivities.filter(a => !a.day_id).sort(byPosition)` 改为：

```jsx
const filteredActivities = displayActivities.filter(matches)
const backlog = filteredActivities.filter(a => !a.day_id).sort(byPosition)
const byDay = Object.fromEntries(days.map(d => [ d.id, filteredActivities.filter(a => a.day_id === d.id).sort(byPosition) ]))
```

（原逻辑里对应行已经定义 `backlog` 与 `byDay`；这一步是把 `displayActivities` 换成 `filteredActivities` 作为两者的源。）

- [ ] **Step 3: 向子组件传 `filterActive`**

- `<BacklogList ... />` 传参加 `filterActive={filterActive}`
- `<DayPanel ... />` 传参加 `filterActive={filterActive}`（并在 DayPanel 内向其 `DayColumn` map 再传）
- `<PlannerMap ... activities={displayActivities} matches={matches} />`——注意 Map 拿全量，谓词单独传

**重要**：Map 传全量而不是过滤后的列表，因为 route_legs 需要检查两端在 original 集合中是否匹配。

- [ ] **Step 4: 运行 Show.jsx 相关测试**

```bash
npm test -- pages/Tour/__tests__/Show
```

Expected: PASS（若有既有测试因 Inertia URL 默认值或 headerSlot provider 缺失而破坏，补 `HeaderSlotProvider` 包裹或在测试 usePage mock 里补 `url: '/tours/1'`）。

- [ ] **Step 5: 快速 smoke 跑完整前端测试**

```bash
npm test
```

Expected: 全部 PASS。

- [ ] **Step 6: 手动验证 dev server**

起服务：

```bash
bin/worktree-dev up
```

用浏览器访问一个有活动的 Tour（用户提供的 existing Tour），确认：
- Header 左侧出现 Search + Filter 图标
- 输入搜索字 → 三视图联动 hide 未匹配
- Popover 内切 Kind chip → 立即生效
- 参与人勾选 → 立即生效
- 计数徽章显示 "X / Y"
- 点重置 → URL 清空，三视图恢复
- 拖拽卡片：无筛选时正常；有筛选时光标不响应 + banner 出现

- [ ] **Step 7: Commit**

```bash
git add app/javascript/pages/Tour/Show.jsx
git commit -m "$(cat <<'EOF'
feat(tour): wire activity filter on Planner

Show.jsx mounts useActivityFilter, injects ActivityFilterBar into
AppShell header's left tools slot, filters Backlog + DayPanel via
matches predicate. PlannerMap gets full activities + predicate so
route_legs can gate on both endpoints. Drag disabled while any
filter dimension active.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 10: 响应式 — `< 640px` 移动布局

**Files:**
- Modify: `app/javascript/components/planner/ActivityFilterBar.jsx`
- Modify: `app/javascript/components/planner/__tests__/ActivityFilterBar.test.jsx`

- [ ] **Step 1: 写失败测试**

在 `ActivityFilterBar.test.jsx` 追加：

```jsx
import { useMediaQuery } from '@mantine/hooks'

// Mock useMediaQuery to force mobile viewport
vi.mock('@mantine/hooks', async () => {
  const actual = await vi.importActual('@mantine/hooks')
  return {
    ...actual,
    useMediaQuery: vi.fn(),
  }
})

describe('ActivityFilterBar · mobile', () => {
  beforeEach(() => {
    useMediaQuery.mockReturnValue(true)  // < 640px
  })
  afterEach(() => {
    vi.clearAllMocks()
  })

  it('collapses search to icon button on mobile', () => {
    renderBar()
    // Mobile: search input hidden; search icon visible as ActionIcon
    expect(screen.queryByRole('textbox', { name: /搜索活动/ })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /搜索/ })).toBeInTheDocument()
  })

  it('clicking mobile search icon opens popover with search input', () => {
    renderBar()
    fireEvent.click(screen.getByRole('button', { name: /搜索/ }))
    expect(screen.getByRole('textbox', { name: /搜索活动/ })).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: 运行测试确认失败**

```bash
npm test -- components/planner/__tests__/ActivityFilterBar
```

Expected: 新 mobile 测试 FAIL。

- [ ] **Step 3: 修改 `ActivityFilterBar.jsx` 加入响应式分支**

在 imports 补：

```jsx
import { useMediaQuery } from '@mantine/hooks'
```

在组件顶部加：

```jsx
const isMobile = useMediaQuery('(max-width: 640px)')
const [searchOpen, setSearchOpen] = useState(false)
```

将 `<TextInput ... aria-label="搜索活动" />` 替换为条件渲染：

```jsx
{!isMobile && (
  <TextInput /* ... 现有 props 原样 ... */ />
)}

{isMobile && (
  <Popover opened={searchOpen} onChange={setSearchOpen} position="bottom-start" width={260} withArrow>
    <Popover.Target>
      <Tooltip label="搜索" withArrow>
        <ActionIcon
          variant={filter.q ? 'light' : 'subtle'}
          size="md"
          onClick={() => setSearchOpen(o => !o)}
          aria-label="搜索"
        >
          <IconSearch size={16} />
        </ActionIcon>
      </Tooltip>
    </Popover.Target>
    <Popover.Dropdown>
      <TextInput
        size="xs"
        value={filter.q}
        onChange={e => setQ(e.currentTarget.value)}
        placeholder="搜索活动名或备注"
        leftSection={<IconSearch size={14} />}
        rightSection={filter.q ? (
          <ActionIcon variant="subtle" size="xs" onClick={() => setQ('')} aria-label="清空搜索">
            <IconX size={12} />
          </ActionIcon>
        ) : null}
        aria-label="搜索活动"
      />
    </Popover.Dropdown>
  </Popover>
)}
```

- [ ] **Step 4: 运行测试确认通过**

```bash
npm test -- components/planner/__tests__/ActivityFilterBar
```

Expected: 全部 PASS。

- [ ] **Step 5: 手动验证移动视口**

在 dev server 上用 Chrome devtools 切到 iPhone 视口，确认 Header 布局不塞满、搜索 Icon + Filter Icon + 计数 + 重置能共存（必要时通过压缩 label 或省略计数徽章里的 "/total" 来节省空间，但基础功能不裁）。

- [ ] **Step 6: Commit**

```bash
git add app/javascript/components/planner/ActivityFilterBar.jsx \
        app/javascript/components/planner/__tests__/ActivityFilterBar.test.jsx
git commit -m "$(cat <<'EOF'
feat(planner): ActivityFilterBar responsive < 640px

On mobile, search input collapses into an icon-triggered popover
to preserve header real estate. Filter popover and count/reset
stay visible. useMediaQuery('(max-width: 640px)'.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 11: 最终验证 — CI 门槛 + 人工 E2E

**Files:** none

- [ ] **Step 1: 跑项目规定的 CI 命令（CLAUDE.md 明确规定）**

```bash
bin/rubocop -f github
```
Expected: 0 offenses（本改动纯前端，RuboCop 理论上无关，但规范要求走一遍）。

```bash
bin/brakeman --no-pager
```
Expected: 0 new warnings。

```bash
npm audit
```
Expected: 0 high/critical vulnerabilities。

```bash
npm test
```
Expected: 全部绿。

```bash
mise exec -- bundle exec rspec
```
Expected: 全部绿（纯前端改动理论不影响 RSpec；走一遍确认没误碰 Ruby 文件）。

- [ ] **Step 2: 人工 E2E（Playwright MCP；memory 要求 UI 改动必跑）**

起 dev server（worktree）：

```bash
bin/worktree-dev up
```

用 Playwright MCP 驱动：
1. 导航到本地 `http://localhost:<port>/`，登录
2. 进入一个活动 ≥ 10 条的 Tour 详情页
3. Header 左侧 Search 框输入 "餐"；验证 Backlog + DayPanel 只剩含"餐"的卡片；Map 只剩对应标记
4. 点 Filter icon；popover 弹出；勾 "吃饭" Chip；验证 AND 收窄
5. 勾一个成员；验证再次收窄
6. 尝试拖拽卡片：拖不动；banner "筛选中，清除后恢复拖拽" 可见
7. 点重置：URL 清掉 `?q=...`；三视图恢复；拖拽恢复
8. 截图 `tour-filter-active.png` 归档

如 E2E 任一步骤不过，回到对应 Task 修复，再跑本 Step。

- [ ] **Step 3: 关闭 dev server**

```bash
bin/worktree-dev down
```

- [ ] **Step 4: 本地 squash/整理 commit（可选）**

每 Task 一个 commit，整体 11 个 commit，已符合"frequent commits"原则；不 squash。确认：

```bash
git log --oneline main..HEAD
```

Expected: 11 条 + 此前 spec commit = 12 条。

- [ ] **Step 5: 准备 PR（按 memory：Claude 不自动 merge）**

```bash
git push -u origin claude/sharp-newton-a7c4e4
gh pr create --title "feat(tour): activity search & filter on Planner" --body "$(cat <<'EOF'
## Summary
- Header 左侧 inline Filter Bar（搜索 + Kind popover + 参与人 popover + 计数 + 重置）
- 三视图联动（Backlog / DayPanel / Map 均 hide 未匹配）；route_legs 两端匹配才显示
- URL 作唯一权威源（`?q=&kind=&uids=`）；200ms debounce on q；immediate on kind/uids
- 过滤激活时卡片拖拽禁用 + 容器顶 banner

## Non-Goals
- ExpenseDrawer 已有过滤，不动
- 全局 Cmd+K / AI 引用过滤 / 筛选预设保存 / Zoom-to-matching 均留待 V2

## Test plan
- [x] `npm test` — 新增 useActivityFilter + ActivityFilterBar 单测 + 既有组件测试调整全绿
- [x] `bin/rubocop`, `bin/brakeman`, `npm audit`, `mise exec -- bundle exec rspec` 全绿
- [x] Playwright E2E 全流程：搜索 → 维度叠加 → 拖拽禁用 → 重置恢复

## Design doc
docs/superpowers/specs/2026-04-23-tour-activity-filter-design.md
EOF
)"
```

**注意**：根据 memory `no_auto_merge_to_main`，Claude 不执行 `gh pr merge`；用户从 GitHub UI 手动合并。

---

## Self-Review（Plan 作者的最终检查）

**1. Spec coverage**（过一遍 spec 每节）：
- ✅ §1 范围 → Tasks 1-10 覆盖；§1 Out-of-Scope 在 code 中不存在的能力正是被拒的
- ✅ §2 UI → Task 4（Filter Bar）+ Task 10（移动端）
- ✅ §3 Map 联动 → Task 7
- ✅ §4 状态模型 → Task 3（URL 同步 + debounce + replace 语义）
- ✅ §5 匹配逻辑 → Task 2（core 谓词 + 空集语义 + details 递归）
- ✅ §6 架构改动 → Tasks 1（slot）、5（BacklogList strip）、6（DayColumn）、7（Map）、8（Card）、9（wire）
- ✅ §7 验收 → Task 11

**2. Placeholder scan**: 无 TBD / TODO / "similar to Task N"。每个代码步骤含完整代码或具体改动描述。

**3. Type consistency**:
- `useActivityFilter` 返回 `{ filter, setQ, setKind, setUids, reset, matches, active, activeCount, totalCount }` — 与 Task 4 组件 props、Task 9 wire-up 用法一致 ✓
- `tour` hook 参数形状 `{ authorId, memberIds }` — Task 2 测试和 Task 9 构造一致 ✓
- `ActivityFilterBar` props — Task 4 测试 + Task 9 调用方一致 ✓
- `filterActive` prop 名 — Backlog / DayColumn / wire 一致 ✓
- `draggable` prop — Card / BacklogList / DayColumn 一致 ✓
- `matches` 谓词形状 `(activity) => boolean` — hook 输出 / Map 输入一致 ✓

无缺口。
