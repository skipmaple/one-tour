# Planner 4-Panel Flex Resizable Layout — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the planner's grid-based "map-on-top, days-below" layout with a 4-column flex layout (候选 | 日卡 | 地图 | AI) where every panel is independently collapsible, mutually resizable via drag handles, and persists per-tour to localStorage. Default flex-grow ratios `2:5:5:2` (symmetric), with a special "auto-fit" mode for the day panel.

**Architecture:** A central `usePlannerLayout(tourId)` hook owns all panel state (open/grow/autoFit) and exposes derived helpers (`flexStyle`, `handleVisible`, `openCount`, `togglePanel`, `resizeBetween`, `toggleAutoFit`). Two new shell components — `PanelShell` (wraps any panel with header + collapse rail) and `ResizeHandle` (the draggable divider) — keep panel-specific logic in the existing `BacklogList` / `ChatPanel` / `PlannerMap` / new `DayPanel` and let `Show.jsx` compose them with handles between. `DayColumn` internals are untouched.

**Tech Stack:** React 18 (existing), Mantine v9, dnd-kit, Vitest + @testing-library/react. Pure CSS flexbox for layout (no new deps).

**Spec:** [`docs/superpowers/specs/2026-04-18-planner-flex-resizable-panels-design.md`](docs/superpowers/specs/2026-04-18-planner-flex-resizable-panels-design.md)

---

## File Map

**New files:**
- `app/javascript/hooks/usePlannerLayout.js` — state hook
- `app/javascript/hooks/__tests__/usePlannerLayout.test.js` — hook tests
- `app/javascript/components/planner/PanelLayout/PanelShell.jsx` — header/rail wrapper
- `app/javascript/components/planner/PanelLayout/ResizeHandle.jsx` — drag handle
- `app/javascript/components/planner/PanelLayout/__tests__/PanelShell.test.jsx`
- `app/javascript/components/planner/PanelLayout/__tests__/ResizeHandle.test.jsx`
- `app/javascript/components/planner/DayPanel.jsx` — wraps day strip + AddDayButton
- `app/javascript/components/planner/__tests__/DayPanel.test.jsx`

**Modified files:**
- `app/javascript/pages/Tour/Show.jsx` — replace grid with flex 4-panel layout
- `app/javascript/components/planner/BacklogList.jsx` — use PanelShell internally; accept `flexStyle` / `canToggle` props
- `app/javascript/components/planner/ChatPanel.jsx` — use PanelShell internally; accept `flexStyle` / `canToggle` props
- `app/javascript/components/planner/PlannerMap.jsx` — extract `PlannerMapInner`; use PanelShell; remove `height: 260`
- `app/javascript/components/planner/__tests__/BacklogList.test.jsx` — adapt to new structure if needed
- `app/javascript/components/planner/__tests__/ChatPanel.test.jsx` — adapt to new structure if needed

---

## Task 1: usePlannerLayout — defaults, schema, persistence

**Files:**
- Create: `app/javascript/hooks/usePlannerLayout.js`
- Test: `app/javascript/hooks/__tests__/usePlannerLayout.test.js`

- [ ] **Step 1.1: Write failing tests for defaults and persistence**

Create `app/javascript/hooks/__tests__/usePlannerLayout.test.js`:

```js
import { describe, test, expect, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import usePlannerLayout, { DEFAULT_LAYOUT } from '../usePlannerLayout'

beforeEach(() => {
  window.localStorage.clear()
})

describe('usePlannerLayout · defaults & persistence', () => {
  test('returns DEFAULT_LAYOUT when no localStorage entry exists', () => {
    const { result } = renderHook(() => usePlannerLayout(42))
    expect(result.current.panels).toEqual(DEFAULT_LAYOUT)
  })

  test('DEFAULT_LAYOUT matches spec (2:5:5:2, all open, autoFit on)', () => {
    expect(DEFAULT_LAYOUT).toEqual({
      candidates: { open: true, grow: 2 },
      days:       { open: true, grow: 5, autoFit: true },
      map:        { open: true, grow: 5 },
      ai:         { open: true, grow: 2 },
    })
  })

  test('reads saved state from localStorage on mount', () => {
    const saved = {
      candidates: { open: false, grow: 3 },
      days:       { open: true,  grow: 4, autoFit: false },
      map:        { open: true,  grow: 6 },
      ai:         { open: true,  grow: 1 },
    }
    window.localStorage.setItem('planner-layout-v1-42', JSON.stringify(saved))
    const { result } = renderHook(() => usePlannerLayout(42))
    expect(result.current.panels).toEqual(saved)
  })

  test('falls back to default on corrupted localStorage', () => {
    window.localStorage.setItem('planner-layout-v1-42', '{not-json')
    const { result } = renderHook(() => usePlannerLayout(42))
    expect(result.current.panels).toEqual(DEFAULT_LAYOUT)
  })

  test('uses tourId in localStorage key (per-tour isolation)', () => {
    const { result: r42 } = renderHook(() => usePlannerLayout(42))
    act(() => r42.current.togglePanel('candidates'))
    expect(window.localStorage.getItem('planner-layout-v1-42')).toContain('"open":false')
    expect(window.localStorage.getItem('planner-layout-v1-99')).toBeNull()
  })
})
```

- [ ] **Step 1.2: Run tests — verify they fail**

```bash
npm test -- app/javascript/hooks/__tests__/usePlannerLayout.test.js
```

Expected: all 5 tests FAIL with "Cannot find module '../usePlannerLayout'".

- [ ] **Step 1.3: Create usePlannerLayout with defaults + persistence only**

Create `app/javascript/hooks/usePlannerLayout.js`:

```js
import { useCallback, useState } from 'react'

export const DEFAULT_LAYOUT = {
  candidates: { open: true, grow: 2 },
  days:       { open: true, grow: 5, autoFit: true },
  map:        { open: true, grow: 5 },
  ai:         { open: true, grow: 2 },
}

const STORAGE_PREFIX = 'planner-layout-v1-'

function loadFromStorage(tourId) {
  try {
    const raw = window.localStorage.getItem(`${STORAGE_PREFIX}${tourId}`)
    if (!raw) return DEFAULT_LAYOUT
    const parsed = JSON.parse(raw)
    // Shallow validation — must have all 4 panel keys
    const expected = ['candidates', 'days', 'map', 'ai']
    if (!expected.every(k => parsed[k])) return DEFAULT_LAYOUT
    return parsed
  } catch {
    return DEFAULT_LAYOUT
  }
}

function saveToStorage(tourId, panels) {
  try {
    window.localStorage.setItem(`${STORAGE_PREFIX}${tourId}`, JSON.stringify(panels))
  } catch {
    // Ignore quota errors — layout will reset on next mount
  }
}

export default function usePlannerLayout(tourId) {
  const [panels, setPanelsRaw] = useState(() => loadFromStorage(tourId))

  const setPanels = useCallback((updater) => {
    setPanelsRaw(prev => {
      const next = typeof updater === 'function' ? updater(prev) : updater
      saveToStorage(tourId, next)
      return next
    })
  }, [tourId])

  // Stub — fleshed out in later tasks
  const togglePanel = useCallback((id) => {
    setPanels(prev => ({ ...prev, [id]: { ...prev[id], open: !prev[id].open } }))
  }, [setPanels])

  return { panels, togglePanel }
}
```

- [ ] **Step 1.4: Run tests — verify all 5 pass**

```bash
npm test -- app/javascript/hooks/__tests__/usePlannerLayout.test.js
```

Expected: all 5 PASS.

- [ ] **Step 1.5: Commit**

```bash
git add app/javascript/hooks/usePlannerLayout.js app/javascript/hooks/__tests__/usePlannerLayout.test.js
git commit -m "feat(planner): usePlannerLayout hook scaffold + persistence"
```

