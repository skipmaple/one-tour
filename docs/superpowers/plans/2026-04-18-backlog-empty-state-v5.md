# Backlog Empty State V5 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Split the V4 empty-state Stack into two siblings — a dashed hint-only frame (flex:1) and a bottom-pinned button Group — so buttons align with the non-empty state's toolbar position.

**Architecture:** Single-block edit in `BacklogList.jsx`. Replace V4's single `<Stack>` (containing hint + buttons inside one dashed frame) with a Fragment holding two siblings: `<Stack>` for the dashed frame + hint only, and a separate `<Group>` for the two buttons with `mt="xs"`. The Body's flex-column layout handles the rest — Stack with `flex:1` fills upper space, Group naturally sits at the bottom of Body's padding.

**Tech Stack:** React 18, `@mantine/core` v9, existing `dragState` variable from V2.

**Reference spec:** [docs/superpowers/specs/2026-04-18-backlog-empty-state-v5-design.md](docs/superpowers/specs/2026-04-18-backlog-empty-state-v5-design.md)

---

## File Structure

| File | Action | Responsibility |
|---|---|---|
| [app/javascript/components/planner/BacklogList.jsx](app/javascript/components/planner/BacklogList.jsx) | Modify | Split V4 empty-state Stack into Fragment with Stack (hint only) + Group (buttons) |

No test changes. No other files touched.

---

## Task 1: Split V4 empty-state Stack into dashed hint-frame + bottom button Group

**Files:**
- Modify: `app/javascript/components/planner/BacklogList.jsx`

- [ ] **Step 1: Replace the empty-state JSX block**

Open `app/javascript/components/planner/BacklogList.jsx`. Locate the V4 empty-state block (inside the Body div, after the readOnly empty check around line 122). Find:

```jsx
        {isEmpty && !readOnly && (
          <Stack
            gap="xs"
            p="md"
            justify="center"
            style={{
              flex: 1,
              border: '2px dashed ' + (dragState === 'idle' ? 'var(--mantine-color-gray-5)' : 'transparent'),
              borderRadius: 4,
              background: dragState === 'idle' ? '#fafafa' : 'transparent',
              transition: 'border-color 120ms ease, background-color 120ms ease',
            }}
          >
            <Text size="xs" c="gray.7" ta="center">先把想去的点塞进这里，再拖到右侧日。</Text>
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

Replace with:

```jsx
        {isEmpty && !readOnly && (
          <>
            <Stack
              gap="xs"
              p="md"
              justify="center"
              style={{
                flex: 1,
                border: '2px dashed ' + (dragState === 'idle' ? 'var(--mantine-color-gray-5)' : 'transparent'),
                borderRadius: 4,
                background: dragState === 'idle' ? '#fafafa' : 'transparent',
                transition: 'border-color 120ms ease, background-color 120ms ease',
              }}
            >
              <Text size="xs" c="gray.7" ta="center">先把想去的点塞进这里，再拖到右侧日。</Text>
            </Stack>
            <Group gap={4} grow mt="xs">
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
          </>
        )}
```

Three conceptual changes:

1. Wrap in Fragment (`<>...</>`) — Stack and Group become two direct flex children of the Body div instead of one Stack root.
2. Remove the inner `<Group>` from the Stack — Stack now only contains the hint `<Text>`. Stack keeps `flex:1` + `justify="center"`, so the hint is centered both horizontally (via `ta="center"`) and vertically (via `justify="center"`) in a frame that fills the upper portion of Body.
3. Move the `<Group>` to be a sibling of Stack with `mt="xs"` (8px top margin). It sits naturally at the bottom of Body's flex-column layout because the preceding Stack with `flex:1` consumes all remaining space.

The buttons themselves are unchanged: same `size="sm"`, `variant="default"`, `fw={500}/fw={700}`, `onClick` handlers.

- [ ] **Step 2: Run the full test suite**

Run: `npm test`

Expected: 175 passed. No test asserts on Stack containment of buttons or Fragment structure; the hint `getByText` assertion still passes, the button `getByRole({ name: ... })` assertions still pass.

- [ ] **Step 3: Commit**

```bash
git add app/javascript/components/planner/BacklogList.jsx
git commit -m "$(cat <<'EOF'
refactor(planner): V5 — split empty-state frame, move buttons to Body bottom

