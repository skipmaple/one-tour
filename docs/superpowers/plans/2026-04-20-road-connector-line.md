# Road Connector Line Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Demote non-tier1 road activities from 60px ActivityCards to ~20px RoadConnector lines between destination cards, and synthesize read-only connectors from `route_legs` for adjacent destination-card pairs that have no road activity between them.

**Architecture:** All rendering logic lives in `DayColumn.jsx` — walk the day's activities, emit `<ActivityCard>` or `<RoadConnector>` based on `kind + citizen_level`, and insert a synthesized `<RoadConnector>` between adjacent ActivityCards when `route_legs` has an entry for that pair. No DB changes. `RoadConnector` is a brand-new component; `ActivityCard` is unchanged.

**Tech Stack:** React 19, `@dnd-kit/core` (reuse existing draggable hooks), `@tabler/icons-react` (`IconCar`), plain CSS imported via Vite, Vitest + `@testing-library/react`.

**Design spec:** `docs/superpowers/specs/2026-04-20-road-connector-line-design.md`

---

## File Structure

**New:**
- `app/javascript/components/planner/RoadConnector.jsx` — the new component (activity-backed + synthesized modes, inline format helpers)
- `app/javascript/components/planner/__tests__/RoadConnector.test.jsx` — Vitest component tests

**Modified:**
- `app/javascript/styles/activity-card.css` — append `.rc-*` CSS block (same stylesheet to keep related planner card styles co-located)
- `app/javascript/components/planner/DayColumn.jsx` — rendering loop + synthesis; accept `routeLegs` prop
- `app/javascript/components/planner/DayPanel.jsx` — thread `routeLegs` prop through to DayColumn
- `app/javascript/pages/Tour/Show.jsx` — pass `route_legs` into DayPanel
- `app/javascript/components/planner/__tests__/DayColumn.test.jsx` — 3 new assertions for branching + synthesis

**Unchanged (read for context):**
- `app/javascript/components/planner/ActivityCard.jsx`
- `app/javascript/components/planner/PlannerMap.jsx` — has its own `routeLegsByPair` lookup; we'll build our own simpler one in DayColumn since only drive-mode is needed here
- `db/schema.rb` — `route_legs` table already has `from_activity_id`, `to_activity_id`, `mode`, `distance_m`, `duration_s`; no migrations needed
- `app/models/activity.rb` — `kind` and `citizen_level` enums unchanged

---

## Spec Quick Reference (from 2026-04-20-road-connector-line-design.md)

**Rendering rule:**

| condition | render |
|---|---|
| `kind != 'road'` | ActivityCard (unchanged) |
| `kind == 'road' && citizen_level == 'tier_one'` | ActivityCard (景观公路) |
| `kind == 'road' && citizen_level != 'tier_one'` | RoadConnector (activity-backed) |
| between two adjacent ActivityCards with a matching `route_leg` | RoadConnector (synthesized) |

**RoadConnector visual:**
- ~20–24px tall, 2px dashed left border (`rgba(0,0,0,0.18)`), `margin-left: 12px`, `padding: 6px 8px 6px 18px`
- Inline: car icon (12px) + distance/duration text (10.5px, `#6b7280`, weight 500)
- `flex-shrink: 0` (matches ActivityCard — prevents crushing in dense columns)

**Chinese units (inline helpers in `RoadConnector.jsx`):**
- `formatDistance(km)` — `X 公里` when present, `''` when missing/zero
- `formatDurationCN(min)` — `< 60` → `X 分钟`; `>= 60 && % 30 === 0` → `X 小时` or `X.Y 小时` (e.g. `1.5 小时`); otherwise `X 分钟`
- `''` when input is missing/zero
- Combined output: `${distance} · ${duration}` with `' · '` separator; if only one present, show just that one; if neither present, show nothing (icon + dashed line only)

**Route leg schema (from `db/schema.rb`, no changes):**
- `distance_m` (integer, meters) — divide by 1000 for km
- `duration_s` (integer, seconds) — divide by 60 for minutes
- `from_activity_id`, `to_activity_id`, `mode` (int, 0 = drive)

**Data source priority (activity-backed connector):**
1. `activity.details.km` / `activity.details.drive_min`
2. Fallback to matching `route_leg` between the previous and next non-road activity in the day (passed in as `legFallback` prop)
3. Otherwise no text

