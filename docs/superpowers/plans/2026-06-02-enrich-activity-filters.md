# 丰富行程筛选维度 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **提交策略（用户规则覆盖模板）**：本仓库规则是「仅在用户明确要求时才 commit」。下面每个 Task 末尾的 "Commit" step **默认跳过**，攒到用户发话再统一提交；执行时把它当作"到此为一个可提交单元"的标记即可。

**Goal:** 在规划器筛选面板上新增「状态 / 重点层级 / 需预约」三个筛选维度，纯前端实现。

**Architecture:** 就地扩展现有 `useActivityFilter`（state + URL 序列化 + `matches` 谓词 + setters）与 `ActivityFilterBar`（popover 新增三个 section），与既有 `kind` 维度同构。维度内 OR、维度间 AND；全部进 URL（分享/刷新/后退可还原）；未知值丢弃。所有字段已序列化到前端，无 Rails / 迁移改动。

**Tech Stack:** React + Mantine v7（`Chip.Group` / `Checkbox` / `Popover`）+ `@inertiajs/react`（`router.replace` URL 同步）；Vitest + `@testing-library/react`（`renderHook` / `userEvent`）。

参考 spec：`docs/superpowers/specs/2026-06-02-enrich-activity-filters-design.md`

---

## File Structure

- `app/javascript/components/activity-editor/detailsSchema.js` — 新增导出 `CITIZEN_LEVEL_FILTER_OPTIONS`（筛选用的友好层级标签）。
- `app/javascript/hooks/useActivityFilter.js` — core 的 `matches`/`active` 增 3 维；URL 层 `filterFromParams`/`buildUrl`/`urlKey` 增 3 参数；新增 `setStatus`/`setLevels`/`setReserve`；`reset` 清 6 项。
- `app/javascript/components/planner/ActivityFilterBar.jsx` — popover 新增 重点层级 / 状态 / 需预约 三个 section；新 setter props；dropdown 加 maxHeight 滚动。
- `app/javascript/pages/Tour/Show.jsx` — 从 hook 多解构并透传 3 个 setter；补 `headerRight` 的 `useMemo` 依赖。
- `app/javascript/hooks/__tests__/useActivityFilter.test.js` — core matches/active + URL 往返/未知值/reset 用例。
- `app/javascript/components/planner/__tests__/ActivityFilterBar.test.jsx` — 三个 section 渲染 + 切换回调。

---

## Task 1: detailsSchema 加 `CITIZEN_LEVEL_FILTER_OPTIONS`

**Files:**
- Modify: `app/javascript/components/activity-editor/detailsSchema.js:91-96`

纯数据常量（无独立测试；由 Task 3 的 URL 校验与 Task 4 的 UI 渲染用例覆盖）。

- [ ] **Step 1: 在 `CITIZEN_LEVEL_OPTIONS` 数组后插入新常量**

在第 96 行 `]`（`CITIZEN_LEVEL_OPTIONS` 的收尾）之后、第 98 行 `STATUS_OPTIONS` 注释之前，插入：

```js

// Filter-facing citizen_level labels. Deliberately friendlier than
// CITIZEN_LEVEL_OPTIONS (the editor's "一等公民（核心）" jargon): the card/footer
// moved to plain wording (今日重点 / 可选), and the filter is a "look at the
// cards" tool, so it follows the same idiom. Same enum values, different labels.
export const CITIZEN_LEVEL_FILTER_OPTIONS = [
  { value: 'tier_one',       label: '今日重点' },
  { value: 'tier_two',       label: '配角' },
  { value: 'tier_three',     label: '备选' },
  { value: 'infrastructure', label: '基础设施' },
]
```

- [ ] **Step 2: 验证 import 不破**

Run: `cd /Users/drewlee/work/personal/one-tour/.claude/worktrees/strange-noyce-4e5387 && npx vitest run app/javascript/hooks/__tests__/useActivityFilter.test.js`
Expected: PASS（现有用例不受影响；新常量尚未被引用）

- [ ] **Step 3: Commit（默认跳过，见顶部说明）**

