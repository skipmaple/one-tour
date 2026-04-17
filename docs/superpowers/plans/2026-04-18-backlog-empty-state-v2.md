# Backlog Empty State V2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the 480px DashedStack with 2 naked buttons at the top of the Body; make the dashed drop-zone visuals appear ONLY when a drag is in progress (via `useDroppable`'s `active` field); rename `加一个` → `加候选`; delete the unused inset shadow.

**Architecture:** Single-file refactor of `BacklogList.jsx`. Introduce a three-way `dragState` derived from `active` + `isOver` that drives Body border and background. Empty-state renders a plain `<Stack>` of 2 buttons (no wrapping frame). Non-empty state keeps its existing toolbar + filters + cards structure, only the top toolbar button is renamed.

**Tech Stack:** React 18, `@mantine/core` v9, `@dnd-kit/core` (existing `useDroppable`), Vitest + React Testing Library.

**Reference spec:** [docs/superpowers/specs/2026-04-18-backlog-empty-state-v2-design.md](docs/superpowers/specs/2026-04-18-backlog-empty-state-v2-design.md)

---

## File Structure

| File | Action | Responsibility |
|---|---|---|
| [app/javascript/components/planner/BacklogList.jsx](app/javascript/components/planner/BacklogList.jsx) | Modify | Rename `加一个` → `加候选` (2 places); replace empty-state DashedStack with naked Stack of 2 buttons; add `dragState` derivation from `{ active, isOver }`; switch Body border + background to drive off dragState; delete inset shadow |
| [app/javascript/components/planner/__tests__/BacklogList.test.jsx](app/javascript/components/planner/__tests__/BacklogList.test.jsx) | Modify | Rename `加一个` → `加候选` in test matchers (2 tests affected) |

No other files touched.

---

## Task 1: Rename `加一个` → `加候选` (TDD)

**Files:**
- Modify: `app/javascript/components/planner/__tests__/BacklogList.test.jsx`
- Modify: `app/javascript/components/planner/BacklogList.jsx`

- [ ] **Step 1: Update tests — rename `加一个` → `加候选` in 3 matchers**

Open `app/javascript/components/planner/__tests__/BacklogList.test.jsx`.

**1a.** Find the test `empty + editable: shows CTA buttons and no top "+ 加一个" button`. Inside it, find:

```jsx
  expect(screen.getByRole('button', { name: '加一个' })).toBeInTheDocument()
```

Change to:

```jsx
  expect(screen.getByRole('button', { name: '加候选' })).toBeInTheDocument()
```

The other assertions in that test (AI 帮选, etc.) don't need changes. The test title string itself (`"+ 加一个"` inside the title) refers to the old codebase and should be updated for clarity:

```jsx
test('empty + editable: shows CTA buttons and no toolbar 加候选 button', () => {
```

**1b.** Find the test `non-empty backlog: empty-state hint not rendered, toolbar shows both buttons`. Inside it, change:

```jsx
  expect(screen.getAllByRole('button', { name: '加一个' })).toHaveLength(1)
```

to:

```jsx
  expect(screen.getAllByRole('button', { name: '加候选' })).toHaveLength(1)
```

**1c.** Find the test `filter hides all but "无匹配" does NOT show empty-CTA frame`. Change:

```jsx
  expect(screen.getByRole('button', { name: '加一个' })).toBeInTheDocument()
```

to:

```jsx
  expect(screen.getByRole('button', { name: '加候选' })).toBeInTheDocument()
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run app/javascript/components/planner/__tests__/BacklogList.test.jsx`

Expected: FAIL on 3 assertions searching for `加候选` because the JSX still uses `加一个`.

- [ ] **Step 3: Rename in `BacklogList.jsx`**

Open `app/javascript/components/planner/BacklogList.jsx`. Two replacements.

**3a.** In the empty-state Stack (around line 129), find:

```jsx
            {onAddActivity && (
              <Button size="sm" variant="default" fullWidth onClick={() => onAddActivity(null)}>
                加一个
              </Button>
            )}
```

Change the button text:

```jsx
            {onAddActivity && (
              <Button size="sm" variant="default" fullWidth onClick={() => onAddActivity(null)}>
                加候选
              </Button>
            )}
```

**3b.** In the non-empty toolbar Group (around line 146), find:

```jsx
                {onAddActivity && (
                  <Button size="compact-xs" variant="default" onClick={() => onAddActivity(null)}>
                    加一个
                  </Button>
                )}
```

Change:

```jsx
                {onAddActivity && (
                  <Button size="compact-xs" variant="default" onClick={() => onAddActivity(null)}>
                    加候选
                  </Button>
                )}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run app/javascript/components/planner/__tests__/BacklogList.test.jsx`