**Synthesized connector:**
- Read-only; `pointer-events: none`; not draggable, no click handler
- Always reads from `leg` prop (never fallbacks)

---

### Task 1: RoadConnector component + CSS + tests

Create the entire new component behind a TDD gate: write its tests first, then implement.

**Files:**
- Create: `app/javascript/components/planner/RoadConnector.jsx`
- Create: `app/javascript/components/planner/__tests__/RoadConnector.test.jsx`
- Modify: `app/javascript/styles/activity-card.css` (append `.rc-*` rules)

- [ ] **Step 1: Append CSS rules to `app/javascript/styles/activity-card.css`**

Add these rules at the bottom of the file (after the last `.ac-card.ac-overlay` rule):

```css

/* Road connector — slim inline line between ActivityCards for non-tier1 road
   activities and for synthesized route_leg pairs. Visual style B from
   brainstorm: 2px dashed left border + inline car icon + Chinese-unit text. */
.rc-line {
  display: flex;
  align-items: center;
  gap: 6px;
  min-height: 24px;
  margin: 0 0 6px 12px;
  padding: 6px 8px 6px 18px;
  border-left: 2px dashed rgba(0, 0, 0, 0.18);
  font-size: 10.5px;
  color: #6b7280;
  font-weight: 500;
  flex-shrink: 0; /* same rigidity fix as .ac-card — don't crush in dense columns */
  cursor: grab;
  position: relative;
}

.rc-line svg {
  width: 12px;
  height: 12px;
  color: #9ca3af;
  flex-shrink: 0;
}

/* Synthesized from route_legs — read-only, drags pass through to the next card */
.rc-line.rc-synthesized {
  cursor: default;
  pointer-events: none;
  opacity: 0.85;
}

/* Active drag state (matches ActivityCard.ac-dragging) */
.rc-line.rc-dragging {
  opacity: 0.4;
  cursor: grabbing;
}

/* Drop indicator (reused from .ac-drop-indicator pattern) */
.rc-line .rc-drop-indicator {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 3px;
  background: #1677ff;
  border-radius: 2px;
  box-shadow: 0 0 6px rgba(22, 119, 255, 0.4);
  pointer-events: none;
  z-index: 5;
}
```

- [ ] **Step 2: Write the failing test file**

Write exactly this to `app/javascript/components/planner/__tests__/RoadConnector.test.jsx`:

