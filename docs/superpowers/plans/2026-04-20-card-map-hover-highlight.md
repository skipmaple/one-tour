# Card ↔ Map Hover Highlight Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Hovering any `ActivityCard` or `RoadConnector` in the day columns highlights the matching AMap marker; hovering any marker on the map highlights the matching card. Road-connector hover highlights both endpoint markers.

**Architecture:** Single React state `hoveredActivityIds: number[] | null` in `Show.jsx`. Props flow down to `DayColumn` (computes `isHighlighted` per activity) and to `PlannerMap` (imperatively updates marker HTML via `AMap.Marker.setContent` in a `useEffect`). Marker mouseover fires a callback that sets state back up. Desktop-only via `@media (hover: hover)` CSS gate.

**Tech Stack:** React (hooks, no new deps), AMap JS SDK, Mantine theme (day-color palette), Vitest + @testing-library/react.

---

## File structure

**Modified files:**

| File | Responsibility |
|---|---|
| `app/javascript/styles/activity-card.css` | Day-color CSS custom properties + `.ac-highlighted` / `.rc-highlighted` rules (Task 1) |
| `app/javascript/components/planner/ActivityCard.jsx` | Accept `isHighlighted`, `onHoverActivity`, `onClearHover`, `dayColorName` props; wire mouse events; add class + `data-day-color` attr (Task 2) |
| `app/javascript/components/planner/RoadConnector.jsx` | Same shape as ActivityCard; connector-specific `onHoverConnector(fromId, toId)` signature + endpoint id props (Task 3) |
| `app/javascript/components/planner/DayColumn.jsx` | Compute `isHighlighted` from `hoveredActivityIds`; resolve connector endpoint ids from ordered activities; pass `dayColorName` from `day.day_index` (Task 4) |
| `app/javascript/components/planner/PlannerMap.jsx` | Add `markerByIdRef` lookup; extend `buildMarkerHTML` with `highlighted` arg; `useEffect` on `hoveredActivityIds` to imperatively update marker content; `marker.on('mouseover'/'mouseout')` handlers (Task 5) |
| `app/javascript/components/planner/DayPanel.jsx` | Pass-through of 4 new props to each DayColumn (Task 6) |
| `app/javascript/pages/Tour/Show.jsx` | Own `hoveredActivityIds` state; `useCallback` wrapped setters; thread to `DayPanel` and `PlannerMap` (Task 7) |
| `app/javascript/pages/Tour/__tests__/Show.test.jsx` | Update PlannerMap mock + prop sanity (Task 7) |

**New test cases:**

| File | Added tests |
|---|---|
| `app/javascript/components/planner/__tests__/ActivityCard.test.jsx` | +3 |
| `app/javascript/components/planner/__tests__/RoadConnector.test.jsx` | +3 |
| `app/javascript/components/planner/__tests__/DayColumn.test.jsx` | +1 |
| `app/javascript/components/planner/__tests__/PlannerMap.test.jsx` | +2 |

**No new files. No DB / backend changes.**

---

## Task 1: CSS foundation — day-color vars + highlight rules

**Files:**
- Modify: `app/javascript/styles/activity-card.css` (append after the existing `.rc-line.rc-dragging` block near line 310)

CSS-only task; no unit test. Visual regression will be caught during Task 7 manual verification.

- [ ] **Step 1: Append highlight CSS rules**

Open `app/javascript/styles/activity-card.css`, scroll to the end of the file, and append:

```css

/* =====================================================================
   Card ↔ Map hover highlight
   Day-color CSS custom property. Populated via [data-day-color] on cards
   and connectors. The attribute value mirrors PlannerMap.jsx DAY_PALETTE
   (red/pink/grape/violet/indigo/blue/cyan/teal/green/yellow). "none" is
   the backlog / unassigned state. Keep in sync with DAY_PALETTE.
   ===================================================================== */
.ac-card[data-day-color="red"],    .rc-line[data-day-color="red"]    { --day-accent: var(--mantine-color-red-6); }
.ac-card[data-day-color="pink"],   .rc-line[data-day-color="pink"]   { --day-accent: var(--mantine-color-pink-6); }
.ac-card[data-day-color="grape"],  .rc-line[data-day-color="grape"]  { --day-accent: var(--mantine-color-grape-6); }
.ac-card[data-day-color="violet"], .rc-line[data-day-color="violet"] { --day-accent: var(--mantine-color-violet-6); }
.ac-card[data-day-color="indigo"], .rc-line[data-day-color="indigo"] { --day-accent: var(--mantine-color-indigo-6); }
.ac-card[data-day-color="blue"],   .rc-line[data-day-color="blue"]   { --day-accent: var(--mantine-color-blue-6); }
.ac-card[data-day-color="cyan"],   .rc-line[data-day-color="cyan"]   { --day-accent: var(--mantine-color-cyan-6); }
.ac-card[data-day-color="teal"],   .rc-line[data-day-color="teal"]   { --day-accent: var(--mantine-color-teal-6); }
.ac-card[data-day-color="green"],  .rc-line[data-day-color="green"]  { --day-accent: var(--mantine-color-green-6); }
.ac-card[data-day-color="yellow"], .rc-line[data-day-color="yellow"] { --day-accent: var(--mantine-color-yellow-6); }
.ac-card[data-day-color="none"],   .rc-line[data-day-color="none"]   { --day-accent: #9ca3af; }

/* Hover-only device: touch devices have no hover, silently skip. */
@media (hover: hover) {
  .ac-card.ac-highlighted,
  .rc-line.rc-highlighted {
    box-shadow: inset 3px 0 0 var(--day-accent, #6b7280);
  }
  .ac-card.ac-highlighted {
    background-color: color-mix(in srgb, var(--day-accent) 4%, white);
  }
}

/* Motion-reduced users: keep the bar, drop the tint. */
@media (prefers-reduced-motion: reduce) {
  .ac-card.ac-highlighted { background-color: initial; }
}
```

