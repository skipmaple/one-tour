# Road Connector Line — Design Spec

**Status:** Draft
**Author:** drewlee (brainstormed 2026-04-20 with Claude)
**Scope:** Planner (`DayColumn` rendering), not Timeline or Backlog

---

## Problem

After the Fizzy-inspired ActivityCard redesign, every activity — including every road/transit segment — renders as a full 60px card. In high-density days (10+ activities, common for long trips), half the column is consumed by "A → B" transit records that are:

1. **Mundane logistics, not plans** — the user cares about the destinations, not the per-segment drive data.
2. **Hard to maintain** — when users reorder destinations, the transit records between them go stale. Asking users to manually fix every `km / drive_min` on every reorder is impractical.

Meanwhile, **some roads ARE the plan** — 独库公路, 318 国道, 滇藏线. For these, the drive itself is the destination (景观公路), and deserves a full card.

The redesign needs to distinguish these two cases.

## Goal

- `kind:road + citizen_level:tier_one` stays as a full ActivityCard (景观公路)
- All other road activities render as a slim **connector line** between the cards around them (20px instead of 60px — ~2/3 column height reclaimed)
- Transit data (km, duration) comes from whatever data source makes sense without requiring user maintenance on reorder
- No DB schema changes; no data migration; zero-breakage on existing tours

## Rule (rendering decision table)

Given a list of activities ordered by `position` in a day:

| condition | render |
|---|---|
| `kind != 'road'` | ActivityCard (60px, unchanged) |
| `kind == 'road' && citizen_level == 'tier_one'` | ActivityCard (60px — 景观公路) |
| `kind == 'road' && citizen_level != 'tier_one'` | RoadConnector (~20px, activity-backed, interactive) |
| (between two adjacent ActivityCards with no road activity between them, if `route_legs` has an entry for that pair) | RoadConnector (~20px, synthesized, read-only) |

The first three branches on a single activity's own fields. The fourth is an inter-activity synthesis: look at the ordered render list, and where two ActivityCards are adjacent with no connector between them, check `route_legs` for the pair and insert a synthesized connector if found.

## Component: `RoadConnector`

New file: `app/javascript/components/planner/RoadConnector.jsx`

### Visual spec (style B from brainstorm mockup)

- **Container**: 2px dashed left border (`rgba(0,0,0,0.18)`), `margin-left: 12px`, `padding: 6px 8px 6px 18px`, min-height `24px`
- **Content**: inline flex — car icon (12px) + distance/duration text (`font-size: 10.5px`, `color: #6b7280`)
- **No card background, no box shadow** — visually a "whisper" between cards, not an equal to them
- **Cursor**: `grab` when activity-backed (matches card); `default` when synthesized
- **dnd-kit integration**:
  - Activity-backed: use existing `useDraggable` / `useDroppable` hooks with same data shape as ActivityCard
  - Synthesized: not draggable, not droppable (`pointer-events: none`); drags pass through to the card below

### Chinese unit formatting

- **Distance**: `X 公里` (e.g., `28 公里`, `150 公里`)
- **Duration** (reuse `formatDuration` from ActivityCard, adapt to full Chinese):
  - `< 60 min` → `X 分钟`
  - `>= 60 && % 30 == 0` → `X 小时` or `X.Y 小时` (e.g., `2 小时`, `1.5 小时`, `2.5 小时`)
  - `else` → `X 分钟` (e.g., `45 分钟`, `100 分钟`)
- **Combined display**: `{distance} · {duration}` with middle dot separator, same as card meta
- When either field is missing, show only the present one; when both missing, show only car icon + dashed line (no text)

### Data source priority

For an **activity-backed** RoadConnector (a road activity record with non-tier1 citizen level):
1. Prefer `activity.details.km` and `activity.details.drive_min` (user/AI-filled)
2. If either is missing, fallback to the `route_leg` between the previous and next non-road activities in the day
3. If still missing, render minimal placeholder (virtual line + car icon, no text)