```bash
git add app/javascript/components/activity-editor/detailsSchema.js
git commit -m "feat(filter): add CITIZEN_LEVEL_FILTER_OPTIONS friendly labels"
```

---

## Task 2: core `matches`/`active` 增 状态/层级/需预约

**Files:**
- Modify: `app/javascript/hooks/useActivityFilter.js:45-96`（`useActivityFilterCore`）
- Test: `app/javascript/hooks/__tests__/useActivityFilter.test.js`（追加到 `describe('useActivityFilterCore')` 块内，第 161 行 `})` 之前）

- [ ] **Step 1: 写失败测试**

在 `useActivityFilter.test.js` 的 `describe('useActivityFilterCore', () => {` 块内、最后一个 `it(...)` 之后、该 `describe` 收尾 `})`（约第 162 行）之前，追加：

```js
  it('status filter — single + multi (OR)', () => {
    const acts = [
      { id: 1, name: 'a', kind: 'scenic', status: 'confirmed', details: {}, participant_user_ids: [] },
      { id: 2, name: 'b', kind: 'scenic', status: 'pending',   details: {}, participant_user_ids: [] },
      { id: 3, name: 'c', kind: 'scenic', status: 'closed',    details: {}, participant_user_ids: [] },
    ]
    const { result } = renderHook(() =>
      useActivityFilterCore({ activities: acts, filter: { q: '', kind: [], uids: [], status: ['pending', 'closed'] }, tour })
    )
    expect(result.current.matches(acts[0])).toBe(false)
    expect(result.current.matches(acts[1])).toBe(true)
    expect(result.current.matches(acts[2])).toBe(true)
    expect(result.current.active).toBe(true)
  })

  it('levels filter — citizen_level OR', () => {
    const acts = [
      { id: 1, name: 'a', kind: 'scenic', citizen_level: 'tier_one',   details: {}, participant_user_ids: [] },
      { id: 2, name: 'b', kind: 'scenic', citizen_level: 'tier_three', details: {}, participant_user_ids: [] },
    ]
    const { result } = renderHook(() =>
      useActivityFilterCore({ activities: acts, filter: { q: '', kind: [], uids: [], levels: ['tier_one'] }, tour })
    )
    expect(result.current.matches(acts[0])).toBe(true)
    expect(result.current.matches(acts[1])).toBe(false)
  })

  it('reserve filter — only need_reservation; missing/false details excluded', () => {
    const acts = [
      { id: 1, name: 'a', kind: 'scenic', details: { need_reservation: true },  participant_user_ids: [] },
      { id: 2, name: 'b', kind: 'scenic', details: { need_reservation: false }, participant_user_ids: [] },
      { id: 3, name: 'c', kind: 'scenic', details: null,                         participant_user_ids: [] },
    ]
    const { result } = renderHook(() =>
      useActivityFilterCore({ activities: acts, filter: { q: '', kind: [], uids: [], reserve: true }, tour })
    )
    expect(result.current.matches(acts[0])).toBe(true)
    expect(result.current.matches(acts[1])).toBe(false)
    expect(result.current.matches(acts[2])).toBe(false)
  })

  it('AND across new + existing dimensions', () => {
    const acts = [
      { id: 1, name: '湖', kind: 'scenic', status: 'pending',   citizen_level: 'tier_one', details: { need_reservation: true }, participant_user_ids: [] },
      { id: 2, name: '湖', kind: 'scenic', status: 'confirmed', citizen_level: 'tier_one', details: { need_reservation: true }, participant_user_ids: [] },
    ]
    const { result } = renderHook(() =>
      useActivityFilterCore({ activities: acts, filter: { q: '', kind: ['scenic'], uids: [], status: ['pending'], levels: ['tier_one'], reserve: true }, tour })
    )
    expect(result.current.matches(acts[0])).toBe(true)
    expect(result.current.matches(acts[1])).toBe(false) // status mismatch
  })
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npx vitest run app/javascript/hooks/__tests__/useActivityFilter.test.js -t "status filter"`
Expected: FAIL（`matches` 还没看 status；`acts[0]` confirmed 被错误放行 → `toBe(false)` 失败）

- [ ] **Step 3: 实现 core 的 3 个维度**

