# Backlog + DayColumn V3 Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Five polish items in one pass: restore Paper `withBorder`, unify button shape across empty/non-empty states, restore onboarding hint text, add font-weight differentiation between `加候选` and `AI 帮选`, and move all CTAs (BacklogList toolbar + per-day `+ 加一个`) to the bottom of their containers.

**Architecture:** Two files, two commits. BacklogList.jsx absorbs four of the five changes (withBorder, empty layout, non-empty layout, font weights). DayColumn.jsx handles the fifth (swap `+ 加一个` from above-Stack to below-Stack). Mantine `mt="auto"` does the bottom-pinning in both files' flex column layouts.

**Tech Stack:** React 18, `@mantine/core` v9 (`Group grow`, `Stack`, `Paper withBorder`, font-weight prop `fw`), Vitest + React Testing Library.

**Reference spec:** [docs/superpowers/specs/2026-04-18-backlog-daycolumn-v3-polish-design.md](docs/superpowers/specs/2026-04-18-backlog-daycolumn-v3-polish-design.md)

---

## File Structure

| File | Action | Responsibility |
|---|---|---|
| [app/javascript/components/planner/BacklogList.jsx](app/javascript/components/planner/BacklogList.jsx) | Modify | Paper withBorder; empty-state hint + horizontal buttons + `mt="auto"` + fw; non-empty-state toolbar to bottom + `mt="auto"` + fw |
| [app/javascript/components/planner/DayColumn.jsx](app/javascript/components/planner/DayColumn.jsx) | Modify | Move `+ 加一个` button JSX block from before the Stack to after it |
| [app/javascript/components/planner/__tests__/BacklogList.test.jsx](app/javascript/components/planner/__tests__/BacklogList.test.jsx) | Modify | Flip 1 absence assertion to a presence assertion (V2 removed hint, V3 restores it) |

DayColumn tests don't assert button position — no changes needed there.

---

## Task 1: BacklogList — withBorder + empty state + non-empty state (TDD)

**Files:**
- Modify: `app/javascript/components/planner/__tests__/BacklogList.test.jsx` (flip 1 assertion)
- Modify: `app/javascript/components/planner/BacklogList.jsx` (4 related edits)

This task commits four changes together because they're all inside the same `return` block and only make visual sense as a set. TDD applies to the hint-text restoration (the only behavior-observable change in tests); button layout, `mt="auto"`, `withBorder`, and `fw` are visual and verified in Task 3.

- [ ] **Step 1: Flip the hint absence assertion to a presence assertion**