---

## Task 2: usePlannerLayout — togglePanel + "at-least-one-open" constraint

**Files:**
- Modify: `app/javascript/hooks/usePlannerLayout.js`
- Modify: `app/javascript/hooks/__tests__/usePlannerLayout.test.js`

- [ ] **Step 2.1: Append failing tests**

Append to `app/javascript/hooks/__tests__/usePlannerLayout.test.js`:

```js
describe('usePlannerLayout · togglePanel + at-least-one-open', () => {
  test('togglePanel flips open state', () => {
    const { result } = renderHook(() => usePlannerLayout(42))
    expect(result.current.panels.candidates.open).toBe(true)
    act(() => result.current.togglePanel('candidates'))
    expect(result.current.panels.candidates.open).toBe(false)
    act(() => result.current.togglePanel('candidates'))
    expect(result.current.panels.candidates.open).toBe(true)
  })

  test('openCount derived correctly', () => {
    const { result } = renderHook(() => usePlannerLayout(42))
    expect(result.current.openCount).toBe(4)
    act(() => result.current.togglePanel('candidates'))
    expect(result.current.openCount).toBe(3)
  })

  test('cannot close last open panel (at-least-one-open)', () => {
    const { result } = renderHook(() => usePlannerLayout(42))
    act(() => result.current.togglePanel('candidates'))
    act(() => result.current.togglePanel('days'))
    act(() => result.current.togglePanel('ai'))
    expect(result.current.openCount).toBe(1)
    expect(result.current.panels.map.open).toBe(true)
    // Try to close the last one — should be no-op
    act(() => result.current.togglePanel('map'))
    expect(result.current.panels.map.open).toBe(true)
    expect(result.current.openCount).toBe(1)
  })
})
```

- [ ] **Step 2.2: Run tests — verify the 3 new tests fail**

```bash
npm test -- app/javascript/hooks/__tests__/usePlannerLayout.test.js
```

Expected: 2 fail (`openCount` undefined, last-open closes incorrectly), 1 passes (basic toggle already works).

- [ ] **Step 2.3: Add openCount + at-least-one-open guard**

Modify `app/javascript/hooks/usePlannerLayout.js`:

```js
export default function usePlannerLayout(tourId) {
  const [panels, setPanelsRaw] = useState(() => loadFromStorage(tourId))

  const setPanels = useCallback((updater) => {
    setPanelsRaw(prev => {
      const next = typeof updater === 'function' ? updater(prev) : updater
      saveToStorage(tourId, next)
      return next
    })
  }, [tourId])

  const openCount = Object.values(panels).filter(p => p.open).length

  const togglePanel = useCallback((id) => {
    setPanels(prev => {
      const isOpen = prev[id].open
      // At-least-one-open: refuse to close if this is the last open
      if (isOpen) {
        const otherOpen = Object.entries(prev).filter(([k, p]) => k !== id && p.open).length
        if (otherOpen === 0) return prev
      }
      return { ...prev, [id]: { ...prev[id], open: !isOpen } }
    })
  }, [setPanels])

  return { panels, openCount, togglePanel }
}
```

- [ ] **Step 2.4: Run tests — verify all 8 pass**

```bash
npm test -- app/javascript/hooks/__tests__/usePlannerLayout.test.js
```

Expected: 8/8 PASS.

- [ ] **Step 2.5: Commit**

```bash
git add app/javascript/hooks/usePlannerLayout.js app/javascript/hooks/__tests__/usePlannerLayout.test.js
git commit -m "feat(planner): togglePanel + at-least-one-open guard in usePlannerLayout"
```

---

## Task 3: usePlannerLayout — resizeBetween + auto-fit interaction

**Files:**
- Modify: `app/javascript/hooks/usePlannerLayout.js`
- Modify: `app/javascript/hooks/__tests__/usePlannerLayout.test.js`

- [ ] **Step 3.1: Append failing tests**

Append to `app/javascript/hooks/__tests__/usePlannerLayout.test.js`:

```js
describe('usePlannerLayout · resizeBetween + autoFit', () => {
  test('resizeBetween conserves grow sum between two panels', () => {
    const { result } = renderHook(() => usePlannerLayout(42))
    const before = result.current.panels.days.grow + result.current.panels.map.grow
    act(() => result.current.resizeBetween('days', 'map', 50, 1000))
    const after = result.current.panels.days.grow + result.current.panels.map.grow
    expect(after).toBeCloseTo(before, 5)
    expect(result.current.panels.days.grow).toBeGreaterThan(5) // shifted right
    expect(result.current.panels.map.grow).toBeLessThan(5)
  })

  test('resizeBetween days↔map auto-disables autoFit', () => {
    const { result } = renderHook(() => usePlannerLayout(42))
    expect(result.current.panels.days.autoFit).toBe(true)
    act(() => result.current.resizeBetween('days', 'map', 30, 1000))
    expect(result.current.panels.days.autoFit).toBe(false)
  })

  test('resizeBetween candidates↔days does NOT touch autoFit', () => {
    const { result } = renderHook(() => usePlannerLayout(42))
    act(() => result.current.resizeBetween('candidates', 'days', 30, 1000))
    expect(result.current.panels.days.autoFit).toBe(true)
  })

  test('toggleAutoFit flips days.autoFit', () => {
    const { result } = renderHook(() => usePlannerLayout(42))
    expect(result.current.panels.days.autoFit).toBe(true)
    act(() => result.current.toggleAutoFit())
    expect(result.current.panels.days.autoFit).toBe(false)
    act(() => result.current.toggleAutoFit())
    expect(result.current.panels.days.autoFit).toBe(true)
  })

  test('resizeBetween clamps so neither side goes below MIN_GROW', () => {
    const { result } = renderHook(() => usePlannerLayout(42))
    // Push hard right — map grow should not go below 0.5 (MIN_GROW guard)
    act(() => result.current.resizeBetween('days', 'map', 9999, 1000))
    expect(result.current.panels.map.grow).toBeGreaterThanOrEqual(0.5)
    // And total still conserved
    const total = result.current.panels.days.grow + result.current.panels.map.grow
    expect(total).toBeCloseTo(10, 5)
  })
})
```

- [ ] **Step 3.2: Run tests — verify all 5 new tests fail**

```bash
npm test -- app/javascript/hooks/__tests__/usePlannerLayout.test.js
```

Expected: 5 new fail (resizeBetween / toggleAutoFit undefined).

- [ ] **Step 3.3: Implement resizeBetween + toggleAutoFit**

Add to `app/javascript/hooks/usePlannerLayout.js`:

```js
const MIN_GROW = 0.5  // Hard floor; below this a panel becomes invisibly thin

function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v))
}
```

Add the two new methods inside `usePlannerLayout`:

```js
  const resizeBetween = useCallback((leftId, rightId, deltaPx, totalPx) => {
    setPanels(prev => {
      const left = prev[leftId], right = prev[rightId]
      const totalGrow = left.grow + right.grow
      // Compute the shared px-space these two panels occupy together
      const sumOfOpenGrows = Object.values(prev).reduce(
        (s, p) => s + (p.open ? p.grow : 0),
        0
      )
      const sharedSpace = totalPx * (totalGrow / sumOfOpenGrows)
      if (sharedSpace <= 0) return prev
      const deltaGrow = (deltaPx / sharedSpace) * totalGrow
      const newLeftGrow = clamp(left.grow + deltaGrow, MIN_GROW, totalGrow - MIN_GROW)
      const newRightGrow = totalGrow - newLeftGrow
      const next = {
        ...prev,
        [leftId]:  { ...left,  grow: newLeftGrow },
        [rightId]: { ...right, grow: newRightGrow },
      }
      // Dragging days↔map turns off auto-fit (user is taking manual control)
      if ((leftId === 'days' && rightId === 'map') || (leftId === 'map' && rightId === 'days')) {
        next.days = { ...next.days, autoFit: false }
      }
      return next
    })
  }, [setPanels])

  const toggleAutoFit = useCallback(() => {
    setPanels(prev => ({
      ...prev,
      days: { ...prev.days, autoFit: !prev.days.autoFit }
    }))
  }, [setPanels])

  return { panels, openCount, togglePanel, resizeBetween, toggleAutoFit }
}
```