```jsx
import { render, screen, fireEvent } from '@testing-library/react'
import { DndContext } from '@dnd-kit/core'
import { vi, afterEach } from 'vitest'
import RoadConnector from '../RoadConnector'

// Match the droppable-mock pattern used in ActivityCard.test.jsx so tests
// are hermetic across dnd-kit's useDroppable.
const mockDroppableReturn = { current: { setNodeRef: () => {}, isOver: false } }
vi.mock('@dnd-kit/core', async () => {
  const actual = await vi.importActual('@dnd-kit/core')
  return {
    ...actual,
    useDroppable: () => mockDroppableReturn.current,
  }
})
afterEach(() => {
  mockDroppableReturn.current = { setNodeRef: () => {}, isOver: false }
})

function renderInDnd(ui) {
  return render(<DndContext>{ui}</DndContext>)
}

const roadActivity = {
  id: 42,
  name: '乌鲁木齐→百丽丹霞',
  kind: 'road',
  citizen_level: 'infrastructure',
  position: 2,
  day_id: 7,
  details: { km: 28, drive_min: 40 },
}

test('renders distance and duration from activity.details in Chinese units', () => {
  renderInDnd(<RoadConnector activity={roadActivity} />)
  expect(screen.getByText(/28 公里/)).toBeInTheDocument()
  expect(screen.getByText(/40 分钟/)).toBeInTheDocument()
})

test('renders duration in hours when >= 60 min and divisible by 30', () => {
  renderInDnd(<RoadConnector activity={{ ...roadActivity, details: { km: 150, drive_min: 150 } }} />)
  expect(screen.getByText(/2\.5 小时/)).toBeInTheDocument()
})

test('renders duration in hours when divisible by 60', () => {
  renderInDnd(<RoadConnector activity={{ ...roadActivity, details: { km: 100, drive_min: 120 } }} />)
  expect(screen.getByText(/2 小时/)).toBeInTheDocument()
})

test('renders minutes when duration not divisible by 30', () => {
  renderInDnd(<RoadConnector activity={{ ...roadActivity, details: { km: 50, drive_min: 100 } }} />)
  expect(screen.getByText(/100 分钟/)).toBeInTheDocument()
})

test('falls back to legFallback when activity details missing', () => {
  const leg = { distance_m: 28000, duration_s: 2400 } // 28 km, 40 min
  renderInDnd(<RoadConnector activity={{ ...roadActivity, details: {} }} legFallback={leg} />)
  expect(screen.getByText(/28 公里/)).toBeInTheDocument()
  expect(screen.getByText(/40 分钟/)).toBeInTheDocument()
})

test('renders only distance when only km present', () => {
  renderInDnd(<RoadConnector activity={{ ...roadActivity, details: { km: 28 } }} />)
  expect(screen.getByText(/28 公里/)).toBeInTheDocument()
  expect(screen.queryByText(/分钟|小时/)).toBeNull()
})

test('renders only duration when only drive_min present', () => {
  renderInDnd(<RoadConnector activity={{ ...roadActivity, details: { drive_min: 40 } }} />)
  expect(screen.getByText(/40 分钟/)).toBeInTheDocument()
  expect(screen.queryByText(/公里/)).toBeNull()
})

test('renders no text when both distance and duration missing', () => {
  const { container } = renderInDnd(<RoadConnector activity={{ ...roadActivity, details: {} }} />)
  expect(screen.queryByText(/公里|分钟|小时/)).toBeNull()
  // Car icon still present
  expect(container.querySelector('.rc-line svg')).toBeInTheDocument()
})

test('activity-backed connector fires onClick with activity id', () => {
  const onClick = vi.fn()
  renderInDnd(<RoadConnector activity={roadActivity} onClick={onClick} />)
  fireEvent.click(screen.getByText(/28 公里/))
  expect(onClick).toHaveBeenCalledWith(42)
})

test('activity-backed connector exposes draggable aria role', () => {
  const { container } = renderInDnd(<RoadConnector activity={roadActivity} />)
  expect(container.querySelector('[aria-roledescription="draggable"]')).not.toBeNull()
})

test('readOnly suppresses onClick and draggable role', () => {
  const onClick = vi.fn()
  const { container } = renderInDnd(<RoadConnector activity={roadActivity} onClick={onClick} readOnly />)
  fireEvent.click(screen.getByText(/28 公里/))
  expect(onClick).not.toHaveBeenCalled()
  expect(container.querySelector('[aria-roledescription="draggable"]')).toBeNull()
})

test('synthesized mode renders from leg prop with rc-synthesized class', () => {
  const leg = { distance_m: 45000, duration_s: 3600 }
  const { container } = renderInDnd(
    <RoadConnector synthesized leg={leg} fromActivityId={1} toActivityId={2} />
  )
  expect(screen.getByText(/45 公里/)).toBeInTheDocument()
  expect(screen.getByText(/1 小时/)).toBeInTheDocument()
  expect(container.querySelector('.rc-line.rc-synthesized')).toBeInTheDocument()
})

test('synthesized mode is not draggable', () => {
  const leg = { distance_m: 45000, duration_s: 3600 }
  const { container } = renderInDnd(
    <RoadConnector synthesized leg={leg} fromActivityId={1} toActivityId={2} />
  )
  expect(container.querySelector('[aria-roledescription="draggable"]')).toBeNull()
})

test('synthesized mode ignores onClick', () => {
  const onClick = vi.fn()
  const leg = { distance_m: 45000, duration_s: 3600 }
  renderInDnd(
    <RoadConnector synthesized leg={leg} fromActivityId={1} toActivityId={2} onClick={onClick} />
  )
  fireEvent.click(screen.getByText(/45 公里/))
  expect(onClick).not.toHaveBeenCalled()
})
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npm test -- app/javascript/components/planner/__tests__/RoadConnector.test.jsx --run`