在 `app/javascript/hooks/useActivityFilter.js`，把 `useActivityFilterCore` 的解构（第 46 行）改为带默认值（默认值让只传 `{q,kind,uids}` 的旧用例继续通过）：

```js
  const { q, kind, uids, status = [], levels = [], reserve = false } = filter
```

把 `active`（第 66 行）改为：

```js
  const active = qTrimmed !== '' || kind.length > 0 || effectiveUids.length > 0 ||
    status.length > 0 || levels.length > 0 || reserve
```

在 `matches` 的 `useMemo`（第 68-83 行）里，`kind` 分支之后、`effectiveUids` 分支之前，加入三段：

```js
      if (status.length > 0) {
        if (!status.includes(activity.status)) return false
      }
      if (levels.length > 0) {
        if (!levels.includes(activity.citizen_level)) return false
      }
      if (reserve && !(activity.details && activity.details.need_reservation)) {
        return false
      }
```

并把该 `useMemo` 的依赖数组（第 83 行）从
`[qTrimmed, kind, effectiveUids, searchableByActivityId, allMemberIdSet]`
改为
`[qTrimmed, kind, status, levels, reserve, effectiveUids, searchableByActivityId, allMemberIdSet]`

- [ ] **Step 4: 跑测试确认通过**

Run: `npx vitest run app/javascript/hooks/__tests__/useActivityFilter.test.js`
Expected: PASS（4 个新用例 + 全部旧用例）

- [ ] **Step 5: Commit（默认跳过）**

```bash
git add app/javascript/hooks/useActivityFilter.js app/javascript/hooks/__tests__/useActivityFilter.test.js
git commit -m "feat(filter): match status/levels/reserve in useActivityFilterCore"
```

---

## Task 3: URL 层 + setters + reset

**Files:**
- Modify: `app/javascript/hooks/useActivityFilter.js`（import / `filterFromParams` / `buildUrl` / `urlKey` / setters / `reset` / 返回值）
- Test: `app/javascript/hooks/__tests__/useActivityFilter.test.js`（追加到 `describe('useActivityFilter · URL sync')` 块内）

- [ ] **Step 1: 写失败测试**

在 `describe('useActivityFilter · URL sync', () => {` 块内（最后一个 `it` 之后、收尾 `})` 之前，约第 297 行）追加：

```js
  it('reads status/levels/reserve from URL', () => {
    usePage.mockReturnValue({ url: '/tours/42?status=pending,closed&levels=tier_one&reserve=1' })
    const { result } = renderHook(() => useActivityFilter({ activities, tour }))
    expect(result.current.filter.status).toEqual(['pending', 'closed'])
    expect(result.current.filter.levels).toEqual(['tier_one'])
    expect(result.current.filter.reserve).toBe(true)
  })

  it('defaults new dims to empty/false when URL has no params', () => {
    const { result } = renderHook(() => useActivityFilter({ activities, tour }))
    expect(result.current.filter.status).toEqual([])
    expect(result.current.filter.levels).toEqual([])
    expect(result.current.filter.reserve).toBe(false)
  })

  it('setStatus is immediate', () => {
    const { result } = renderHook(() => useActivityFilter({ activities, tour }))
    act(() => { result.current.setStatus(['pending']) })
    expect(router.replace).toHaveBeenCalledWith(
      expect.objectContaining({ url: '/tours/42?status=pending', preserveState: true, preserveScroll: true })
    )
  })

  it('setLevels is immediate', () => {
    const { result } = renderHook(() => useActivityFilter({ activities, tour }))
    act(() => { result.current.setLevels(['tier_one', 'tier_three']) })
    expect(router.replace).toHaveBeenCalledWith(
      expect.objectContaining({ url: '/tours/42?levels=tier_one,tier_three' })
    )
  })

  it('setReserve true adds reserve=1; false drops it', () => {
    usePage.mockReturnValue({ url: '/tours/42?reserve=1' })
    const { result } = renderHook(() => useActivityFilter({ activities, tour }))
    act(() => { result.current.setReserve(false) })
    expect(router.replace).toHaveBeenCalledWith(
      expect.objectContaining({ url: '/tours/42' })
    )
  })

  it('ignores unknown status/levels values from URL', () => {
    usePage.mockReturnValue({ url: '/tours/42?status=typo,pending&levels=bogus,tier_two' })
    const { result } = renderHook(() => useActivityFilter({ activities, tour }))
    expect(result.current.filter.status).toEqual(['pending'])
    expect(result.current.filter.levels).toEqual(['tier_two'])
  })

  it('reset clears new dims too', () => {
    usePage.mockReturnValue({ url: '/tours/42?status=pending&levels=tier_one&reserve=1' })
    const { result } = renderHook(() => useActivityFilter({ activities, tour }))
    act(() => { result.current.reset() })
    expect(router.replace).toHaveBeenCalledWith(
      expect.objectContaining({ url: '/tours/42' })
    )
  })
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npx vitest run app/javascript/hooks/__tests__/useActivityFilter.test.js -t "reads status/levels/reserve"`
Expected: FAIL（`filter.status` 为 `undefined`，`toEqual(['pending','closed'])` 失败）