- [ ] **Step 3.4: Run tests — verify all 13 pass**

```bash
npm test -- app/javascript/hooks/__tests__/usePlannerLayout.test.js
```

Expected: 13/13 PASS.

- [ ] **Step 3.5: Commit**

```bash
git add app/javascript/hooks/usePlannerLayout.js app/javascript/hooks/__tests__/usePlannerLayout.test.js
git commit -m "feat(planner): resizeBetween + toggleAutoFit in usePlannerLayout"
```

---

## Task 4: usePlannerLayout — flexStyle + handleVisible helpers

**Files:**
- Modify: `app/javascript/hooks/usePlannerLayout.js`
- Modify: `app/javascript/hooks/__tests__/usePlannerLayout.test.js`

- [ ] **Step 4.1: Append failing tests**

Append to `app/javascript/hooks/__tests__/usePlannerLayout.test.js`:

```js
describe('usePlannerLayout · flexStyle + handleVisible', () => {
  test('flexStyle for collapsed panel returns 40px rail', () => {
    const { result } = renderHook(() => usePlannerLayout(42))
    act(() => result.current.togglePanel('candidates'))
    expect(result.current.flexStyle('candidates')).toEqual({
      flex: '0 0 40px',
      minWidth: 40,
    })
  })

  test('flexStyle for open candidates returns grow with min-width', () => {
    const { result } = renderHook(() => usePlannerLayout(42))
    expect(result.current.flexStyle('candidates')).toEqual({
      flex: '2 1 0',
      minWidth: 64,
    })
  })

  test('flexStyle for days with autoFit on uses fixed basis', () => {
    const { result } = renderHook(() => usePlannerLayout(42))
    const style = result.current.flexStyle('days', { autoFitWidth: 832 })
    expect(style).toEqual({ flex: '0 0 832px', minWidth: 200 })
  })

  test('flexStyle for days with autoFit off uses grow', () => {
    const { result } = renderHook(() => usePlannerLayout(42))
    act(() => result.current.toggleAutoFit())
    const style = result.current.flexStyle('days', { autoFitWidth: 832 })
    expect(style).toEqual({ flex: '5 1 0', minWidth: 200 })
  })

  test('handleVisible true only when both adjacent panels open', () => {
    const { result } = renderHook(() => usePlannerLayout(42))
    expect(result.current.handleVisible('candidates', 'days')).toBe(true)
    act(() => result.current.togglePanel('candidates'))
    expect(result.current.handleVisible('candidates', 'days')).toBe(false)
  })
})
```

- [ ] **Step 4.2: Run tests — verify 5 new tests fail**

```bash
npm test -- app/javascript/hooks/__tests__/usePlannerLayout.test.js
```

Expected: 5 fail (helpers undefined).

- [ ] **Step 4.3: Add flexStyle + handleVisible**

Add at top of `app/javascript/hooks/usePlannerLayout.js` (after `MIN_GROW`):

```js
const MIN_WIDTH = {
  candidates: 64,
  days: 200,
  map: 240,
  ai: 220,
}

const COLLAPSED_WIDTH = 40
```

Add inside `usePlannerLayout`:

```js
  const flexStyle = useCallback((id, opts = {}) => {
    const p = panels[id]
    if (!p.open) {
      return { flex: `0 0 ${COLLAPSED_WIDTH}px`, minWidth: COLLAPSED_WIDTH }
    }
    if (id === 'days' && p.autoFit && opts.autoFitWidth != null) {
      return { flex: `0 0 ${opts.autoFitWidth}px`, minWidth: MIN_WIDTH.days }
    }
    return { flex: `${p.grow} 1 0`, minWidth: MIN_WIDTH[id] }
  }, [panels])

  const handleVisible = useCallback((leftId, rightId) => {
    return panels[leftId].open && panels[rightId].open
  }, [panels])

  return { panels, openCount, togglePanel, resizeBetween, toggleAutoFit, flexStyle, handleVisible }
}
```

- [ ] **Step 4.4: Run tests — verify all 18 pass**

```bash
npm test -- app/javascript/hooks/__tests__/usePlannerLayout.test.js
```

Expected: 18/18 PASS.

- [ ] **Step 4.5: Commit**

```bash
git add app/javascript/hooks/usePlannerLayout.js app/javascript/hooks/__tests__/usePlannerLayout.test.js
git commit -m "feat(planner): flexStyle + handleVisible helpers in usePlannerLayout"
```

---

## Task 5: ResizeHandle component

**Files:**
- Create: `app/javascript/components/planner/PanelLayout/ResizeHandle.jsx`
- Test: `app/javascript/components/planner/PanelLayout/__tests__/ResizeHandle.test.jsx`

- [ ] **Step 5.1: Write failing tests**

Create `app/javascript/components/planner/PanelLayout/__tests__/ResizeHandle.test.jsx`:

```jsx
import { render, screen, fireEvent } from '@testing-library/react'
import { describe, test, expect, vi } from 'vitest'
import ResizeHandle from '../ResizeHandle'

describe('ResizeHandle', () => {
  test('renders a draggable element with col-resize cursor', () => {
    render(<ResizeHandle onResize={() => {}} />)
    const handle = screen.getByRole('separator')
    expect(handle).toBeInTheDocument()
    expect(handle).toHaveStyle({ cursor: 'col-resize' })
  })

  test('returns null when disabled', () => {
    const { container } = render(<ResizeHandle disabled onResize={() => {}} />)
    expect(container).toBeEmptyDOMElement()
  })

  test('mousedown → mousemove → mouseup fires onResize with cumulative deltaPx', () => {
    const onResize = vi.fn()
    render(<ResizeHandle onResize={onResize} />)
    const handle = screen.getByRole('separator')

    fireEvent.mouseDown(handle, { clientX: 500 })
    fireEvent.mouseMove(window, { clientX: 530 })
    fireEvent.mouseMove(window, { clientX: 550 })
    fireEvent.mouseUp(window, { clientX: 550 })

    // Should be called for each mousemove with cumulative delta from start
    expect(onResize).toHaveBeenCalled()
    const lastCall = onResize.mock.calls[onResize.mock.calls.length - 1]
    expect(lastCall[0]).toBe(50)  // 550 - 500
  })

  test('mouseup outside the component still ends the drag', () => {
    const onResize = vi.fn()
    render(<ResizeHandle onResize={onResize} />)
    const handle = screen.getByRole('separator')

    fireEvent.mouseDown(handle, { clientX: 500 })
    fireEvent.mouseUp(window, { clientX: 600 })
    onResize.mockClear()

    // After mouseup, further mousemove should NOT fire onResize
    fireEvent.mouseMove(window, { clientX: 700 })
    expect(onResize).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 5.2: Run tests — verify they fail**

```bash
npm test -- app/javascript/components/planner/PanelLayout/__tests__/ResizeHandle.test.jsx
```

Expected: all 4 FAIL with "Cannot find module '../ResizeHandle'".

- [ ] **Step 5.3: Implement ResizeHandle**

Create `app/javascript/components/planner/PanelLayout/ResizeHandle.jsx`:

```jsx
import { useEffect, useRef, useState } from 'react'