- [ ] **Step 2: Verify CSS compiles (Vite HMR)**

Run: `npm test -- --run 2>&1 | tail -5`
Expected: `Tests  320 passed (320)` — no regression (no new tests yet; existing suite still green).

- [ ] **Step 3: Commit**

```bash
git add app/javascript/styles/activity-card.css
git commit -m "$(cat <<'EOF'
style(planner): day-color vars + hover highlight rules

Foundation for card/connector hover highlight. Defines --day-accent
custom property from [data-day-color] attribute (10 Mantine colors +
"none"), and .ac-highlighted / .rc-highlighted rules that draw a 3px
inset left bar. Gated behind @media (hover: hover) so touch devices
silently skip. Motion-reduced preference drops the tint but keeps the
bar for accessibility.

No components consume these rules yet — wired up in subsequent tasks.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: ActivityCard hover props + handlers

**Files:**
- Modify: `app/javascript/components/planner/ActivityCard.jsx`
- Modify: `app/javascript/components/planner/__tests__/ActivityCard.test.jsx`

- [ ] **Step 1: Add failing tests**

Open `app/javascript/components/planner/__tests__/ActivityCard.test.jsx` and append at the bottom of the file (before the last closing):

```javascript

test('applies .ac-highlighted class when isHighlighted=true', () => {
  const { container } = renderInDnd(<ActivityCard activity={baseActivity} isHighlighted />)
  expect(container.querySelector('.ac-card.ac-highlighted')).toBeInTheDocument()
})

test('does NOT apply .ac-highlighted class when isHighlighted=false', () => {
  const { container } = renderInDnd(<ActivityCard activity={baseActivity} isHighlighted={false} />)
  expect(container.querySelector('.ac-card.ac-highlighted')).toBeNull()
})

test('calls onHoverActivity(activity.id) on mouseenter and onClearHover on mouseleave', () => {
  const onHoverActivity = vi.fn()
  const onClearHover    = vi.fn()
  const { container } = renderInDnd(
    <ActivityCard
      activity={baseActivity}
      onHoverActivity={onHoverActivity}
      onClearHover={onClearHover}
    />
  )
  const card = container.querySelector('.ac-card')
  fireEvent.mouseEnter(card)
  expect(onHoverActivity).toHaveBeenCalledWith(baseActivity.id)
  fireEvent.mouseLeave(card)
  expect(onClearHover).toHaveBeenCalled()
})

test('renders data-day-color attribute from dayColorName prop', () => {
  const { container } = renderInDnd(<ActivityCard activity={baseActivity} dayColorName="blue" />)
  expect(container.querySelector('.ac-card').getAttribute('data-day-color')).toBe('blue')
})
```

(Note: the spec called for 3 tests; I split the class assertion into positive + negative for tighter coverage — still 4 new tests total.)

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- --run ActivityCard 2>&1 | tail -15`
Expected: 4 failing tests: `applies .ac-highlighted class`, `does NOT apply`, `calls onHoverActivity`, `renders data-day-color`. All other ActivityCard tests pass.

- [ ] **Step 3: Modify `ActivityCard.jsx` to accept new props**

Open `app/javascript/components/planner/ActivityCard.jsx`. Replace the current default export function signature and body. Locate:

```jsx
export default function ActivityCard({ activity, onClick, readOnly }) {
```

Replace with:

```jsx
export default function ActivityCard({
  activity,
  onClick,
  readOnly,
  isHighlighted = false,
  onHoverActivity,
  onClearHover,
  dayColorName = 'none',
}) {
```

Then locate the `extra` variable (inside the same function, right before the `return`):

```jsx
  const extra = [
    isDragging ? 'ac-dragging' : '',
    readOnly && onClick ? 'ac-readonly' : '',
  ].filter(Boolean).join(' ')
```

Replace with:

```jsx
  const extra = [
    isDragging ? 'ac-dragging' : '',
    readOnly && onClick ? 'ac-readonly' : '',
    isHighlighted ? 'ac-highlighted' : '',
  ].filter(Boolean).join(' ')

  const handleMouseEnter = () => {
    if (onHoverActivity) onHoverActivity(activity.id)
  }
  const handleMouseLeave = () => {
    if (onClearHover) onClearHover()
  }
```

Then locate the outer `<div ref={setRef} ...>`:

```jsx
  return (
    <div
      ref={setRef}
      className={cardClasses(activity, extra)}
      {...dragAttributes}
      {...dragListeners}
    >
```

Replace with:

```jsx
  return (
    <div
      ref={setRef}
      className={cardClasses(activity, extra)}
      data-day-color={dayColorName}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      {...dragAttributes}
      {...dragListeners}
    >
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- --run ActivityCard 2>&1 | tail -10`
Expected: All ActivityCard tests pass (20 total — 16 existing + 4 new).

- [ ] **Step 5: Commit**

