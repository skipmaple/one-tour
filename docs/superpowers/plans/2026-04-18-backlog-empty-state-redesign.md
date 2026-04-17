# Candidate Pool Empty + Working State Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the 6 UX issues in the candidate pool UI — vertical dead zone, fake drop-zone affordance, inverted CTA hierarchy, missing 池 metaphor, onboarding cliff, and narrative text with no visual cue.

**Architecture:** Single-file restructure of `BacklogList.jsx` plus a one-line `Show.jsx` prop cleanup. Outer `<Paper>` loses `withBorder` and becomes a flex column so its inner Body can grow. The Body div — not the Paper, not any inner Stack — becomes the `useDroppable` ref, so both empty and non-empty states have a hit area. The dashed Stack in empty state goes `flex: 1` and centers two outline buttons (`加一个` / `AI 帮选`) with zero instructional text. Non-empty state gets a matching two-button compact toolbar. The `onFocusChat` / 跳到对话输入框 button and all icons are removed.

**Tech Stack:** React 18, `@mantine/core` v9, `@dnd-kit/core` (existing), Vitest + React Testing Library.

**Reference spec:** [docs/superpowers/specs/2026-04-18-backlog-empty-state-redesign-design.md](docs/superpowers/specs/2026-04-18-backlog-empty-state-redesign-design.md)

---

## File Structure

| File | Action | Responsibility |
|---|---|---|
| [app/javascript/components/planner/BacklogList.jsx](app/javascript/components/planner/BacklogList.jsx) | Modify | Remove `onFocusChat` / "跳到对话" button; rename labels; add two-button toolbar to non-empty state; empty state flex:1 + no hint text; Paper/Body restructure (withBorder off, flex column, ref on Body, inset shadow, isOver bg on Body) |
| [app/javascript/pages/Tour/Show.jsx](app/javascript/pages/Tour/Show.jsx) | Modify | Remove the `onFocusChat={...}` prop passed to BacklogList (now unused) |
| [app/javascript/components/planner/__tests__/BacklogList.test.jsx](app/javascript/components/planner/__tests__/BacklogList.test.jsx) | Modify | Delete `onFocusChat` test + "跳到对话" assertions; rename label assertions; add toolbar test |

---

## Task 1: Remove `onFocusChat` and 跳到对话输入框 button (TDD)

**Files:**
- Modify: `app/javascript/components/planner/__tests__/BacklogList.test.jsx`
- Modify: `app/javascript/components/planner/BacklogList.jsx`
- Modify: `app/javascript/pages/Tour/Show.jsx`

- [ ] **Step 1: Update tests — delete two stale tests, simplify one**

Open `app/javascript/components/planner/__tests__/BacklogList.test.jsx`.

**1a.** Delete the entire test `empty + editable: clicking 跳到对话 calls onFocusChat` (lines 124–140 in the current file). It tests a button that's being removed.