Expected: All 13 tests FAIL (with "Cannot find module '../RoadConnector'" or similar — the component doesn't exist yet).

- [ ] **Step 4: Implement the RoadConnector component**

Write exactly this to `app/javascript/components/planner/RoadConnector.jsx`:

```jsx
import { useDraggable, useDroppable } from '@dnd-kit/core'
import { IconCar } from '@tabler/icons-react'
import '../../styles/activity-card.css'

// km is already in km (user-filled on activity.details), while route_leg.distance_m
// is in meters. Both paths converge here.
function formatDistance(km) {
  if (!km && km !== 0) return ''
  if (km <= 0) return ''
  return `${km} 公里`
}

// min is already in minutes (user-filled on activity.details), while route_leg.duration_s
// is in seconds. Both paths converge here.
function formatDurationCN(min) {
  if (!min && min !== 0) return ''
  if (min <= 0) return ''
  if (min >= 60 && min % 30 === 0) {
    const h = min / 60
    return `${h} 小时`
  }
  return `${min} 分钟`
}

function extractKmMin({ activity, leg }) {
  // Priority: activity.details > leg (converted from m/s to km/min). Either
  // field may be missing; missing → empty string.
  const detailsKm = activity?.details?.km
  const detailsMin = activity?.details?.drive_min
  const fromLegKm = leg?.distance_m != null ? Math.round(leg.distance_m / 1000) : undefined
  const fromLegMin = leg?.duration_s != null ? Math.round(leg.duration_s / 60) : undefined
  const km = (detailsKm != null && detailsKm !== '') ? detailsKm : fromLegKm
  const min = (detailsMin != null && detailsMin !== '') ? detailsMin : fromLegMin
  return { km, min }
}

function ConnectorText({ km, min }) {
  const distText = formatDistance(km)
  const durText = formatDurationCN(min)
  const parts = [distText, durText].filter(Boolean)
  if (parts.length === 0) return null
  return <span>{parts.join(' · ')}</span>
}

// Synthesized variant — read-only, from a route_leg only.
function SynthesizedConnector({ leg }) {
  const km = leg?.distance_m != null ? Math.round(leg.distance_m / 1000) : undefined
  const min = leg?.duration_s != null ? Math.round(leg.duration_s / 60) : undefined
  return (
    <div className="rc-line rc-synthesized">
      <IconCar size={12} stroke={2} aria-hidden="true" />
      <ConnectorText km={km} min={min} />
    </div>
  )
}

// Activity-backed variant — interactive, draggable via dnd-kit.
function ActivityBackedConnector({ activity, legFallback, onClick, readOnly }) {
  const { attributes, listeners, setNodeRef: setDragRef, isDragging } =
    useDraggable({ id: `activity-${activity.id}` })
  const { setNodeRef: setDropRef, isOver } = useDroppable({
    id: `activity-drop-${activity.id}`,
    data: { dayId: activity.day_id, position: activity.position },
  })
  const setRef = (el) => { setDragRef(el); setDropRef(el) }
  const dragAttributes = readOnly ? {} : attributes
  const dragListeners = readOnly ? {} : listeners

  const handleClick = () => {
    if (!readOnly && onClick) onClick(activity.id)
  }

  const { km, min } = extractKmMin({ activity, leg: legFallback })
  const classes = ['rc-line', isDragging ? 'rc-dragging' : ''].filter(Boolean).join(' ')

  return (
    <div
      ref={setRef}
      className={classes}
      onClick={handleClick}
      {...dragAttributes}
      {...dragListeners}
    >
      {isOver && <div className="rc-drop-indicator" data-testid="rc-drop-indicator" />}
      <IconCar size={12} stroke={2} aria-hidden="true" />
      <ConnectorText km={km} min={min} />
    </div>
  )
}

export default function RoadConnector(props) {
  if (props.synthesized) {
    return <SynthesizedConnector leg={props.leg} />
  }
  return <ActivityBackedConnector
    activity={props.activity}
    legFallback={props.legFallback}
    onClick={props.onClick}
    readOnly={props.readOnly}
  />
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm test -- app/javascript/components/planner/__tests__/RoadConnector.test.jsx --run`

Expected: all 13 tests PASS.

- [ ] **Step 6: Run full JS suite to catch any cross-file breakage**

Run: `npm test -- --run`

Expected: full suite green (existing 301 tests + 13 new = 314 passing).

- [ ] **Step 7: Commit**

```bash
git add \
  app/javascript/styles/activity-card.css \
  app/javascript/components/planner/RoadConnector.jsx \
  app/javascript/components/planner/__tests__/RoadConnector.test.jsx
git commit -m "$(cat <<'EOF'
feat(planner): add RoadConnector component with Chinese units

Slim (~24px) inline line component replacing the 60px ActivityCard for
non-tier1 road activities. Two modes: activity-backed (interactive,
draggable, clickable → drawer) and synthesized (read-only, from a
route_leg, pointer-events:none so drags pass through).

Data source priority: activity.details.km/drive_min > legFallback
(converted from m/s). Chinese units: X 公里 · X 分钟 / X 小时.

Not yet wired into DayColumn — that happens in the next task.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: Thread `routeLegs` prop through Show → DayPanel → DayColumn

Wire the existing `route_legs` data (already on Show.jsx as a Rails prop) down to DayColumn, where it will be consumed in Task 3. No rendering logic yet.

**Files:**
- Modify: `app/javascript/pages/Tour/Show.jsx` (find the `<DayPanel ... />` render and add `routeLegs` prop)
- Modify: `app/javascript/components/planner/DayPanel.jsx` (accept prop, forward to DayColumn)
- Modify: `app/javascript/components/planner/DayColumn.jsx` (accept prop, unused for now)

- [ ] **Step 1: Update `Show.jsx` to pass `route_legs` into DayPanel**

Find the JSX where `<DayPanel` is rendered in `app/javascript/pages/Tour/Show.jsx`. Add a `routeLegs={route_legs || []}` prop to the element (matches the existing pattern used for `<PlannerMap routeLegs={route_legs || []} ... />` in the same file).

Concretely, locate the block that includes `<DayPanel` and add one prop. Example diff-style context (line numbers approximate — grep to locate):

```jsx
<DayPanel
  days={days}
  byDay={byDay}
  tour={tour}
  // ... existing props ...
  routeLegs={route_legs || []}
/>
```

- [ ] **Step 2: Update `DayPanel.jsx` to accept and forward `routeLegs`**

In `app/javascript/components/planner/DayPanel.jsx`:

1. Add `routeLegs` to the destructured props on the `export default function DayPanel({ ... })` signature (alongside `days`, `byDay`, etc.).
2. Find the `<DayColumn` render and add `routeLegs={routeLegs}` to it.

Example (locate the `days.map(d => <DayColumn ...` block and add the prop):

```jsx
{days.map(d => (
  <DayColumn
    key={d.id}
    day={d}
    activities={byDay[d.id] || []}
    routeLegs={routeLegs}
    // ... existing props ...
  />
))}
```

- [ ] **Step 3: Update `DayColumn.jsx` to accept prop (unused for now)**

In `app/javascript/components/planner/DayColumn.jsx`, add `routeLegs = []` to the destructured props in the function signature:

```jsx
export default function DayColumn({ day, activities, constitution, onAddActivity, onEditActivity, onEditDay, readOnly, dragWarning, routeLegs = [] }) {
```

No other changes — the prop is accepted but not referenced yet. Task 3 consumes it.

- [ ] **Step 4: Run full test suite**

Run: `npm test -- --run`

Expected: full suite green (314 passing, no regressions). The new prop is additive and optional.

- [ ] **Step 5: Commit**

```bash
git add \
  app/javascript/pages/Tour/Show.jsx \
  app/javascript/components/planner/DayPanel.jsx \
  app/javascript/components/planner/DayColumn.jsx
git commit -m "$(cat <<'EOF'
chore(planner): thread routeLegs prop Show → DayPanel → DayColumn

Wiring only — DayColumn receives the prop but does not yet consume it.
Task 3 adds the rendering branch that uses route_legs for synthesized
connectors between adjacent ActivityCards.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: Branch DayColumn rendering + synthesize connectors

Replace the simple `activities.map(...)` render in DayColumn with a walk that emits `<ActivityCard>` or `<RoadConnector>` per activity, and inserts a synthesized `<RoadConnector>` between adjacent ActivityCards when a matching `route_leg` is found.

**Files:**
- Modify: `app/javascript/components/planner/DayColumn.jsx`
- Modify: `app/javascript/components/planner/__tests__/DayColumn.test.jsx` (3 new assertions)

- [ ] **Step 1: Read the existing DayColumn test file to match its patterns**

Run: `cat app/javascript/components/planner/__tests__/DayColumn.test.jsx`

Observe the test setup (fixtures, renderInDnd helper, mocks) so the new tests fit in.

- [ ] **Step 2: Add 3 new failing tests to `DayColumn.test.jsx`**

Add these tests to the existing DayColumn test file (place them after the last existing test but before the file end):

```jsx
test('road + tier_one activity renders as ActivityCard, not RoadConnector', () => {
  const activities = [
    { id: 1, name: '独库公路', kind: 'road', citizen_level: 'tier_one', position: 1, day_id: 10 },
  ]
  const { container } = renderInDnd(
    <DayColumn day={{ id: 10, day_index: 1 }} activities={activities} constitution={null} />
  )
  expect(container.querySelector('.ac-card')).toBeInTheDocument()
  expect(container.querySelector('.rc-line')).toBeNull()
})

test('road + non-tier_one activity renders as RoadConnector, not ActivityCard', () => {
  const activities = [
    { id: 2, name: '乌鲁木齐→百丽丹霞', kind: 'road', citizen_level: 'infrastructure', position: 1, day_id: 10, details: { km: 28, drive_min: 40 } },
  ]
  const { container } = renderInDnd(
    <DayColumn day={{ id: 10, day_index: 1 }} activities={activities} constitution={null} />
  )
  expect(container.querySelector('.rc-line')).toBeInTheDocument()
  expect(container.querySelector('.ac-card')).toBeNull()
})

test('synthesizes a read-only RoadConnector between adjacent ActivityCards when route_leg exists', () => {
  const activities = [
    { id: 3, name: '喀纳斯湖',   kind: 'scenic', citizen_level: 'tier_one',  position: 1, day_id: 10, details: {} },
    { id: 4, name: '白哈巴住宿', kind: 'stay',   citizen_level: 'tier_three', position: 2, day_id: 10, details: {} },
  ]
  const routeLegs = [
    { from_activity_id: 3, to_activity_id: 4, mode: 0, distance_m: 28000, duration_s: 2400 },
  ]
  const { container } = renderInDnd(
    <DayColumn day={{ id: 10, day_index: 1 }} activities={activities} constitution={null} routeLegs={routeLegs} />
  )
  expect(container.querySelectorAll('.ac-card')).toHaveLength(2)
  expect(container.querySelector('.rc-line.rc-synthesized')).toBeInTheDocument()
})
```

- [ ] **Step 3: Run the new tests to verify they fail**

Run: `npm test -- app/javascript/components/planner/__tests__/DayColumn.test.jsx --run`

Expected: the 3 new tests FAIL (DayColumn still renders everything as ActivityCard).

- [ ] **Step 4: Implement the branching render in `DayColumn.jsx`**

In `app/javascript/components/planner/DayColumn.jsx`:

1. Add imports at the top (after the existing imports):

```jsx
import { useMemo } from 'react'
import RoadConnector from './RoadConnector'
```

2. Replace the inline `{activities.map(a => <ActivityCard ... />)}` block inside the `<Stack ...>` with a call to a new helper function defined in the same file. Just above the `return` statement inside the component, add:

```jsx
// Build a pair-indexed lookup of drive-mode route_legs for synthesis
// between adjacent ActivityCards: routeLegByPair[fromId][toId] = leg
const routeLegByPair = useMemo(() => {
  const out = {}
  for (const leg of routeLegs) {
    if (leg.mode !== 0 && leg.mode !== 'drive') continue
    const from = leg.from_activity_id
    const to = leg.to_activity_id
    if (from == null || to == null) continue
    out[from] = out[from] || {}
    out[from][to] = leg
  }
  return out
}, [routeLegs])

// Walk activities in order, emitting an ActivityCard or a RoadConnector
// per activity, and inserting a synthesized RoadConnector between
// adjacent ActivityCards when a matching route_leg exists.
const renderedItems = []
let prevCardActivity = null // last ActivityCard activity, for synthesis lookup
for (const a of activities) {
  const isRoadCard = a.kind === 'road' && a.citizen_level === 'tier_one'
  const isRoadConnectorActivity = a.kind === 'road' && a.citizen_level !== 'tier_one'

  if (isRoadConnectorActivity) {
    // Find the NEXT non-road-connector activity after this one (for fallback)
    const next = activities.find(x => activities.indexOf(x) > activities.indexOf(a) && !(x.kind === 'road' && x.citizen_level !== 'tier_one'))
    const fallback = (prevCardActivity && next) ? routeLegByPair[prevCardActivity.id]?.[next.id] : undefined
    renderedItems.push(
      <RoadConnector
        key={`conn-${a.id}`}
        activity={a}
        legFallback={fallback}
        onClick={onEditActivity}
        readOnly={readOnly}
      />
    )
    // A connector activity does not become prevCardActivity; the card before it stays
    continue
  }

  // This activity will render as an ActivityCard (scenic/food/stay/fuel/other,
  // or road+tier_one).
  // Before emitting, check if we should synthesize a connector between
  // prevCardActivity and this one (only when there was no connector-activity between them).
  const lastPushed = renderedItems[renderedItems.length - 1]
  const lastKey = lastPushed && lastPushed.key ? String(lastPushed.key) : ''
  const lastWasConnector = lastKey.startsWith('conn-') || lastKey.startsWith('synth-')
  if (prevCardActivity && !lastWasConnector) {
    const leg = routeLegByPair[prevCardActivity.id]?.[a.id]
    if (leg) {
      renderedItems.push(
        <RoadConnector
          key={`synth-${prevCardActivity.id}-${a.id}`}
          synthesized
          leg={leg}
          fromActivityId={prevCardActivity.id}
          toActivityId={a.id}
        />
      )
    }
  }

  renderedItems.push(
    <ActivityCard key={a.id} activity={a} onClick={onEditActivity} readOnly={readOnly} />
  )
  prevCardActivity = a
}
```

3. Replace the body of the `<Stack ref={setNodeRef} ...>` (the `{activities.map(...)}` line) with `{renderedItems}`:

```jsx
<Stack gap={4} p="xs" ref={setNodeRef} style={{ ... }}>
  {renderedItems}
  {activities.length === 0 && <Text size="xs" c="dimmed" ta="center" mt="md">空</Text>}
</Stack>
```

- [ ] **Step 5: Run the DayColumn tests to verify all pass**

Run: `npm test -- app/javascript/components/planner/__tests__/DayColumn.test.jsx --run`

Expected: all existing DayColumn tests + 3 new tests PASS.

- [ ] **Step 6: Run the full JS suite**

Run: `npm test -- --run`

Expected: full suite green (317 passing).

- [ ] **Step 7: Commit**

```bash
git add \
  app/javascript/components/planner/DayColumn.jsx \
  app/javascript/components/planner/__tests__/DayColumn.test.jsx
git commit -m "$(cat <<'EOF'
feat(planner): render non-tier1 roads as connector lines in DayColumn

Walk activities and emit ActivityCard or RoadConnector based on kind +
citizen_level. Between adjacent ActivityCards with a matching drive-
mode route_leg, insert a read-only synthesized RoadConnector.

Rule:
  kind != road                          → ActivityCard
  kind == road && tier_one              → ActivityCard (景观公路)
  kind == road && != tier_one           → RoadConnector (activity-backed)
  adjacent cards with route_leg         → RoadConnector (synthesized)

No data migration; no DB changes. Existing road+non-tier1 activities
automatically shrink from 60px cards to ~24px connector lines on
next render.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: Visual verification in the browser

Confirm the rendering across all branches of the rule and all visual edge cases.

- [ ] **Step 1: Bring up the worktree dev server**

Run: `bin/worktree-dev up`

Expected: output lists chosen Rails + Vite ports (e.g. `rails on http://localhost:9101`).

- [ ] **Step 2: Seed a tier1 road activity and some non-tier1 road activities into Tour 16**

Tour 16 (the Sichuan 11-day seed) has no road activities by default, so there's nothing to demo the branching on. Run this once to add 3 test road activities into D1 of Tour 16:

```bash
mise exec -- bundle exec rails runner '
tour = Tour.find_by!(title: "川西·稻城亚丁 11 日环线 (E2E)")
d1 = tour.days.order(:day_index).first
# Reposition to leave room
max_pos = tour.activities.where(day_id: d1.id).maximum(:position) || 0
Activity.create!(tour: tour, day: d1, position: max_pos + 1,
  kind: :road, citizen_level: :tier_one, name: "川藏318-天路",
  details: { km: 200, drive_min: 300 })
Activity.create!(tour: tour, day: d1, position: max_pos + 2,
  kind: :road, citizen_level: :infrastructure, name: "成都→雅安",
  details: { km: 150, drive_min: 120 })
Activity.create!(tour: tour, day: d1, position: max_pos + 3,
  kind: :road, citizen_level: :tier_three, name: "过渡路段",
  details: {}) # missing data — renders as minimal connector
puts "Added 3 test road activities to Tour 16 D#{d1.day_index}"
'
```

- [ ] **Step 3: Visit the planner for Tour 16 and verify**

Open `http://localhost:<rails_port>/tours/16` in a browser. Expand the `日程` panel (it may be collapsed by default on narrow viewports). Scroll D1.

Verify:
- The `川藏318-天路` activity renders as a **full ActivityCard** (60px, kind-road blue fill, tier1 gold override + ★ badge, `200公里` and `300 分钟`/`5 小时` in its meta cells as normal activity data)
- The `成都→雅安` activity renders as a **thin dashed RoadConnector** (20-24px) showing `150 公里 · 2 小时`
- The `过渡路段` activity renders as a **thin RoadConnector with no text** (only car icon + dashed line)

- [ ] **Step 4: Verify interactivity on activity-backed connectors**

- Hover a RoadConnector → cursor is `grab`
- Click a RoadConnector → ActivityDrawer opens with the correct activity
- Drag a RoadConnector → reorders like a card would
- Drop indicator (3px blue bar) appears when hovering another card during drag

- [ ] **Step 5: Verify synthesized connectors**

Pick two adjacent destination cards in Tour 16 that have no road activity between them, then on the main map click **批量算路** to populate route_legs (if not already done). Reload the planner view.

Verify:
- A read-only `.rc-synthesized` connector appears between the two cards with the computed km + duration
- Hover does NOT change cursor (stays default)
- Click does nothing
- Dragging another card onto it passes through to the card below (drop target is the next card, not the connector)

- [ ] **Step 6: Verify missing-data edge case**

- The `过渡路段` activity (seeded in step 2 with empty details) renders only the car icon + dashed line — no text — since both `details.km` and `details.drive_min` are missing AND there's no route_leg available between the adjacent cards.

- [ ] **Step 7: Clean up test activities**

Run:

```bash
mise exec -- bundle exec rails runner '
names = ["川藏318-天路", "成都→雅安", "过渡路段"]
n = Activity.where(name: names).destroy_all.size
puts "Deleted #{n} test activities"
'
```

- [ ] **Step 8: Bring the server down**

Run: `bin/worktree-dev down`

- [ ] **Step 9: If any visual issue was found, iterate**

If the connector looked too thick, the line color was off, or the synthesized connector felt too prominent, adjust the `.rc-*` rules in `app/javascript/styles/activity-card.css` and re-verify. Commit each visual tweak separately with descriptive messages (`fix(planner): soften rc-line dash color` etc.).

---

## Out of Scope (explicitly)

- **Auto route_leg recompute on drag** — user still clicks 批量算路; recompute-on-drag needs rate-limiting and is a separate design decision.
- **Unifying ActivityCard duration with Chinese units** — card meta still shows `4h` / `90分` mix; this PR changes only RoadConnector units. Separate polish PR if/when desired.
- **Timeline view** — Timeline has its own card component and is not touched.
- **Backlog view** — if a road+non-tier1 activity lands in the backlog, it still renders as an ActivityCard there (since the branching is in DayColumn only). Acceptable inconsistency for v1.
- **Disabling road+non-tier1 creation in the drawer** — drawer still allows it. If we move to pure route_legs long-term, disabling creation is its own task.
- **Bulk migration / cleanup of existing road+non-tier1 activities** — users delete one-by-one today; no bulk tool.

## Success criteria

- `npm test -- --run` is green (317 passing = 301 existing + 13 RoadConnector + 3 DayColumn).
- On Tour 16 (or any tour with mixed activities), non-tier1 road activities visibly shrink from 60px cards to 20-24px connector lines.
- tier1 road activities continue to render as full cards.
- Adjacent destination cards with computed route_legs get a read-only synthesized connector between them.
- Drag-to-reorder of cards and activity-backed connectors still works identically to before.
- Visual column-height reduction of ~50% on road-heavy days (e.g. 11 activities → ~400px instead of ~800px).