```bash
git add app/javascript/components/planner/ActivityCard.jsx \
        app/javascript/components/planner/__tests__/ActivityCard.test.jsx
git commit -m "$(cat <<'EOF'
feat(planner): hover handlers and highlight state on ActivityCard

Adds isHighlighted, onHoverActivity, onClearHover, dayColorName props.
Wires onMouseEnter → onHoverActivity(activity.id) and onMouseLeave →
onClearHover. Applies .ac-highlighted class and data-day-color attr
that the CSS foundation (Task 1) uses to draw the accent bar.

Component is still invoked without these props by existing call sites
(defaults keep old behavior) — consumers opt in in subsequent tasks.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: RoadConnector hover props + handlers

**Files:**
- Modify: `app/javascript/components/planner/RoadConnector.jsx`
- Modify: `app/javascript/components/planner/__tests__/RoadConnector.test.jsx`

- [ ] **Step 1: Add failing tests**

Append to `app/javascript/components/planner/__tests__/RoadConnector.test.jsx`:

```javascript

test('applies .rc-highlighted class when isHighlighted=true', () => {
  const { container } = renderInDnd(<RoadConnector activity={roadActivity} isHighlighted />)
  expect(container.querySelector('.rc-line.rc-highlighted')).toBeInTheDocument()
})

test('calls onHoverConnector(fromId, toId) on mouseenter when both ids present', () => {
  const onHoverConnector = vi.fn()
  const { container } = renderInDnd(
    <RoadConnector
      activity={roadActivity}
      fromActivityId={10}
      toActivityId={20}
      onHoverConnector={onHoverConnector}
    />
  )
  fireEvent.mouseEnter(container.querySelector('.rc-line'))
  expect(onHoverConnector).toHaveBeenCalledWith(10, 20)
})

test('does NOT call onHoverConnector when fromActivityId is null', () => {
  const onHoverConnector = vi.fn()
  const { container } = renderInDnd(
    <RoadConnector
      activity={roadActivity}
      fromActivityId={null}
      toActivityId={20}
      onHoverConnector={onHoverConnector}
    />
  )
  fireEvent.mouseEnter(container.querySelector('.rc-line'))
  expect(onHoverConnector).not.toHaveBeenCalled()
})