/**
 * Draggable vertical divider between two flex panels.
 *
 * onResize(deltaPx) fires on every mousemove during a drag, with the cumulative
 * delta from the mousedown point (not the per-frame delta). The parent decides
 * how to translate that into grow-ratio changes.
 *
 * During a drag, a transparent fullscreen overlay captures mousemove/mouseup so
 * AMAP / iframes / canvases can't steal the events.
 */
export default function ResizeHandle({ onResize, disabled = false }) {
  const [dragging, setDragging] = useState(false)
  const startXRef = useRef(0)

  useEffect(() => {
    if (!dragging) return

    function onMove(e) {
      onResize(e.clientX - startXRef.current)
    }
    function onUp() {
      setDragging(false)
    }

    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
  }, [dragging, onResize])

  if (disabled) return null

  function onMouseDown(e) {
    startXRef.current = e.clientX
    setDragging(true)
  }

  return (
    <>
      <div
        role="separator"
        aria-orientation="vertical"
        onMouseDown={onMouseDown}
        style={{
          width: 6,
          flex: '0 0 6px',
          cursor: 'col-resize',
          background: dragging ? '#0071e3' : '#cfcfd3',
          margin: '0 3px',
          borderRadius: 2,
          alignSelf: 'stretch',
          transition: 'background 0.1s',
        }}
      />
      {dragging && (
        // Fullscreen capture overlay — prevents AMAP / iframes from stealing events
        <div style={{
          position: 'fixed',
          inset: 0,
          cursor: 'col-resize',
          zIndex: 9999,
        }} />
      )}
    </>
  )
}
```

- [ ] **Step 5.4: Run tests — verify all 4 pass**

```bash
npm test -- app/javascript/components/planner/PanelLayout/__tests__/ResizeHandle.test.jsx
```

Expected: 4/4 PASS.

- [ ] **Step 5.5: Commit**

```bash
git add app/javascript/components/planner/PanelLayout/
git commit -m "feat(planner): ResizeHandle component with drag capture overlay"
```

---

## Task 6: PanelShell — open state (header + collapse button + children)

**Files:**
- Create: `app/javascript/components/planner/PanelLayout/PanelShell.jsx`
- Test: `app/javascript/components/planner/PanelLayout/__tests__/PanelShell.test.jsx`

- [ ] **Step 6.1: Write failing tests for the open state**

Create `app/javascript/components/planner/PanelLayout/__tests__/PanelShell.test.jsx`:

```jsx
import { render, screen, fireEvent } from '@testing-library/react'
import { describe, test, expect, vi } from 'vitest'
import { MantineProvider } from '@mantine/core'
import PanelShell from '../PanelShell'

function renderShell(props = {}) {
  return render(
    <MantineProvider>
      <PanelShell
        title="候选"
        icon="📋"
        open={true}
        onToggle={() => {}}
        canToggle={true}
        flexStyle={{ flex: '2 1 0', minWidth: 64 }}
        {...props}
      >
        <div>panel content</div>
      </PanelShell>
    </MantineProvider>
  )
}

describe('PanelShell · open state', () => {
  test('renders header with title + icon', () => {
    renderShell()
    expect(screen.getByText(/候选/)).toBeInTheDocument()
    expect(screen.getByText(/📋/)).toBeInTheDocument()
  })

  test('renders children inside the body', () => {
    renderShell()
    expect(screen.getByText('panel content')).toBeInTheDocument()
  })

  test('clicking the collapse button calls onToggle', () => {
    const onToggle = vi.fn()
    renderShell({ onToggle })
    fireEvent.click(screen.getByLabelText('折叠'))
    expect(onToggle).toHaveBeenCalledOnce()
  })

  test('renders headerExtra slot when provided', () => {
    renderShell({ headerExtra: <span data-testid="extra-slot">📐</span> })
    expect(screen.getByTestId('extra-slot')).toBeInTheDocument()
  })
})
```

- [ ] **Step 6.2: Run tests — verify they fail**

```bash
npm test -- app/javascript/components/planner/PanelLayout/__tests__/PanelShell.test.jsx
```

Expected: all 4 FAIL with "Cannot find module '../PanelShell'".

- [ ] **Step 6.3: Implement PanelShell open state**

Create `app/javascript/components/planner/PanelLayout/PanelShell.jsx`:

```jsx
import { Paper, Group, Text, UnstyledButton, Tooltip } from '@mantine/core'

/**
 * Generic panel container — header (title + icon + extra slot + collapse button)
 * over body content. When open=false, renders a 40px vertical rail with the icon
 * and a vertical label that expands on click.
 *
 * Props:
 *   title            string  — header title
 *   icon             string  — emoji or short string shown in header + rail
 *   open             bool    — whether to render full panel or rail
 *   onToggle         fn      — called on collapse/expand button click
 *   canToggle        bool    — false → collapse button disabled with tooltip
 *   flexStyle        object  — passed to wrapping Paper's style (flex + minWidth)
 *   headerExtra      node    — optional slot in header (left of collapse button)
 *   children         node    — body content (rendered when open)
 */