For a **synthesized** RoadConnector (no road activity between two adjacent ActivityCards):
1. Look up `route_legs` for the pair `(previousActivity.id, nextActivity.id)`
2. If found, render km + duration from that route_leg
3. If not found, do not render the synthesized connector at all (cards stack directly — no placeholder)

### Interactivity

- **Activity-backed connector click** → opens ActivityDrawer for that road activity (same as ActivityCard click)
- **Activity-backed connector drag** → same as ActivityCard drag (reorderable)
- **Synthesized connector click** → no-op
- **Synthesized connector drag** → no-op (pointer-events: none)

## Rendering pipeline in `DayColumn`

Current code (simplified):
```jsx
{activities.map(a => <ActivityCard key={a.id} activity={a} ... />)}
```

New code (pseudocode):
```jsx
const items = []
for (let i = 0; i < activities.length; i++) {
  const a = activities[i]
  const isRoadNonTier1 = a.kind === 'road' && a.citizen_level !== 'tier_one'

  if (isRoadNonTier1) {
    items.push(<RoadConnector key={a.id} activity={a} routeLegs={routeLegs} ... />)
  } else {
    // Before emitting this card, check if we need a synthesized connector
    // between the previously-emitted card and this one
    const prevVisibleCard = findPreviousNonConnectorCard(items)
    if (prevVisibleCard) {
      const leg = findRouteLeg(routeLegs, prevVisibleCard.activity.id, a.id)
      if (leg) {
        items.push(<RoadConnector key={`synth-${prevVisibleCard.activity.id}-${a.id}`} synthetic legData={leg} />)
      }
    }
    items.push(<ActivityCard key={a.id} activity={a} ... />)
  }
}
return items
```

Important: the synthesis only runs between two **visible cards**. If a road+non-tier1 activity is between them (rendering as an activity-backed connector), the synthesized connector is suppressed — we don't double up.

## Route leg computation (unchanged behavior)

- No new auto-compute triggers. User still clicks **批量算路** on the main map to populate `route_legs`.
- Rationale for this PR: scope control. Auto-recompute on drag-end is desirable but needs rate-limiting (Amap 3 QPS) and is its own design decision. Note as future work.
- When user moves activities around and route_legs become stale, the connector lines fall back gracefully (prefer activity.details, then route_leg, then nothing).

## File structure

**New files:**
- `app/javascript/components/planner/RoadConnector.jsx` — component
- `app/javascript/components/planner/__tests__/RoadConnector.test.jsx` — tests
- `app/javascript/utils/formatDistance.js` — if we unify distance/duration formatting across card + connector (OPTIONAL — inline in RoadConnector if YAGNI)

**Modified files:**
- `app/javascript/components/planner/DayColumn.jsx` — rendering loop with branching + synthesis
- `app/javascript/styles/activity-card.css` — add `.rc-*` (road-connector) prefixed CSS rules
- `app/javascript/components/planner/__tests__/DayColumn.test.jsx` — assertions for branch logic + synthesis

**Not modified:**
- `app/javascript/components/planner/ActivityCard.jsx` — branch happens at DayColumn level
- `app/models/activity.rb`, DB schema — no changes
- `app/javascript/components/planner/BacklogList.jsx` — backlog doesn't typically show road activities; if it did, same rule could apply but out of scope for this PR
- `app/javascript/components/timeline/*.jsx` — timeline has its own card component; out of scope
- `app/javascript/pages/Tour/Show.jsx` — `route_legs` already passed to planner tree; verify only

## CSS additions to `activity-card.css`

```css
/* Road connector line — inline between ActivityCards. */
.rc-line {
  display: flex;
  align-items: center;
  gap: 6px;
  min-height: 24px;
  margin-bottom: 6px;
  padding: 6px 8px 6px 18px;
  margin-left: 12px;
  border-left: 2px dashed rgba(0, 0, 0, 0.18);
  font-size: 10.5px;
  color: #6b7280;
  font-weight: 500;
  flex-shrink: 0; /* same fix as .ac-card */
  cursor: grab;
}

.rc-line.rc-synthesized {
  cursor: default;
  pointer-events: none;
  opacity: 0.85;
}

.rc-line.rc-dragging { opacity: 0.4; cursor: grabbing; }

.rc-line svg {
  width: 12px;
  height: 12px;
  color: #9ca3af;
  flex-shrink: 0;
}

.rc-line .rc-empty {
  color: #bcc2cc;
  font-style: italic;
}
```