- [ ] **Step 3: 实现 URL 层**

`app/javascript/hooks/useActivityFilter.js`：

(a) 第 3 行 import 改为：

```js
import { KIND_OPTIONS, STATUS_OPTIONS, CITIZEN_LEVEL_FILTER_OPTIONS } from '../components/activity-editor/detailsSchema'
```

(b) 第 5 行 `const VALID_KINDS = ...` 之后追加：

```js
const VALID_STATUSES = new Set(STATUS_OPTIONS.map(o => o.value))
const VALID_LEVELS = new Set(CITIZEN_LEVEL_FILTER_OPTIONS.map(o => o.value))
```

(c) `filterFromParams`（第 105-115 行）整体替换为：

```js
function filterFromParams(params) {
  const q = params.get('q') || ''
  const kindRaw = params.get('kind') || ''
  const uidsRaw = params.get('uids') || ''
  const statusRaw = params.get('status') || ''
  const levelsRaw = params.get('levels') || ''
  // Drop unknown enum values silently — a typo'd / stale URL param otherwise
  // activates the dimension with zero matches and hides every activity.
  const kind = kindRaw ? kindRaw.split(',').filter(v => VALID_KINDS.has(v)) : []
  const uids = uidsRaw ? uidsRaw.split(',').map(Number).filter(n => Number.isFinite(n)) : []
  const status = statusRaw ? statusRaw.split(',').filter(v => VALID_STATUSES.has(v)) : []
  const levels = levelsRaw ? levelsRaw.split(',').filter(v => VALID_LEVELS.has(v)) : []
  const reserve = params.get('reserve') === '1'
  return { q, kind, uids, status, levels, reserve }
}
```

(d) `buildUrl`（第 117-127 行）整体替换为（顺序保持 q→kind→uids 前缀不变，新参数追加在后，旧 URL 字节级不变）：

```js
function buildUrl(path, { q, kind, uids, status, levels, reserve }) {
  const parts = []
  // Trim q before persisting — core matcher treats whitespace-only as
  // inactive, so the URL should not carry "%20%20" noise.
  const qTrimmed = q.trim()
  if (qTrimmed) parts.push(`q=${encodeURIComponent(qTrimmed)}`)
  if (kind.length > 0) parts.push(`kind=${kind.join(',')}`)
  if (uids.length > 0) parts.push(`uids=${uids.join(',')}`)
  if (status.length > 0) parts.push(`status=${status.join(',')}`)
  if (levels.length > 0) parts.push(`levels=${levels.join(',')}`)
  if (reserve) parts.push('reserve=1')
  const qs = parts.join('&')
  return qs ? `${path}?${qs}` : path
}
```

(e) `urlKey`（第 153 行）改为：

```js
  const urlKey = `${path}|${urlFilter.q}|${urlFilter.kind.join(',')}|${urlFilter.uids.join(',')}|${urlFilter.status.join(',')}|${urlFilter.levels.join(',')}|${urlFilter.reserve}`
```

(f) 在 `setUids`（第 190-197 行）之后追加三个 setter（镜像 `setKind`：立即推、清 q debounce）：

