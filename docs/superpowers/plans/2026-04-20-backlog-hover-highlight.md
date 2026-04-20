# Backlog Hover Highlight Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend Phase B's card ↔ map hover highlight to the `BacklogList` panel via pure prop pass-through — hovering a backlog card lights up its grey dashed marker on the map, and hovering a backlog marker lights up its card in the backlog list.

**Architecture:** Zero new state. Zero new CSS. `Show.jsx` already owns `hoveredActivityIds` + 5 callbacks (Phase B). This plan passes 3 of those (`hoveredActivityIds`, `onHoverActivity`, `onClearHover`) through `BacklogList` into each `ActivityCard` it renders. ActivityCard's default `dayColorName='none'` handles the grey accent; Phase B's `buildMarkerHTML` backlog branch already supports `highlighted=true`. Map side is untouched.

**Tech Stack:** React (no new deps), Vitest + @testing-library/react.

---

## File structure

**Modified files:**

| File | Responsibility |
|---|---|
| `app/javascript/components/planner/BacklogList.jsx` | Accept 3 new props in the function signature; compute `isHighlighted` per activity in the `.map(filtered)` loop; forward `onHoverActivity` / `onClearHover` to each ActivityCard. (Task 1) |
| `app/javascript/pages/Tour/Show.jsx` | Pass 3 existing props (`hoveredActivityIds`, `onHoverActivity`, `onClearHover`) to `<BacklogList ... />`. (Task 2) |
| `app/javascript/components/planner/__tests__/BacklogList.test.jsx` | +2 tests: class-applied-on-match and callback-on-mouseenter/leave. (Task 1) |

**No new files. No new CSS. No state changes. No backend changes.**

---

## Task 1: BacklogList prop pass-through (TDD)

**Files:**
- Modify: `app/javascript/components/planner/BacklogList.jsx`
- Modify: `app/javascript/components/planner/__tests__/BacklogList.test.jsx`

- [ ] **Step 1: Add failing tests**

Open `app/javascript/components/planner/__tests__/BacklogList.test.jsx`. At the very bottom of the file, append:

```javascript

test('hoveredActivityIds=[id] applies .ac-highlighted to the matching card only', () => {
  const { container } = render(
    <MantineProvider>
      <DndContext>
        <BacklogList
          activities={fixtures}
          hoveredActivityIds={[2]}
        />
      </DndContext>
    </MantineProvider>
  )
  const cards = container.querySelectorAll('.ac-card')
  expect(cards).toHaveLength(3)
  // fixtures order: id=1 赛里木湖, id=2 独库公路, id=3 早餐
  expect(cards[0].classList.contains('ac-highlighted')).toBe(false)
  expect(cards[1].classList.contains('ac-highlighted')).toBe(true)
  expect(cards[2].classList.contains('ac-highlighted')).toBe(false)
})

test('card mouseenter calls onHoverActivity(id); mouseleave calls onClearHover', () => {
  const onHoverActivity = vi.fn()
  const onClearHover = vi.fn()
  const { container } = render(
    <MantineProvider>
      <DndContext>
        <BacklogList
          activities={fixtures}
          onHoverActivity={onHoverActivity}
          onClearHover={onClearHover}
        />
      </DndContext>
    </MantineProvider>
  )
  const firstCard = container.querySelectorAll('.ac-card')[0]
  fireEvent.mouseEnter(firstCard)
  expect(onHoverActivity).toHaveBeenCalledWith(1) // fixtures[0].id === 1
  fireEvent.mouseLeave(firstCard)
  expect(onClearHover).toHaveBeenCalled()
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- --run BacklogList 2>&1 | tail -15`

Expected: 2 new failing tests — the `isHighlighted` class assertion fails because BacklogList doesn't pass the prop through yet; the callback test fails because `onHoverActivity` isn't wired.

- [ ] **Step 3: Modify `BacklogList.jsx` function signature**

Open `app/javascript/components/planner/BacklogList.jsx`. Locate the function signature:

```jsx
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
```

Replace with:

```jsx
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
}) {
```

- [ ] **Step 4: Forward hover props to ActivityCard in the render loop**

Still in `BacklogList.jsx`, locate the render block that maps filtered activities to cards (inside the `{!isEmpty && (...)}` branch):

```jsx
            <Stack gap={4}>
              {filtered.map(a => (
                <ActivityCard key={a.id} activity={a} onClick={onEditActivity} readOnly={readOnly} />
              ))}
              {filtered.length === 0 && (
                <Text size="xs" c="dimmed">无匹配的候选。调整筛选或清空条件。</Text>
              )}
            </Stack>
```

Replace with:

```jsx
            <Stack gap={4}>
              {filtered.map(a => (
                <ActivityCard
                  key={a.id}
                  activity={a}
                  onClick={onEditActivity}
                  readOnly={readOnly}
                  isHighlighted={hoveredActivityIds != null && hoveredActivityIds.includes(a.id)}
                  onHoverActivity={onHoverActivity}
                  onClearHover={onClearHover}
                />
              ))}
              {filtered.length === 0 && (
                <Text size="xs" c="dimmed">无匹配的候选。调整筛选或清空条件。</Text>
              )}
            </Stack>
```