export default function PanelShell({
  title,
  icon,
  open,
  onToggle,
  canToggle = true,
  flexStyle,
  headerExtra,
  children,
}) {
  if (!open) {
    return (
      <UnstyledButton
        onClick={onToggle}
        aria-label={`展开 ${title}`}
        style={{
          ...flexStyle,
          background: '#f3f3f3',
          border: '1px solid var(--mantine-color-default-border)',
          borderRadius: 4,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'flex-start',
          padding: '8px 0',
          gap: 6,
          cursor: 'pointer',
        }}
      >
        <Text size="sm">›</Text>
        <Text size="sm">{icon}</Text>
        <Text size="xs" c="gray.7" style={{ writingMode: 'vertical-rl', marginTop: 4 }}>
          {title}
        </Text>
      </UnstyledButton>
    )
  }

  const collapseButton = (
    <UnstyledButton
      onClick={canToggle ? onToggle : undefined}
      disabled={!canToggle}
      aria-label="折叠"
      style={{
        color: canToggle ? '#999' : '#ccc',
        cursor: canToggle ? 'pointer' : 'not-allowed',
        fontSize: 14,
        lineHeight: 1,
        padding: '0 4px',
      }}
    >
      ‹
    </UnstyledButton>
  )

  return (
    <Paper withBorder style={{ ...flexStyle, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <Group justify="space-between" px="xs" py={6} bg="gray.1" style={{ borderBottom: '1px solid var(--mantine-color-default-border)' }}>
        <Text size="xs" fw={600} c="dimmed">{icon} {title}</Text>
        <Group gap={6}>
          {headerExtra}
          {canToggle ? collapseButton : (
            <Tooltip label="至少保留一个面板打开" withArrow>
              <span>{collapseButton}</span>
            </Tooltip>
          )}
        </Group>
      </Group>
      <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        {children}
      </div>
    </Paper>
  )
}
```

- [ ] **Step 6.4: Run tests — verify all 4 pass**

```bash
npm test -- app/javascript/components/planner/PanelLayout/__tests__/PanelShell.test.jsx
```

Expected: 4/4 PASS.

- [ ] **Step 6.5: Commit**

```bash
git add app/javascript/components/planner/PanelLayout/PanelShell.jsx app/javascript/components/planner/PanelLayout/__tests__/PanelShell.test.jsx
git commit -m "feat(planner): PanelShell open state — header + body + collapse button"
```

---

## Task 7: PanelShell — collapsed rail + canToggle disabled state

**Files:**
- Modify: `app/javascript/components/planner/PanelLayout/__tests__/PanelShell.test.jsx`

- [ ] **Step 7.1: Append failing tests for collapsed and disabled states**

Append to `app/javascript/components/planner/PanelLayout/__tests__/PanelShell.test.jsx`:

```jsx
describe('PanelShell · collapsed rail', () => {
  test('renders rail with icon + vertical label when open=false', () => {
    renderShell({ open: false })
    expect(screen.getByText('📋')).toBeInTheDocument()
    expect(screen.getByText('候选')).toBeInTheDocument()
    expect(screen.getByLabelText('展开 候选')).toBeInTheDocument()
  })

  test('clicking the rail calls onToggle (expand)', () => {
    const onToggle = vi.fn()
    renderShell({ open: false, onToggle })
    fireEvent.click(screen.getByLabelText('展开 候选'))
    expect(onToggle).toHaveBeenCalledOnce()
  })

  test('rail does NOT render children', () => {
    renderShell({ open: false })
    expect(screen.queryByText('panel content')).not.toBeInTheDocument()
  })
})

describe('PanelShell · canToggle=false (last open)', () => {
  test('collapse button is disabled', () => {
    renderShell({ canToggle: false })
    expect(screen.getByLabelText('折叠')).toBeDisabled()
  })

  test('clicking disabled collapse button does NOT call onToggle', () => {
    const onToggle = vi.fn()
    renderShell({ canToggle: false, onToggle })
    fireEvent.click(screen.getByLabelText('折叠'))
    expect(onToggle).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 7.2: Run tests — verify the 5 new tests pass (Task 6 implementation already covers these)**

```bash
npm test -- app/javascript/components/planner/PanelLayout/__tests__/PanelShell.test.jsx
```

Expected: 9/9 PASS. If any fail, fix the implementation in `PanelShell.jsx` before continuing.

- [ ] **Step 7.3: Commit**

```bash
git add app/javascript/components/planner/PanelLayout/__tests__/PanelShell.test.jsx
git commit -m "test(planner): PanelShell collapsed rail + canToggle behavior"
```

---

## Task 8: DayPanel — wraps day strip + AddDayButton + auto-fit toggle

**Files:**
- Create: `app/javascript/components/planner/DayPanel.jsx`
- Test: `app/javascript/components/planner/__tests__/DayPanel.test.jsx`

- [ ] **Step 8.1: Write failing tests**

Create `app/javascript/components/planner/__tests__/DayPanel.test.jsx`:

```jsx
import { render, screen, fireEvent } from '@testing-library/react'
import { describe, test, expect, vi } from 'vitest'
import { MantineProvider } from '@mantine/core'
import { DndContext } from '@dnd-kit/core'
import DayPanel from '../DayPanel'

function renderPanel(props = {}) {
  const defaults = {
    days: [
      { id: 1, day_index: 1, date: '2026-05-10', buffer_day: false },
      { id: 2, day_index: 2, date: '2026-05-11', buffer_day: false },
    ],
    byDay: { 1: [], 2: [] },
    tour: { id: 42, constitution: { max_daily_driving_minutes: 420 } },
    nextDayIndex: 3,
    open: true,
    onToggle: () => {},
    canToggle: true,
    autoFit: true,
    onToggleAutoFit: () => {},
    flexStyle: { flex: '0 0 432px', minWidth: 200 },
    onAddActivity: () => {},
    onEditActivity: () => {},
    onEditDay: () => {},
    readOnly: false,
    dragWarning: null,
  }
  return render(
    <MantineProvider>
      <DndContext>
        <DayPanel {...defaults} {...props} />
      </DndContext>
    </MantineProvider>
  )
}

describe('DayPanel', () => {
  test('renders panel header with day count', () => {
    renderPanel()
    expect(screen.getByText(/日程/)).toBeInTheDocument()
  })

  test('renders one DayColumn per day', () => {
    renderPanel()
    expect(screen.getByText(/D1/)).toBeInTheDocument()
    expect(screen.getByText(/D2/)).toBeInTheDocument()
  })

  test('renders AddDayButton', () => {
    renderPanel()
    expect(screen.getByTestId('add-day-slot')).toBeInTheDocument()
  })

  test('shows auto-fit button when autoFit=true (active style)', () => {
    renderPanel({ autoFit: true })
    const button = screen.getByLabelText(/auto-fit/i)
    expect(button).toBeInTheDocument()
    // Active state: blue background
    expect(button).toHaveAttribute('data-active', 'true')
  })

  test('shows auto-fit button when autoFit=false (inactive style — "恢复")', () => {
    renderPanel({ autoFit: false })
    const button = screen.getByLabelText(/auto-fit/i)
    expect(button).toHaveAttribute('data-active', 'false')
  })

  test('clicking auto-fit button calls onToggleAutoFit', () => {
    const onToggleAutoFit = vi.fn()
    renderPanel({ onToggleAutoFit })
    fireEvent.click(screen.getByLabelText(/auto-fit/i))
    expect(onToggleAutoFit).toHaveBeenCalledOnce()
  })

  test('renders rail when open=false (no DayColumns)', () => {
    renderPanel({ open: false })
    expect(screen.queryByText(/D1/)).not.toBeInTheDocument()
    expect(screen.getByLabelText(/展开 日程/)).toBeInTheDocument()
  })
})
```

- [ ] **Step 8.2: Run tests — verify they fail**

```bash
npm test -- app/javascript/components/planner/__tests__/DayPanel.test.jsx
```

Expected: all 7 FAIL with "Cannot find module '../DayPanel'".

- [ ] **Step 8.3: Implement DayPanel**

Create `app/javascript/components/planner/DayPanel.jsx`:

```jsx
import { Paper, Stack, Text, Button, UnstyledButton } from '@mantine/core'
import { router } from '@inertiajs/react'
import PanelShell from './PanelLayout/PanelShell'
import DayColumn from './DayColumn'

const DAY_STRIP_BACKGROUND = `
  linear-gradient(to right, white, white),
  linear-gradient(to left, white, white),
  linear-gradient(to right, rgba(0,0,0,0.1), rgba(0,0,0,0)),
  linear-gradient(to left, rgba(0,0,0,0.1), rgba(0,0,0,0))
`

export default function DayPanel({
  days,
  byDay,
  tour,
  nextDayIndex,
  open,
  onToggle,
  canToggle,
  autoFit,
  onToggleAutoFit,
  flexStyle,
  onAddActivity,
  onEditActivity,
  onEditDay,
  readOnly,
  dragWarning,
}) {
  const autoFitButton = (
    <UnstyledButton
      onClick={onToggleAutoFit}
      aria-label="auto-fit toggle"
      data-active={autoFit ? 'true' : 'false'}
      style={{
        background: autoFit ? '#0071e3' : '#fff',
        color: autoFit ? '#fff' : '#666',
        border: autoFit ? 'none' : '1px solid #ddd',
        fontSize: 10,
        padding: '2px 7px',
        borderRadius: 3,
        cursor: 'pointer',
      }}
    >
      📐 {autoFit ? 'auto' : '恢复'}
    </UnstyledButton>
  )

  return (
    <PanelShell
      title="日程"
      icon="📅"
      open={open}
      onToggle={onToggle}
      canToggle={canToggle}
      flexStyle={flexStyle}
      headerExtra={autoFitButton}
    >
      <div style={{
        display: 'flex',
        gap: 8,
        overflowX: 'auto',
        alignItems: 'stretch',
        padding: 8,
        flex: 1,
        background: DAY_STRIP_BACKGROUND,
        backgroundPosition: 'left center, right center, left center, right center',
        backgroundSize: '20px 100%, 20px 100%, 10px 100%, 10px 100%',
        backgroundRepeat: 'no-repeat',
        backgroundAttachment: 'local, local, scroll, scroll',
      }}>
        {days.map(d => (
          <DayColumn
            key={d.id}
            day={d}
            activities={byDay[d.id] || []}
            constitution={tour.constitution}
            onAddActivity={onAddActivity}
            onEditActivity={onEditActivity}
            onEditDay={onEditDay}
            readOnly={readOnly}
            dragWarning={dragWarning?.dayId === d.id ? dragWarning : null}
          />
        ))}
        <AddDayButton tour={tour} nextDayIndex={nextDayIndex} empty={days.length === 0} />
      </div>
    </PanelShell>
  )
}

function AddDayButton({ tour, nextDayIndex, empty }) {
  const handleAdd = () => {
    router.post(
      `/tours/${tour.id}/days`,
      { day: { day_index: nextDayIndex } },
      {
        only: ['days', 'activities', 'violations'],
        preserveState: true,
        preserveScroll: true,
      }
    )
  }

  if (empty) {
    return (
      <Paper
        withBorder
        style={{
          minWidth: 260,
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          alignItems: 'center',
          border: '2px dashed #ccc',
          background: '#fafafa',
          padding: 24,
          gap: 8,
        }}
      >
        <Stack gap={6} align="center">
          <Text fw={600} size="sm">还没有日</Text>
          <Text size="xs" c="dimmed" ta="center">
            从第 1 天开始，或让 AI 帮你一次排完
          </Text>
          <Button size="xs" onClick={handleAdd} data-testid="add-day-empty">
            + 新建 D1
          </Button>
        </Stack>
      </Paper>
    )
  }

  return (
    <Paper
      withBorder
      onClick={handleAdd}
      style={{
        minWidth: 60,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        cursor: 'pointer',
        border: '2px dashed #ccc',
        background: '#fafafa',
        color: '#666',
      }}
      data-testid="add-day-slot"
    >
      <Text size="sm" fw={500}>+ D{nextDayIndex}</Text>
    </Paper>
  )
}
```

- [ ] **Step 8.4: Run tests — verify all 7 pass**

```bash
npm test -- app/javascript/components/planner/__tests__/DayPanel.test.jsx
```

Expected: 7/7 PASS.

- [ ] **Step 8.5: Commit**

```bash
git add app/javascript/components/planner/DayPanel.jsx app/javascript/components/planner/__tests__/DayPanel.test.jsx
git commit -m "feat(planner): DayPanel — wraps day strip with PanelShell + auto-fit toggle"
```

---

## Task 9: Refactor BacklogList to use PanelShell internally

**Files:**
- Modify: `app/javascript/components/planner/BacklogList.jsx`
- Modify: `app/javascript/components/planner/__tests__/BacklogList.test.jsx` (if needed)

- [ ] **Step 9.1: Read existing BacklogList to understand current structure**

```bash
cat app/javascript/components/planner/BacklogList.jsx | head -100
```

Note: the current file renders its own collapsed rail when `open=false` and its own header when `open=true`. We need to swap both for `PanelShell`.

- [ ] **Step 9.2: Refactor BacklogList — wrap with PanelShell, accept new props**

Modify `app/javascript/components/planner/BacklogList.jsx`. Replace the `if (!open)` branch and the outer `<Paper>` wrapper with `<PanelShell>`:

```jsx
import { useState, useMemo } from 'react'
import { Stack, Text, Button, Group, Select } from '@mantine/core'
import { useDroppable } from '@dnd-kit/core'
import ActivityCard from './ActivityCard'
import PanelShell from './PanelLayout/PanelShell'

const KIND_FILTER_OPTIONS = [
  { value: '',       label: '所有类型' },
  { value: 'scenic', label: '景' },
  { value: 'road',   label: '路' },
  { value: 'food',   label: '食' },
  { value: 'stay',   label: '住' },
  { value: 'fuel',   label: '油' },
  { value: 'other',  label: '其他' },
]

const LEVEL_FILTER_OPTIONS = [
  { value: '',               label: '所有等级' },
  { value: 'tier_one',       label: '一等' },
  { value: 'tier_two',       label: '二等' },
  { value: 'tier_three',     label: '三等' },
  { value: 'infrastructure', label: '基础' },
]

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
}) {
  const [kindFilter, setKindFilter] = useState('')
  const [levelFilter, setLevelFilter] = useState('')

  const filtered = useMemo(() => {
    return activities.filter(a => {
      if (kindFilter && a.kind !== kindFilter) return false
      if (levelFilter && a.citizen_level !== levelFilter) return false
      return true
    })
  }, [activities, kindFilter, levelFilter])

  const { setNodeRef, isOver, active } = useDroppable({
    id: 'backlog',
    data: { dayId: null, position: activities.length + 1 },
  })

  return (
    <PanelShell
      title="候选池"
      icon="📋"
      open={open}
      onToggle={onToggle}
      canToggle={canToggle}
      flexStyle={flexStyle}
    >
      {/* All existing body content (filters + droppable list) goes here.
          Keep the existing JSX from the current `if (open)` branch's body,
          MINUS the outer <Paper> and <Group> header (PanelShell provides them). */}
      <Stack gap="xs" p="xs" style={{ flex: 1, overflow: 'auto' }}>
        <Group gap="xs">
          <Select
            data={KIND_FILTER_OPTIONS}
            value={kindFilter}
            onChange={(v) => setKindFilter(v || '')}
            size="xs"
            style={{ flex: 1 }}
          />
          <Select
            data={LEVEL_FILTER_OPTIONS}
            value={levelFilter}
            onChange={(v) => setLevelFilter(v || '')}
            size="xs"
            style={{ flex: 1 }}
          />
        </Group>

        <div
          ref={setNodeRef}
          style={{
            flex: 1,
            minHeight: 100,
            background: isOver && active ? '#e7f5ff' : 'transparent',
            border: isOver && active ? '2px dashed #228be6' : '2px dashed transparent',
            borderRadius: 4,
            padding: 4,
          }}
        >
          {filtered.length === 0 ? (
            <Text size="xs" c="dimmed" ta="center" mt="md">
              {activities.length === 0
                ? (readOnly ? '没有候选' : '先把想去的点塞这里')
                : '无匹配的候选'}
            </Text>
          ) : (
            <Stack gap={4}>
              {filtered.map(a => (
                <ActivityCard
                  key={a.id}
                  activity={a}
                  onClick={() => onEditActivity?.(a.id)}
                  compact
                />
              ))}
            </Stack>
          )}
        </div>

        {!readOnly && (
          <Group gap="xs">
            <Button size="compact-xs" variant="light" onClick={() => onAddActivity?.(null)} style={{ flex: 1 }}>
              + 新增
            </Button>
            {onAskAI && (
              <Button size="compact-xs" variant="light" color="grape" onClick={onAskAI} style={{ flex: 1 }}>
                问 AI
              </Button>
            )}
          </Group>
        )}
      </Stack>
    </PanelShell>
  )
}
```

**IMPORTANT**: Open the current `BacklogList.jsx` and copy the EXACT body content (filters, droppable area, action buttons) into the children of `<PanelShell>` above. The snippet shows the structure but the precise existing content should be preserved verbatim — do not reinvent the body.

- [ ] **Step 9.3: Run BacklogList tests — verify they still pass**

```bash
npm test -- app/javascript/components/planner/__tests__/BacklogList.test.jsx
```

Expected: all existing tests PASS. If any fail because of the structural change (e.g., a new outer element wraps content), update the test selectors to match — but don't change behavior assertions.

- [ ] **Step 9.4: Commit**

```bash
git add app/javascript/components/planner/BacklogList.jsx app/javascript/components/planner/__tests__/BacklogList.test.jsx
git commit -m "refactor(planner): BacklogList uses PanelShell internally; accepts flexStyle/canToggle"
```

---

## Task 10: Refactor ChatPanel to use PanelShell internally

**Files:**
- Modify: `app/javascript/components/planner/ChatPanel.jsx`
- Modify: `app/javascript/components/planner/__tests__/ChatPanel.test.jsx` (if needed)

- [ ] **Step 10.1: Refactor ChatPanel — wrap with PanelShell**

Modify `app/javascript/components/planner/ChatPanel.jsx`. Keep the `needsExpand` auto-expand logic. Replace the `if (!open)` branch and outer `<Paper>` with `<PanelShell>`:

```jsx
import { Text, Button, Textarea, Stack, Group, Badge, Code } from '@mantine/core'
import { useEffect, useRef, useState } from 'react'
import useChat from '../../hooks/useChat'
import { ONBOARDING_SENTINEL } from '../../lib/onboarding'
import PanelShell from './PanelLayout/PanelShell'

export default function ChatPanel({
  tour,
  open,
  onToggle,
  pendingPrompt,
  onPromptConsumed,
  canToggle = true,
  flexStyle,
}) {
  // Auto-expand and send when a pending prompt arrives
  const needsExpand = pendingPrompt && !open
  useEffect(() => {
    if (needsExpand && onToggle) onToggle()
  }, [needsExpand]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <PanelShell
      title="AI 对话"
      icon="💬"
      open={open}
      onToggle={onToggle}
      canToggle={canToggle}
      flexStyle={flexStyle}
    >
      {/* Copy the existing body content (messages list, send box, etc.)
          from current ChatPanel.jsx — everything inside the existing `<Paper>`
          MINUS the existing `<Group>` header (PanelShell provides one). */}
      {/* ... existing body verbatim ... */}
    </PanelShell>
  )
}
```

**IMPORTANT**: Read the current `ChatPanel.jsx` and copy the body content (everything between the existing `<Group>` header and the closing `</Paper>`) into the children of `<PanelShell>`. Do not reinvent the messaging UI.

- [ ] **Step 10.2: Run ChatPanel tests — verify they still pass**

```bash
npm test -- app/javascript/components/planner/__tests__/ChatPanel.test.jsx
```

Expected: all PASS. Update selectors if the wrapping structure changed (e.g., test was looking for a specific outer element).

- [ ] **Step 10.3: Commit**

```bash
git add app/javascript/components/planner/ChatPanel.jsx app/javascript/components/planner/__tests__/ChatPanel.test.jsx
git commit -m "refactor(planner): ChatPanel uses PanelShell internally; accepts flexStyle/canToggle"
```

---

## Task 11: Refactor PlannerMap — extract Inner, wrap with PanelShell, drop hardcoded height

**Files:**
- Modify: `app/javascript/components/planner/PlannerMap.jsx`
- Modify: `app/javascript/components/planner/__tests__/PlannerMap.test.jsx` (likely no change — pure-function tests)

- [ ] **Step 11.1: Refactor PlannerMap — split into wrapper + Inner**

Modify `app/javascript/components/planner/PlannerMap.jsx`. The current file has a single default export. Restructure:

1. Rename the existing component body to `PlannerMapInner` (NOT exported as default)
2. Remove the `height: 260` from the inner Paper, replace with `height: '100%'`
3. New default export `PlannerMap` wraps `PlannerMapInner` in `PanelShell`

The pure helper functions `DAY_COLOR`, `filterActivitiesByViewMode`, `buildMarkerHTML`, `buildPolylineConfigs`, and the `DAY_PALETTE` constant stay as named exports (PlannerMap.test.jsx imports them).

Top of file gets a new import:
```jsx
import PanelShell from './PanelLayout/PanelShell'
```

Wrap the inner with shell at the bottom:

```jsx
function PlannerMapInner({ activities, days = [] }) {
  /* ...existing component body, but the outer <Paper> changes from
     `style={{ height: 260, position: 'relative', overflow: 'hidden', background: '#fafafa' }}`
     to `style={{ height: '100%', position: 'relative', overflow: 'hidden', background: '#fafafa' }}` */
  /* The rest (containerRef, useEffects, ViewModeRadio absolute-positioned, Overlay, etc.) is unchanged */
}

export default function PlannerMap({
  activities,
  days = [],
  open = true,
  onToggle,
  canToggle = true,
  flexStyle,
}) {
  return (
    <PanelShell
      title="地图"
      icon="🗺"
      open={open}
      onToggle={onToggle}
      canToggle={canToggle}
      flexStyle={flexStyle}
    >
      <PlannerMapInner activities={activities} days={days} />
    </PanelShell>
  )
}
```

- [ ] **Step 11.2: Run PlannerMap tests — verify they pass (testing pure functions only)**

```bash
npm test -- app/javascript/components/planner/__tests__/PlannerMap.test.jsx
```

Expected: all PASS (the test file only imports `DAY_COLOR` and `filterActivitiesByViewMode`, which are unchanged named exports).

- [ ] **Step 11.3: Commit**

```bash
git add app/javascript/components/planner/PlannerMap.jsx
git commit -m "refactor(planner): PlannerMap wraps with PanelShell; remove hardcoded 260px height"
```

---

## Task 12: Wire up Show.jsx — replace grid with flex 4-panel layout

**Files:**
- Modify: `app/javascript/pages/Tour/Show.jsx`

This is the integration step. Show.jsx currently has:
- `backlogOpen` / `chatOpen` useState
- A grid layout: `gridTemplateColumns: '${backlogOpen?260:44}px 1fr ${chatOpen?320:44}px'`
- Inside the middle column: `gridTemplateRows: 'auto 1fr'` with PlannerMap on top + day strip on bottom

We replace ALL of that with: `usePlannerLayout` + flex 4-column layout + `DayPanel` + `ResizeHandle`s.

- [ ] **Step 12.1: Add imports + hook + container ref**

Open `app/javascript/pages/Tour/Show.jsx`. At the top, add imports:

```jsx
import usePlannerLayout from '../../hooks/usePlannerLayout'
import DayPanel from '../../components/planner/DayPanel'
import ResizeHandle from '../../components/planner/PanelLayout/ResizeHandle'
import { useRef } from 'react'
```

(The existing `useRef` import may already be there via `useState, useEffect`; just add `useRef` to the same line.)

Inside the `Show` component body, **remove** the lines:

```jsx
const [chatOpen, setChatOpen] = useState(true)
const [backlogOpen, setBacklogOpen] = useState(true)
```

**Add** in their place:

```jsx
const layout = usePlannerLayout(tour.id)
const containerRef = useRef(null)
const handleResize = (leftId, rightId) => (deltaPx) => {
  const total = containerRef.current?.getBoundingClientRect().width
  if (!total) return
  layout.resizeBetween(leftId, rightId, deltaPx, total)
}
```

- [ ] **Step 12.2: Replace the grid layout with flex 4-panel**

Find the JSX block in Show.jsx that opens with `<div style={{ display: 'grid', gridTemplateColumns: ... }}>` (around line 146). REPLACE the whole block (from that opening `<div>` through its closing `</div>`, INCLUDING the inner middle-column `<div>` that contains PlannerMap + day strip) with:

```jsx
<div ref={containerRef} style={{
  display: 'flex',
  alignItems: 'stretch',
  gap: 0,
  padding: 10,
  height: 'calc(100vh - 200px)',
}}>
  <BacklogList
    activities={backlog}
    onAddActivity={canEdit ? openCreate : undefined}
    onEditActivity={canEdit ? openEdit : undefined}
    onAskAI={canEdit ? () => setPendingChatPrompt(ASK_AI_BACKLOG_PROMPT) : undefined}
    readOnly={!canEdit}
    open={layout.panels.candidates.open}
    onToggle={() => layout.togglePanel('candidates')}
    canToggle={layout.openCount > 1 || !layout.panels.candidates.open}
    flexStyle={layout.flexStyle('candidates')}
  />
  <ResizeHandle
    disabled={!layout.handleVisible('candidates', 'days')}
    onResize={handleResize('candidates', 'days')}
  />

  <DayPanel
    days={days}
    byDay={byDay}
    tour={tour}
    nextDayIndex={nextDayIndex}
    onAddActivity={canEdit ? openCreate : undefined}
    onEditActivity={canEdit ? openEdit : undefined}
    onEditDay={canEdit ? setEditingDayId : undefined}
    readOnly={!canEdit}
    dragWarning={dragWarning}
    open={layout.panels.days.open}
    onToggle={() => layout.togglePanel('days')}
    canToggle={layout.openCount > 1 || !layout.panels.days.open}
    autoFit={layout.panels.days.autoFit}
    onToggleAutoFit={layout.toggleAutoFit}
    flexStyle={layout.flexStyle('days', { autoFitWidth: days.length * 200 + 32 })}
  />
  <ResizeHandle
    disabled={!layout.handleVisible('days', 'map')}
    onResize={handleResize('days', 'map')}
  />

  <PlannerMap
    activities={activities}
    days={days}
    open={layout.panels.map.open}
    onToggle={() => layout.togglePanel('map')}
    canToggle={layout.openCount > 1 || !layout.panels.map.open}
    flexStyle={layout.flexStyle('map')}
  />
  <ResizeHandle
    disabled={!layout.handleVisible('map', 'ai')}
    onResize={handleResize('map', 'ai')}
  />

  <ChatPanel
    tour={tour}
    pendingPrompt={pendingChatPrompt}
    onPromptConsumed={() => setPendingChatPrompt(null)}
    open={layout.panels.ai.open}
    onToggle={() => layout.togglePanel('ai')}
    canToggle={layout.openCount > 1 || !layout.panels.ai.open}
    flexStyle={layout.flexStyle('ai')}
  />
</div>
```

Also REMOVE the inline `AddDayButton` component definition at the bottom of Show.jsx — it now lives inside `DayPanel.jsx`.

- [ ] **Step 12.3: Run all planner-related tests**

```bash
npm test -- app/javascript/components/planner/ app/javascript/hooks/__tests__/usePlannerLayout.test.js
```

Expected: all PASS. If any test imports `AddDayButton` from Show.jsx, it will fail — find via:
```bash
grep -r "AddDayButton" app/javascript/
```
Update the importer to point at `DayPanel.jsx` (or remove if test was incidental).

- [ ] **Step 12.4: Manual smoke test**

```bash
bin/worktree-dev up
```

Open the planner page in the browser. Verify:
1. Default view: 4 panels visible, ratios look ~symmetric (候选/AI thin, 日卡/地图wide), map fills full vertical height (no longer 260px)
2. Click each panel's `‹` button → collapses to 40px rail with icon + vertical label
3. With only one panel open, that panel's `‹` button hover → tooltip "至少保留一个面板打开"
4. Drag a handle between two open panels → both panels resize proportionally
5. Drag the days↔map handle → days panel header's `📐` button switches from "auto" to "恢复"
6. Refresh the page → all panel states preserved
7. Drag an activity from candidates into D1 → still works (existing DnD)

- [ ] **Step 12.5: Commit**

```bash
git add app/javascript/pages/Tour/Show.jsx
git commit -m "feat(planner): replace grid with 4-panel flex layout (候选|日卡|地图|AI)"
```

---

## Task 13: Verify AMAP map resizes correctly when panels resize

**Files:**
- Modify: `app/javascript/components/planner/PlannerMap.jsx` (only if needed)

- [ ] **Step 13.1: Manual test for map resize behavior**

Run dev server (`bin/worktree-dev up` if not running). On the planner page:
1. Note the map's current rendered size and visible markers
2. Drag the days↔map handle to make the map column wider
3. Observe: the map div CSS resizes immediately, but does the AMAP canvas/tiles redraw to fill the new size?

If the map redraws correctly (markers stay positioned, tiles fill new size): no code change needed — `resizeEnable: true` handled it. Skip to Step 13.3.

If the map does NOT redraw (markers offset, tiles cut off, or whitespace appears): proceed to Step 13.2.

- [ ] **Step 13.2: Add explicit resize trigger (only if Step 13.1 found a problem)**

In `PlannerMap.jsx`, inside `PlannerMapInner`, add a ResizeObserver effect:

```jsx
useEffect(() => {
  const map = mapRef.current
  const container = containerRef.current
  if (!map || !container || !window.ResizeObserver) return

  const observer = new ResizeObserver(() => {
    map.resize?.()
  })
  observer.observe(container)
  return () => observer.disconnect()
}, [sdkState])
```

Re-run Step 13.1 to verify the resize now works.

- [ ] **Step 13.3: Commit (if Step 13.2 was needed)**

```bash
git add app/javascript/components/planner/PlannerMap.jsx
git commit -m "fix(planner): trigger AMAP resize on container width change"
```

(If no change was needed, skip this commit.)

---

## Task 14: Final verification — full test + lint sweep

- [ ] **Step 14.1: Run full JS test suite**

```bash
npm test
```

Expected: all PASS. If any unrelated test breaks, investigate (could be a side effect of the refactor on shared utilities).

- [ ] **Step 14.2: Run Ruby checks (no Ruby code changed but CI checks all)**

```bash
bin/rubocop -f github
bin/brakeman --no-pager
mise exec -- bundle exec rspec
```

Expected: all PASS (no Ruby changes; this is a sanity check).

- [ ] **Step 14.3: Run JS audit**

```bash
npm audit
```

Expected: no new high/critical vulnerabilities.

- [ ] **Step 14.4: Manual cross-screen visual check**

`bin/worktree-dev up` and resize browser:
- 1280×800: 4 panels visible at minimums (no horizontal body scroll)
- 1920×1080: panels render at ~2:5:5:2 (eyeball check)
- 2560×1440: same ratio, just wider

Take 2-3 screenshots for the PR description (default state, panels collapsed state, drag-handle in action).

- [ ] **Step 14.5: Final summary commit (if any test/lint fixes were applied)**

If 14.1-14.3 required follow-up fixes, commit them:

```bash
git add -u
git commit -m "fix(planner): post-refactor test/lint cleanup"
```

If everything was already green, skip this.

---

## Self-Review Checklist (run after writing the plan)

- [x] Each spec section maps to ≥1 task: Layout topology → T12 · 比例模型 → T1+T4 · auto-fit → T3+T4+T8 · 拖拽手柄 → T5+T12 · 折叠 → T6+T7 · 至少一个开 → T2+T7 · 持久化 → T1 · 文件改动清单 → T1-T12 · 算法 → T3 · 测试 → T1-T11 · 验收 → T12.4+T14.4
- [x] No "TBD" / "TODO" / "implement later" / "appropriate error handling" placeholders
- [x] All function/method names consistent across tasks: `usePlannerLayout`, `togglePanel`, `resizeBetween`, `toggleAutoFit`, `flexStyle`, `handleVisible`, `openCount`, `panels`
- [x] All file paths exact and consistent
- [x] Each code-changing step has actual code (no "similar to above" deferrals)
- [x] DEFAULT_LAYOUT, MIN_GROW, MIN_WIDTH, COLLAPSED_WIDTH, STORAGE_PREFIX defined exactly once and re-referenced
- [x] PanelShell prop signature consistent across BacklogList / ChatPanel / PlannerMap / DayPanel callers