## Test plan

### `RoadConnector.test.jsx` (new — 8 tests)
1. Renders distance and duration from activity.details (e.g., `28 公里 · 40 分钟`)
2. Renders only distance when duration missing
3. Renders only duration when distance missing
4. Renders no text (icon + line only) when both missing
5. Falls back to route_leg when activity.details.km missing but route_leg present
6. Synthesized mode: renders from leg prop, applies `.rc-synthesized` class
7. Synthesized mode: `pointer-events: none` means click does nothing (use `userEvent.click` + assert onClick not fired)
8. Activity-backed mode: click opens drawer (onClick fires with activity.id)

### `DayColumn.test.jsx` (modify — 3 new assertions)
1. road+tier1 activity renders as ActivityCard (not connector)
2. road+non-tier1 activity renders as RoadConnector (not card)
3. Between two non-road cards with route_leg available, synthesized connector appears

### Format helper tests (if extracted)
- `formatDistance(28)` → `28 公里`
- `formatDuration(40)` → `40 分钟`
- `formatDuration(90)` → `1.5 小时`
- `formatDuration(150)` → `2.5 小时`
- `formatDuration(null)` → `''`

## Visual verification checklist

Run `bin/worktree-dev up` and open Tour 16 (川西):

- [ ] If seed has road+non-tier1 activities, they render as dashed connector lines with `公里 · 分钟` text
- [ ] Cards stack naturally around connectors
- [ ] Day column height is visibly reduced compared to before
- [ ] If a tour has tier1 road (manually create one for test), it renders as full card
- [ ] Click connector → drawer opens with correct activity
- [ ] Drag connector → reorders the same way cards do
- [ ] Missing `details.km/drive_min` → falls back to route_leg data if present
- [ ] No route_leg and no details → connector shows only car icon + line, no broken text

## Migration / rollout

- **Zero data migration**. Existing `kind:road + non-tier1` activities are automatically picked up by the new rendering branch and shown as connectors.
- **User impact**: users with these activities will see them shrink from 60px cards to 20px connectors. Content remains; interaction (click/drag) preserved. This is the intended improvement.
- **Rollback**: revert the DayColumn + CSS changes; no data was mutated.

## Out of scope (explicitly)

- **Auto route_leg recompute on drag** — out of scope. User still clicks 批量算路.
- **Unifying ActivityCard duration format with Chinese units** — the existing card meta uses `4h` / `90分` mix. Changing that is a separate, independent fix.
- **Timeline view** — has its own card component, not touched.
- **Backlog** — backlog doesn't typically contain road activities; if a user drags one there, it still renders as a card (since DayColumn is the only place this rule applies). That's acceptable inconsistency for v1.
- **Deprecating road+non-tier1 creation** — the drawer still allows creating them. Long-term, if we move to pure route_legs, we'd disable creation; not this PR.
- **Bulk migration to delete orphaned road activities** — user can delete one-by-one via drawer today. A bulk tool is future work.

## Open questions (none blocking)

- Should synthesized connectors be draggable to *insert a new road activity* between the cards? (I.e., drag-to-create). Leaning no for v1.
- If an activity-backed connector has BOTH its own details AND a route_leg with different values, do we warn / flag? Leaning no (activity wins silently).

## Success criteria

- In a day with 11 activities (3 destinations + 8 road segments), the column height reduces from ~800px to ~400px.
- No test regressions; 20+ new component tests pass.
- Users can still click / drag road segments (reorder preserved).
- Visually in 14" MacBook: the column reads as "destinations + light transit annotations", not "11 equal cards".