**Do NOT pass `dayColorName`** — ActivityCard's default `'none'` is correct for backlog cards (grey accent via `data-day-color="none"` CSS rule).

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm test -- --run BacklogList 2>&1 | tail -10`

Expected: all BacklogList tests pass (existing 16 + 2 new = 18).

- [ ] **Step 6: Run full test suite to check for regressions**

Run: `npm test -- --run 2>&1 | tail -5`

Expected: `Tests  335 passed (335)` — was 333 + 2 new = 335.

- [ ] **Step 7: Commit**

```bash
git add app/javascript/components/planner/BacklogList.jsx \
        app/javascript/components/planner/__tests__/BacklogList.test.jsx
git commit -m "$(cat <<'EOF'
feat(planner): hover highlight pass-through in BacklogList

Extends Phase B's card ↔ map hover highlight to the backlog panel.
BacklogList now accepts hoveredActivityIds + onHoverActivity +
onClearHover props and forwards them to each ActivityCard it renders
(computing isHighlighted per activity via .includes()).

No dayColorName is passed — ActivityCard's default 'none' yields the
grey accent that matches the grey dashed backlog marker on the map.

Consumers (Show.jsx) still don't wire these props; added next task.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Show.jsx wires hover props to BacklogList + manual verify

**Files:**
- Modify: `app/javascript/pages/Tour/Show.jsx`

No new unit test — Show.jsx already exercises BacklogList in the full render tree, and the prop wiring is too mechanical to meaningfully test at the Show level (would duplicate the Task 1 BacklogList test coverage).

- [ ] **Step 1: Pass hover props to `<BacklogList ... />`**

Open `app/javascript/pages/Tour/Show.jsx`. Locate the `<BacklogList ... />` JSX block:

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
          />
```

Append three props right before the closing `/>`:

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

`hoveredActivityIds`, `onHoverActivity`, and `onClearHover` are already defined in Show.jsx from Phase B (lines ~58, 59, 62 in the current file). Do NOT add any new state or callbacks.

- [ ] **Step 2: Run full test suite**

Run: `npm test -- --run 2>&1 | tail -5`

Expected: `Tests  335 passed (335)` — unchanged from Task 1.

- [ ] **Step 3: Manual browser verification**

With the dev server running (the worktree's bin/worktree-dev on port 9101):

1. Open Tour 18 (`北疆·独库·吐鲁番 11 日 (E2E)`).
2. Drag one activity from a day column into the backlog panel (or if the backlog already has content, skip this step).
3. Ensure the backlog activity being tested has a lat/lng (seed or user-entered) so it appears as a grey dashed marker on the map.
4. Hover the backlog card → grey dashed marker on the map scales up with heavier shadow.
5. Apply a kind filter that excludes the hovered activity, then hover its map marker → backlog panel does not respond (silent). Map marker still scales.
6. Remove the filter. Hover the map marker → matching backlog card grows a 3px grey bar on the left.
7. Confirm day-column hover behavior is unchanged (hover a card in D1 → its colored marker still scales; no regression).

If any of these seven checks fails, investigate before committing.

- [ ] **Step 4: Commit**

```bash
git add app/javascript/pages/Tour/Show.jsx
git commit -m "$(cat <<'EOF'
feat(planner): wire BacklogList into card ↔ map hover highlight

Passes the 3 existing Phase B hover props (hoveredActivityIds,
onHoverActivity, onClearHover) to the BacklogList component. No new
state or callbacks — the backlog now participates in the same hover
loop as day-column cards, with the grey accent matching the grey
dashed backlog markers on the map.

Phase D of the card ↔ map hover highlight feature is now complete.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Self-review pass (writing-plans skill requirement)

**1. Spec coverage:**

| Spec section | Task | Status |
|---|---|---|
| `BacklogList` signature extended with 3 props | Task 1 Step 3 | ✅ |
| Per-activity `isHighlighted` computation | Task 1 Step 4 | ✅ |
| `onHoverActivity`/`onClearHover` forwarded to ActivityCard | Task 1 Step 4 | ✅ |
| `dayColorName` NOT passed (default 'none' correct) | Task 1 Step 4 (explicit note) | ✅ |
| `Show.jsx` passes 3 existing props to `<BacklogList>` | Task 2 Step 1 | ✅ |
| No new state / callbacks / CSS | Task 2 Step 1 (explicit note) | ✅ |
| Silent no-op when filtered | Natural from `.map(filtered)` semantics | ✅ — covered by Task 1 Step 4 implementation |
| 2 new tests (class-applied, callback-fires) | Task 1 Step 1 | ✅ |
| Manual verification of 7 scenarios | Task 2 Step 3 | ✅ |

**2. Placeholder scan:** No "TBD", no "TODO", no "add validation". All code blocks contain complete JSX. Commit messages are fully written.

**3. Type consistency:**
- `hoveredActivityIds: number[] | null` — matches Phase B exactly. Used in Task 1 and Task 2 with the same shape.
- `onHoverActivity: (id: number) => void` — matches ActivityCard's Phase B prop (Task 2 in the Phase B plan defined it).
- `onClearHover: () => void` — matches ActivityCard's Phase B prop.
- Default `hoveredActivityIds = null` in BacklogList matches Phase B's DayColumn default.

No drift detected. The plan is ready for execution.