**1b.** In the test `empty + editable: shows three CTA buttons and no top "+ 加一个" button` (around line 71), change its expectations. Replace the test body with the simpler form (the old `先把想去的点` hint is still present because Task 4 hasn't removed it yet; we only touch the 跳到对话 assertion here):

```jsx
test('empty + editable: shows CTA buttons and no top "+ 加一个" button', () => {
  render(
    <MantineProvider>
      <DndContext>
        <BacklogList
          activities={[]}
          onAddActivity={() => {}}
          onAskAI={() => {}}
          readOnly={false}
        />
      </DndContext>
    </MantineProvider>
  )
  expect(screen.getByRole('button', { name: /\+ 手动添加行/ })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: /💬 让 AI 帮列候选/ })).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: /跳到对话/ })).not.toBeInTheDocument()
  expect(screen.queryByRole('button', { name: /^\+ 加一个$/ })).not.toBeInTheDocument()
})
```

Changes: `onFocusChat` prop gone; 跳到对话 button assertion flipped from `getByRole` (expect present) to `queryByRole … not.toBeInTheDocument()` (expect absent); title no longer says "three CTA buttons" since there are now two.

**1c.** In the test `empty + readOnly: shows simple "尚无候选" text, no CTAs` (around line 92), the `onFocusChat` is already passed (line 103's assertion stays). Nothing to change. Keep the `queryByRole … 跳到对话` absence check — it's still correct even after the button is removed.

- [ ] **Step 2: Run tests to verify baseline**

Run: `npx vitest run app/javascript/components/planner/__tests__/BacklogList.test.jsx`

Expected: The tests still pass because BacklogList.jsx still renders the 跳到对话 button — our **1b** assertion changed from present to absent, so it now FAILS. Other tests: 1 deleted, rest unaffected. Net: 1 failing test due to the flipped absence assertion.

- [ ] **Step 3: Remove button + prop from `BacklogList.jsx`**

Open `app/javascript/components/planner/BacklogList.jsx`.

**3a.** Remove `onFocusChat` from the destructured props at the component signature. Current:

```jsx
export default function BacklogList({
  activities,
  onAddActivity,
  onEditActivity,
  onAskAI,
  onFocusChat,
  readOnly,
  open = true,
  onToggle,
}) {
```

Change to (remove `onFocusChat,`):

```jsx
export default function BacklogList({
  activities,
  onAddActivity,
  onEditActivity,
  onAskAI,
  readOnly,
  open = true,
  onToggle,
}) {
```

**3b.** In the empty-state JSX (inside `{isEmpty && !readOnly && (...)}`), delete the 跳到对话 button block. Find:

```jsx
            {onFocusChat && (
              <Button size="xs" variant="subtle" onClick={onFocusChat}>
                ▸ 跳到对话输入框
              </Button>
            )}
```

Delete those 5 lines entirely.

- [ ] **Step 4: Remove `onFocusChat` prop pass from Show.jsx**

Open `app/javascript/pages/Tour/Show.jsx`. Find the `<BacklogList ...>` invocation in the grid (around line 146). Delete the line:

```jsx
            onFocusChat={canEdit ? () => setChatOpen(true) : undefined}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run app/javascript/components/planner/__tests__/BacklogList.test.jsx`

Expected: PASS. All tests green including the flipped `queryByRole('button', { name: /跳到对话/ })` absence check.

Then run: `npm test`

Expected: 174 passed (one fewer than before because we deleted a test).

- [ ] **Step 6: Commit**

```bash
git add app/javascript/components/planner/BacklogList.jsx app/javascript/components/planner/__tests__/BacklogList.test.jsx app/javascript/pages/Tour/Show.jsx
git commit -m "$(cat <<'EOF'
refactor(planner): remove 跳到对话输入框 button and onFocusChat prop

The 跳到对话 button was a redundant entry point — it opened the AI
chat panel without seeding a prompt, while the sibling "让 AI 帮列候选"
button opens the same panel WITH a prompt. Two paths to the same
place is signal/noise bloat. Drop the weaker one.

Part 1 of the candidate-pool redesign spec. Subsequent commits will
rename the remaining buttons, add a non-empty-state toolbar, and
restructure the Paper/Body so the dashed frame fills the panel.
EOF
)"
```

---

## Task 2: Rename button labels — drop `+` / `💬` / `让...候选`

**Files:**
- Modify: `app/javascript/components/planner/__tests__/BacklogList.test.jsx`
- Modify: `app/javascript/components/planner/BacklogList.jsx`

Per spec §Design: empty state buttons become `加一个` and `AI 帮选` (no `+`, no `💬`, no "让 AI 帮列"). Non-empty state's `+ 加一个` also drops its `+`. Unified label vocabulary across states.

- [ ] **Step 1: Update tests — find/replace label patterns**

In `BacklogList.test.jsx`, make these specific replacements:

**1a.** Test `empty + editable: shows CTA buttons and no top "+ 加一个" button` (which you edited in Task 1). Replace label matchers:

```jsx
expect(screen.getByRole('button', { name: /\+ 手动添加行/ })).toBeInTheDocument()
expect(screen.getByRole('button', { name: /💬 让 AI 帮列候选/ })).toBeInTheDocument()
```

becomes:

```jsx
expect(screen.getByRole('button', { name: '加一个' })).toBeInTheDocument()
expect(screen.getByRole('button', { name: 'AI 帮选' })).toBeInTheDocument()
```

Note: `getByRole` without a regex is an exact match. Because Task 3 will add a SECOND "加一个" button to the non-empty toolbar, we'll revisit this in Task 3. For now, empty state has exactly one of each — exact match is fine.

**1b.** Test `empty + editable: clicking 💬 让 AI 帮列候选 calls onAskAI` (around line 106). Rename the test and update the selector:

```jsx
test('empty + editable: clicking AI 帮选 calls onAskAI', () => {
  const onAskAI = vi.fn()
  render(
    <MantineProvider>
      <DndContext>
        <BacklogList
          activities={[]}
          onAddActivity={() => {}}
          onAskAI={onAskAI}
        />
      </DndContext>
    </MantineProvider>
  )
  fireEvent.click(screen.getByRole('button', { name: 'AI 帮选' }))
  expect(onAskAI).toHaveBeenCalled()
})
```

**1c.** Test `non-empty backlog: empty-CTAs not rendered, top "+ 加一个" still shows` (around line 142). Rename and update matcher:

```jsx
test('non-empty backlog: empty-state hint not rendered, top 加一个 still shows', () => {
  render(
    <MantineProvider>
      <DndContext>
        <BacklogList
          activities={fixtures}
          onAddActivity={() => {}}
          onAskAI={() => {}}
        />
      </DndContext>
    </MantineProvider>
  )
  expect(screen.queryByText(/先把想去的点塞进这里/)).not.toBeInTheDocument()
  expect(screen.getByRole('button', { name: '加一个' })).toBeInTheDocument()
})
```

**1d.** Test `filter hides all but "无匹配" does NOT show empty-CTA frame` (around line 159). Update the `+ 加一个` matcher:

```jsx
  expect(screen.getByRole('button', { name: '加一个' })).toBeInTheDocument()
```

replacing the old `+ 加一个`.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run app/javascript/components/planner/__tests__/BacklogList.test.jsx`

Expected: FAIL — the three tests with updated label matchers can't find buttons named exactly `加一个` or `AI 帮选` because the JSX still has `+ 手动添加行` / `💬 让 AI 帮列候选` / `+ 加一个`.

- [ ] **Step 3: Update labels in `BacklogList.jsx`**

Three label replacements.

**3a.** In the empty-state JSX inside `{isEmpty && !readOnly && (...)}`:

Find:
```jsx
            {onAddActivity && (
              <Button size="sm" fullWidth onClick={() => onAddActivity(null)}>
                + 手动添加行
              </Button>
            )}
            {onAskAI && (
              <Button size="sm" variant="default" fullWidth onClick={onAskAI}>
                💬 让 AI 帮列候选
              </Button>
            )}
```

Change to (both become `variant="default"` since we're unifying them as outline buttons per spec; swap to short labels):

```jsx
            {onAddActivity && (
              <Button size="sm" variant="default" fullWidth onClick={() => onAddActivity(null)}>
                加一个
              </Button>
            )}
            {onAskAI && (
              <Button size="sm" variant="default" fullWidth onClick={onAskAI}>
                AI 帮选
              </Button>
            )}
```

**3b.** In the non-empty-state JSX inside `{!isEmpty && (...)}`, find the `+ 加一个` button:

```jsx
            {!readOnly && onAddActivity && (
              <Button size="compact-xs" variant="light" fullWidth mb="xs" onClick={() => onAddActivity(null)}>
                + 加一个
              </Button>
            )}
```

Change to (drop `+`; variant stays `light` for now — Task 3 will replace this whole block with a toolbar Group):

```jsx
            {!readOnly && onAddActivity && (
              <Button size="compact-xs" variant="light" fullWidth mb="xs" onClick={() => onAddActivity(null)}>
                加一个
              </Button>
            )}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run app/javascript/components/planner/__tests__/BacklogList.test.jsx`

Expected: PASS — all tests green.

- [ ] **Step 5: Commit**

```bash
git add app/javascript/components/planner/BacklogList.jsx app/javascript/components/planner/__tests__/BacklogList.test.jsx
git commit -m "$(cat <<'EOF'
refactor(planner): shorten BacklogList button labels

Drop + prefixes and 💬 emoji; collapse "让 AI 帮列候选" → "AI 帮选".
Unified vocabulary across empty and non-empty states per the
candidate-pool redesign spec (user preference: minimize text and
icons to avoid reading fatigue + attention-grab).

Empty-state buttons are now both variant="default" outline. Task 3
will add a matching two-button toolbar to non-empty state.
EOF
)"
```

---

## Task 3: Non-empty state gets a two-button toolbar (TDD)

**Files:**
- Modify: `app/javascript/components/planner/__tests__/BacklogList.test.jsx`
- Modify: `app/javascript/components/planner/BacklogList.jsx`

Per spec §#5: the `加一个` button in non-empty state gets a sibling `AI 帮选` button, both in a `Group ... grow` row. Tests assert both buttons are present; click of `AI 帮选` triggers `onAskAI`.

- [ ] **Step 1: Update the `non-empty backlog` test + add a click test**

In `BacklogList.test.jsx`, replace the test `non-empty backlog: empty-state hint not rendered, top 加一个 still shows` (the one you updated in Task 2):

```jsx
test('non-empty backlog: empty-state hint not rendered, toolbar shows both buttons', () => {
  render(
    <MantineProvider>
      <DndContext>
        <BacklogList
          activities={fixtures}
          onAddActivity={() => {}}
          onAskAI={() => {}}
        />
      </DndContext>
    </MantineProvider>
  )
  expect(screen.queryByText(/先把想去的点塞进这里/)).not.toBeInTheDocument()
  expect(screen.getAllByRole('button', { name: '加一个' })).toHaveLength(1)
  expect(screen.getAllByRole('button', { name: 'AI 帮选' })).toHaveLength(1)
})
```

Note the switch from `getByRole` to `getAllByRole(…).toHaveLength(1)` — this is a future-proof assertion in case we later add another callsite.

Append a new test below:

```jsx
test('non-empty backlog: clicking toolbar AI 帮选 calls onAskAI', () => {
  const onAskAI = vi.fn()
  render(
    <MantineProvider>
      <DndContext>
        <BacklogList
          activities={fixtures}
          onAddActivity={() => {}}
          onAskAI={onAskAI}
        />
      </DndContext>
    </MantineProvider>
  )
  fireEvent.click(screen.getByRole('button', { name: 'AI 帮选' }))
  expect(onAskAI).toHaveBeenCalled()
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run app/javascript/components/planner/__tests__/BacklogList.test.jsx`

Expected: FAIL — both new/updated non-empty tests can't find `AI 帮选` because the non-empty branch still has only the `加一个` button.

- [ ] **Step 3: Wrap the non-empty `加一个` in a `Group grow` with `AI 帮选`**

In `BacklogList.jsx`, inside the `{!isEmpty && (...)}` block, replace the single-button block:

```jsx
            {!readOnly && onAddActivity && (
              <Button size="compact-xs" variant="light" fullWidth mb="xs" onClick={() => onAddActivity(null)}>
                加一个
              </Button>
            )}
```

with a two-button toolbar (compact outline, symmetrical grow):

```jsx
            {!readOnly && (onAddActivity || onAskAI) && (
              <Group gap={4} mb="xs" grow>
                {onAddActivity && (
                  <Button size="compact-xs" variant="default" onClick={() => onAddActivity(null)}>
                    加一个
                  </Button>
                )}
                {onAskAI && (
                  <Button size="compact-xs" variant="default" onClick={onAskAI}>
                    AI 帮选
                  </Button>
                )}
              </Group>
            )}
```

Changes: wrap in `<Group gap={4} mb="xs" grow>` so they split available width; change `variant="light"` → `variant="default"` for visual consistency with empty-state buttons; guard on either callback being truthy (drops the guard if both are absent, but that's the readOnly-or-neither case).

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run app/javascript/components/planner/__tests__/BacklogList.test.jsx`

Expected: PASS — both new tests green.

- [ ] **Step 5: Commit**

```bash
git add app/javascript/components/planner/BacklogList.jsx app/javascript/components/planner/__tests__/BacklogList.test.jsx
git commit -m "$(cat <<'EOF'
feat(planner): non-empty state gets twin toolbar (加一个 / AI 帮选)

Per redesign spec: the empty-state two-button pattern mirrors into
non-empty state as a compact toolbar. Same labels, same outline
variant, same left-to-right order — empty-state CTAs visually
shrink into the toolbar when cards appear rather than disappearing
cliff-style. Closes the onboarding-cliff issue from the UX review.
EOF
)"
```

---

## Task 4: Empty state fills panel + Paper/Body restructure + inset shadow

**Files:**
- Modify: `app/javascript/components/planner/__tests__/BacklogList.test.jsx`
- Modify: `app/javascript/components/planner/BacklogList.jsx`

Per spec §Design diagram: Paper becomes flex column with no `withBorder`; inner Body div gets `flex:1`, `ref={setNodeRef}`, inset shadow, and `isOver` bg (moved from Paper); empty-state DashedStack gets `flex:1` + vertical centering; the "先把想去的点塞进这里..." instructional text is deleted entirely.

- [ ] **Step 1: Update tests — delete hint-text assertion, assert absence**

In `BacklogList.test.jsx`, find the test `empty + editable: shows CTA buttons and no top "+ 加一个" button` (updated in Tasks 1–2). Delete the assertion checking presence of any hint text (there isn't one currently — the old `先把想去的点` assertion was already removed in Task 1's edit 1b, so this step's only change is to ADD an absence assertion for it):

Current test body (after Tasks 1–2) is:

```jsx
test('empty + editable: shows CTA buttons and no top "+ 加一个" button', () => {
  render(
    <MantineProvider>
      <DndContext>
        <BacklogList
          activities={[]}
          onAddActivity={() => {}}
          onAskAI={() => {}}
          readOnly={false}
        />
      </DndContext>
    </MantineProvider>
  )
  expect(screen.getByRole('button', { name: '加一个' })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'AI 帮选' })).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: /跳到对话/ })).not.toBeInTheDocument()
  expect(screen.queryByRole('button', { name: /^\+ 加一个$/ })).not.toBeInTheDocument()
})
```

Append one more absence assertion for the narrative hint:

```jsx
  expect(screen.queryByText(/先把想去的点塞进这里/)).not.toBeInTheDocument()
```

- [ ] **Step 2: Run tests to verify it fails**

Run: `npx vitest run app/javascript/components/planner/__tests__/BacklogList.test.jsx`

Expected: FAIL on the new `queryByText(/先把想去的点塞进这里/)` assertion — the text is still rendered.

- [ ] **Step 3: Restructure `BacklogList.jsx`**

This is the biggest single edit of the plan — four changes to the open-state render block (the big `return (...)` after the early folded return).

Find the current open-state block:

```jsx
  return (
    <Paper withBorder ref={setNodeRef} style={{ background: isOver ? '#f0f7ff' : undefined }}>
      <Group justify="space-between" p="xs" bg="gray.1">
        <Title order={5} m={0}>
          候选池
          {hasFilter && !isEmpty && (
            <Text component="span" size="xs" c="dimmed" ml={6}>
              {filtered.length}/{activities.length}
            </Text>
          )}
        </Title>
        {onToggle && (
          <Button size="compact-xs" variant="subtle" onClick={onToggle}>收起 ◂</Button>
        )}
      </Group>

      <div style={{ padding: 12 }}>
        {isEmpty && readOnly && (
          <Text size="xs" c="gray.7">尚无候选</Text>
        )}

        {isEmpty && !readOnly && (
          <Stack
            gap="xs"
            p="md"
            align="stretch"
            style={{ border: '2px dashed var(--mantine-color-gray-5)', borderRadius: 4, background: '#fafafa' }}
          >
            <Text size="xs" c="gray.7" ta="center">
              先把想去的点塞进这里，再拖到右侧日。
            </Text>
            {onAddActivity && (
              <Button size="sm" variant="default" fullWidth onClick={() => onAddActivity(null)}>
                加一个
              </Button>
            )}
            {onAskAI && (
              <Button size="sm" variant="default" fullWidth onClick={onAskAI}>
                AI 帮选
              </Button>
            )}
          </Stack>
        )}

        {!isEmpty && (
          /* ... existing non-empty content from Task 3 ... */
        )}
      </div>
    </Paper>
  )
```

Replace it with:

```jsx
  return (
    <Paper style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <Group justify="space-between" p="xs" bg="gray.1">
        <Title order={5} m={0}>
          候选池
          {hasFilter && !isEmpty && (
            <Text component="span" size="xs" c="dimmed" ml={6}>
              {filtered.length}/{activities.length}
            </Text>
          )}
        </Title>
        {onToggle && (
          <Button size="compact-xs" variant="subtle" onClick={onToggle}>收起 ◂</Button>
        )}
      </Group>

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
        {isEmpty && readOnly && (
          <Text size="xs" c="gray.7">尚无候选</Text>
        )}

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
                加一个
              </Button>
            )}
            {onAskAI && (
              <Button size="sm" variant="default" fullWidth onClick={onAskAI}>
                AI 帮选
              </Button>
            )}
          </Stack>
        )}

        {!isEmpty && (
          <>
            {!readOnly && (onAddActivity || onAskAI) && (
              <Group gap={4} mb="xs" grow>
                {onAddActivity && (
                  <Button size="compact-xs" variant="default" onClick={() => onAddActivity(null)}>
                    加一个
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
      </div>
    </Paper>
  )
```

Specific changes from old → new:

1. `<Paper withBorder ref={setNodeRef} style={{ background: isOver ? '#f0f7ff' : undefined }}>` → `<Paper style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>` — drop `withBorder`, drop ref, drop isOver bg; add flex column + 100% height so the Body can fill
2. `<div style={{ padding: 12 }}>` → `<div ref={setNodeRef} style={{ padding: 12, flex: 1, display: 'flex', flexDirection: 'column', boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.04)', background: isOver ? '#f0f7ff' : undefined }}>` — Body becomes the droppable, gains flex:1, becomes flex column, gets inset shadow, inherits isOver bg
3. DashedStack: `align="stretch"` → `justify="center"`; adds `flex: 1` to its style; removes the `先把想去的点塞进这里...` Text child
4. Non-empty state's content matches the Task 3 toolbar + filters + cards layout (unchanged from Task 3; included here only because it's inside the same return block you're editing)

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run app/javascript/components/planner/__tests__/BacklogList.test.jsx`

Expected: PASS — all tests green, including the new `queryByText(/先把想去的点塞进这里/)` absence assertion.

Then: `npm test`

Expected: all 174-ish tests pass.

- [ ] **Step 5: Commit**

```bash
git add app/javascript/components/planner/BacklogList.jsx app/javascript/components/planner/__tests__/BacklogList.test.jsx
git commit -m "$(cat <<'EOF'
refactor(planner): candidate pool fills panel + drop zone alignment

Restructure BacklogList so:
- Paper is a flex column with no withBorder (default shadow-xs
  standards the outer border instead — less visual weight)
- Body div becomes the useDroppable target and gains flex:1 +
  inset shadow (WCAG-safe 0.04 alpha, conveys 池 container depth)
- Empty-state DashedStack gets flex:1 + justify=center, fills the
  entire panel vertically so 60% dead-zone disappears
- The "先把想去的点塞进这里，再拖到右侧日" narrative hint is gone;
  two outline buttons (加一个 / AI 帮选) are self-explanatory per
  the user's anti-decoration principle

The droppable ref moves from the Paper to the Body div so both
empty and non-empty states have a hit area — previously the
dashed frame lied (looked like a drop zone but wasn't) while the
real drop target was the invisible Paper.

Closes #1, #2, #4, #6 from the UX critique.
EOF
)"
```

---

## Task 5: Visual + a11y verification via chrome-devtools-mcp

No code changes. Verify the redesign visually.

- [ ] **Step 1: Dev server running**

Worktree dev server should be up on port 9101. If not, `bin/worktree-dev up`.

- [ ] **Step 2: Load the planner at 1280×800**

```
new_page(url: "http://127.0.0.1:9101/tours/1")   # existing 5-day tour
click 规划 tab if needed
resize_page(width: 1280, height: 800)
```

- [ ] **Step 3: Verify empty state — DashedStack fills Body**

Ensure tour has no backlog candidates (add one temporarily removable or use a clean tour). Then:

```js
// evaluate_script
() => {
  const paper = Array.from(document.querySelectorAll('.mantine-Paper-root'))
    .find(p => p.textContent.includes('候选池'))
  if (!paper) return { error: 'paper not found' }

  const body = paper.querySelector('[style*="inset"]') || paper.children[1]
  const dashed = body?.querySelector('.mantine-Stack-root')

  return {
    bodyHeight: body ? Math.round(body.getBoundingClientRect().height) : null,
    dashedHeight: dashed ? Math.round(dashed.getBoundingClientRect().height) : null,
    // Dashed should fill most of the Body (minus padding)
    dashedFillsBody: body && dashed
      ? (dashed.getBoundingClientRect().height / body.getBoundingClientRect().height) > 0.8
      : null,
    hintTextPresent: !!Array.from(paper.querySelectorAll('.mantine-Text-root'))
      .find(e => e.textContent.includes('先把想去的点塞进这里')),
  }
}
```

Expected: `dashedFillsBody: true`, `hintTextPresent: false`.

- [ ] **Step 4: Verify drop target — drop behavior survives in non-empty state**

Add at least one candidate (manually via "加一个" button or via seed). Then:

```js
() => {
  const paper = Array.from(document.querySelectorAll('.mantine-Paper-root'))
    .find(p => p.textContent.includes('候选池'))
  const body = paper.querySelector('[style*="inset"]')
  // The body div is the droppable; dnd-kit attaches the ref directly.
  // We can't easily read the ref but we can check that it has role/aria
  // attributes consistent with being a drop target. dnd-kit doesn't set
  // any — instead check that the body is a plain div (not a button) and
  // has the inset shadow class/style.
  return {
    bodyHasInsetShadow: body ? getComputedStyle(body).boxShadow.includes('inset') : false,
  }
}
```

Expected: `bodyHasInsetShadow: true`.

- [ ] **Step 5: Verify non-empty toolbar has both buttons**

After adding a candidate:

```js
() => {
  const toolbar = Array.from(document.querySelectorAll('.mantine-Group-root'))
    .find(g => g.textContent.includes('加一个') && g.textContent.includes('AI 帮选'))
  const addBtn = Array.from(document.querySelectorAll('button'))
    .find(b => b.textContent.trim() === '加一个')
  const aiBtn = Array.from(document.querySelectorAll('button'))
    .find(b => b.textContent.trim() === 'AI 帮选')
  return {
    toolbarFound: !!toolbar,
    addBtnPresent: !!addBtn,
    aiBtnPresent: !!aiBtn,
  }
}
```

Expected: all three `true`.

- [ ] **Step 6: Plan 2 acceptance re-verification (no regression)**

```js
() => {
  const headers = Array.from(document.querySelectorAll('[data-testid="day-header"]'))
  return {
    bodyOverflow: document.body.scrollWidth > document.body.clientWidth,
    dayCount: headers.length,
    allFullyVisible: headers.every(el => {
      const r = el.getBoundingClientRect()
      return r.left >= 0 && r.right <= window.innerWidth + 2
    }),
  }
}
```

Expected: `bodyOverflow: false, dayCount: 5, allFullyVisible: true`.

- [ ] **Step 7: Screenshot for PR** (optional)

`take_screenshot({ filePath: '/tmp/backlog-after.png' })` at 1280×800 in empty state for before/after comparison in the PR body.

No commit for Task 5 unless a regression surfaces — in which case go back to the relevant earlier task, fix, re-commit under its number.

---

## Task 6: CI parity

- [ ] **Step 1: Run the CI suite**

```bash
mise exec -- bundle exec rspec
npm test
mise exec -- bundle exec rubocop -f github app/
mise exec -- bundle exec brakeman --no-pager
npm audit
```

Expected:
- RSpec: unchanged baseline (no Ruby touched)
- Vitest: all tests pass
- Rubocop on `app/`: no new offenses
- Brakeman: 0 warnings
- `npm audit`: 0 vulnerabilities

If green, plan is done.

---

## Self-Review

Coverage against [the spec](docs/superpowers/specs/2026-04-18-backlog-empty-state-redesign-design.md):

- **#1 vertical dead zone** → Task 4 (DashedStack `flex: 1`, Paper flex column, Body flex: 1)
- **#2 fake drop zone** → Task 4 (ref moves from Paper to Body; dashed frame now visually matches droppable extent)
- **#3 inverted CTA hierarchy + redundant 跳到对话** → Task 1 (delete 跳到对话) + Task 2 (rename to `加一个` / `AI 帮选`) + Task 3 (twin toolbar)
- **#4 池 metaphor** → Task 4 (Body `boxShadow: inset 0 2px 4px rgba(0,0,0,0.04)`)
- **#5 onboarding cliff** → Task 3 (non-empty state twin toolbar mirrors empty state)
- **#6 text + no visual cue** → Task 4 (delete 先把想去的点塞进这里 hint)
- **Show.jsx onFocusChat cleanup** → Task 1 Step 4
- **Test updates** → Tasks 1, 2, 3, 4 (each task updates the specific tests affected by its change)
- **CI parity** → Task 6

No placeholders. Button labels consistent across tasks: `加一个`, `AI 帮选`, `收起 ◂`. Variant consistent: `variant="default"` for both CTAs in both states. Droppable ref position consistent: always Body in Task 4 onwards.

One deliberate coupling note: Task 3 wraps the non-empty `加一个` in a `<Group grow>` with `AI 帮选`. Task 4 then restructures the surrounding Paper/Body. The sequencing matters — if you reorder them, Task 3's toolbar lands inside the old Body, which Task 4 then still replaces correctly. Either order works, but the chosen order builds up complexity gradually (small → larger edits), which is easier to review task-by-task.