Open `app/javascript/components/planner/__tests__/BacklogList.test.jsx`. Find the test `empty + editable: shows CTA buttons and no toolbar 加候选 button` (named as of Task 1 of V2 plan, may be slightly different if earlier renames didn't stick — look for the test that renders `activities={[]}` + `readOnly={false}` + both `onAddActivity` and `onAskAI`).

Inside that test, find the line:

```jsx
  expect(screen.queryByText(/先把想去的点塞进这里/)).not.toBeInTheDocument()
```

Replace with:

```jsx
  expect(screen.getByText(/先把想去的点塞进这里/)).toBeInTheDocument()
```

`queryByText(…).not.toBeInTheDocument()` → `getByText(…).toBeInTheDocument()`.

- [ ] **Step 2: Run tests to verify the flipped assertion fails**

Run: `npx vitest run app/javascript/components/planner/__tests__/BacklogList.test.jsx`

Expected: FAIL on that assertion — the hint text currently isn't rendered in V2.

- [ ] **Step 3: Apply `withBorder` to the open-state Paper**

Open `app/javascript/components/planner/BacklogList.jsx`. Find the open-state Paper (around line 87, inside the main `return (...)` — not the folded-state early return):

```jsx
    <Paper style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
```

Change to:

```jsx
    <Paper withBorder style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
```

- [ ] **Step 4: Rewrite the empty-state block**

Still in `BacklogList.jsx`. Find the empty-state block (inside the Body div, around line 117):

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

Replace with:

```jsx
        {isEmpty && !readOnly && (
          <Stack gap="xs" mt="auto">
            <Text size="xs" c="gray.7">先把想去的点塞进这里，再拖到右侧日。</Text>
            <Group gap={4} grow>
              {onAddActivity && (
                <Button size="sm" variant="default" fw={500} onClick={() => onAddActivity(null)}>
                  加候选
                </Button>
              )}
              {onAskAI && (
                <Button size="sm" variant="default" fw={700} onClick={onAskAI}>
                  AI 帮选
                </Button>
              )}
            </Group>
          </Stack>
        )}
```

Changes: `Stack` gains `mt="auto"` (pushes cluster to bottom of Body's flex column); prepend `<Text>` hint; swap vertical button list for `<Group gap={4} grow>`; buttons lose `fullWidth` (Group `grow` handles width now); buttons gain `fw={500}` (加候选) and `fw={700}` (AI 帮选).

- [ ] **Step 5: Rewrite the non-empty-state block**

Still in `BacklogList.jsx`. Find the non-empty-state block (around line 142):

```jsx
        {!isEmpty && (
          <>
            {!readOnly && (onAddActivity || onAskAI) && (
              <Group gap={4} mb="xs" grow>
                {onAddActivity && (
                  <Button size="compact-xs" variant="default" onClick={() => onAddActivity(null)}>
                    加候选
                  </Button>
                )}
                {onAskAI && (
                  <Button size="compact-xs" variant="default" onClick={onAskAI}>
                    AI 帮选
                  </Button>
                )}
              </Group>
            )}

            <Group gap={4} mb="xs">
              <Select
                data={KIND_FILTER_OPTIONS}
                value={kindFilter}
                onChange={v => setKindFilter(v || '')}
                size="xs"
                w={100}
                allowDeselect={false}
                aria-label="按类型筛选"
              />
              <Select
                data={LEVEL_FILTER_OPTIONS}
                value={levelFilter}
                onChange={v => setLevelFilter(v || '')}
                size="xs"
                w={100}
                allowDeselect={false}
                aria-label="按等级筛选"
              />
            </Group>

            <Stack gap={4}>
              {filtered.map(a => (
                <ActivityCard key={a.id} activity={a} onClick={onEditActivity} readOnly={readOnly} />
              ))}
              {filtered.length === 0 && (
                <Text size="xs" c="dimmed">无匹配的候选。调整筛选或清空条件。</Text>
              )}
            </Stack>
          </>
        )}
```

Replace with (reorder: filter first, cards second, toolbar last; toolbar gets `mt="auto"` and buttons get `fw`):

```jsx
        {!isEmpty && (
          <>
            <Group gap={4} mb="xs">
              <Select
                data={KIND_FILTER_OPTIONS}
                value={kindFilter}
                onChange={v => setKindFilter(v || '')}
                size="xs"
                w={100}
                allowDeselect={false}
                aria-label="按类型筛选"
              />
              <Select
                data={LEVEL_FILTER_OPTIONS}
                value={levelFilter}
                onChange={v => setLevelFilter(v || '')}
                size="xs"
                w={100}
                allowDeselect={false}
                aria-label="按等级筛选"
              />
            </Group>

            <Stack gap={4}>
              {filtered.map(a => (
                <ActivityCard key={a.id} activity={a} onClick={onEditActivity} readOnly={readOnly} />
              ))}
              {filtered.length === 0 && (
                <Text size="xs" c="dimmed">无匹配的候选。调整筛选或清空条件。</Text>
              )}
            </Stack>

            {!readOnly && (onAddActivity || onAskAI) && (
              <Group gap={4} mt="auto" grow>
                {onAddActivity && (
                  <Button size="compact-xs" variant="default" fw={500} onClick={() => onAddActivity(null)}>
                    加候选
                  </Button>
                )}
                {onAskAI && (
                  <Button size="compact-xs" variant="default" fw={700} onClick={onAskAI}>
                    AI 帮选
                  </Button>
                )}
              </Group>
            )}
          </>
        )}
```

Key changes:
- Toolbar `Group` moved from position 1 to position 3 (last)
- Toolbar's `mb="xs"` → `mt="auto"` (push to bottom of Body; no `mb` needed since nothing below it)
- Buttons gain `fw={500}` and `fw={700}` matching the empty-state pair

- [ ] **Step 6: Run tests and full suite**

Run: `npx vitest run app/javascript/components/planner/__tests__/BacklogList.test.jsx`

Expected: PASS — the flipped hint-text assertion now passes.

Then: `npm test`

Expected: 175 passed (no count change from V2; just the one flipped assertion + structural rearrangement invisible to existing role-based tests).

- [ ] **Step 7: Commit**

```bash
git add app/javascript/components/planner/BacklogList.jsx app/javascript/components/planner/__tests__/BacklogList.test.jsx
git commit -m "$(cat <<'EOF'
refactor(planner): BacklogList V3 polish — border + shape + hint + fw + bottom

Five changes inside BacklogList.jsx's open-state return block:

1. Paper withBorder restored — aligns with ChatPanel's 1px subtle
   edge, which had been visually asymmetric since V1 Task 4 removed
   it (the spec anticipated this rollback if the default shadow-xs
   proved too faint, which it did)
2. Empty-state buttons: vertical fullWidth Stack → horizontal
   <Group gap={4} grow>. Kills the onboarding-cliff shape jump
   when the user adds the first candidate (buttons now only resize
   between states, no longer rearrange)
3. Restore the V1 hint "先把想去的点塞进这里，再拖到右侧日。" above
   the empty-state buttons — rescues onboarding warmth after V2's
   zero-text approach proved too cold
4. AI 帮选 fw={700} / 加候选 fw={500} in both states — font weight
   only, no icon, no color, no size. AI-first nudge at the lightest
   possible visual touch
5. Toolbar moved to bottom in non-empty state; empty-state cluster
   pinned to bottom via Stack mt="auto". Append-at-bottom pattern
   matches Trello, Notion, WeChat, Slack — users scan to the
   bottom to add more when the list is full

Test change: flip the absence assertion for the hint text back to a
presence assertion (V2 had removed it; we're restoring it).
EOF
)"
```

---

## Task 2: DayColumn — move `+ 加一个` below the card Stack

**Files:**
- Modify: `app/javascript/components/planner/DayColumn.jsx` (swap JSX order)

No test changes — `DayColumn.test.jsx` only tests the drag warning banner; no test asserts button position.

- [ ] **Step 1: Swap the `+ 加一个` JSX block from above Stack to below Stack**

Open `app/javascript/components/planner/DayColumn.jsx`.

Find the block at lines 81–87 (current position of the button, just above the Stack):

```jsx
      {!readOnly && onAddActivity && (
        <div style={{ padding: '4px 8px' }}>
          <Button size="compact-xs" variant="light" fullWidth onClick={() => onAddActivity(day.id)}>
            + 加一个
          </Button>
        </div>
      )}
      <Stack gap={4} p="xs" ref={setNodeRef} style={{
        flex: 1, minHeight: 140,
        background: isOver ? '#f0f7ff' : undefined,
        border: dragWarning ? '1px solid var(--mantine-color-red-6)' : undefined
      }}>
        {activities.map(a => (
          <ActivityCard key={a.id} activity={a} onClick={onEditActivity} readOnly={readOnly} />
        ))}
        {activities.length === 0 && <Text size="xs" c="dimmed" ta="center" mt="md">空</Text>}
      </Stack>
```

Cut the 7-line button block (lines 81–87) and paste it immediately AFTER the Stack's closing `</Stack>`, so the final structure is:

```jsx
      <Stack gap={4} p="xs" ref={setNodeRef} style={{
        flex: 1, minHeight: 140,
        background: isOver ? '#f0f7ff' : undefined,
        border: dragWarning ? '1px solid var(--mantine-color-red-6)' : undefined
      }}>
        {activities.map(a => (
          <ActivityCard key={a.id} activity={a} onClick={onEditActivity} readOnly={readOnly} />
        ))}
        {activities.length === 0 && <Text size="xs" c="dimmed" ta="center" mt="md">空</Text>}
      </Stack>
      {!readOnly && onAddActivity && (
        <div style={{ padding: '4px 8px' }}>
          <Button size="compact-xs" variant="light" fullWidth onClick={() => onAddActivity(day.id)}>
            + 加一个
          </Button>
        </div>
      )}
```

The button itself is unchanged — only its JSX sibling position relative to the Stack. The metrics footer `<div>` at line 98 stays below the button.

Final DOM order becomes:
1. `<div data-testid="day-header">` (header)
2. `{dragWarning && ...}` (optional drag warning)
3. `<Stack>` (cards / 空 placeholder, droppable ref)
4. `{+ 加一个 button}` (moved here)
5. `<div>` (metrics footer)

- [ ] **Step 2: Run tests**

Run: `npx vitest run app/javascript/components/planner/__tests__/DayColumn.test.jsx`

Expected: PASS — the 2 existing tests are about `dragWarning`, not button position.

Then: `npm test`

Expected: all tests pass.

- [ ] **Step 3: Commit**

```bash
git add app/javascript/components/planner/DayColumn.jsx
git commit -m "$(cat <<'EOF'
refactor(planner): move DayColumn + 加一个 button below cards

Append-at-bottom pattern: after the card list (or 空 placeholder),
before the metrics footer. This matches every major content tool's
convention (Trello, Notion, Asana, chat/messaging apps). The button
itself is unchanged — only its JSX sibling position relative to
the Stack swaps.

Empty state reading order: 空 placeholder → + 加一个 (status →
action, natural flow). Non-empty state: cards → + 加一个 (append
where your eye lands after reading the list).

DayColumn tests are position-agnostic; no test changes needed.
EOF
)"
```

---

## Task 3: Visual verification via chrome-devtools-mcp

No code changes. Verify the five polish items end-to-end.

- [ ] **Step 1: Dev server is up**

`bin/worktree-dev up` on port 9101. If not running, start it.

- [ ] **Step 2: Load the planner at 1280×800 with an empty backlog**

```
navigate_page(url: "http://127.0.0.1:9101/tours/<empty-backlog-tour-id>")
click 规划 tab if needed
resize_page(width: 1280, height: 800)
```

- [ ] **Step 3: Verify empty-state layout**

```js
// evaluate_script
() => {
  const paper = Array.from(document.querySelectorAll('.mantine-Paper-root'))
    .find(p => p.textContent.includes('候选池'))
  if (!paper) return { error: 'paper not found' }

  const cs = getComputedStyle(paper)
  const body = Array.from(paper.children).find(c => !c.className.includes('mantine-Group-root'))
  const bodyCs = body ? getComputedStyle(body) : null

  const hint = Array.from(paper.querySelectorAll('.mantine-Text-root'))
    .find(e => e.textContent.trim().startsWith('先把想去的点塞进这里'))
  const buttons = Array.from(paper.querySelectorAll('button')).map(b => ({
    text: b.textContent.trim(),
    fw: getComputedStyle(b).fontWeight,
  }))

  const bodyRect = body ? body.getBoundingClientRect() : null
  const hintRect = hint ? hint.getBoundingClientRect() : null

  return {
    paperHasBorder: cs.borderStyle !== 'none',
    hintPresent: !!hint,
    hintNearBottom: body && hint
      ? Math.round(bodyRect.bottom - hintRect.bottom) < Math.round(bodyRect.height * 0.3) // bottom 30%
      : null,
    buttons: buttons.filter(b => b.text === '加候选' || b.text === 'AI 帮选'),
  }
}
```

Expected:
- `paperHasBorder: true` (withBorder restored)
- `hintPresent: true`
- `hintNearBottom: true` (hint cluster is in the bottom 30% of Body)
- `buttons` contains `{ text: '加候选', fw: '500' }` and `{ text: 'AI 帮选', fw: '700' }`

- [ ] **Step 4: Verify non-empty-state layout**

Add at least 2 candidates to the backlog (click `加候选` and the ActivityDrawer creates a draft). Then:

```js
() => {
  const paper = Array.from(document.querySelectorAll('.mantine-Paper-root'))
    .find(p => p.textContent.includes('候选池'))
  const body = Array.from(paper.children).find(c => !c.className.includes('mantine-Group-root'))

  // The non-empty state should have: filters (top) → cards Stack → toolbar (bottom)
  const bodyChildren = Array.from(body.children)
  const filterGroup = bodyChildren.find(c => c.textContent.includes('所有类型') || c.textContent.includes('所有等级'))
  const cardStack = bodyChildren.find(c => c.className.includes('mantine-Stack-root'))
  const toolbarGroup = bodyChildren.findLast(c => {
    const btns = Array.from(c.querySelectorAll('button')).map(b => b.textContent.trim())
    return btns.includes('加候选') && btns.includes('AI 帮选')
  })

  const bodyChildOrder = bodyChildren.map(c => {
    if (c === filterGroup) return 'filter'
    if (c === cardStack) return 'cards'
    if (c === toolbarGroup) return 'toolbar'
    return 'other'
  })

  return {
    expectedOrder: ['filter', 'cards', 'toolbar'],
    actualOrder: bodyChildOrder,
    matches: JSON.stringify(bodyChildOrder) === JSON.stringify(['filter', 'cards', 'toolbar']),
  }
}
```

Expected: `matches: true` OR `actualOrder` ends with `toolbar` (some scenarios may have extra children but the toolbar should be last).

- [ ] **Step 5: Verify DayColumn `+ 加一个` at bottom**

Still at 1280×800, with at least one day column visible:

```js
() => {
  const dayHeaders = Array.from(document.querySelectorAll('[data-testid="day-header"]'))
  return dayHeaders.slice(0, 3).map((header, i) => {
    const paper = header.closest('.mantine-Paper-root')
    if (!paper) return { idx: i, error: 'no paper' }

    const children = Array.from(paper.children)
    // Find the Stack (droppable) and the + 加一个 button wrapper
    const stack = children.find(c => c.className.includes('mantine-Stack-root'))
    const addBtnWrapper = children.find(c => {
      const btn = c.querySelector('button')
      return btn && btn.textContent.trim() === '+ 加一个'
    })
    const metricsFooter = children.findLast(c =>
      c.textContent.includes('驾驶') && c.textContent.includes('核心')
    )

    if (!stack || !addBtnWrapper || !metricsFooter) {
      return { idx: i, missing: { stack: !stack, addBtn: !addBtnWrapper, metrics: !metricsFooter } }
    }

    const stackIdx = children.indexOf(stack)
    const btnIdx = children.indexOf(addBtnWrapper)
    const metricsIdx = children.indexOf(metricsFooter)

    return {
      idx: i,
      stackIdx,
      btnIdx,
      metricsIdx,
      buttonAfterStack: btnIdx > stackIdx,
      buttonBeforeMetrics: btnIdx < metricsIdx,
    }
  })
}
```

Expected for each day: `buttonAfterStack: true`, `buttonBeforeMetrics: true`. Confirms the DOM order is `header → (dragWarning) → Stack → + 加一个 → metrics`.

- [ ] **Step 6: Regression check — drop zone three-state still works**

Drag a card from a day column and observe the candidate pool Body. While dragging (before releasing), take a snapshot:

```js
() => {
  const paper = Array.from(document.querySelectorAll('.mantine-Paper-root'))
    .find(p => p.textContent.includes('候选池'))
  const body = Array.from(paper.children).find(c => !c.className.includes('mantine-Group-root'))
  const cs = getComputedStyle(body)
  return {
    borderStyle: cs.borderStyle,
    borderColor: cs.borderColor,
    bg: cs.backgroundColor,
  }
}
```

Expected during a drag that is NOT over the backlog: `borderStyle: dashed`, `bg: rgb(248, 249, 250)` (gray.0). Confirms V2's three-state machine is intact.

- [ ] **Step 7: Screenshot for PR body** (optional)

`take_screenshot({ filePath: '/tmp/backlog-v3.png' })` at 1280×800 in both empty and non-empty states for the PR description.

No commit for Task 3 — verification only.

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
- RSpec: 256 passed, 0 failures (no Ruby touched)
- Vitest: 175 passed
- Rubocop on `app/`: 0 new offenses
- Brakeman: 0 warnings
- `npm audit`: 0 vulnerabilities

If all green, the plan is done.

---

## Self-Review

Coverage against [the spec](docs/superpowers/specs/2026-04-18-backlog-daycolumn-v3-polish-design.md):

- **改动 1 (Paper withBorder)** → Task 1 Step 3
- **改动 2 (empty state: hint + horizontal + bottom + fw)** → Task 1 Step 4
- **改动 3 (non-empty state: toolbar to bottom + fw)** → Task 1 Step 5
- **改动 4 (DayColumn `+ 加一个` to bottom)** → Task 2 Step 1
- **改动 5 (rollup)** → covered by Tasks 1+2
- **Test flip** → Task 1 Step 1
- **Visual verification** → Task 3
- **CI parity** → Task 4

No placeholders. Task 1 shows all four BacklogList edits inline with exact old/new code. Task 2 shows the exact cut-paste location for DayColumn. Verification uses specific DOM assertions (children order, fontWeight values, border existence) rather than vague "looks right".

One thing to watch in Task 3: "empty-backlog tour" may not exist in the default seed data. If none exists, the implementer can click `加候选` on a non-empty tour's backlog, cancel the drawer, and rely on `activities.length === 0` being the condition for empty state. Alternatively, seed a fresh tour by clicking "+ 新建程" in the main nav.