Expected: PASS — all tests green.

Then: `npm test`

Expected: 175 passed (no change in count; just label updates).

- [ ] **Step 5: Commit**

```bash
git add app/javascript/components/planner/BacklogList.jsx app/javascript/components/planner/__tests__/BacklogList.test.jsx
git commit -m "$(cat <<'EOF'
refactor(planner): rename BacklogList buttons 加一个 → 加候选

"加一个" required users to visually reference the panel header (候选池)
to understand what "one" meant. "加候选" is self-explanatory —
it carries its own object within three characters. Applied to both
the empty-state Button and the non-empty toolbar Button so the
vocabulary is consistent.
EOF
)"
```

---

## Task 2: Body drag-state machine + naked empty-state buttons

**Files:**
- Modify: `app/javascript/components/planner/BacklogList.jsx`

This task does three related changes in one commit because they're all in the same `return` block and only make sense together:

1. Destructure `active` from `useDroppable` and derive `dragState`
2. Replace the DashedStack with a naked `<Stack>` (no wrapping container, no hint text — hint was already gone after V1, we just swap frame for non-frame)
3. Rewrite the Body `style` object to drive off `dragState` (replacing the old `isOver` + inset-shadow approach)

No new failing unit tests — dnd-kit drag state is hard to simulate in jsdom. The existing test suite (with the Task 1 renames) continues to pass after this change because:
- Empty-state buttons are still queryable by role + name (just no longer inside a DashedStack)
- Body drop-target behavior is unchanged at the dnd-kit level
- Default (idle) state renders the same visible content as before minus the dashed frame

Visual / drag behavior is verified in Task 3.

- [ ] **Step 1: Update the `useDroppable` call to destructure `active`**

In `BacklogList.jsx` around line 48, change:

```jsx
  const { setNodeRef, isOver } = useDroppable({
    id: 'backlog',
    data: { dayId: null, position: activities.length + 1 }
  })
```

to:

```jsx
  const { setNodeRef, isOver, active } = useDroppable({
    id: 'backlog',
    data: { dayId: null, position: activities.length + 1 }
  })

  // Three-state drop zone visual: idle (no drag) → active (drag in progress
  // but not hovering this droppable) → over (hovering this droppable).
  const dragState = active ? (isOver ? 'over' : 'active') : 'idle'
```

- [ ] **Step 2: Rewrite the Body `<div>` style**

Around line 102, find:

```jsx
      <div
        ref={setNodeRef}
        style={{
          padding: 12,
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.04)',
          background: isOver ? '#f0f7ff' : undefined,
        }}
      >
```

Replace with:

```jsx
      <div
        ref={setNodeRef}
        style={{
          padding: 12,
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          border: dragState === 'idle' ? 'none' : '2px dashed var(--mantine-color-gray-5)',
          borderRadius: 4,
          background:
            dragState === 'over' ? '#e7f5ff' :
            dragState === 'active' ? 'var(--mantine-color-gray-0)' :
            undefined,
          transition: 'border-color 120ms ease, background-color 120ms ease',
        }}
      >
```

Four changes from old to new:

- `boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.04)'` → **deleted** (was invisible at 480px panel height, no longer earning its keep now that dragState handles "this is a drop target")
- `background: isOver ? '#f0f7ff' : undefined` → three-way: `over` → `#e7f5ff`, `active` → `gray.0`, `idle` → `undefined`. `isOver` semantics are now a subset of the `over` state.
- Added `border: dragState === 'idle' ? 'none' : '2px dashed gray-5'` + `borderRadius: 4` — the dashed frame that used to be ONLY around the empty-state Stack now appears around the entire Body whenever a drag is in progress
- Added `transition` for 120ms smooth fade on border + bg

- [ ] **Step 3: Replace empty-state DashedStack with naked Stack**

Around line 117, find the entire empty-state block:

```jsx
        {isEmpty && !readOnly && (
          <Stack
            gap="xs"
            p="md"
            justify="center"
            style={{
              flex: 1,
              border: '2px dashed var(--mantine-color-gray-5)',
              borderRadius: 4,
              background: '#fafafa',
            }}
          >
            {onAddActivity && (
              <Button size="sm" variant="default" fullWidth onClick={() => onAddActivity(null)}>
                加候选
              </Button>
            )}
            {onAskAI && (
              <Button size="sm" variant="default" fullWidth onClick={onAskAI}>
                AI 帮选
              </Button>
            )}
          </Stack>
        )}
```

Replace with:

