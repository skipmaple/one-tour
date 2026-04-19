# ActivityCard Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign `ActivityCard` (planner行卡片) with a Fizzy-inspired visual language: kind-tinted pastel fills, tier1 gold treatment with circular ★ badge, 2×2 meta grid with real "十字" cross dividers, iPhone-signal-style citizen_level icon, and right-side thumb gradient bleed.

**Architecture:** Move from inline-style JSX to a dedicated CSS file at `app/javascript/styles/activity-card.css` (class-prefixed with `.ac-*` to avoid collisions). All format helpers and the citizen signal SVG are inlined in `ActivityCard.jsx` (YAGNI — they're not reused elsewhere yet). Preserve all existing interaction contracts: `@dnd-kit` drag/drop, `onClick`, `readOnly`, `isOver` drop indicator, and the separate `ActivityCardOverlay` used by `DragOverlay`.

**Tech Stack:** React 19, `@dnd-kit/core`, `@tabler/icons-react` (v3.41.1 already installed), plain CSS imported via Vite, Vitest + `@testing-library/react`.

**Design spec source of truth:** `.superpowers/brainstorm/58306-1776623576/content/22-final.html`

---

## File Structure

**New:**
- `app/javascript/styles/activity-card.css` — all card styles, `.ac-*` prefixed

**Rewritten:**
- `app/javascript/components/planner/ActivityCard.jsx` — both `ActivityCard` and `ActivityCardOverlay` exports
- `app/javascript/components/planner/__tests__/ActivityCard.test.jsx` — existing tests assert text "一等"/"景" that no longer renders; must be rewritten to query by `data-testid` and names

**Unchanged (but read for context):**
- `app/models/activity.rb` — citizen_level enum values: `tier_one / tier_two / tier_three / infrastructure`; kind enum: `scenic / road / food / stay / fuel / other`; `as_json` overrides `planned_start_at` to `HH:MM` string
- `db/schema.rb` — confirms `address` column is present on `activities`

---

## Spec Quick Reference (from brainstorm 22-final.html)

**Card shell**
- height: 60px · border-radius: 5px · overflow: hidden
- box-shadow: `0 1px 2px rgba(0,0,0,0.04)`
- margin-bottom: 8px (between cards)

**Grip (left)**
- `IconGripVertical` from `@tabler/icons-react`, size 12, color `#999`, svg opacity 0.55
- padding: 0 4px · cursor: grab
- replaces the current `⋮⋮` emoji (memory rule: no emoji as functional icons)

**Body (flex:1, padded 8px/8px/8px/4px, display:flex column)**
- row 1 "name-row": kind icon (13×13, kind-colored) + name (font-weight:800, 12.5px, letter-spacing:-0.015em, kind-colored, ellipsis), height:18px, margin-bottom:4px
- row 2 "meta": 2×2 grid with cross dividers (see below)

**Meta 2×2 grid**
- `display: grid; grid-template-columns: 1fr 1fr; grid-template-rows: 1fr 1fr`
- margin-left: 21px (aligns with name text, past the 13px icon)
- font-size: 10px · font-weight: 400
- **Horizontal line** via `::before`: `top:50%; left:4px; right:4px; height:1px; background:rgba(0,0,0,0.08); z-index:1`
- **Vertical line** via `::after`: `top:2px; bottom:2px; left:50%; width:1px; background:rgba(0,0,0,0.13); z-index:2`
- Cross intersection = visible "+" at center
- Cells: `display:flex; align-items:center; padding:0 8px; gap:4px; white-space:nowrap; overflow:hidden`
- Cell with missing data: `visibility: hidden` (reserves space, no collapse)
- 4 cells in this order:
  1. top-left: **citizen_level** signal bars (no text)
  2. top-right: **duration** (IconHourglass + formatted minutes)
  3. bottom-left: **address** (IconMapPin + truncated)
  4. bottom-right: **time** (IconClock + `planned_start_at`)

**Kind fills** (柔化 pastel — saturation ~40%):
| kind | bg | border | icon | name | meta |
|------|------|------|------|------|------|
| scenic | #fdf7f9 | #f8dce5 | #db2777 | #831843 | rgba(157,23,77,0.6) |
| food | #fffaf3 | #fadcb8 | #ea580c | #7c2d12 | rgba(154,52,18,0.6) |
| road | #f5f8fd | #cfdcf3 | #2563eb | #1e3a8a | rgba(30,64,175,0.6) |
| stay | #f8f6fd | #dcd3f0 | #7c3aed | #4c1d95 | rgba(91,33,182,0.6) |
| fuel | #f0fdfa | #99f6e4 | #0d9488 | #134e4a | rgba(19,78,74,0.6) |
| other | #f9fafb | #e5e7eb | #6b7280 | #374151 | rgba(55,65,81,0.6) |

**Kind icon mapping** (Tabler):
- scenic → `IconMountain`
- food → `IconToolsKitchen2`
- road → `IconCar`
- stay → `IconBed`
- fuel → `IconGasStation`
- other → `IconCategory`

**Tier1 override** (applied on top of kind class):
- background: `linear-gradient(90deg, #fff8d6 0%, #fffcf1 95%)`
- border: `1px solid #dcc273`
- box-shadow: `0 1px 3px rgba(200,145,0,0.18), 0 1px 2px rgba(0,0,0,0.04)`
- kind icon color → `#c89100` · name color → `#5c3d00` · meta color → `rgba(138,100,0,0.65)`

**Tier1 circular badge** (only when `citizen_level === 'tier_one'`):
- absolute top:8, right:8, width:22, height:22, border-radius:50%, z-index:4
- background:`#c89100` · color:#fff · font-size:11px · font-weight:700 · content "★"
- box-shadow: `0 1px 2px rgba(200,145,0,0.4)`
- when card has thumb: `right:60` (to clear the thumb gradient solid region)

**Thumb gradient** (only when `activity._coverUrl`):
- absolute, right:0, top:0, bottom:0, width:100px, z-index:1 (below body text)
- `background-image: url(…); background-size: cover; background-position: center right`
- `mask-image: linear-gradient(to left, black 0%, black 30%, transparent 100%)`
- `-webkit-mask-image:` same (prefixed fallback)
- `filter: saturate(0.85) brightness(1.02)`
- `pointer-events: none`

**citizen_level signal bars** (inline SVG, 14×10 viewBox):
- 4 ascending vertical bars: x=0,3.5,7,10.5 · width=2.2 · heights=3,5,7,9 · bottom-aligned · rx=0.4
- Opacity per level:
  - tier_one: [1,1,1,1] (all bright)
  - tier_two: [1,1,1,0.22]
  - tier_three: [1,1,0.22,0.22]
  - infrastructure: [1,0.22,0.22,0.22]
- Container `.ac-ci` uses opacity:0.55 for "weak-attention" feel; on tier1 cards it's opacity:0.9 and `color:#c89100`

**Drop indicator** (preserve): when `isOver`, 3px blue bar at top (`#1677ff`, box-shadow glow), `data-testid="drop-indicator"`

**Format helpers** (inlined in `ActivityCard.jsx`):
- `formatDuration(min)` — if min≥60 and min%30===0 → `${min/60}h`; else if min truthy → `${min}分`; else `""`
- `formatAddress(addr)` — split on whitespace/punctuation, take last segment, truncate to 6 chars max

---

### Task 1: Write failing tests for the redesigned ActivityCard

Delete old assertions (they query text "一等"/"景" that won't exist). Write new tests around the data contract and visible DOM.

**Files:**
- Modify: `app/javascript/components/planner/__tests__/ActivityCard.test.jsx` (replace contents)

- [ ] **Step 1: Read the current test file to understand existing patterns**

Run: `cat app/javascript/components/planner/__tests__/ActivityCard.test.jsx`

Observe: the wrapper `renderInDnd`, the `mockDroppableReturn` for `isOver` state, and the `vi.mock('@dnd-kit/core', …)` pattern. These must be preserved.

- [ ] **Step 2: Replace the test file with the new suite**

Write exactly this to `app/javascript/components/planner/__tests__/ActivityCard.test.jsx`:

```jsx
import { render, screen, fireEvent } from '@testing-library/react'
import { DndContext } from '@dnd-kit/core'
import { vi } from 'vitest'
import ActivityCard, { ActivityCardOverlay } from '../ActivityCard'

// Allow tests to override useDroppable return (used by insert-indicator test)
const mockDroppableReturn = { current: { setNodeRef: () => {}, isOver: false } }
vi.mock('@dnd-kit/core', async () => {
  const actual = await vi.importActual('@dnd-kit/core')
  return {
    ...actual,
    useDroppable: () => mockDroppableReturn.current,
  }
})

function renderInDnd(ui) {
  return render(<DndContext>{ui}</DndContext>)
}

const baseActivity = {
  id: 1,
  name: '喀纳斯湖',
  kind: 'scenic',
  citizen_level: 'tier_two',
  position: 1,
}

test('renders the name', () => {
  renderInDnd(<ActivityCard activity={baseActivity} />)
  expect(screen.getByText('喀纳斯湖')).toBeInTheDocument()
})

test('renders kind icon svg inside the name row', () => {
  const { container } = renderInDnd(<ActivityCard activity={baseActivity} />)
  expect(container.querySelector('.ac-kind-icon svg')).toBeInTheDocument()
})

test('renders tier1 badge only when citizen_level is tier_one', () => {
  const { rerender } = renderInDnd(<ActivityCard activity={{ ...baseActivity, citizen_level: 'tier_one' }} />)
  expect(screen.getByTestId('tier-badge')).toBeInTheDocument()
  rerender(<DndContext><ActivityCard activity={baseActivity} /></DndContext>)
  expect(screen.queryByTestId('tier-badge')).not.toBeInTheDocument()
})

test('renders citizen signal with a data-level attribute', () => {
  const { container, rerender } = renderInDnd(
    <ActivityCard activity={{ ...baseActivity, citizen_level: 'tier_one' }} />
  )
  const signal = container.querySelector('[data-testid="citizen-signal"]')
  expect(signal).toBeInTheDocument()
  expect(signal.getAttribute('data-level')).toBe('tier_one')

  rerender(<DndContext><ActivityCard activity={{ ...baseActivity, citizen_level: 'infrastructure' }} /></DndContext>)
  expect(container.querySelector('[data-testid="citizen-signal"]').getAttribute('data-level')).toBe('infrastructure')
})

test('renders planned time when provided', () => {
  renderInDnd(<ActivityCard activity={{ ...baseActivity, planned_start_at: '10:00' }} />)
  expect(screen.getByText('10:00')).toBeInTheDocument()
})

test('formats duration >=60 and divisible by 30 as hours', () => {
  renderInDnd(<ActivityCard activity={{ ...baseActivity, planned_duration_min: 150 }} />)
  expect(screen.getByText('2.5h')).toBeInTheDocument()
})

test('formats duration otherwise as minutes', () => {
  renderInDnd(<ActivityCard activity={{ ...baseActivity, planned_duration_min: 45 }} />)
  expect(screen.getByText('45分')).toBeInTheDocument()
})

test('renders truncated last segment of address', () => {
  renderInDnd(<ActivityCard activity={{ ...baseActivity, address: '新疆阿勒泰 布尔津县' }} />)
  expect(screen.getByText('布尔津县')).toBeInTheDocument()
})

test('renders thumb gradient when _coverUrl present', () => {
  const { container } = renderInDnd(
    <ActivityCard activity={{ ...baseActivity, _coverUrl: 'https://example.com/x.jpg' }} />
  )
  const thumb = container.querySelector('[data-testid="thumb-gradient"]')
  expect(thumb).toBeInTheDocument()
  expect(thumb.style.backgroundImage).toContain('example.com')
})

test('does not render thumb gradient when _coverUrl missing', () => {
  const { container } = renderInDnd(<ActivityCard activity={baseActivity} />)
  expect(container.querySelector('[data-testid="thumb-gradient"]')).not.toBeInTheDocument()
})

test('hides meta cell (not removes) when its data is missing', () => {
  const { container } = renderInDnd(<ActivityCard activity={baseActivity} />)
  // All 4 meta cells should exist in DOM; duration/time cells should have the empty modifier
  const cells = container.querySelectorAll('.ac-meta-cell')
  expect(cells).toHaveLength(4)
  expect(container.querySelector('.ac-meta-cell.ac-meta-cell--empty')).toBeInTheDocument()
})

test('renders a grab handle element', () => {
  renderInDnd(<ActivityCard activity={baseActivity} />)
  expect(screen.getByTestId('grab-handle')).toBeInTheDocument()
})

test('fires onClick when card body is clicked', () => {
  const onClick = vi.fn()
  renderInDnd(<ActivityCard activity={baseActivity} onClick={onClick} />)
  fireEvent.click(screen.getByText('喀纳斯湖'))
  expect(onClick).toHaveBeenCalledWith(1)
})

test('does not fire onClick when readOnly', () => {
  const onClick = vi.fn()
  renderInDnd(<ActivityCard activity={baseActivity} onClick={onClick} readOnly />)
  fireEvent.click(screen.getByText('喀纳斯湖'))
  expect(onClick).not.toHaveBeenCalled()
})

test('does not render grab handle when readOnly', () => {
  renderInDnd(<ActivityCard activity={baseActivity} readOnly />)
  expect(screen.queryByTestId('grab-handle')).not.toBeInTheDocument()
})

test('does not expose draggable aria role when readOnly', () => {
  renderInDnd(<ActivityCard activity={baseActivity} readOnly />)
  expect(
    screen.queryByText('喀纳斯湖').closest('[aria-roledescription="draggable"]')
  ).toBeNull()
})

test('shows drop indicator when isOver=true', () => {
  mockDroppableReturn.current = { setNodeRef: () => {}, isOver: true }
  renderInDnd(<ActivityCard activity={baseActivity} />)
  expect(screen.getByTestId('drop-indicator')).toBeInTheDocument()
  mockDroppableReturn.current = { setNodeRef: () => {}, isOver: false } // reset
})

test('hides drop indicator when isOver=false', () => {
  mockDroppableReturn.current = { setNodeRef: () => {}, isOver: false }
  renderInDnd(<ActivityCard activity={baseActivity} />)
  expect(screen.queryByTestId('drop-indicator')).not.toBeInTheDocument()
})

test('ActivityCardOverlay renders name without drag handlers', () => {
  render(<ActivityCardOverlay activity={baseActivity} />)
  expect(screen.getByText('喀纳斯湖')).toBeInTheDocument()
  expect(screen.queryByTestId('grab-handle')).not.toBeInTheDocument()
})
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npm test -- app/javascript/components/planner/__tests__/ActivityCard.test.jsx --run`

Expected: most tests FAIL because the component doesn't yet emit `data-testid="tier-badge"`, `data-testid="citizen-signal"`, `data-testid="thumb-gradient"`, `.ac-kind-icon`, `.ac-meta-cell`, `.ac-meta-cell--empty`, and text like `2.5h` / `45分` / `布尔津县`.

- [ ] **Step 4: Commit the new failing tests**

```bash
git add app/javascript/components/planner/__tests__/ActivityCard.test.jsx
git commit -m "$(cat <<'EOF'
test(planner): rewrite ActivityCard tests for Fizzy redesign

Updates queries from removed text labels (一等/景) to data-testid hooks
and class selectors matching the new CSS-class-driven structure.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: Create the CSS file with all styles

Write every class the new `ActivityCard.jsx` will use. Everything prefixed with `.ac-` to avoid collisions with other global styles.

**Files:**
- Create: `app/javascript/styles/activity-card.css`

- [ ] **Step 1: Verify no file exists at the target path**

Run: `ls app/javascript/styles/activity-card.css 2>&1 || echo "not found (good)"`

Expected: `not found (good)`.

- [ ] **Step 2: Write the CSS file**

Create `app/javascript/styles/activity-card.css` with exactly:

```css
/* Activity card — Fizzy-inspired pastel card for planner day columns.
   All classes prefixed .ac-* to stay out of the global namespace.
   Design source: .superpowers/brainstorm/58306-1776623576/content/22-final.html */

.ac-card {
  display: flex;
  align-items: stretch;
  box-sizing: border-box;
  height: 60px;
  margin-bottom: 8px;
  background: #fff;
  border: 1px solid #e5e7eb;
  border-radius: 5px;
  overflow: hidden;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.04);
  position: relative;
  font-size: 12px;
  color: #222;
}

.ac-card.ac-dragging { opacity: 0.4; }

/* drop indicator — preserved from old component */
.ac-drop-indicator {
  position: absolute;
  top: -3px;
  left: 0;
  right: 0;
  height: 3px;
  background: #1677ff;
  border-radius: 2px;
  box-shadow: 0 0 6px rgba(22, 119, 255, 0.4);
  pointer-events: none;
  z-index: 5;
}

/* grip */
.ac-grip {
  color: #999;
  display: flex;
  align-items: center;
  cursor: grab;
  flex-shrink: 0;
  padding: 0 4px;
  user-select: none;
  position: relative;
  z-index: 2;
}
.ac-grip svg { opacity: 0.55; }

/* body */
.ac-body {
  flex: 1;
  min-width: 0;
  padding: 8px 8px 8px 4px;
  display: flex;
  flex-direction: column;
  position: relative;
  z-index: 2; /* stacks above thumb gradient */
}

.ac-name-row {
  display: flex;
  align-items: center;
  gap: 8px;
  height: 18px;
  margin-bottom: 4px;
  min-width: 0;
}

.ac-kind-icon {
  display: inline-flex;
  align-items: center;
  flex-shrink: 0;
}

.ac-name {
  font-weight: 800;
  font-size: 12.5px;
  letter-spacing: -0.015em;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* meta 2x2 cross */
.ac-meta {
  position: relative;
  flex: 1;
  display: grid;
  grid-template-columns: 1fr 1fr;
  grid-template-rows: 1fr 1fr;
  font-size: 10px;
  font-weight: 400;
  margin-left: 21px;
}
.ac-meta::before {
  content: '';
  position: absolute;
  top: 50%;
  left: 4px;
  right: 4px;
  height: 1px;
  background: rgba(0, 0, 0, 0.08);
  z-index: 1;
}
.ac-meta::after {
  content: '';
  position: absolute;
  top: 2px;
  bottom: 2px;
  left: 50%;
  width: 1px;
  background: rgba(0, 0, 0, 0.13);
  z-index: 2;
}
.ac-meta-cell {
  padding: 0 8px;
  gap: 4px;
  display: flex;
  align-items: center;
  overflow: hidden;
  white-space: nowrap;
  min-width: 0;
  color: rgba(0, 0, 0, 0.5);
}
.ac-meta-cell svg {
  width: 9px;
  height: 9px;
  opacity: 0.6;
  flex-shrink: 0;
}
.ac-meta-cell--empty {
  visibility: hidden;
}

/* citizen signal */
.ac-ci {
  display: inline-flex;
  align-items: flex-end;
  flex-shrink: 0;
  opacity: 0.55;
}
.ac-ci svg {
  width: 13px;
  height: 10px;
}

/* tier1 overrides .ac-ci */
.ac-card.ac-tier1 .ac-ci {
  opacity: 0.9;
  color: #c89100;
}

/* tier1 circular badge */
.ac-tier-badge {
  position: absolute;
  right: 8px;
  top: 8px;
  width: 22px;
  height: 22px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 11px;
  font-weight: 700;
  color: #fff;
  background: #c89100;
  box-shadow: 0 1px 2px rgba(200, 145, 0, 0.4);
  z-index: 4;
  user-select: none;
}
.ac-card.ac-has-thumb .ac-tier-badge { right: 60px; }

/* thumb gradient */
.ac-thumb-gradient {
  position: absolute;
  right: 0;
  top: 0;
  bottom: 0;
  width: 100px;
  background-size: cover;
  background-position: center right;
  -webkit-mask-image: linear-gradient(to left, black 0%, black 30%, transparent 100%);
  mask-image: linear-gradient(to left, black 0%, black 30%, transparent 100%);
  filter: saturate(0.85) brightness(1.02);
  z-index: 1;
  pointer-events: none;
}

/* Kind variants — soft pastel fill + kind-colored name/icon/meta */
.ac-kind-scenic { background: #fdf7f9; border-color: #f8dce5; }
.ac-kind-scenic .ac-kind-icon { color: #db2777; }
.ac-kind-scenic .ac-name { color: #831843; }
.ac-kind-scenic .ac-meta-cell { color: rgba(157, 23, 77, 0.6); }

.ac-kind-food { background: #fffaf3; border-color: #fadcb8; }
.ac-kind-food .ac-kind-icon { color: #ea580c; }
.ac-kind-food .ac-name { color: #7c2d12; }
.ac-kind-food .ac-meta-cell { color: rgba(154, 52, 18, 0.6); }

.ac-kind-road { background: #f5f8fd; border-color: #cfdcf3; }
.ac-kind-road .ac-kind-icon { color: #2563eb; }
.ac-kind-road .ac-name { color: #1e3a8a; }
.ac-kind-road .ac-meta-cell { color: rgba(30, 64, 175, 0.6); }

.ac-kind-stay { background: #f8f6fd; border-color: #dcd3f0; }
.ac-kind-stay .ac-kind-icon { color: #7c3aed; }
.ac-kind-stay .ac-name { color: #4c1d95; }
.ac-kind-stay .ac-meta-cell { color: rgba(91, 33, 182, 0.6); }

.ac-kind-fuel { background: #f0fdfa; border-color: #99f6e4; }
.ac-kind-fuel .ac-kind-icon { color: #0d9488; }
.ac-kind-fuel .ac-name { color: #134e4a; }
.ac-kind-fuel .ac-meta-cell { color: rgba(19, 78, 74, 0.6); }

.ac-kind-other { background: #f9fafb; border-color: #e5e7eb; }
.ac-kind-other .ac-kind-icon { color: #6b7280; }
.ac-kind-other .ac-name { color: #374151; }
.ac-kind-other .ac-meta-cell { color: rgba(55, 65, 81, 0.6); }

/* tier1 overrides kind fill */
.ac-card.ac-tier1 {
  background: linear-gradient(90deg, #fff8d6 0%, #fffcf1 95%);
  border-color: #dcc273;
  box-shadow: 0 1px 3px rgba(200, 145, 0, 0.18), 0 1px 2px rgba(0, 0, 0, 0.04);
}
.ac-card.ac-tier1 .ac-kind-icon { color: #c89100; }
.ac-card.ac-tier1 .ac-name { color: #5c3d00; }
.ac-card.ac-tier1 .ac-meta-cell { color: rgba(138, 100, 0, 0.65); }

/* Overlay variant used by DragOverlay — tilt + heavier shadow */
.ac-card.ac-overlay {
  cursor: grabbing;
  transform: rotate(2deg);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
}
```

- [ ] **Step 3: Commit the CSS file**

```bash
git add app/javascript/styles/activity-card.css
git commit -m "$(cat <<'EOF'
feat(planner): add CSS for redesigned ActivityCard

All classes scoped with .ac-* prefix; kind fills, tier1 overrides,
meta 2x2 cross, thumb gradient mask, and tier badge positioning.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: Rewrite ActivityCard.jsx with the new structure

Replace the inline-styled JSX with class-based JSX backed by the new CSS file. Inline the three format helpers and the citizen-signal SVG helper. Preserve the exact dnd-kit / onClick / readOnly / isOver contract.

**Files:**
- Modify: `app/javascript/components/planner/ActivityCard.jsx` (complete rewrite)

- [ ] **Step 1: Overwrite ActivityCard.jsx with the complete new module**

Write exactly this to `app/javascript/components/planner/ActivityCard.jsx`:

```jsx
import { useDraggable, useDroppable } from '@dnd-kit/core'
import {
  IconGripVertical,
  IconMountain,
  IconCar,
  IconToolsKitchen2,
  IconBed,
  IconGasStation,
  IconCategory,
  IconHourglass,
  IconMapPin,
  IconClock,
} from '@tabler/icons-react'
import '../../styles/activity-card.css'

const KIND_ICONS = {
  scenic: IconMountain,
  food: IconToolsKitchen2,
  road: IconCar,
  stay: IconBed,
  fuel: IconGasStation,
  other: IconCategory,
}

const KIND_CLASS = {
  scenic: 'ac-kind-scenic',
  food: 'ac-kind-food',
  road: 'ac-kind-road',
  stay: 'ac-kind-stay',
  fuel: 'ac-kind-fuel',
  other: 'ac-kind-other',
}

const SIGNAL_OPACITIES = {
  tier_one: [1, 1, 1, 1],
  tier_two: [1, 1, 1, 0.22],
  tier_three: [1, 1, 0.22, 0.22],
  infrastructure: [1, 0.22, 0.22, 0.22],
}

// planned_duration_min → short string.
//   60  → '1h'      (≥60 and divisible by 30)
//   90  → '1.5h'
//   150 → '2.5h'
//   45  → '45分'
//   null/undef/0 → ''
function formatDuration(min) {
  if (!min) return ''
  if (min >= 60 && min % 30 === 0) return `${min / 60}h`
  return `${min}分`
}

// activity.address often stores a long multi-segment string. Take the last
// whitespace/punctuation-delimited chunk and cap at 6 chars so the meta cell
// stays one line.
function formatAddress(addr) {
  if (!addr) return ''
  const segments = String(addr).split(/[\s、，,]+/).filter(Boolean)
  const last = segments[segments.length - 1] || ''
  return last.length > 6 ? last.slice(-6) : last
}

function KindIcon({ kind }) {
  const Icon = KIND_ICONS[kind] || IconCategory
  return (
    <span className="ac-kind-icon">
      <Icon size={13} stroke={2.2} />
    </span>
  )
}

// iPhone-signal-style 4-bar indicator for citizen_level. Bars are bottom-aligned
// ascending (heights 3,5,7,9) in a 14×10 viewBox. Bright bars at opacity 1,
// dim bars at 0.22. Lower tiers dim more bars.
function CitizenSignal({ level }) {
  const ops = SIGNAL_OPACITIES[level] || SIGNAL_OPACITIES.infrastructure
  return (
    <span className="ac-ci" data-testid="citizen-signal" data-level={level}>
      <svg viewBox="0 0 14 10" aria-hidden="true">
        {[0, 1, 2, 3].map((i) => {
          const h = 3 + i * 2
          return (
            <rect
              key={i}
              x={i * 3.5}
              y={10 - h}
              width="2.2"
              height={h}
              rx="0.4"
              fill="currentColor"
              opacity={ops[i]}
            />
          )
        })}
      </svg>
    </span>
  )
}

function MetaGrid({ activity }) {
  const duration = formatDuration(activity.planned_duration_min)
  const address = formatAddress(activity.address)
  const time = activity.planned_start_at || ''
  const cellClass = (v) => `ac-meta-cell${v ? '' : ' ac-meta-cell--empty'}`
  return (
    <div className="ac-meta">
      <div className="ac-meta-cell">
        <CitizenSignal level={activity.citizen_level} />
      </div>
      <div className={cellClass(duration)}>
        <IconHourglass size={9} stroke={2} aria-hidden="true" />
        <span>{duration || '-'}</span>
      </div>
      <div className={cellClass(address)}>
        <IconMapPin size={9} stroke={2} aria-hidden="true" />
        <span>{address || '-'}</span>
      </div>
      <div className={cellClass(time)}>
        <IconClock size={9} stroke={2} aria-hidden="true" />
        <span>{time || '-'}</span>
      </div>
    </div>
  )
}

function cardClasses(activity, extra = '') {
  const kindClass = KIND_CLASS[activity.kind] || KIND_CLASS.other
  const tierClass = activity.citizen_level === 'tier_one' ? 'ac-tier1' : ''
  const thumbClass = activity._coverUrl ? 'ac-has-thumb' : ''
  return `ac-card ${kindClass} ${tierClass} ${thumbClass} ${extra}`
    .trim()
    .replace(/\s+/g, ' ')
}

function ThumbAndBadge({ activity }) {
  return (
    <>
      {activity._coverUrl && (
        <div
          className="ac-thumb-gradient"
          data-testid="thumb-gradient"
          style={{ backgroundImage: `url(${activity._coverUrl})` }}
        />
      )}
      {activity.citizen_level === 'tier_one' && (
        <span className="ac-tier-badge" data-testid="tier-badge" aria-label="一等公民">
          ★
        </span>
      )}
    </>
  )
}

export default function ActivityCard({ activity, onClick, readOnly }) {
  const { attributes, listeners, setNodeRef: setDragRef, setActivatorNodeRef, isDragging } =
    useDraggable({ id: `activity-${activity.id}` })
  const { setNodeRef: setDropRef, isOver } = useDroppable({
    id: `activity-drop-${activity.id}`,
    data: { dayId: activity.day_id, position: activity.position },
  })
  const setRef = (el) => {
    setDragRef(el)
    setDropRef(el)
  }
  // When readOnly, suppress drag affordances entirely: skip {...attributes} (drops
  // aria-roledescription="draggable" and tabindex) and don't render the grip so
  // listeners never attach.
  const dragAttributes = readOnly ? {} : attributes

  const handleBodyClick = () => {
    if (!readOnly && onClick) onClick(activity.id)
  }

  return (
    <div
      ref={setRef}
      className={cardClasses(activity, isDragging ? 'ac-dragging' : '')}
      {...dragAttributes}
    >
      {isOver && <div data-testid="drop-indicator" className="ac-drop-indicator" />}
      <ThumbAndBadge activity={activity} />
      {!readOnly && (
        <span
          ref={setActivatorNodeRef}
          {...listeners}
          data-testid="grab-handle"
          className="ac-grip"
        >
          <IconGripVertical size={12} stroke={2} />
        </span>
      )}
      <div
        className="ac-body"
        onClick={handleBodyClick}
        role={onClick && !readOnly ? 'button' : undefined}
      >
        <div className="ac-name-row">
          <KindIcon kind={activity.kind} />
          <span className="ac-name">{activity.name}</span>
        </div>
        <MetaGrid activity={activity} />
      </div>
    </div>
  )
}

export function ActivityCardOverlay({ activity }) {
  return (
    <div className={cardClasses(activity, 'ac-overlay')}>
      <ThumbAndBadge activity={activity} />
      <span className="ac-grip" aria-hidden="true">
        <IconGripVertical size={12} stroke={2} />
      </span>
      <div className="ac-body">
        <div className="ac-name-row">
          <KindIcon kind={activity.kind} />
          <span className="ac-name">{activity.name}</span>
        </div>
        <MetaGrid activity={activity} />
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Run the new ActivityCard tests**

Run: `npm test -- app/javascript/components/planner/__tests__/ActivityCard.test.jsx --run`

Expected: ALL tests PASS.

Likely gotchas if any fail:
- `screen.getByText('喀纳斯湖').closest('[aria-roledescription="draggable"]')` — requires the outer `.ac-card` div to receive `{...attributes}` from dnd-kit when `!readOnly`. It does.
- `container.querySelector('.ac-kind-icon svg')` — the Tabler component renders an `<svg>` inside the span.
- `thumb.style.backgroundImage` — inline style is preserved as given.

- [ ] **Step 3: Run the full JS test suite to catch downstream breakage**

Run: `npm test -- --run`

Expected: all tests pass. If other planner tests (`DayColumn.test.jsx`, `BacklogList.test.jsx`, etc.) previously asserted on text "一等"/"景"/"基础" rendered from `ActivityCard`, those will fail — Task 4 fixes them.

- [ ] **Step 4: Commit**

```bash
git add app/javascript/components/planner/ActivityCard.jsx
git commit -m "$(cat <<'EOF'
feat(planner): rewrite ActivityCard with Fizzy-inspired visual design

- Replace inline styles with classes from activity-card.css
- Kind-tinted pastel fills with tier1 gold override + circular ★ badge
- 2×2 meta grid with true cross dividers (horizontal + vertical intersect)
- citizen_level rendered as iPhone-signal bars (弱 attention)
- Right-side thumb gradient bleed (100px, mask-image fade) when _coverUrl present
- Drop emoji ⋮⋮ drag handle for IconGripVertical (Tabler)

Preserves dnd-kit contract, onClick/readOnly behavior, and the isOver drop
indicator. ActivityCardOverlay mirrors the main card visually with a tilt
and heavier shadow for DragOverlay.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: Update any dependent tests that broke

`npm test -- --run` from Task 3 Step 3 may have surfaced failures in tests that mount `ActivityCard` indirectly (for example `DayColumn.test.jsx` or `BacklogList.test.jsx`) and look for removed text.

- [ ] **Step 1: List any failing tests outside of ActivityCard.test.jsx**

Run: `npm test -- --run 2>&1 | grep -E '(FAIL|✗)' | grep -v ActivityCard.test.jsx`

Expected: either empty output (nothing broke) — skip to Step 3 — or a list of failing test files.

- [ ] **Step 2: For each failing external test, replace text assertions with name-based or testid-based queries**

Example: if `DayColumn.test.jsx` has `expect(screen.getByText(/一等/)).toBeInTheDocument()`, swap it for a stable assertion based on the activity name or `data-testid`:

```jsx
// Before
expect(screen.getByText(/一等/)).toBeInTheDocument()
// After
expect(screen.getByText('赛里木湖')).toBeInTheDocument()
expect(screen.getByTestId('tier-badge')).toBeInTheDocument() // still asserts tier1-ness
```

Repeat for each affected file. Keep changes minimal — don't rewrite unrelated assertions in the same file.

- [ ] **Step 3: Re-run the full suite**

Run: `npm test -- --run`

Expected: all tests pass.

- [ ] **Step 4: Commit (only if files were changed)**

```bash
git add -u app/javascript
git commit -m "$(cat <<'EOF'
test(planner): update dependent tests for new ActivityCard DOM

Cards no longer render '一等'/'景'/'基础' text labels; switch those
assertions to name/testid-based queries that match the new structure.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

If nothing needed updating, skip this commit.

---

### Task 5: Visual verification in the browser

Unit tests cover DOM structure but not visual correctness. Bring up the worktree dev server and confirm the redesign actually looks right across kinds, tiers, and presence of thumbs.

- [ ] **Step 1: Bring up the worktree dev server**

From CLAUDE.md: in a secondary worktree, use `bin/worktree-dev up` (picks free ports, isolated DB, bypasses the bundler/Ruby 2.6 trap).

Run: `bin/worktree-dev up`

Expected: output lists the chosen Rails and Vite ports, e.g. `rails on http://localhost:9100 · vite on http://localhost:3100`.

- [ ] **Step 2: Open the planner page for a tour with diverse activities**

Visit `http://localhost:<railsPort>/tours/5/planner` (Tour 5 is the seeded 11-day Sichuan tour used during B1 E2E testing — it has scenic/food/road/stay/fuel/other kinds and mixed tier levels).

If `preview_start` + `preview_snapshot` are available in this session, use them. Otherwise open the browser manually.

- [ ] **Step 3: Verify each kind renders with the correct pastel fill and kind icon**

One card of each kind should be visible:
- scenic → soft pink background, mountain icon
- food → soft peach background, kitchen icon
- road → soft blue background, car icon
- stay → soft violet background, bed icon
- fuel → soft teal background, gas station icon
- other → neutral gray, category icon

- [ ] **Step 4: Verify tier1 treatment**

Find a tier_one activity. Check:
- Card background is warm gold gradient
- Gold border (#dcc273)
- Small gold circular ★ badge in top-right corner
- When the same card has a cover image, the ★ badge sits to the LEFT of the thumb gradient (at `right:60px`)

- [ ] **Step 5: Verify meta cross**

Zoom in on any card. The horizontal line at 50% of the meta area should visibly intersect the vertical line at 50% width, forming a "+" shape. Each of the 4 cells sits in its own quadrant. Cells with missing data render blank (no "-" fallback visible — that text is in the DOM but `visibility:hidden`).

- [ ] **Step 6: Verify citizen signal**

Find activities with each citizen_level:
- tier_one: all 4 bars bright
- tier_two: 3 bars bright, 1 dim
- tier_three: 2 bars bright, 2 dim
- infrastructure: 1 bar bright, 3 dim

On a tier1 card, the signal takes on the gold tint and stronger opacity.

- [ ] **Step 7: Verify thumb gradient**

Find an activity with a cover image. The right ~100px of the card should show the photo fading smoothly left to transparent (no hard edge). The photo's colors look slightly muted (the `saturate(0.85) brightness(1.02)` filter).

- [ ] **Step 8: Verify drag still works**

Drag a card from one day to another and from backlog to a day. The drag overlay (grabbed card with 2° tilt) should match the resting card's style.

- [ ] **Step 9: Verify drop indicator**

While dragging, hover over another card. A 3px blue bar appears above the hover target.

- [ ] **Step 10: Take a screenshot for the PR**

If `preview_screenshot` is available, capture the planner page at full width. Save the image path for the PR description.

- [ ] **Step 11: Bring the server down**

Run: `bin/worktree-dev down`

- [ ] **Step 12: If anything looked wrong, iterate**

If a kind color felt off, or the cross wasn't crossing cleanly, or the thumb gradient's fade looked abrupt, adjust the numbers in `app/javascript/styles/activity-card.css` and re-verify from Step 2. Commit each fix separately with a descriptive message like `fix(planner): tighten thumb gradient fade stop`.

---

## Out of Scope (Intentionally)

- **Cover image count badge.** The old `CoverThumb` showed a "N" badge when `_imageCount > 1`. The redesign drops this; users see photo counts in the drawer. Revisit only if users complain.
- **Extracting format helpers to `app/javascript/utils/`.** YAGNI — no other component needs them yet.
- **Road-infrastructure special dashed/italic treatment.** The new design relies on the citizen signal (1 bar for infrastructure) and the kind-road blue fill to convey this. The old `isRoadInfra` branch is not reproduced.
- **Animating the tier1 badge on hover.** Polish pass, separate task.
- **Accessibility audit.** Should happen but is scoped for a separate pass — current contract (clickable body with role="button", aria-label on badge, aria-hidden SVGs, draggable role from dnd-kit) is a reasonable baseline.

## Success criteria

- `npm test -- --run` is green.
- The planner page renders the new card for every kind and tier combination without console errors.
- dnd-kit behavior is unchanged: drag from day A to day B, from backlog to a day, and card-to-card reordering all still work.
- A reviewer glancing at a screenshot can immediately tell a tier_one activity apart from a tier_two.