```js
  const setStatus = useCallback((v) => {
    if (qDebounceRef.current) clearTimeout(qDebounceRef.current)
    setLocal(prev => {
      const next = { ...prev, status: v }
      pushUrl(next)
      return next
    })
  }, [pushUrl])

  const setLevels = useCallback((v) => {
    if (qDebounceRef.current) clearTimeout(qDebounceRef.current)
    setLocal(prev => {
      const next = { ...prev, levels: v }
      pushUrl(next)
      return next
    })
  }, [pushUrl])

  const setReserve = useCallback((v) => {
    if (qDebounceRef.current) clearTimeout(qDebounceRef.current)
    setLocal(prev => {
      const next = { ...prev, reserve: v }
      pushUrl(next)
      return next
    })
  }, [pushUrl])
```

(g) `reset` 的空值（第 200 行）改为：

```js
    const empty = { q: '', kind: [], uids: [], status: [], levels: [], reserve: false }
```

(h) 返回对象（第 208-215 行）加入三个 setter：

```js
  return {
    filter: local,
    setQ,
    setKind,
    setUids,
    setStatus,
    setLevels,
    setReserve,
    reset,
    ...core,
  }
```

- [ ] **Step 4: 跑测试确认通过**

Run: `npx vitest run app/javascript/hooks/__tests__/useActivityFilter.test.js`
Expected: PASS（新 7 个 URL 用例 + Task 2 的 4 个 + 全部旧用例）

- [ ] **Step 5: Commit（默认跳过）**

```bash
git add app/javascript/hooks/useActivityFilter.js app/javascript/hooks/__tests__/useActivityFilter.test.js
git commit -m "feat(filter): URL-sync status/levels/reserve + setters + reset"
```

---

## Task 4: ActivityFilterBar 三个 section

**Files:**
- Modify: `app/javascript/components/planner/ActivityFilterBar.jsx`
- Test: `app/javascript/components/planner/__tests__/ActivityFilterBar.test.jsx`

- [ ] **Step 1: 更新测试默认 props 并写失败测试**

把 `renderBar` 的 `defaultProps`（第 14-25 行）整体替换为：

```js
  const defaultProps = {
    filter: { q: '', kind: [], uids: [], status: [], levels: [], reserve: false },
    setQ: vi.fn(),
    setKind: vi.fn(),
    setUids: vi.fn(),
    setStatus: vi.fn(),
    setLevels: vi.fn(),
    setReserve: vi.fn(),
    reset: vi.fn(),
    active: false,
    activeCount: 10,
    totalCount: 10,
    members,
    author,
  }
```

在 `describe('ActivityFilterBar', () => {` 块末（最后一个 `it` 之后、收尾 `})` 之前，约第 133 行）追加：

```js
  it('popover reveals 重点层级 / 状态 / 需预约 sections', async () => {
    renderBar()
    await openPopover()
    expect(screen.getByText('重点层级')).toBeInTheDocument()
    expect(screen.getByText('今日重点')).toBeInTheDocument()
    expect(screen.getByText('配角')).toBeInTheDocument()
    expect(screen.getByText('备选')).toBeInTheDocument()
    expect(screen.getByText('基础设施')).toBeInTheDocument()
    expect(screen.getByText('状态')).toBeInTheDocument()
    expect(screen.getByText('已定')).toBeInTheDocument()
    expect(screen.getByText('待定')).toBeInTheDocument()
    expect(screen.getByText('暂停开放')).toBeInTheDocument()
    expect(screen.getByText('仅看需预约')).toBeInTheDocument()
  })

  it('clicking a 状态 chip calls setStatus', async () => {
    const setStatus = vi.fn()
    renderBar({ setStatus })
    const user = await openPopover()
    await user.click(screen.getByText('待定'))
    expect(setStatus).toHaveBeenCalledWith(['pending'])
  })

  it('clicking a 重点层级 chip calls setLevels', async () => {
    const setLevels = vi.fn()
    renderBar({ setLevels })
    const user = await openPopover()
    await user.click(screen.getByText('今日重点'))
    expect(setLevels).toHaveBeenCalledWith(['tier_one'])
  })

  it('toggling 需预约 checkbox calls setReserve(true)', async () => {
    const setReserve = vi.fn()
    renderBar({ setReserve })
    const user = await openPopover()
    await user.click(screen.getByText('仅看需预约'))
    expect(setReserve).toHaveBeenCalledWith(true)
  })
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npx vitest run app/javascript/components/planner/__tests__/ActivityFilterBar.test.jsx -t "重点层级"`
Expected: FAIL（找不到 `重点层级` 文本 — section 还没渲染）