```jsx
        {isEmpty && !readOnly && (
          <Stack gap="xs">
            {onAddActivity && (
              <Button size="sm" variant="default" fullWidth onClick={() => onAddActivity(null)}>
                加候选
              </Button>
            )}
            {onAskAI && (
              <Button size="sm" variant="default" fullWidth onClick={onAskAI}>
                AI 帮选
              </Button>
            )}
          </Stack>
        )}
```

Stripped: `p="md"` (Body already has `padding: 12`), `justify="center"` (we want buttons at top, not centered), the entire `style` prop (no more dashed frame, no more background — Body handles drag visuals now, Stack is just a layout helper). Result: 2 buttons in a column, flush to the top of Body padding, sized by content.

- [ ] **Step 4: Run the full JS suite to confirm no regressions**

Run: `npm test`

Expected: PASS — 175 tests green. The existing suite doesn't assert on Body border / inset shadow / DashedStack `style`, only on rendered content (buttons, hint text presence/absence, etc.), which is preserved.

- [ ] **Step 5: Commit**

```bash
git add app/javascript/components/planner/BacklogList.jsx
git commit -m "$(cat <<'EOF'
refactor(planner): drag-activated drop zone + naked empty-state buttons

The empty-state DashedStack at flex:1 made 2 small buttons float in
480px of space — visually stranded. And its dashed frame implied a
drop target in a state where the user has nothing to drop (backlog
is primarily a drag SOURCE, not a drag destination for first-time
users). Two problems, one fix:

1. Empty state buttons now sit at the top of the Body with no
   wrapping container. Below is honest empty space.
2. Drop-zone visuals are state-driven. useDroppable's `active` field
   powers a three-way dragState (idle / active / over). Body shows
   dashed border + gray-0 bg when any drag is in progress, #e7f5ff
   when hovering this droppable specifically. Otherwise: nothing.

Also deleted the inset shadow (0.04 alpha was invisible at 480px
panel height; no longer needed now that dragState carries the
"this is a drop target" signal).

Closes UX re-review #1, #2, #5 (defers #3, which conflicts with
the chosen "space is space" philosophy).
EOF
)"
```

---

## Task 3: Visual + drag verification via chrome-devtools-mcp

No code changes. Verify the three-state behavior end-to-end.

- [ ] **Step 1: Dev server is up**

`bin/worktree-dev up` should already be running on port 9101. If not, start it.

- [ ] **Step 2: Load the planner at 1280×800, with an empty backlog**

Use a tour whose backlog is empty. (Either navigate to an existing empty-backlog tour, or create a new tour at `/` and click straight through Constitution to the planner.)

```
navigate_page(url: "http://127.0.0.1:9101/tours/<id>")
click 规划 tab if not already there
resize_page(width: 1280, height: 800)
```

- [ ] **Step 3: Verify idle empty state**

```js
// evaluate_script
() => {
  const paper = Array.from(document.querySelectorAll('.mantine-Paper-root'))
    .find(p => p.textContent.includes('候选池'))
  if (!paper) return { error: 'paper not found' }

  // Body is the second child of Paper (after the header Group)
  const body = Array.from(paper.children).find(c => c.tagName === 'DIV')

  const cs = body ? getComputedStyle(body) : null
  const stack = body?.querySelector('.mantine-Stack-root')
  const stackRect = stack?.getBoundingClientRect()
  const bodyRect = body?.getBoundingClientRect()

  return {
    bodyHasBorder: cs ? cs.borderStyle !== 'none' : null,
    bodyBg: cs ? cs.backgroundColor : null,
    bodyShadow: cs ? cs.boxShadow : null,
    stackAtTop: stack && body ? Math.round(stackRect.top - bodyRect.top) : null, // should be ~padding (12)
    stackHeight: stack ? Math.round(stackRect.height) : null,
    bodyHeight: body ? Math.round(bodyRect.height) : null,
    buttonsPresent: body ? Array.from(body.querySelectorAll('button')).map(b => b.textContent.trim()) : [],
  }
}
```