test('renders data-day-color from dayColorName prop', () => {
  const { container } = renderInDnd(<RoadConnector activity={roadActivity} dayColorName="teal" />)
  expect(container.querySelector('.rc-line').getAttribute('data-day-color')).toBe('teal')
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- --run RoadConnector 2>&1 | tail -15`
Expected: 4 new failing tests. Existing 14 RoadConnector tests still pass.

- [ ] **Step 3: Modify `RoadConnector.jsx` to accept new props**

Open `app/javascript/components/planner/RoadConnector.jsx`. Replace the `ActivityBackedConnector` function (entire function body). Locate:

```jsx
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
```

Replace with:

```jsx
function ActivityBackedConnector({
  activity,
  legFallback,
  onClick,
  readOnly,
  isHighlighted = false,
  onHoverConnector,
  onClearHover,
  fromActivityId,
  toActivityId,
  dayColorName = 'none',
}) {
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

  // Connector hover highlights BOTH endpoint markers. Skip the call if either
  // endpoint id is missing (day boundary, orphan connector) — connector's own
  // .rc-highlighted bar still lights up when parent sets isHighlighted.
  const handleMouseEnter = () => {
    if (onHoverConnector && fromActivityId != null && toActivityId != null) {
      onHoverConnector(fromActivityId, toActivityId)
    }
  }
  const handleMouseLeave = () => {
    if (onClearHover) onClearHover()
  }

  const { km, min } = extractKmMin({ activity, leg: legFallback })
  const classes = [
    'rc-line',
    isDragging ? 'rc-dragging' : '',
    isHighlighted ? 'rc-highlighted' : '',
  ].filter(Boolean).join(' ')

  return (
    <div
      ref={setRef}
      className={classes}
      data-day-color={dayColorName}
      onClick={handleClick}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      {...dragAttributes}
      {...dragListeners}
    >
      {isOver && <div className="rc-drop-indicator" data-testid="rc-drop-indicator" />}
      <IconCar size={12} stroke={2} aria-hidden="true" />
      <ConnectorText km={km} min={min} />
    </div>
  )
}
```

Also update the `SynthesizedConnector` function to accept `isHighlighted` and `dayColorName` for consistency. Locate:

```jsx
function SynthesizedConnector({ leg }) {
  const { km, min } = extractKmMin({ activity: null, leg })
  return (
    <div className="rc-line rc-synthesized">
      <IconCar size={12} stroke={2} aria-hidden="true" />
      <ConnectorText km={km} min={min} />
    </div>
  )
}
```

Replace with:

```jsx
function SynthesizedConnector({
  leg,
  isHighlighted = false,
  onHoverConnector,
  onClearHover,
  fromActivityId,
  toActivityId,
  dayColorName = 'none',
}) {
  const { km, min } = extractKmMin({ activity: null, leg })
  const classes = [
    'rc-line',
    'rc-synthesized',
    isHighlighted ? 'rc-highlighted' : '',
  ].filter(Boolean).join(' ')

  // Synthesized has pointer-events: none in CSS, but onMouseEnter still needs
  // handlers in case that CSS rule is relaxed later. Safe no-op when hovered
  // is impossible.
  const handleMouseEnter = () => {
    if (onHoverConnector && fromActivityId != null && toActivityId != null) {
      onHoverConnector(fromActivityId, toActivityId)
    }
  }
  const handleMouseLeave = () => {
    if (onClearHover) onClearHover()
  }

  return (
    <div
      className={classes}
      data-day-color={dayColorName}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      <IconCar size={12} stroke={2} aria-hidden="true" />
      <ConnectorText km={km} min={min} />
    </div>
  )
}
```

Finally update the default export `RoadConnector` to forward the new props:

```jsx
export default function RoadConnector(props) {
  // `synthesized` and `activity` are mutually exclusive; `synthesized` takes precedence.
  // A synthesized connector derives all data from `leg` — `activity` is ignored.
  if (props.synthesized) {
    return <SynthesizedConnector
      leg={props.leg}
      isHighlighted={props.isHighlighted}
      onHoverConnector={props.onHoverConnector}
      onClearHover={props.onClearHover}
      fromActivityId={props.fromActivityId}
      toActivityId={props.toActivityId}
      dayColorName={props.dayColorName}
    />
  }
  return <ActivityBackedConnector
    activity={props.activity}
    legFallback={props.legFallback}
    onClick={props.onClick}
    readOnly={props.readOnly}
    isHighlighted={props.isHighlighted}
    onHoverConnector={props.onHoverConnector}
    onClearHover={props.onClearHover}
    fromActivityId={props.fromActivityId}
    toActivityId={props.toActivityId}
    dayColorName={props.dayColorName}
  />
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- --run RoadConnector 2>&1 | tail -10`
Expected: All RoadConnector tests pass (18 total — 14 existing + 4 new).

- [ ] **Step 5: Commit**

```bash
git add app/javascript/components/planner/RoadConnector.jsx \
        app/javascript/components/planner/__tests__/RoadConnector.test.jsx
git commit -m "$(cat <<'EOF'
feat(planner): hover handlers and highlight state on RoadConnector

Mirrors ActivityCard hover API with a connector-specific onHoverConnector
signature: (fromActivityId, toActivityId) so the consumer can highlight
both endpoint markers on the map. Handler is skipped if either endpoint
id is missing (day boundary / orphan connector) — own .rc-highlighted
bar still applies when parent sets isHighlighted.

Extends both the activity-backed and synthesized variants; default
export forwards all new props.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: DayColumn threads props + computes isHighlighted + endpoint ids

**Files:**
- Modify: `app/javascript/components/planner/DayColumn.jsx`
- Modify: `app/javascript/components/planner/__tests__/DayColumn.test.jsx`

- [ ] **Step 1: Add failing test**

Append to `app/javascript/components/planner/__tests__/DayColumn.test.jsx`:

```javascript

test('applies .ac-highlighted to the ActivityCard whose id is in hoveredActivityIds', () => {
  const activities = [
    { id: 100, name: '喀纳斯湖', kind: 'scenic', citizen_level: 'tier_two', position: 1, day_id: 10 },
    { id: 200, name: '白哈巴住宿', kind: 'stay', citizen_level: 'tier_three', position: 2, day_id: 10 },
  ]
  const { container } = renderInDnd(
    <DayColumn
      day={{ id: 10, day_index: 1 }}
      activities={activities}
      constitution={null}
      hoveredActivityIds={[100]}
    />
  )
  const cards = container.querySelectorAll('.ac-card')
  expect(cards).toHaveLength(2)
  // First card (id=100) is highlighted, second (id=200) is not.
  expect(cards[0].classList.contains('ac-highlighted')).toBe(true)
  expect(cards[1].classList.contains('ac-highlighted')).toBe(false)
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- --run DayColumn 2>&1 | tail -10`
Expected: 1 new failing test, 5 existing pass.

- [ ] **Step 3: Modify `DayColumn.jsx`**

Open `app/javascript/components/planner/DayColumn.jsx`. First update the function signature to accept new props:

```jsx
export default function DayColumn({ day, activities, constitution, onAddActivity, onEditActivity, onEditDay, readOnly, dragWarning, routeLegs = [] }) {
```

Replace with:

```jsx
export default function DayColumn({
  day,
  activities,
  constitution,
  onAddActivity,
  onEditActivity,
  onEditDay,
  readOnly,
  dragWarning,
  routeLegs = [],
  hoveredActivityIds = null,
  onHoverActivity,
  onHoverConnector,
  onClearHover,
}) {
```

At the top of the file, add the import for `DAY_COLOR`:

```jsx
import { useMemo } from 'react'
```

Replace with:

```jsx
import { useMemo } from 'react'
import { DAY_COLOR } from './PlannerMap'
```

Inside the component function, right after the existing `maxH` / `maxTier1` / `driveMin` / `driveH` / `tierOneCount` declarations and BEFORE `const { setNodeRef, isOver } = useDroppable(...)`, add:

```jsx
  const dayColorName = DAY_COLOR(day.day_index)
  const isHighlightedById = (id) => hoveredActivityIds != null && hoveredActivityIds.includes(id)
```

Then locate the rendering loop. Find the block starting with:

```jsx
  // Walk activities in order, emitting an ActivityCard or a RoadConnector
  // per activity, and inserting a synthesized RoadConnector between
  // adjacent ActivityCards when a matching route_leg exists.
  const renderedItems = []
  let prevCardActivity = null // last ActivityCard activity, for synthesis lookup
  for (const a of activities) {
    const isRoadConnectorActivity = a.kind === 'road' && a.citizen_level !== 'tier_one'

    if (isRoadConnectorActivity) {
      // Find the NEXT non-road-connector activity after this one (for fallback)
      const currentIdx = activities.indexOf(a)
      const next = activities.find((x, idx) => idx > currentIdx && !(x.kind === 'road' && x.citizen_level !== 'tier_one'))
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
```

Replace the `RoadConnector` JSX inside the loop with one that passes new props. The full replacement for the `if (isRoadConnectorActivity) { ... }` block is:

```jsx
    if (isRoadConnectorActivity) {
      // Find the NEXT non-road-connector activity after this one (for fallback)
      const currentIdx = activities.indexOf(a)
      const next = activities.find((x, idx) => idx > currentIdx && !(x.kind === 'road' && x.citizen_level !== 'tier_one'))
      const fallback = (prevCardActivity && next) ? routeLegByPair[prevCardActivity.id]?.[next.id] : undefined
      renderedItems.push(
        <RoadConnector
          key={`conn-${a.id}`}
          activity={a}
          legFallback={fallback}
          onClick={onEditActivity}
          readOnly={readOnly}
          isHighlighted={isHighlightedById(a.id)}
          onHoverConnector={onHoverConnector}
          onClearHover={onClearHover}
          fromActivityId={prevCardActivity?.id ?? null}
          toActivityId={next?.id ?? null}
          dayColorName={dayColorName}
        />
      )
      // A connector activity does not become prevCardActivity; the card before it stays
      continue
    }
```

Next, locate the synthesized `RoadConnector` emission block inside the same loop:

```jsx
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
```

Replace with (adding hover props to the synthesized connector too):

```jsx
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
            onHoverConnector={onHoverConnector}
            onClearHover={onClearHover}
            dayColorName={dayColorName}
          />
        )
      }
    }
```

Finally, locate the `ActivityCard` emission at the bottom of the loop:

```jsx
    renderedItems.push(
      <ActivityCard key={a.id} activity={a} onClick={onEditActivity} readOnly={readOnly} />
    )
    prevCardActivity = a
  }
```

Replace with:

```jsx
    renderedItems.push(
      <ActivityCard
        key={a.id}
        activity={a}
        onClick={onEditActivity}
        readOnly={readOnly}
        isHighlighted={isHighlightedById(a.id)}
        onHoverActivity={onHoverActivity}
        onClearHover={onClearHover}
        dayColorName={dayColorName}
      />
    )
    prevCardActivity = a
  }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- --run DayColumn 2>&1 | tail -10`
Expected: All DayColumn tests pass (6 total — 5 existing + 1 new).

- [ ] **Step 5: Run full test suite to catch regressions**

Run: `npm test -- --run 2>&1 | tail -5`
Expected: `Tests  328 passed (328)` — was 320, now 320 + 8 new tests (+4 ActivityCard, +4 RoadConnector, +0 DayColumn because DayColumn previously listed had 5 tests, not 6 — recount: after Task 2 (+4), Task 3 (+4), Task 4 (+1) = 329 total. Adjust expected number if it drifts by 1 — the point is green.

- [ ] **Step 6: Commit**

```bash
git add app/javascript/components/planner/DayColumn.jsx \
        app/javascript/components/planner/__tests__/DayColumn.test.jsx
git commit -m "$(cat <<'EOF'
feat(planner): thread hover props through DayColumn

DayColumn receives hoveredActivityIds + 3 callbacks from its parent and:
- computes isHighlighted per activity (ac.id in array)
- passes dayColorName derived from day.day_index via DAY_COLOR
- for each connector, resolves from/to endpoint ids (prev and next
  non-connector activities) so the connector's onMouseEnter can emit
  a two-id highlight set

No behavior change when hoveredActivityIds is null (default) — cards
render as before.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: PlannerMap marker highlight + marker mouse events

**Files:**
- Modify: `app/javascript/components/planner/PlannerMap.jsx`
- Modify: `app/javascript/components/planner/__tests__/PlannerMap.test.jsx`

- [ ] **Step 1: Add failing tests**

Open `app/javascript/components/planner/__tests__/PlannerMap.test.jsx`. At the end of the file, append:

```javascript

describe('buildMarkerHTML highlighted state', () => {
  const theme = {
    colors: {
      red:    [, , , , , , '#fa5252'],
      pink:   [, , , , , , '#e64980'],
      grape:  [, , , , , , '#be4bdb'],
      violet: [, , , , , , '#7950f2'],
      indigo: [, , , , , , '#4c6ef5'],
      blue:   [, , , , , , '#228be6'],
      cyan:   [, , , , , , '#15aabf'],
      teal:   [, , , , , , '#12b886'],
      green:  [, , , , , , '#40c057'],
      yellow: [, , , , , , '#fab005'],
    }
  }

  test('highlighted=true adds scale(1.3) transform', () => {
    const html = buildMarkerHTML({ day_id: 10 }, { 10: 1 }, theme, true)
    expect(html).toContain('scale(1.3)')
  })

  test('highlighted=false (default) uses scale(1)', () => {
    const html = buildMarkerHTML({ day_id: 10 }, { 10: 1 }, theme)
    expect(html).toContain('scale(1)')
  })

  test('backlog marker honors highlighted flag', () => {
    const html = buildMarkerHTML({ day_id: null }, {}, theme, true)
    expect(html).toContain('scale(1.3)')
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- --run PlannerMap 2>&1 | tail -15`
Expected: 3 new failing tests (scale(1.3) / scale(1) substrings missing from current output).

- [ ] **Step 3: Update `buildMarkerHTML` in `PlannerMap.jsx`**

Open `app/javascript/components/planner/PlannerMap.jsx`. Locate the exported `buildMarkerHTML`:

```jsx
export function buildMarkerHTML(activity, dayIndexById, theme) {
  if (activity.day_id == null) {
    // Backlog marker — grey dashed circle, no label
    return `<div style="
      width: 22px; height: 22px;
      background: white;
      border: 2px dashed #999;
      border-radius: 50%;
      opacity: 0.85;
      box-sizing: border-box;
    "></div>`
  }

  const day_index = dayIndexById[activity.day_id]
  const colorName = DAY_COLOR(day_index)
  const hex = theme.colors[colorName][6]

  return `<div style="
    width: 28px; height: 28px;
    background: ${hex};
    border: 2px solid white;
    border-radius: 50%;
    box-shadow: 0 2px 4px rgba(0,0,0,0.3);
    display: flex; align-items: center; justify-content: center;
    color: white; font-size: 11px; font-weight: bold;
    box-sizing: border-box;
  ">D${day_index}</div>`
}
```

Replace with:

```jsx
export function buildMarkerHTML(activity, dayIndexById, theme, highlighted = false) {
  const scale = highlighted ? 'scale(1.3)' : 'scale(1)'
  const transition = 'transition: transform 150ms ease, box-shadow 150ms ease;'

  if (activity.day_id == null) {
    // Backlog marker — grey dashed circle, no label.
    const shadow = highlighted ? 'box-shadow: 0 4px 10px rgba(0,0,0,0.25);' : ''
    return `<div style="
      width: 22px; height: 22px;
      background: white;
      border: 2px dashed #999;
      border-radius: 50%;
      opacity: 0.85;
      box-sizing: border-box;
      transform: ${scale};
      ${shadow}
      ${transition}
    "></div>`
  }

  const day_index = dayIndexById[activity.day_id]
  const colorName = DAY_COLOR(day_index)
  const hex = theme.colors[colorName][6]
  const shadow = highlighted ? '0 4px 12px rgba(0,0,0,0.4)' : '0 2px 4px rgba(0,0,0,0.3)'

  return `<div style="
    width: 28px; height: 28px;
    background: ${hex};
    border: 2px solid white;
    border-radius: 50%;
    box-shadow: ${shadow};
    display: flex; align-items: center; justify-content: center;
    color: white; font-size: 11px; font-weight: bold;
    box-sizing: border-box;
    transform: ${scale};
    ${transition}
  ">D${day_index}</div>`
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- --run PlannerMap 2>&1 | tail -10`
Expected: All PlannerMap tests pass.

- [ ] **Step 5: Add `markerByIdRef`, highlight effect, and marker mouseover/mouseout handlers**

Still in `PlannerMap.jsx`, locate the `PlannerMapInner` function signature:

```jsx
function PlannerMapInner({ activities, days = [], routeLegs = [], tourId, canEdit = false }) {
```

Replace with:

```jsx
function PlannerMapInner({
  activities,
  days = [],
  routeLegs = [],
  tourId,
  canEdit = false,
  hoveredActivityIds = null,
  onMarkerHover,
  onMarkerLeave,
}) {
```

Next, inside the function, locate the refs block near the top:

```jsx
  const containerRef = useRef(null)
  const mapRef = useRef(null)
  const markersRef = useRef([])
  const polylinesRef = useRef([])
  // One-at-a-time tooltip for straight-polyline hover — keep a ref so we can
  // close the previous one when the cursor moves between segments.
  const tooltipRef = useRef(null)
```

After `markersRef` and before `polylinesRef`, insert a new ref:

```jsx
  const containerRef = useRef(null)
  const mapRef = useRef(null)
  const markersRef = useRef([])
  // Parallel lookup: activity.id → AMap.Marker. Lets the highlight effect
  // update just the affected markers via setContent, without scanning the
  // whole markers array.
  const markerByIdRef = useRef({})
  const polylinesRef = useRef([])
```

Now find the marker-creation `useEffect` that starts with:

```jsx
  useEffect(() => {
    const map = mapRef.current
    if (!map || !window.AMap) return

    markersRef.current.forEach(m => m.setMap(null))
    markersRef.current = []
```

Extend the cleanup of `markersRef` to also clear `markerByIdRef`, and register mouseover/mouseout handlers and populate the by-id map. The existing block is:

```jsx
    visible.forEach(a => {
      const inDay = a.day_id && dayIndexById[a.day_id]
      const marker = new window.AMap.Marker({
        position: [ a.lng, a.lat ],
        title: a.name,
        content: buildMarkerHTML(a, dayIndexById, theme),
        anchor: 'center'
      })
      const info = new window.AMap.InfoWindow({
        content: `<div style="padding:6px 10px;font-size:12px;line-height:1.5">
          <strong>${escapeHtml(a.name)}</strong><br/>
          <span style="color:#888">${inDay ? `已排入 D${inDay}` : '尚未排入(backlog)'}</span>
        </div>`,
        offset: new window.AMap.Pixel(0, -20)
      })
      marker.on('click', () => info.open(map, marker.getPosition()))
      marker.setMap(map)
      markersRef.current.push(marker)
    })
```

Replace this block with (includes clearing `markerByIdRef` at the start of the effect and populating it plus adding mouseover/mouseout handlers; note: the array-clear line `markersRef.current = []` stays where it is — only the per-marker block changes):

First, right after the existing `markersRef.current = []` line, add:

```jsx
    markerByIdRef.current = {}
```

Then replace the `visible.forEach(a => { ... })` block with:

```jsx
    visible.forEach(a => {
      const inDay = a.day_id && dayIndexById[a.day_id]
      const marker = new window.AMap.Marker({
        position: [ a.lng, a.lat ],
        title: a.name,
        content: buildMarkerHTML(a, dayIndexById, theme),
        anchor: 'center',
        extData: { activity: a },
      })
      const info = new window.AMap.InfoWindow({
        content: `<div style="padding:6px 10px;font-size:12px;line-height:1.5">
          <strong>${escapeHtml(a.name)}</strong><br/>
          <span style="color:#888">${inDay ? `已排入 D${inDay}` : '尚未排入(backlog)'}</span>
        </div>`,
        offset: new window.AMap.Pixel(0, -20)
      })
      marker.on('click', () => info.open(map, marker.getPosition()))
      marker.on('mouseover', () => { if (onMarkerHover) onMarkerHover(a.id) })
      marker.on('mouseout',  () => { if (onMarkerLeave) onMarkerLeave() })
      marker.setMap(map)
      markersRef.current.push(marker)
      markerByIdRef.current[a.id] = marker
    })
```

Finally, add a new `useEffect` that watches `hoveredActivityIds` and updates marker content. Insert it AFTER the existing markers-sync effect (the one that just got modified) and BEFORE the polylines-sync effect. Add:

```jsx
  // Sync marker highlight state with hoveredActivityIds. Changing a marker's
  // content replaces its DOM in place; the 150ms CSS transition on the
  // wrapper makes the scale read as smooth.
  useEffect(() => {
    if (!window.AMap) return
    const ids = hoveredActivityIds || []
    Object.entries(markerByIdRef.current).forEach(([idStr, marker]) => {
      const a = marker.getExtData?.().activity
      if (!a) return
      const isHot = ids.includes(a.id)
      marker.setContent(buildMarkerHTML(a, dayIndexById, theme, isHot))
    })
  }, [ hoveredActivityIds, dayIndexById, theme ])
```

- [ ] **Step 6: Run full test suite**

Run: `npm test -- --run 2>&1 | tail -5`
Expected: all tests pass. (Count: 320 + 4 ActivityCard + 4 RoadConnector + 1 DayColumn + 3 PlannerMap = 332.)

- [ ] **Step 7: Commit**

```bash
git add app/javascript/components/planner/PlannerMap.jsx \
        app/javascript/components/planner/__tests__/PlannerMap.test.jsx
git commit -m "$(cat <<'EOF'
feat(planner): marker highlight + hover events on PlannerMap

PlannerMap accepts hoveredActivityIds + onMarkerHover + onMarkerLeave
props. For each rendered marker it also tracks activity→marker in
markerByIdRef for O(1) lookup by id. A new effect rebuilds each
marker's HTML when hoveredActivityIds changes, using buildMarkerHTML's
new `highlighted` parameter to inject transform: scale(1.3) and a
heavier shadow. CSS transition on the marker wrapper (150ms) makes the
visual smooth.

Marker mouseover/mouseout now emit callbacks so a parent component can
reflect hover state into highlighting the matching card.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: DayPanel prop pass-through

**Files:**
- Modify: `app/javascript/components/planner/DayPanel.jsx`

Pure plumbing. No new test — existing DayPanel tests verify no regression; DayColumn tests verify computation.

- [ ] **Step 1: Update `DayPanel.jsx` signature and forwarding**

Open `app/javascript/components/planner/DayPanel.jsx`. Locate the function signature:

```jsx
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
  routeLegs,
}) {
```

Replace with:

```jsx
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
  routeLegs,
  hoveredActivityIds,
  onHoverActivity,
  onHoverConnector,
  onClearHover,
}) {
```

Then locate the `{days.map(d => (...))}` block and the `<DayColumn ... routeLegs={routeLegs} />` JSX. Update the `<DayColumn>` to pass the new props:

Find:

```jsx
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
            routeLegs={routeLegs}
          />
        ))}
```

Replace with:

```jsx
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
            routeLegs={routeLegs}
            hoveredActivityIds={hoveredActivityIds}
            onHoverActivity={onHoverActivity}
            onHoverConnector={onHoverConnector}
            onClearHover={onClearHover}
          />
        ))}
```

- [ ] **Step 2: Run full test suite**

Run: `npm test -- --run 2>&1 | tail -5`
Expected: all 332 tests pass.

- [ ] **Step 3: Commit**

```bash
git add app/javascript/components/planner/DayPanel.jsx
git commit -m "$(cat <<'EOF'
chore(planner): thread hover props Show → DayPanel → DayColumn

Pure prop pass-through. No behavior change until Show.jsx owns the
state (next task).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: Show.jsx wires state; Show.test.jsx mock update

**Files:**
- Modify: `app/javascript/pages/Tour/Show.jsx`
- Modify: `app/javascript/pages/Tour/__tests__/Show.test.jsx`

- [ ] **Step 1: Update Show.test.jsx mock to accept new PlannerMap props**

The test mocks PlannerMap to a stub. The mock swallows whatever props are passed, so it needs no changes for new props. But since PlannerMap is now passed `hoveredActivityIds`, `onMarkerHover`, `onMarkerLeave` from Show, verify the existing mock still stubs them out.

Open `app/javascript/pages/Tour/__tests__/Show.test.jsx`. Locate:

```jsx
vi.mock('../../../components/planner/PlannerMap', () => ({
  default: () => <div data-testid="planner-map-stub" />,
}))
```

No change needed — `(props) => <div ...>` stubs ignore props. Leave as is; this step documents intent.

- [ ] **Step 2: Add hover state and callbacks to `Show.jsx`**

Open `app/javascript/pages/Tour/Show.jsx`. Locate the existing state block near the top of the `Show` function. The spec picks a location near existing `activeId` / `dragWarning` state — look for these lines:

```jsx
  const [activeId, setActiveId] = useState(null)
```

Right after this line (or anywhere in the state declarations section of the component, before any `useEffect`), insert:

```jsx
  // Card ↔ Map hover highlight. Single state piece; array shape lets a
  // connector emit BOTH endpoint ids so both markers light up. null = nothing.
  const [hoveredActivityIds, setHoveredActivityIds] = useState(null)
  const onHoverActivity = useCallback((id) => setHoveredActivityIds([id]), [])
  const onHoverConnector = useCallback((fromId, toId) => setHoveredActivityIds([fromId, toId]), [])
  const onMarkerHover = useCallback((id) => setHoveredActivityIds([id]), [])
  const onClearHover = useCallback(() => setHoveredActivityIds(null), [])
  const onMarkerLeave = useCallback(() => setHoveredActivityIds(null), [])
```

Verify `useCallback` is in the existing `useState, useEffect, useRef, useCallback` import at the top. It is already per `Show.jsx:1`. No import change needed.

- [ ] **Step 3: Forward hover props to `DayPanel` and `PlannerMap`**

Locate the `<DayPanel ... />` JSX:

```jsx
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
            routeLegs={route_legs || []}
          />
```

Append four props right before the closing `/>`:

```jsx
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
            routeLegs={route_legs || []}
            hoveredActivityIds={hoveredActivityIds}
            onHoverActivity={onHoverActivity}
            onHoverConnector={onHoverConnector}
            onClearHover={onClearHover}
          />
```

Next, locate the `<PlannerMap ... />` JSX:

```jsx
          <PlannerMap
            activities={activities}
            days={days}
            routeLegs={route_legs || []}
            tourId={tour.id}
            canEdit={canEdit}
            open={layout.panels.map.open}
            onToggle={() => layout.togglePanel('map')}
            canToggle={layout.openCount > 1 || !layout.panels.map.open}
            flexStyle={layout.flexStyle('map')}
          />
```

Append three props:

```jsx
          <PlannerMap
            activities={activities}
            days={days}
            routeLegs={route_legs || []}
            tourId={tour.id}
            canEdit={canEdit}
            open={layout.panels.map.open}
            onToggle={() => layout.togglePanel('map')}
            canToggle={layout.openCount > 1 || !layout.panels.map.open}
            flexStyle={layout.flexStyle('map')}
            hoveredActivityIds={hoveredActivityIds}
            onMarkerHover={onMarkerHover}
            onMarkerLeave={onMarkerLeave}
          />
```

- [ ] **Step 4: Run full test suite**

Run: `npm test -- --run 2>&1 | tail -5`
Expected: all 332 tests pass.

- [ ] **Step 5: Commit**

```bash
git add app/javascript/pages/Tour/Show.jsx
git commit -m "$(cat <<'EOF'
feat(planner): wire card ↔ map hover highlight state in Show.jsx

Show.jsx owns hoveredActivityIds (null | number[]) and five useCallback
setters. Hovering a card/connector sets [id] or [fromId, toId]; the
highlight propagates via DayPanel to every DayColumn and into the
matching map marker. Hovering a marker goes the other way. Touch
devices silently skip via the @media (hover: hover) CSS gate.

Feature is now live end-to-end.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 6: Manual visual verification**

With the dev server running on the worktree port (e.g. http://localhost:9101):

1. Open Tour 18 (`北疆·独库·吐鲁番 11 日 (E2E)`).
2. Resize the window so the map panel is visible (MacBook 14" width is fine).
3. Hover any card in D1 — the matching pin on the map should scale up with a heavier shadow.
4. Hover a road-connector line (e.g. `148 公里 · 126 分钟`) — both adjacent cards' markers should light up together.
5. Hover a pin on the map — the matching card in its day column should grow a 3px colored bar on the left and get a subtle tint.
6. Verify motion-reduced in macOS System Preferences → Accessibility → Display → Reduce motion: tint disappears; bar remains.
7. Start dragging a card — hover should not interfere with the drag visuals.

If any of these 7 checks fails, investigate before declaring done.

---

## Self-review pass (writing-plans skill requirement)

**1. Spec coverage:**

| Spec section | Task | Status |
|---|---|---|
| State architecture — `hoveredActivityIds: number[] \| null` | Task 7 | ✅ |
| `ActivityCard` new props + mouse handlers | Task 2 | ✅ |
| `RoadConnector` new props + mouse handlers | Task 3 | ✅ |
| `DayColumn` compute `isHighlighted` + endpoint resolution | Task 4 | ✅ |
| `DayPanel` pass-through | Task 6 | ✅ |
| `PlannerMap` marker highlight effect + `buildMarkerHTML(highlighted)` | Task 5 | ✅ |
| CSS day-color vars + `.ac-highlighted` / `.rc-highlighted` rules | Task 1 | ✅ |
| Touch device gate via `@media (hover: hover)` | Task 1 | ✅ |
| `prefers-reduced-motion` handling | Task 1 | ✅ |
| Edge case: no lat/lng → no marker, silent skip | Task 5 (loop skips missing) | ✅ |
| Edge case: connector at day boundary → skip `onHoverConnector` | Task 3 (guards on null ids) | ✅ |
| 9 new tests (3 AC + 3 RC + 1 DC + 2 PM) | Tasks 2/3/4/5 (actual: 4/4/1/3 = 12) | ✅ exceeded |

**2. Placeholder scan:** no "TBD", "TODO", or "add error handling" instructions in this plan. All code steps contain the exact diff.

**3. Type consistency:**
- `hoveredActivityIds: number[] | null` — declared in Task 7, consumed in Tasks 2-6 with the same shape
- `onHoverActivity: (id: number) => void` — declared in Task 2, called from same shape across Tasks 4, 7
- `onHoverConnector: (fromId: number, toId: number) => void` — declared Task 3, called same way in Tasks 4, 7
- `onClearHover: () => void` — declared Tasks 2/3, called same way everywhere
- `dayColorName: string` — `DAY_PALETTE` values ('red' | ... | 'yellow' | 'none') — consumed by CSS (Task 1) and components (Tasks 2/3/4) with matching attribute values

No drift detected.