- [ ] **Step 3: 实现组件**

`app/javascript/components/planner/ActivityFilterBar.jsx`：

(a) 第 4 行 import 改为：

```js
import { KIND_OPTIONS as CANONICAL_KIND_OPTIONS, KIND_ICONS, STATUS_OPTIONS, CITIZEN_LEVEL_FILTER_OPTIONS } from '../activity-editor/detailsSchema'
```

(b) 函数签名（第 9-13 行）改为（加 3 个 setter props）：

```js
export default function ActivityFilterBar({
  filter, setQ, setKind, setUids, setStatus, setLevels, setReserve, reset,
  active, activeCount, totalCount,
  members, author,
}) {
```

(c) 最外层 `<Stack gap="sm">`（第 57 行）改为加滚动上限：

```js
        <Stack gap="sm" style={{ maxHeight: 'min(70vh, 520px)', overflowY: 'auto' }}>
```

(d) 在「类型」section 的结束 `</div>`（第 87 行）之后、「参与人」section 的 `<div>`（第 89 行）之前，插入三个新 section：

```jsx
          <div>
            <div style={{ fontSize: 12, color: 'var(--mantine-color-gray-7)', marginBottom: 6 }}>重点层级</div>
            <Chip.Group multiple value={filter.levels || []} onChange={setLevels}>
              <Group gap={4}>
                {CITIZEN_LEVEL_FILTER_OPTIONS.map(({ value, label }) => (
                  <Chip key={value} value={value} size="xs">{label}</Chip>
                ))}
              </Group>
            </Chip.Group>
          </div>

          <div>
            <div style={{ fontSize: 12, color: 'var(--mantine-color-gray-7)', marginBottom: 6 }}>状态</div>
            <Chip.Group multiple value={filter.status || []} onChange={setStatus}>
              <Group gap={4}>
                {STATUS_OPTIONS.map(({ value, label }) => (
                  <Chip key={value} value={value} size="xs">{label}</Chip>
                ))}
              </Group>
            </Chip.Group>
          </div>

          <Checkbox
            size="xs"
            checked={!!filter.reserve}
            onChange={e => setReserve(e.currentTarget.checked)}
            label="仅看需预约"
          />
```

- [ ] **Step 4: 跑测试确认通过**

Run: `npx vitest run app/javascript/components/planner/__tests__/ActivityFilterBar.test.jsx`
Expected: PASS（4 个新用例 + 全部旧用例）

- [ ] **Step 5: Commit（默认跳过）**

```bash
git add app/javascript/components/planner/ActivityFilterBar.jsx app/javascript/components/planner/__tests__/ActivityFilterBar.test.jsx
git commit -m "feat(filter): add 重点层级/状态/需预约 sections to ActivityFilterBar"
```

---

## Task 5: 接线 Show.jsx

**Files:**
- Modify: `app/javascript/pages/Tour/Show.jsx:127-130`（解构）、`:363-374`（透传）、`:385`（useMemo 依赖）

无独立单测；由 Task 2-4 的单测 + 全量 vitest（含 `Show.test.jsx`）覆盖。

- [ ] **Step 1: 解构新 setter**

第 127-130 行替换为：

```js
  const {
    filter, setQ, setKind, setUids, setStatus, setLevels, setReserve, reset,
    active: filterActive, matches, activeCount, totalCount,
  } = useActivityFilter({ activities: displayActivities, tour: tourShape })
```

- [ ] **Step 2: 透传给 ActivityFilterBar**

第 363-374 行的 `<ActivityFilterBar ... />`，在 `setUids={setUids}`（第 367 行）之后插入三行：