Expected:
- `bodyHasBorder: false` (idle state: no border)
- `bodyBg: 'rgba(0, 0, 0, 0)'` or `'transparent'` (no bg)
- `bodyShadow: 'none'` (inset shadow gone)
- `stackAtTop` ≈ 12 (Stack flush to top of Body's padding)
- `stackHeight` ≪ `bodyHeight` (Stack ~80-100px, Body ~500px)
- `buttonsPresent` contains `'加候选'` and `'AI 帮选'`

- [ ] **Step 4: Start a drag from a day column, verify `active` state (no hover on backlog yet)**

This requires a day column with at least one ActivityCard. If there are none, seed one by clicking `加候选` or AI 帮选.

Manually trigger a drag using `chrome-devtools-mcp`'s drag facility or by dispatching pointer events via `evaluate_script`. A pragmatic alternative: synthesize the dnd-kit `active` state by directly interacting with the DOM is brittle; instead, **take a screenshot mid-drag** using the user's own cursor via real pointer (if automation allows) OR accept that this step is best verified by manual human interaction.

If automated drag is too fiddly, do the following human-driven check:
1. Instruct the user (via the chat) to drag an ActivityCard from a day column and hover over the middle of the page (not over the backlog).
2. Once they confirm they're mid-drag, run the same evaluate_script from Step 3 and check `bodyHasBorder: true`, `bodyBg` is `rgb(248, 249, 250)` (gray.0), and NOT the brighter `#e7f5ff`.

If the automation isn't viable, mark this sub-step as done-by-report and move on to Step 5 for the `isOver` case, which is easier.

- [ ] **Step 5: Drag-hover the backlog and verify `over` state**

From the same drag (or starting fresh), hover the dragged card over the candidate pool's Body area. Then run:

```js
() => {
  const paper = Array.from(document.querySelectorAll('.mantine-Paper-root'))
    .find(p => p.textContent.includes('候选池'))
  const body = Array.from(paper.children).find(c => c.tagName === 'DIV')
  const cs = getComputedStyle(body)
  return {
    bg: cs.backgroundColor,
    border: cs.borderStyle,
    borderColor: cs.borderColor,
  }
}
```

Expected: `bg` is `rgb(231, 245, 255)` (#e7f5ff), `border: 'dashed'`, `borderColor` is a gray-5 color.

- [ ] **Step 6: Release the drag, verify transition back to idle**

After drop (or after canceling the drag), re-run the Step 3 evaluate_script. Expected state: same as the initial idle (no border, no bg, stack at top).

- [ ] **Step 7: Non-empty state sanity check (no regression)**

Navigate to or populate a tour backlog with at least one ActivityCard. Then verify:

```js
() => {
  const paper = Array.from(document.querySelectorAll('.mantine-Paper-root'))
    .find(p => p.textContent.includes('候选池'))
  const toolbar = paper?.querySelector('.mantine-Group-root')
  const toolbarBtns = toolbar ? Array.from(toolbar.querySelectorAll('button')).map(b => b.textContent.trim()) : []
  return {
    toolbarBtns,
    toolbarHasBoth: toolbarBtns.includes('加候选') && toolbarBtns.includes('AI 帮选'),
  }
}
```

Expected: `toolbarHasBoth: true`.

- [ ] **Step 8: (optional) Screenshot for PR**

`take_screenshot({ filePath: '/tmp/backlog-v2.png' })` at 1280×800 in idle empty state. Use later when composing the PR description.

No commit for Task 3 — verification only. If a regression surfaces, go back to Task 2 and fix under that commit.

---

## Task 4: CI parity

- [ ] **Step 1: Run the CI suite**

Per [CLAUDE.md](CLAUDE.md) "Before claiming done":

```bash
mise exec -- bundle exec rspec
npm test
mise exec -- bundle exec rubocop -f github app/
mise exec -- bundle exec brakeman --no-pager
npm audit
```

Expected:
- RSpec: unchanged baseline (no Ruby touched)
- Vitest: 175 passed
- Rubocop on `app/`: 0 new offenses
- Brakeman: 0 warnings
- `npm audit`: 0 vulnerabilities

If all green, the plan is done.

---

## Self-Review

Coverage against [the spec](docs/superpowers/specs/2026-04-18-backlog-empty-state-v2-design.md):

- **#1 (buttons stranded in oversize DashedStack)** → Task 2 Step 3 (replace DashedStack with plain Stack at top of Body)
- **#2 (drop zone misleading when nothing to drop)** → Task 2 Steps 1 + 2 (dragState machine, Body visuals only when `active`)
- **#4 (加一个 semantic weakness)** → Task 1 (rename to `加候选`, both places)
- **#5 (inset shadow invisible)** → Task 2 Step 2 (deleted)
- **Tests**: Task 1 updates 3 label matchers; Task 2 doesn't add tests (drag state is defer-to-manual-verification per spec)
- **Verification**: Task 3 covers empty idle, mid-drag `active`, `over`, release-to-idle, non-empty toolbar
- **CI parity**: Task 4

No placeholders. Label names consistent (`加候选`, `AI 帮选`) across tasks. `dragState` used consistently in Task 2 Steps 1 and 2. `useDroppable` destructure pattern consistent.

One deferred item: #3 (AI 帮选 visual emphasis) is NOT addressed — see spec "非目标". The current design makes both buttons equal-weight per user's preference for the C-philosophy ("space is space, no hierarchical decoration").
