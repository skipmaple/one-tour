# Backlog Hover Highlight — Design Spec

**Status:** Draft
**Author:** drewlee (brainstormed 2026-04-20 with Claude)
**Scope:** Planner — extend Phase B's card ↔ map hover highlight to the `BacklogList` panel

---

## Problem

Phase B ([2026-04-20-card-map-hover-highlight-design.md](./2026-04-20-card-map-hover-highlight-design.md)) shipped bidirectional hover highlighting between day-column cards/connectors and map markers, but explicitly deferred the `BacklogList` panel as "Phase 2". Hovering a card in the backlog does not light up its marker on the map, and hovering a backlog marker on the map (grey dashed circle) does not light up its card in the backlog list. This leaves an asymmetry: once an activity is dragged into a day column it gains the hover affordance; while still in the backlog it doesn't.

The map already draws backlog markers differently (grey dashed 22px circle, no day label), and the existing `buildMarkerHTML` backlog branch already supports `highlighted=true` (scale + heavier shadow). The missing link is purely component-side — BacklogList does not wire its cards into the hover state.

## Goal

- Hover any card in the backlog → the matching grey dashed marker on the map scales up (reusing Phase B's marker-highlight effect).
- Hover a grey dashed backlog marker on the map → the matching card in the backlog panel gets a 3px grey inset left bar (reusing Phase B's `.ac-highlighted` rule with `data-day-color="none"`).
- Behavior when the hovered activity is filtered out of the backlog view (`kindFilter` / `levelFilter` active): silent no-op — filtered-out card isn't in the render loop, so no highlight applies. The user can still see the map marker scale up.
- Preserve all Phase B semantics: desktop-only via `@media (hover: hover)`, reduced-motion drops tint, drag does not suppress hover state (brief co-occurrence accepted).
- Zero new state, zero new callbacks, zero new CSS rules, zero new dependencies. Pure prop pass-through.

## Out of scope (explicitly)

- **Auto-clearing filters when a hidden card's marker is hovered** — user chose silent no-op.
- **Scroll-into-view when a hovered marker's card is off-screen** — consistent with Phase B's day-column behavior (also not implemented).
- **Polyline hover emphasis** — backlog has no polylines. Day-column polylines remain untouched.
- **Changes to the map's marker visuals** — Phase B already covers highlighted backlog markers.

## Rule (what applies when)

| Source | Target |
|---|---|
| hover backlog `ActivityCard` (has lat/lng) | that activity's grey dashed marker scales up |
| hover backlog `ActivityCard` (no lat/lng) | card's own left-bar lights up (grey `#9ca3af`); no marker in map → silent no-op |
| hover grey dashed backlog marker (`activity.day_id = null`) | matching card in BacklogList gets `.ac-highlighted` with grey bar |
| hover backlog marker BUT matching activity is filtered out of backlog view | silent no-op — filtered-out card isn't rendered, so no highlight happens. Map marker still scales (Phase B wiring independent of filter). |
| drag in progress | Phase B semantics: state independent; brief co-occurrence accepted |

## Architecture

### State

No new state. Reuses Phase B's `hoveredActivityIds: null | number[]` in `Show.jsx` and its five `useCallback` setters.

### Data flow

```
Show.jsx (Phase B state + callbacks, unchanged)
  │
  ├─ hoveredActivityIds
  ├─ onHoverActivity
  ├─ onClearHover
  │
  └──> BacklogList  (3 new props passed in)
         └──> ActivityCard  (Phase B API: isHighlighted, onHoverActivity, onClearHover)
              │
              └── Renders with:
                  - data-day-color="none" (ActivityCard default, already in place)
                  - ac-highlighted class when isHighlighted=true
                  - Phase B CSS: box-shadow: inset 3px 0 0 var(--day-accent, #6b7280)
                    with --day-accent: #9ca3af (from Phase B's data-day-color="none" rule)
```

Map side: `PlannerMap`'s `buildMarkerHTML` backlog branch already handles `highlighted=true` (Phase B). `marker.on('mouseover')` is already registered unconditionally (Phase B). No changes needed there.

## Component: `BacklogList`

### New props (on the default export function signature)

- `hoveredActivityIds: number[] | null = null`
- `onHoverActivity: (id: number) => void`
- `onClearHover: () => void`

### Implementation

In the rendering block that maps `filtered.map(a => <ActivityCard ... />)`, pass three additional props to each `ActivityCard`:

```jsx
<ActivityCard
  key={a.id}
  activity={a}
  onClick={onEditActivity}
  readOnly={readOnly}
  isHighlighted={hoveredActivityIds != null && hoveredActivityIds.includes(a.id)}
  onHoverActivity={onHoverActivity}
  onClearHover={onClearHover}
/>
```

**No `dayColorName` prop passed** — ActivityCard's default `'none'` is correct for backlog cards (no day assignment → grey accent).

**Do NOT pass `onHoverConnector`** — backlog cards are never connectors (connectors only exist inside day columns), and ActivityCard doesn't accept that prop anyway.

The `useMemo`-computed `filtered` list already handles the kind/level filter. When an activity is filtered out, it simply isn't in the loop — there's no card to receive `isHighlighted=true`, and the empty hover target is silent.

## Component: `Show.jsx`

### Changes

In the existing `<BacklogList ... />` JSX, append three props (all already exist in Show.jsx from Phase B; no new state or callbacks):

```jsx
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
  hoveredActivityIds={hoveredActivityIds}
  onHoverActivity={onHoverActivity}
  onClearHover={onClearHover}
/>
```

No state changes, no callback changes, no other prop changes.

## CSS

None. Phase B's rules cover:
- `.ac-card[data-day-color="none"] { --day-accent: #9ca3af; }` — grey accent for backlog cards
- `@media (hover: hover) { .ac-card.ac-highlighted { box-shadow: inset 3px 0 0 var(--day-accent, #6b7280); ... } }` — the 3px bar applies regardless of day-color

## Edge cases

| Case | Behavior |
|---|---|
| Filter hides the activity whose marker is hovered | Silent no-op. The card isn't rendered, so `isHighlighted` never reaches it. Map marker still scales (Phase B is filter-independent). |
| Backlog is empty | No cards to hover; the empty-state UI stays as-is. No code path change. |
| Backlog activity has no lat/lng | Card bar lights up on hover; no marker to scale. Same as Phase B day-column behavior. |
| Backlog activity has lat/lng | Map's grey dashed marker (22px, dashed border) scales up with heavier shadow via Phase B's `buildMarkerHTML(..., highlighted=true)`. |
| Hovering card while drag in progress | Hover state sets, drag overlay still dominates visually. Same as Phase B. |
| Touch device | `@media (hover: hover)` CSS gate (Phase B) prevents the bar from appearing. JS handlers still fire but cause no visible change. |

## Testing

### `BacklogList.test.jsx` (+2 tests)

Both tests mount BacklogList with a non-empty activities array and the existing DndContext + MantineProvider test wrappers.

1. **`hoveredActivityIds=[42]` applies .ac-highlighted to the matching card only**
   - Render with two activities `id=42` and `id=99`, `hoveredActivityIds={[42]}`.
   - Assert `.ac-card` for id=42 has class `ac-highlighted`.
   - Assert `.ac-card` for id=99 does not have class `ac-highlighted`.

2. **Card mouseenter calls `onHoverActivity(activity.id)` and mouseleave calls `onClearHover`**
   - Render with `onHoverActivity = vi.fn()` and `onClearHover = vi.fn()`.
   - `fireEvent.mouseEnter(firstCard)` → `onHoverActivity` called with `firstCard.activity.id`.
   - `fireEvent.mouseLeave(firstCard)` → `onClearHover` called.

### Existing tests

No regressions expected. BacklogList's existing tests render without hover props, which defaults cleanly (`hoveredActivityIds` defaults to `null`, no callback props fire).

### Manual verification

- Open Tour 18 on local dev, drag a backlog activity out to a day then back to the backlog (or rely on existing backlog activities if any).
- Hover a card in the backlog → its grey dashed marker on the map should scale up.
- Hover a grey dashed marker on the map → the matching backlog card should grow a 3px grey bar on the left.
- Apply a kind filter that hides the hovered activity, then hover its map marker → backlog panel does not respond (silent). Map marker still scales.

## File structure

**Modified files:**
- `app/javascript/components/planner/BacklogList.jsx` — add 3 new props to signature, pass 3 new props to ActivityCard
- `app/javascript/pages/Tour/Show.jsx` — pass 3 existing props to `<BacklogList>`
- `app/javascript/components/planner/__tests__/BacklogList.test.jsx` — +2 tests

**No new files. No DB / backend changes. No new CSS. No new dependencies.**

## Migration / rollout

- Zero data migration.
- Zero DB impact.
- Rollback: revert the two modified component files and the test file.
- Feature flag: not warranted — the addition is behind the existing `@media (hover: hover)` CSS gate and defaults to a no-op if the props aren't passed.

## Success criteria

- Hovering any backlog card surfaces its grey dashed marker with scale(1.3) within ~150ms.
- Hovering any backlog marker surfaces the matching card with a grey 3px bar within ~150ms.
- Filtered-out activities cause no backlog-side response (silent).
- Existing day-column hover behavior unchanged.
- 2 new tests pass. Existing 333 tests unchanged.
- No CSS changes, no state changes, no new callbacks.

## Future work (not this spec)

- Polyline hover emphasis (deferred from Phase B).
- Scroll-card-into-view when hovered marker's card is off-screen.
- Map marker for currently-filtered activity: could dim slightly to signal "this one's filtered out of your current backlog view" — but would require threading filter state up to PlannerMap, out of scope for this pure pass-through spec.