V4 put hint and buttons both inside the dashed frame. V5 splits
them: dashed frame becomes a pure onboarding visual (hint only,
centered); buttons move to Body's bottom as an independent Group,
matching the non-empty state's toolbar position exactly.

Side effect (the real win): buttons now sit at the same Y position
in both empty and non-empty states. When the user adds the first
candidate, the upper frame morphs into filter + cards, but the
toolbar row stays put. Final elimination of the button position
cliff that has haunted V1 → V4.

Drag state unchanged: dashed frame still fades border-color and bg
to transparent over 120ms; buttons now fully independent of the
Stack so they remain visible and clickable throughout any drag.
EOF
)"
```

---

## Task 2: Visual verification via chrome-devtools-mcp

No code changes. Verify the split layout + button alignment + drag independence.

- [ ] **Step 1: Dev server up**

`bin/worktree-dev up` on port 9101. If not running, start it.

- [ ] **Step 2: Load empty-state planner at 1280×800**

```
navigate_page(url: "http://127.0.0.1:9101/tours/<empty-backlog-tour>")
click 规划 tab if needed
resize_page(width: 1280, height: 800)
```

- [ ] **Step 3: Verify idle empty-state structure**

```js
// evaluate_script
() => {
  const paper = Array.from(document.querySelectorAll('.mantine-Paper-root'))
    .find(p => p.textContent.includes('候选池'))
  if (!paper) return { error: 'paper not found' }

  const body = Array.from(paper.children).find(c => !c.className.includes('mantine-Group-root'))

  // V5 empty state: Body should have Stack (dashed) + Group (buttons) as direct flex children
  const stack = Array.from(body.children).find(c => c.className.includes('mantine-Stack-root'))
  const group = Array.from(body.children).findLast(c => c.className.includes('mantine-Group-root'))

  if (!stack || !group) return { error: 'stack or group missing', stackFound: !!stack, groupFound: !!group }

  // Verify Stack contains hint only (no button descendants)
  const stackButtons = stack.querySelectorAll('button').length
  const stackHint = stack.querySelector('.mantine-Text-root')?.textContent?.trim().startsWith('先把想去的点塞进这里')

  // Verify Group contains 2 buttons
  const groupButtons = Array.from(group.querySelectorAll('button')).map(b => b.textContent.trim())

  const bodyRect = body.getBoundingClientRect()
  const stackRect = stack.getBoundingClientRect()
  const groupRect = group.getBoundingClientRect()

  return {
    stackHasHintOnly: stackHint && stackButtons === 0,
    groupButtons,
    stackBorderStyle: getComputedStyle(stack).borderStyle,
    stackBg: getComputedStyle(stack).backgroundColor,
    stackFillsUpper: +(stackRect.height / bodyRect.height).toFixed(2),
    groupBelowStack: Math.round(groupRect.top - stackRect.bottom),
    groupAboveBodyBottom: Math.round(bodyRect.bottom - groupRect.bottom),
  }
}
```

Expected:
- `stackHasHintOnly: true`
- `groupButtons: ['加候选', 'AI 帮选']`
- `stackBorderStyle: 'dashed'`
- `stackBg: 'rgb(250, 250, 250)'` (#fafafa)
- `stackFillsUpper: ≥ 0.75` (Stack takes most of Body; Group takes the bottom)
- `groupBelowStack: ≈ 8` (mt="xs" = 8px gap between Stack bottom and Group top)
- `groupAboveBodyBottom: ≈ 0` (Group sits at Body's bottom padding edge)

- [ ] **Step 4: Verify button Y position alignment with non-empty state**

Capture the `<y>` coordinate of the button row in empty state:

```js
() => {
  const paper = Array.from(document.querySelectorAll('.mantine-Paper-root'))
    .find(p => p.textContent.includes('候选池'))
  const btn = Array.from(paper.querySelectorAll('button'))
    .find(b => b.textContent.trim() === '加候选')
  return btn ? Math.round(btn.getBoundingClientRect().top) : null
}
```

Save this number (e.g., 640). Then add a candidate to the backlog (click `加候选`, fill drawer, save) and re-run the same script. The returned value should match the empty-state value ± 4px (margin-of-error from font rendering, slight reflow from filter row appearing, etc.).

Expected: **button Y position stable across state transition**. This is the V5 core deliverable.

- [ ] **Step 5: Verify drag state fades frame only, not buttons**

Drag a card from any day column. While hovering over the candidate pool (not yet released):

```js
() => {
  const paper = Array.from(document.querySelectorAll('.mantine-Paper-root'))
    .find(p => p.textContent.includes('候选池'))
  const body = Array.from(paper.children).find(c => !c.className.includes('mantine-Group-root'))
  const stack = Array.from(body.children).find(c => c.className.includes('mantine-Stack-root'))
  const group = Array.from(body.children).findLast(c => c.className.includes('mantine-Group-root'))

  const stackCs = getComputedStyle(stack)
  const bodyCs = getComputedStyle(body)

  const btnVisible = Array.from(group.querySelectorAll('button')).every(b =>
    b.offsetParent !== null && getComputedStyle(b).opacity !== '0'
  )

  return {
    outerBodyHasDashedBorder: bodyCs.borderStyle === 'dashed',
    innerStackBorderColor: stackCs.borderColor,
    innerStackBg: stackCs.backgroundColor,
    buttonsVisible: btnVisible,
  }
}
```

Expected during drag-over:
- `outerBodyHasDashedBorder: true` (V2 drop zone visual active)
- `innerStackBorderColor: 'rgba(0, 0, 0, 0)'` or similar transparent (inner frame faded out)
- `innerStackBg: 'rgba(0, 0, 0, 0)'` (inner bg faded out)
- `buttonsVisible: true` (buttons independent of the Stack, not affected)

If drag automation is fiddly, this step can be done manually — drag a card by mouse and eyeball the result.

- [ ] **Step 6: Screenshot for PR body** (optional)

`take_screenshot({ filePath: '/tmp/v5-empty.png' })` at idle empty state.

No commit for Task 2. Any regression → back to Task 1, fix, recommit.

---

## Task 3: CI parity

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
- RSpec: 256 passed (no Ruby touched)
- Vitest: 175 passed
- Rubocop on `app/`: 0 new offenses
- Brakeman: 0 warnings
- `npm audit`: 0 vulnerabilities

If all green, plan is done.

---

## Self-Review

Coverage against [the spec](docs/superpowers/specs/2026-04-18-backlog-empty-state-v5-design.md):

- **Splitting Stack into Fragment + 2 siblings** → Task 1 Step 1 (3 conceptual changes spelled out)
- **Dashed frame holds hint only** → Task 1 Step 1, verified in Task 2 Step 3
- **Buttons at Body bottom as independent Group** → Task 1 Step 1, verified in Task 2 Step 3
- **Cross-state button Y alignment** → Task 2 Step 4 (specific verification)
- **Drag state: frame fades, buttons independent** → Task 1 preserves V4 frame fade logic; Task 2 Step 5 verifies
- **V3 non-empty state unchanged** → no edits to that branch
- **No test changes** → explicit in spec and plan
- **CI parity** → Task 3

No placeholders. The `dragState` variable referenced in the Stack style is defined by the V2 code earlier in the component (around line 50) and remains in scope. Fragment (`<>...</>`) is standard React syntax and valid wherever JSX expects a single return value.
