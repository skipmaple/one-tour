# Planner as Canonical Tour View — Design

**Date:** 2026-04-21
**Status:** Implemented. Revised 2026-04-22 to reflect PM-feedback deltas applied during rollout (see §PM-feedback deltas).
**Supersedes in part:** [`2026-04-21-unified-sidebar-design.md`](./2026-04-21-unified-sidebar-design.md) — specifically the Task 6 opt-out of `Tour/Show` from `AppShell` is reverted.

## Goal

Eliminate the `宪法 / 规划 / 总览` tab-based navigation inside a tour. Make the planner (`/tours/:id`) the canonical view for any tour; absorb 宪法 and 总览 as in-place surfaces (a left-push drawer for constitution, a full-screen overlay for timeline). Preserve the product intent: constitution is configurable input, planner is the main workspace where users spend most of their time, timeline is a read-only output summary.

## Non-Goals

- Changing the constitution data model or violation-computation logic.
- Changing how `ConstitutionBanner`, `AcknowledgeModal`, or `ChatPanel` integrations work — they continue to trigger from inside the new constitution drawer.
- Changing how `ExpenseDrawer`, `MembershipDrawer`, `ActivityDrawer`, `TourSettingsModal`, or `DayEditModal` behave — these existing planner surfaces stay as-is.
- Redesigning the timeline's internal content (TourSummaryBar / RhythmBar / TimelineDayColumn / DayDetailPanel) — only its host changes.

## Current State (after unified-sidebar spec)

- `AppShell` wraps every Inertia page except `Auth/Login` and `Tour/Show` (which opt out via `Show.layout = (page) => page`).
- `Tour/Show` (planner) renders its own chrome-less layout: `TourTabs` (宪法 / 规划 / 总览), tour title + hover-to-edit, inline `ConstitutionChip`, and right-side `账单 / 成员` buttons.
- `Tour/Constitution` (page) and `Tour/Timeline` (page) are siblings of the planner, reached via `TourTabs`.
- Routes: `GET /tours/:id/constitution`, `PATCH /tours/:id/constitution`, `POST /tours/:id/constitution/accept`, `GET /tours/:id/timeline`.

## Design

### Architecture

The planner becomes the only page under `/tours/:id`. It re-enters `AppShell` (the opt-out is removed). Constitution and timeline become **surfaces on top of the planner**, not separate routes:

- **Constitution** → left-push drawer that lives **inside** the planner's main area. Opening it shrinks the planner's panel group. Violations indicator on the 宪法 icon button.
- **Timeline** → full-screen overlay covering everything except `AppShell.Header`. Modal semantics (ESC / backdrop / X to close).

The `AppShell.Header` gains a "right slot" that pages can inject custom content into. The planner injects **five** icon buttons: 宪法 / 总览 / 账单 / 成员 / 旅程设置 — the first two are new, 账单 and 成员 replace what today lives in the planner's own sub-header, and 旅程设置 replaces the in-body hover-to-edit affordance (see §PM-feedback deltas).

### File structure

