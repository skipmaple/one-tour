# Card ↔ Map Bidirectional Hover Highlight — Design Spec

**Status:** Draft
**Author:** drewlee (brainstormed 2026-04-20 with Claude)
**Scope:** Planner — `ActivityCard`, `RoadConnector`, `PlannerMap`

---

## Problem

The planner shows activities in two places simultaneously: the day-column cards (left half of screen) and the map panel (right half). Each has good information on its own, but there is **no visual link between them**. A user looking at a yellow-pastel food card has no way to tell which pin on the map it is, short of reading the address meta. Similarly, hovering a pin on the map doesn't tell you which day / which position in the list the activity lives in.

In a dense trip (11 days × ~10 activities = 100+ markers), this gap costs real time: users zoom in on a pin, read the label, then scan down the column looking for a matching name. This is the kind of low-floor UX upgrade where "Card ↔ Map bidirectional hover highlight" pays back many times its build cost.

## Goal

- **Hover any card or road connector** in the day column → the matching marker on the map pops out (scale + heavier shadow).
- **Hover any marker** on the map → the matching card gets a colored left-bar accent matching the day palette.
- **Hover a road connector** (which typically has no lat/lng of its own) → highlight **both endpoint markers** (previous and next card's lat/lng), since a road segment visually connects two points.
- No behavioral change during drag (dnd-kit already owns that interaction surface).
- Desktop-only via `@media (hover: hover)` — touch devices have no hover; the feature silently disables.
- Zero new dependencies.

## Out of scope (explicitly)

- **Backlog panel (`BacklogList`)** — will be phase 2. Cards in the backlog panel don't yet wire into the hover state.
- **Polyline highlight on hover** (hovering card/connector → route line thickens). Different component layer, different data shape; defer.
- **Scrolling the card into view** when a map marker is hovered. Not needed for v1.
- **Mobile tap-to-highlight.** If there's demand later, a separate design pass — hover semantics translate awkwardly to touch.

## Rule (when highlight applies)

| Source | Target |
|---|---|
| hover `ActivityCard` (has lat/lng) | that activity's marker scales up |
| hover `ActivityCard` (no lat/lng) | card's own left-bar lights up; no marker in map → silent no-op |
| hover `RoadConnector` (activity-backed, between two card-backed activities) | both endpoint markers scale up + connector's own left-bar lights up |
| hover `RoadConnector` (synthesized, between two card-backed activities) | same: both endpoints light up |
| hover map marker (activity has day assigned) | that activity's card in its day column lights up |
| hover map marker (backlog activity, `day_id=null`) | phase 2 — no target yet |
| drag in progress (`activeId !== null`) | hover updates suppressed; drag owns the UI |

## Architecture

### State

A single piece of React state in `Show.jsx`:

```js
const [hoveredActivityIds, setHoveredActivityIds] = useState(null)
// shape: null | number[]
//   null       → nothing hovered
//   [id]       → single card/activity hovered
//   [id1, id2] → road connector hovered (two endpoints)
```

`null` vs `[]` — use `null` explicitly for "no hover" so we never waste time on an empty iteration.

### Callbacks (all created via `useCallback` to keep reference stable across renders)

```js
const onHoverActivity = (id) => setHoveredActivityIds([id])
const onHoverConnector = (fromId, toId) => setHoveredActivityIds([fromId, toId])
const onClearHover     = ()            => setHoveredActivityIds(null)
```

Passed down as props.

### Data flow

```
Show.jsx
  ├─ [hoveredActivityIds, setHover...]
  ├──> DayPanel  (props: hoveredActivityIds, onHoverActivity, onHoverConnector, onClearHover)
  │      └──> DayColumn
  │             ├──> ActivityCard (isHighlighted, onHoverActivity, onClearHover)
  │             └──> RoadConnector (isHighlighted, onHoverConnector,  onClearHover, fromActivityId, toActivityId)
  │
  └──> PlannerMap (hoveredActivityIds, onMarkerHover, onMarkerLeave)
         └──> useEffect([hoveredActivityIds]) → iterate markers, call setContent with highlight state
         └──> marker creation loop: marker.on('mouseover', () => onMarkerHover(activity.id))
                                    marker.on('mouseout',  onMarkerLeave)
```

### Why single state vs per-card boolean

Each card needs a boolean `isHighlighted`, but storing booleans on every card would mean N state updates per hover. A single `hoveredActivityIds` state recomputes to N booleans during render — cheaper and simpler. Standard React lifted-state pattern.

### Why array not set

Ordering doesn't matter, only membership. Arrays are easier to log/inspect than Sets and `.includes(id)` on a 0-or-2-element array is trivially fast. No need to optimize to a Set.

## Component: `ActivityCard`

### New props

- `isHighlighted: boolean` — drives the `.ac-highlighted` class.
- `onHoverActivity: (id: number) => void` — called on `mouseenter`.
- `onClearHover: () => void` — called on `mouseleave`.

### Implementation

Add `onMouseEnter` / `onMouseLeave` to the card root element. Append `ac-highlighted` to `cardClasses` when `isHighlighted`. Add a `data-day-color` attribute for CSS custom-property lookup (computed from `dayIndex` via `DAY_COLOR(dayIndex)` from `PlannerMap.jsx`).

```jsx
<div
  ref={setRef}
  className={cardClasses(activity, [extra, isHighlighted && 'ac-highlighted'].filter(Boolean).join(' '))}
  data-day-color={dayColorName}   // 'red' | 'blue' | ... | 'none'
  onMouseEnter={() => onHoverActivity?.(activity.id)}
  onMouseLeave={() => onClearHover?.()}
  {...dragAttributes} {...dragListeners}
>
  ...
</div>
```

`dayColorName` comes from the parent (`DayColumn`) which knows `day.day_index`.

## Component: `RoadConnector`

### New props

- `isHighlighted: boolean`
- `onHoverConnector: (fromId: number, toId: number) => void`
- `onClearHover: () => void`
- `fromActivityId: number | null` — id of the ActivityCard before this connector in the day
- `toActivityId: number | null` — id of the ActivityCard after this connector in the day

### Implementation

Same pattern as ActivityCard: add `onMouseEnter` calling `onHoverConnector(fromActivityId, toActivityId)` (only when both ids present), `onMouseLeave` calling `onClearHover`. Append `rc-highlighted` class.

If either endpoint id is missing (edge of day, or the pair can't be resolved), **don't call** `onHoverConnector` at all — hovering an orphan connector simply lights up its own bar.

## Component: `DayColumn`

### Changes

- Receives new props from DayPanel: `hoveredActivityIds, onHoverActivity, onHoverConnector, onClearHover`.
- Per activity during render: compute `isHighlighted = hoveredActivityIds?.includes(a.id) ?? false`.
- When rendering a `RoadConnector` for a road-non-tier1 activity, look up the previous and next **ActivityCard** (non-connector) activity in the day ordering; pass those ids as `fromActivityId` / `toActivityId`.
- Pass `day.day_index` → `DAY_COLOR(dayIndex)` → `dayColorName` prop to ActivityCard.

## Component: `DayPanel`

Simple prop pass-through. Add `hoveredActivityIds` + 3 callbacks to its props signature; forward to each `DayColumn`.

## Component: `PlannerMap`

### New props

- `hoveredActivityIds: number[] | null`
- `onMarkerHover: (id: number) => void`
- `onMarkerLeave: () => void`

### Marker lookup ref

Marker creation currently only stores markers in `markersRef.current` (array). Add a sibling `markerByIdRef.current: { [activity.id]: AMap.Marker }` for O(1) lookup in the highlight effect. Populate during marker creation; clear between `useEffect` runs.

### Highlight effect

```jsx
useEffect(() => {
  const ids = hoveredActivityIds || []
  Object.values(markerByIdRef.current).forEach(marker => {
    const a = marker.getExtData?.() // activity stashed at creation time
    if (!a) return
    const isHot = ids.includes(a.id)
    marker.setContent(buildMarkerHTML(a, dayIndexById, theme, isHot))
  })
}, [hoveredActivityIds])  // eslint-disable-line react-hooks/exhaustive-deps
```

`setContent` replaces the marker's DOM. AMap keeps the marker position stable, so the visual is an in-place swap. With a CSS transition on the wrapper, it reads as a smooth scale.

### Marker mouse events

Inside the existing marker creation forEach, add:

```js
marker.on('mouseover', () => onMarkerHover?.(a.id))
marker.on('mouseout',  () => onMarkerLeave?.())
```

Guard `onMarkerHover` / `onMarkerLeave` being undefined when PlannerMap is rendered in a place that doesn't pass them (keeps component tolerant).

### `buildMarkerHTML` signature

Add a fourth parameter: `highlighted: boolean`. When true:

```js
`<div style="
  width: 28px; height: 28px;
  background: ${hex};
  border: 2px solid white;
  border-radius: 50%;
  box-shadow: ${highlighted ? '0 4px 12px rgba(0,0,0,0.4)' : '0 2px 4px rgba(0,0,0,0.3)'};
  transform: ${highlighted ? 'scale(1.3)' : 'scale(1)'};
  transition: transform 150ms ease, box-shadow 150ms ease;
  ...
">D${day_index}</div>`
```

Same additional lines for the backlog (grey dashed) marker variant: scale + heavier shadow when highlighted. The backlog case won't fire until phase 2 but wiring the HTML now is free.

## CSS additions (`activity-card.css`)

```css
/* Day color → CSS custom property. Matches DAY_PALETTE in PlannerMap.jsx.
   Source of truth is the JS palette; these must stay in sync. */
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

@media (hover: hover) {
  .ac-card.ac-highlighted,
  .rc-line.rc-highlighted {
    box-shadow: inset 3px 0 0 var(--day-accent, #6b7280);
  }
  .ac-card.ac-highlighted {
    /* subtle tint — color-mix supported Chrome 111+, Firefox 113+ */
    background-color: color-mix(in srgb, var(--day-accent) 4%, white);
  }
}

/* Respect reduced motion — skip the tint, keep only the bar. */
@media (prefers-reduced-motion: reduce) {
  .ac-card.ac-highlighted { background-color: initial; }
}
```

Using `inset box-shadow` (not `border-left`) avoids pushing card content and works with the existing tier1 gradient on road cards.

## Edge cases

| Case | Behavior |
|---|---|
| Activity with no lat/lng, hovered | Card bar lights up; no marker to highlight → no-op in map effect |
| Connector with at least one endpoint missing (day boundary) | Skip `onHoverConnector` call; connector's own bar still lights up |
| Drag in progress (`activeId != null`) | `onMouseEnter` still fires but `handleDragEnd` and drag overlay are already dominant; highlight visible only after drag ends. No explicit suppression code — just accept the brief co-occurrence. |
| Same activity hovered repeatedly | `setState` with same array skips re-render (React shallow compare of primitives); **but** array identity differs each call. Use `useCallback` + cheap comparison or accept a no-op render. Not a perf concern at this scale. |
| PlannerMap unmounted during hover | hover state remains set; ignored. Reopening map re-derives from state. |
| Touch device | `@media (hover: hover)` gates CSS; JS handlers still fire harmlessly on tap (no visible change). No code path to exclude. |

## Testing

### `ActivityCard.test.jsx` (+3 tests)

1. **Renders `.ac-highlighted` when `isHighlighted=true`**
2. **`onHoverActivity` fires with activity.id on mouseenter**
3. **`onClearHover` fires on mouseleave**

### `RoadConnector.test.jsx` (+3 tests)

1. **Renders `.rc-highlighted` when `isHighlighted=true`**
2. **`onHoverConnector` fires with (fromId, toId) on mouseenter when both ids present**
3. **`onHoverConnector` NOT called when `fromActivityId` is null**

### `DayColumn.test.jsx` (+1 test)

1. **Given `hoveredActivityIds=[42]`, the ActivityCard whose activity.id is 42 receives `isHighlighted={true}`; others receive `isHighlighted={false}`**

### `PlannerMap.test.jsx` (+2 tests)

1. **When `hoveredActivityIds` prop changes, each marker's `setContent` is called with the new highlight state** (mock AMap SDK; verify setContent called with expected HTML substring `scale(1.3)`)
2. **Marker's registered `mouseover` handler calls `onMarkerHover(activity.id)`**

### Manual verification

- Open Tour 18 (`北疆·独库 E2E`) on local dev, resize for 4-panel layout with all panels visible
- Hover a card in D1 → corresponding marker on the map scales + shadow deepens; only one at a time
- Hover the `148 公里 · 126 分钟` connector in D1 → both `乌鲁木齐 → 百丽丹霞` endpoints' markers highlight (connector activity is a road w/o lat/lng, but endpoint cards have coords)
- Hover a marker on the map → matching card in its day column grows a 3px day-color bar on the left
- Verify reduced-motion setting in macOS system prefs → only the bar, no tint
- Drag a card with another card hovered → hover doesn't interfere with drag

## File structure

**Modified files:**
- `app/javascript/pages/Tour/Show.jsx` — state + callbacks + prop forwarding
- `app/javascript/components/planner/DayPanel.jsx` — prop pass-through
- `app/javascript/components/planner/DayColumn.jsx` — compute `isHighlighted`, look up from/to ids for connectors, pass dayColorName
- `app/javascript/components/planner/ActivityCard.jsx` — mouse handlers, `isHighlighted` class, `data-day-color` attr
- `app/javascript/components/planner/RoadConnector.jsx` — mouse handlers, `isHighlighted` class, `data-day-color` attr
- `app/javascript/components/planner/PlannerMap.jsx` — `markerByIdRef`, highlight effect, marker mouse events, `buildMarkerHTML(highlighted)` signature
- `app/javascript/styles/activity-card.css` — day-color CSS vars + `.ac-highlighted` + `.rc-highlighted` rules
- All four `__tests__/*.test.jsx` listed above

**Not modified:**
- `BacklogList.jsx` — phase 2
- DB schema / backend — pure frontend feature

## Migration / rollout

- Zero data migration
- No feature flag — low risk, easily revertable (state + a few props)
- Rollback: revert the touched files; CSS rules are additive and removing them is safe

## Future work

- **Phase 2: Backlog panel hover**
  Extend `BacklogList` with the same hover hooks. Backlog cards already have `data-day-color="none"` (grey) — hook them up to `onHoverActivity`/`onClearHover`. Map's grey dashed markers get the same scale treatment when their activity id is in `hoveredActivityIds`.

- **Polyline emphasis**
  On card/connector hover, find the polyline pair `{fromId, toId}` and bump `strokeWeight` temporarily. Requires storing polylines by pair-key, not just as an array. Useful but independent of this design.

- **Scroll card into view**
  When hovering a map marker and the matching card is scrolled out of view in its day column, `scrollIntoView({ block: 'nearest' })`. Nice polish; needs a `ref` per card managed in state.

## Open questions (none blocking)

- Do we want the map effect to ALSO dim non-hovered markers slightly (opacity 0.7) to push the highlighted one forward more? — Could be added in a follow-up if the current scale+shadow isn't enough.
- Should the connector's own bar light up only the `from` half or full length? Spec says full length (simpler, more visible). If it reads too heavy, can scope to first half later.

## Success criteria

- Hovering any card in any day column surfaces the matching marker within ~150ms
- Hovering any marker surfaces the matching card with the colored bar within ~150ms
- Road connector hover highlights both endpoint markers
- Feature silently disables on touch devices
- No regression in drag, drop, or click-to-open-drawer flows
- 9+ new tests pass; existing tests unchanged
- No measurable change in initial render perf (100+ activities)