```jsx
        setStatus={setStatus}
        setLevels={setLevels}
        setReserve={setReserve}
```

- [ ] **Step 3: 补 useMemo 依赖**

第 385 行依赖数组，把 `setUids, reset,` 改为 `setUids, setStatus, setLevels, setReserve, reset,`：

```js
  ), [filter, setQ, setKind, setUids, setStatus, setLevels, setReserve, reset, filterActive, activeCount, totalCount, members, author, tour.author_id, violations, openConst, openTimeline, canEdit])
```

- [ ] **Step 4: 跑相关单测确认通过**

Run: `npx vitest run app/javascript/pages/Tour/__tests__/Show.test.jsx app/javascript/components/planner/__tests__/ActivityFilterBar.test.jsx`
Expected: PASS

- [ ] **Step 5: Commit（默认跳过）**

```bash
git add app/javascript/pages/Tour/Show.jsx
git commit -m "feat(filter): wire status/levels/reserve setters through Show.jsx"
```

---

## Task 6: 全量验证 + 实地自测

**Files:** 无（验证）

- [ ] **Step 1: 全量 vitest**

Run: `cd /Users/drewlee/work/personal/one-tour/.claude/worktrees/strange-noyce-4e5387 && npm test`
Expected: 全绿（在当前 674 基础上新增本计划用例，0 失败）

- [ ] **Step 2: PWA service-worker 模式校验（JS 改动门禁）**

Run: `npx vite build && bash scripts/verify-sw-rewrite-patterns.sh`
Expected: build 成功 + SW 校验脚本 exit 0

- [ ] **Step 3: 实地自测（dev server 已在 :9000，DB→5433）**

打开 http://localhost:9000/tours/17（dev 登录 `/auth/developer` → `d1-pm@example.com`），开筛选 popover：
- 勾「状态=待定」→ 只剩待定卡；「暂停开放」同理。
- 勾「重点层级=今日重点」→ 只剩金条卡。
- 勾「仅看需预约」→ 只剩需预约卡。
- 多选叠加验证维度间 AND；URL 出现 `?status=...&levels=...&reserve=1`，刷新后筛选态还原；重置清空。
- 筛选激活时卡片不可拖拽（沿用既有 `filterActive`）。

- [ ] **Step 4: Commit（默认跳过；最终由用户统一提交/开 PR）**

---

## Self-Review

**1. Spec coverage（逐条对 spec）：**
- 3 维度（状态/层级/需预约）→ Task 2（matches）+ Task 3（URL）+ Task 4（UI）✓
- 友好 4 档标签 → Task 1 常量 ✓
- 维度内 OR、维度间 AND → Task 2 的 `includes` 分支 + "AND across" 用例 ✓
- URL 持久化 + 未知值丢弃 + reset 清全部 → Task 3 + 对应用例 ✓
- `active→拖拽禁用/计数` 连带生效 → Task 2 改 `active`，Task 6 Step 3 实地验证 ✓
- 纯前端、无后端改动 → 全部 Task 仅触 JS ✓
- 默认不筛 → core 解构默认值 `status=[],levels=[],reserve=false`；`filterFromParams` 无参时返回空 ✓
- UI 顺序 搜索/类型/重点层级/状态/需预约/参与人 → Task 4 (d) 插入位置 ✓
- 需预约用 Checkbox、状态/层级 Chip 无图标 → Task 4 (d) ✓

**2. Placeholder scan：** 无 TBD/TODO；每个代码 step 都给了完整代码与精确行号锚点。✓

**3. Type consistency：**
- 常量名 `CITIZEN_LEVEL_FILTER_OPTIONS` 在 Task 1 定义，Task 3 (a) import、Task 4 (a) import 一致。✓
- setter 名 `setStatus`/`setLevels`/`setReserve` 在 Task 3 (f) 定义、(h) 导出，Task 4 (b) 接收、Task 5 解构/透传/依赖一致。✓
- filter 字段 `status`/`levels`（数组）、`reserve`（布尔）在 core、URL、UI、测试中一致。✓
- URL 参数名 `status`/`levels`/`reserve` 在 `filterFromParams`、`buildUrl`、测试断言一致。✓