**New**
- `app/javascript/layouts/HeaderSlot.js` — React context with `HeaderSlotProvider` and `useInjectHeaderRight(node)` hook.
- `app/javascript/components/planner/PlannerHeaderRight.jsx` — the icon-button group injected into AppShell header's right slot.
- `app/javascript/components/planner/ConstitutionDrawer.jsx` — left-push resizable drawer wrapping the constitution form. Contains the violation list (folded from `ConstitutionChip`'s popover) and the mode-switching save logic.
- `app/javascript/components/planner/TimelineOverlay.jsx` — full-screen overlay wrapping timeline content.

**Modified**
- `app/javascript/layouts/AppShell.jsx` — wrap with `HeaderSlotProvider`; read right-slot node and render it alongside the page title.
- `app/javascript/pages/Tour/Show.jsx`:
  - Remove `Show.layout = (page) => page` opt-out.
  - Drop the `TourTabs`, inline `ConstitutionChip`, and the right-side `账单 / 成员` Button group.
  - Inject `PlannerHeaderRight` into the header via `useInjectHeaderRight`.
  - Render `ConstitutionDrawer` as the leftmost child of the panel flex row; it controls its own width state.
  - Render `TimelineOverlay` as a portal on top of everything.
  - Wire drawer/overlay open state via `useDisclosure`.
- `config/routes.rb` — remove `GET /tours/:id/constitution` and `GET /tours/:id/timeline`. Keep `PATCH /tours/:id/constitution` and `POST /tours/:id/constitution/accept` (the drawer calls these).
- `app/controllers/tours_controller.rb#show` — add the props Timeline and Constitution used to receive: `summary: Tour::TimelineSummary.for(@tour)`, and per-day `intensity_derived` override in the `days` prop. Constitution's data comes from `tour.constitution` which is already present.

**Deleted**
- `app/javascript/pages/Tour/Constitution.jsx` — content migrates to `ConstitutionDrawer`.
- `app/javascript/pages/Tour/Timeline.jsx` — content migrates to `TimelineOverlay`.
- `app/javascript/components/tour/TourTabs.jsx` — no longer any tabs.
- `app/controllers/tours/timelines_controller.rb` and its `Tours::TimelinesController#show` action — data is served directly by `tours#show`.
- `app/controllers/tours/constitutions_controller.rb#show` action — the `show` method body is removed, leaving `update` and `accept`.
- Any page-level test files for the deleted pages.

### Planner header (injected into AppShell.Header)

Single row, 56px (AppShell default). Left-to-right:

```
[sidebar toggle] [tour title • hover shows edit pencil] ···············  [📖] [📋] [💰] [👥]
```

- **Sidebar toggle** — unchanged; comes from `AppShell.Header` itself.
- **Tour title** — comes from `document.title` (`<Head title={tour.title} />` on planner). Rendered as plain, non-interactive text. `canEdit` users reach `TourSettingsModal` via the 旅程设置 button (right slot, see below); non-editors see a read-only title. We do **not** render the tour title separately in the page body. (Previous revision called for a hover-to-edit affordance on the title itself; dropped in favor of an explicit button — see §PM-feedback deltas.)
- **Right slot** — `PlannerHeaderRight` component, 5 `ActionIcon` buttons:

| # | Icon | Tabler | Tooltip | Opens | Visibility |
|---|---|---|---|---|---|
| 1 | 📖 | `IconBook2` | 宪法 | `ConstitutionDrawer` (push from left, 400px default, resizable) | always |
| 2 | 📋 | `IconListDetails` | 总览 | `TimelineOverlay` (full-screen overlay) | always |
| 3 | 💰 | `IconCoin` | 账单 | `ExpenseDrawer` (existing) | always |
| 4 | 👥 | `IconUsers` | 成员 | `MembershipDrawer` (existing) | always |
| 5 | ⚙️ | `IconSettings` | 旅程设置 | `TourSettingsModal` (existing) | `canEdit` only |

All `ActionIcon variant="subtle" size="md"`. Button 1 is wrapped in a Mantine `Indicator` that reflects violation severity:

```jsx
const hasHard = violations.some(v => v.level === 'hard')
const color = hasHard ? 'red' : 'yellow'
// visible only when violations.length > 0
<Indicator
  color={color}
  label={violations.length}
  size={16}
  offset={4}
  disabled={violations.length === 0}
>
  <ActionIcon ...><IconBook2 /></ActionIcon>
</Indicator>
```

Color and count semantics match the current `ConstitutionChip`.

### Header slot mechanism

`HeaderSlot.js`:

```jsx
import { createContext, useContext, useEffect, useState } from 'react'

const HeaderSlotContext = createContext({ right: null, setRight: () => {} })

export function HeaderSlotProvider({ children }) {
  const [right, setRight] = useState(null)
  return (
    <HeaderSlotContext.Provider value={{ right, setRight }}>
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
```

`AppShell.jsx` wraps its tree in `<HeaderSlotProvider>` and, inside `AppShell.Header`, renders:

```jsx
<Group h="100%" px="md" gap="sm">
  <ActionIcon ...toggle... />
  <Text fw={600} size="sm">{title}</Text>
  <Box style={{ flex: 1 }} />
  {useHeaderRightSlot()}
</Group>
```

Pages call `useInjectHeaderRight(<PlannerHeaderRight ... />)` to mount content. Cleanup on unmount returns the slot to `null`.

**Important:** the injected node may change on every render (e.g., `violations` prop updates). To avoid thrashing the slot state, the planner wraps the node in `useMemo(() => <PlannerHeaderRight ... />, [violations, handlers])`.

### ConstitutionDrawer

Push-style, left of the planner panel flex row. **Not** a Mantine Drawer (which is float-only); instead, a plain `<aside>` sibling in the flex container, width-animated with CSS transitions.

```jsx
// Tour/Show.jsx (relevant portion)
const [constOpen, { open: openConst, close: closeConst }] = useDisclosure(false)
const [constWidth, setConstWidth] = useState(400) // session-only
const [timelineOpen, { open: openTimeline, close: closeTimeline }] = useDisclosure(false)

<div ref={containerRef} style={{ display: 'flex', ... }}>
  {constOpen && (
    <ConstitutionDrawer
      width={constWidth}
      onWidthChange={setConstWidth}
      onClose={closeConst}
      tour={tour}
      violations={violations}
      onFix={(v) => setPendingChatPrompt(fixPromptFor(v))}
      onAcknowledge={(v) => setAcknowledgingViolation(v)}
    />
  )}
  <BacklogList ... />
  <ResizeHandle ... />
  <DayPanel ... />
  ...
</div>
```

**Resize:** `ConstitutionDrawer` renders a plain `<div onMouseDown>` handle on its right edge. Width is clamped to `[320, 640]` px. Not persisted — resets to `400px` on next open. The aside itself uses `flexShrink: 0` so the declared width is respected even when planner panels compete for horizontal space. (The planner's internal `ResizeHandle` component was not reused — it carries too much panel-split-specific state; sharing was noted as a nice-to-have in spec risks but deferred.)

**Close:**
- `Esc` key — bound via `useHotkeys`.
- `×` button at top-right of drawer header.
- **Not** closable via click-outside (push style; planner clicks should never dismiss).

**Modes:** the drawer reads `tour.constitution_accepted`:
- **Onboarding mode** (`constitution_accepted === false` AND `localStorage.onboarded:tour:${tour.id}` is missing): renders a wizard — `"设置这次旅程"` header + tour-metadata inputs (程名 / 日期范围 / 人数 / 天数) + constitution `ParameterEditor` + bottom CTA `[下一步 →]` → step 2 full-text review `[← 返回修改] [同意并开始规划 →]`. Close button `×` is still enabled — user may dismiss, but will see onboarding again next open until they complete `accept`. After `accept`, `localStorage.setItem('onboarded:tour:${id}', '1')` and the backend sets `constitution_accepted = true` via `POST /tours/:id/constitution/accept`.
- **Edit mode** (accepted): renders constitution fields as live editable (no tour metadata — that lives in `TourSettingsModal`). Each field change triggers debounced (500ms) `router.patch(...)` to `/tours/:id/constitution`. Footer shows "所有更改将自动保存" before any save, swaps to "已保存 · HH:MM:SS" after first successful save. No explicit save button.

**Violation list** — rendered at the top of the drawer (above fields) in **edit mode only**. During onboarding the user has not yet accepted; surfacing violations at that moment gives the impression of being corrected before they start (`整程 0 个机动日` on a brand-new tour with `days_count=0` was the canonical offender). Hard violations show `[帮我修正 →] [承认此违反]`; soft show `[知道了]` (same as today). `onFix` fills the planner's `ChatPanel` with the prepared prompt.

### TimelineOverlay

Full-screen overlay (except `AppShell.Header`). Implemented as Mantine `Modal` with `fullScreen` + `withinPortal`:

```jsx
<Modal
  opened={timelineOpen}
  onClose={closeTimeline}
  fullScreen
  withCloseButton
  padding={0}
  styles={{ content: { marginTop: 56 } /* sit below AppShell.Header */ }}
>
  <TimelineContent tour={tour} days={days} activities={activities} violations={violations} summary={summary} />
</Modal>
```

`TimelineContent` is the body of the current `Tour/Timeline.jsx`, minus its outer `<Head>` and `TourTabs` wrapper.

**Close:** Esc, backdrop click (the small strip visible behind the overlay), and the `×` button all close. Standard Mantine Modal behavior.

**Data:** pulled from `usePage().props`. Requires `tours#show` to provide `summary` and `days[*].intensity_derived` — see Backend changes below.

### First-visit onboarding trigger

On planner mount:

```jsx
useEffect(() => {
  const key = `onboarded:tour:${tour.id}`
  const hasOnboarded = localStorage.getItem(key) === '1'
  const acceptedOnServer = !!tour.constitution_accepted // boolean on Tour model (see db/schema.rb:283)
  if (!hasOnboarded && !acceptedOnServer) {
    openConst()
  }
}, [tour.id])
```

The drawer's onboarding mode is driven by the same two signals. After a successful `accept`, write the `localStorage` marker. Clearing browser storage re-shows onboarding on next visit — acceptable per design.

### Old route deletion & 404 behavior

Deep links to `/tours/:id/constitution` and `/tours/:id/timeline` become **hard 404**. No server-side redirect; users with stale bookmarks land on an error page and need to re-open via `/tours/:id`. The spec accepts this cost because:
1. Both routes have been alive only weeks; real bookmarks are rare.
2. Query-param deep-link behavior would add code that serves a marginal use case.
3. 404 is honest: those pages no longer exist.

If any internal links (emails, notifications, server-rendered redirects) point at these routes, they must be updated to `/tours/:id` first.

### Backend changes

- `config/routes.rb`:
  - Remove `resource :timeline, ...` entirely.
  - For constitution: change from `only: [:show, :update]` to `only: [:update]`. Keep the `accept` member route.
- `app/controllers/tours/timelines_controller.rb` — delete the file.
- `app/controllers/tours/constitutions_controller.rb` — delete the `show` action.
- `app/controllers/tours_controller.rb#show`:
  - Compute `tour_violations = Tour::ConstitutionCheck.for(@tour).map(&:to_h)` (already done, reused by timeline).
  - Add `summary: Tour::TimelineSummary.for(@tour)` to the Inertia props.
  - Update `days` to include `intensity_derived`: `@tour.days.map { |d| d.as_json.merge("intensity_derived" => d.intensity_derived(tour_violations).to_s) }`.
  - Every other existing prop is preserved.

The one cost here: `tours#show` now computes `TimelineSummary` on every planner load even if the user never opens the overlay. Measure before optimizing; if latency is noticeable, switch to Inertia partial reload on `openTimeline`: `router.reload({ only: ['summary', 'days'] })`.

## Component contracts

### `ConstitutionDrawer({ tour, violations, width, onWidthChange, onClose, onFix, onAcknowledge })`

- Controlled width via `width` + `onWidthChange` (parent owns state).
- Renders violation list at top, constitution form fields below.
- Switches between onboarding and edit mode based on `tour.constitution_accepted` and `localStorage`.
- Calls `router.patch('/tours/:id/constitution', ...)` on field change (edit mode, debounced) or on "保存设置" click (onboarding mode).
- Calls `POST /tours/:id/constitution/accept` on "同意并开始规划"; on success, writes localStorage marker and calls `onClose`.
- Does NOT own open/close state — parent does.

### `TimelineOverlay({ tour, days, activities, violations, summary, opened, onClose })`

- Pure presentational, full-screen Modal.
- Renders the existing timeline UI (`TourSummaryBar`, `RhythmBar`, `TimelineDayColumn`, `DayDetailPanel`).
- No data fetching; consumes props.

### `PlannerHeaderRight({ violations, onOpenConst, onOpenTimeline, onOpenExpense, onOpenMembers, onOpenSettings })`

- Pure presentational; 4 always-visible `ActionIcon` buttons + 1 optional 旅程设置 button gated by `onOpenSettings` being provided.
- Constitution button wraps in `Indicator` reflecting violation severity + count.

### `HeaderSlotProvider` / `useInjectHeaderRight` / `useHeaderRightSlot`

- Context-backed slot for page-specific header content.
- Memoize the injected node in calling pages to avoid unnecessary re-sets.

## Testing

### JS (Vitest)

- **`HeaderSlot.test.js`**: injecting content shows it; unmounting clears; two pages mounting in sequence reset cleanly.
- **`PlannerHeaderRight.test.jsx`**: renders 4 buttons; 宪法 button shows Indicator with correct color/count when violations present; no Indicator when empty.
- **`ConstitutionDrawer.test.jsx`**:
  - Onboarding mode: renders when `tour.constitution_accepted === false` AND no localStorage marker; shows "同意并开始规划" CTA.
  - Edit mode: renders when accepted; field change triggers debounced PATCH.
  - Violation list shows "帮我修正 →" for hard, "知道了" for soft.
- **`TimelineOverlay.test.jsx`**: renders timeline content when open; closes on Esc.
- **Planner integration `Tour/Show.test.jsx`**:
  - First visit (no localStorage, `constitution_accepted === false`) → drawer auto-opens.
  - After accept, reload → drawer does NOT auto-open.
  - 宪法 button click toggles drawer.
  - Resize handle updates `constWidth` state.

### RSpec

- `spec/requests/tours/constitutions_spec.rb`: verify `GET /tours/:id/constitution` now returns 404; `PATCH` and `POST .../accept` still work.
- `spec/requests/tours/timelines_spec.rb`: verify `GET /tours/:id/timeline` returns 404; delete the file after refactor.
- `spec/requests/tours_spec.rb`: verify `GET /tours/:id` now includes `summary` and `days[].intensity_derived` in the Inertia response.

## Migration sequence

1. Backend: add timeline props to `tours#show`; keep constitution + timeline controllers alive for now (no route deletion yet). Run RSpec; planner keeps working.
2. Create `HeaderSlot.js` + `PlannerHeaderRight.jsx`; extend `AppShell.jsx` with slot support. Ship separately with a no-op planner injection.
3. Create `ConstitutionDrawer.jsx` (edit mode only, no onboarding gate). Wire it into `Tour/Show.jsx` behind the 宪法 icon. Keep old `TourTabs` and `Tour/Constitution` alive temporarily so users have a fallback.
4. Add onboarding mode + first-visit trigger to the drawer.
5. Create `TimelineOverlay.jsx` and wire it into `Tour/Show.jsx` behind 总览 icon.
6. Remove `TourTabs`, inline `ConstitutionChip`, and the right-side `账单 / 成员` Button group from `Tour/Show.jsx`. Remove `Show.layout = (page) => page` opt-out. Planner is now AppShell-wrapped.
7. Delete `/tours/:id/constitution` GET and `/tours/:id/timeline` routes + controller actions. Delete `pages/Tour/Constitution.jsx` and `pages/Tour/Timeline.jsx`. Delete `components/tour/TourTabs.jsx`.
8. Manual QA + Playwright E2E: navigate `/tours`, open a tour, verify drawer opens on first visit, resize, accept, reopen (edit mode auto-save), open timeline, close, verify navigation back to `/tours` via sidebar.

## PM-feedback deltas (2026-04-22)

Four spec-level deltas landed during the first PM review pass. Each is an **intentional deviation** from the earlier draft (this document has been rewritten above to match the shipped implementation; this section records the reasoning).

- **Tour title in header is not hover-to-edit.** The earlier draft proposed that hovering the AppShell header's tour title swapped in an `IconPencil + 编辑` label and clicked to open `TourSettingsModal`. Shipped instead as a dedicated `⚙️ 旅程设置` button in the `PlannerHeaderRight` slot (5th icon, `canEdit`-gated). Reasons: the hover affordance was invisible on touch; the explicit button is more discoverable; and it also works in mobile (where hover does not exist). Accepting the cost of one extra icon in the header.
- **Header has 5 icons, not 4.** Follows directly from the previous item — the 旅程设置 button brings the count from 4 to 5. Read-only users still see 4 (settings hidden for them).
- **Onboarding step 1 CTA is "下一步 →", not "保存设置".** Preserves the phrasing users already knew from the pre-refactor `Tour/Constitution.jsx` setup flow; functionally identical (the click does save + advance).
- **Violation list hidden during onboarding.** The earlier draft said both modes render the violation list. A brand-new tour often has "整程 0 个机动日（建议 ≥ 1）" as a soft violation — showing it before the user has accepted the constitution came across as scolding new users at the moment of first setup. Violations are suppressed in onboarding mode; they appear as soon as the user enters edit mode. Backend computation is unchanged; only the drawer-level rendering is gated.

## Risks & open questions

- **TimelineSummary cost on every planner load.** If `Tour::TimelineSummary.for(@tour)` is expensive, this spec adds latency even for users who never open 总览. Measure before optimizing; fallback is Inertia partial reload on overlay open.
- **Slot memoization footgun.** If `Tour/Show.jsx` forgets `useMemo` around `PlannerHeaderRight`, the slot resets on every parent render, potentially blanking the header mid-render. Mitigated by the context's stable setter ref + the injected element being a stable-shape component; but a test must cover "header content doesn't flicker during parent re-renders."
- **Mobile (< sm).** On narrow viewports, the push drawer behavior becomes harsh (40% of a 400px screen is ~160px of planner left). Proposed: below `sm` breakpoint, the constitution drawer becomes a Mantine Drawer (float from left, 85% width overlay). Decide during implementation; not spec-critical if desktop is the primary surface.
- **Onboarding marker is browser-scoped.** A user who completes onboarding on device A and opens the tour on device B will see onboarding again — but because the backend `constitution_accepted` is also checked, the drawer opens in **edit mode**, not onboarding mode. Effective behavior: only "repeat the acceptance ritual" is browser-scoped; the core accept is server-scoped. This is the intended balance.
- **ResizeHandle reuse — resolved as not-reused.** The drawer uses an inline `<div onMouseDown>` handle rather than the planner's internal `ResizeHandle` component. Reason: `ResizeHandle` is coupled to the flex-panel split model (neighbor-flex-basis math, auto-fit toggle, hover hint against sibling panel) and a standalone drag-to-resize handle is simpler. Share this code in a future pass if a third drag-to-resize surface lands.
