# Backlog + Chat Folded-State A11y Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix 5 WCAG 2.1 AA findings in the candidate pool + AI chat folded states — semantic button, contrast, touch target, dashed border.

**Architecture:** Three files touched, each a focused change. `BacklogList.jsx` and `ChatPanel.jsx` replace their folded `<Paper onClick>` with `<UnstyledButton aria-label>`, swap `c="dimmed"` for `c="gray.7"` on the three audited texts, and use `gray.5` for the dashed frame border. `Show.jsx` bumps the collapsed grid-column width from 36 to 44. Two tests assert `role="button"` + accessible name.

**Tech Stack:** React 18, `@mantine/core` v9 (`UnstyledButton`, color tokens), Vitest + React Testing Library.

**Reference spec:** [docs/superpowers/specs/2026-04-18-backlog-chat-folded-a11y-design.md](docs/superpowers/specs/2026-04-18-backlog-chat-folded-a11y-design.md)

---

## File Structure

| File | Action | Responsibility |
|---|---|---|
| [app/javascript/components/planner/BacklogList.jsx](app/javascript/components/planner/BacklogList.jsx) | Modify | Folded `<Paper onClick>` → `<UnstyledButton aria-label>`; `c="dimmed"` → `c="gray.7"` (2 places); dashed border `#ccc` → `gray.5` token |
| [app/javascript/components/planner/ChatPanel.jsx](app/javascript/components/planner/ChatPanel.jsx) | Modify | Folded `<Paper onClick>` → `<UnstyledButton aria-label>`; `c="dimmed"` → `c="gray.7"` on the folded label |
| [app/javascript/pages/Tour/Show.jsx](app/javascript/pages/Tour/Show.jsx) | Modify | Grid template: collapsed column width 36 → 44 (both sides) |
| [app/javascript/components/planner/__tests__/BacklogList.test.jsx](app/javascript/components/planner/__tests__/BacklogList.test.jsx) | Modify | Add 1 test for `role="button"` + accessible name `展开候选池` |
| [app/javascript/components/planner/__tests__/ChatPanel.test.jsx](app/javascript/components/planner/__tests__/ChatPanel.test.jsx) | Modify | Add 1 test for `role="button"` + accessible name `展开 AI 对话` |

---

## Task 1: BacklogList folded state → `UnstyledButton` + a11y test (TDD)

**Files:**
- Modify: `app/javascript/components/planner/__tests__/BacklogList.test.jsx` — append 1 test
- Modify: `app/javascript/components/planner/BacklogList.jsx` — swap folded branch + contrast + dashed border

- [ ] **Step 1: Append the failing test**

Open `app/javascript/components/planner/__tests__/BacklogList.test.jsx`. Append this test at the bottom of the file (it sits alongside the three Plan 2 Task 1 tests for the folded state):

```jsx
test('folded state exposes role=button with accessible name 展开候选池', () => {
  const onToggle = vi.fn()
  render(
    <MantineProvider>
      <DndContext>
        <BacklogList activities={fixtures} open={false} onToggle={onToggle} />
      </DndContext>
    </MantineProvider>
  )
  const btn = screen.getByRole('button', { name: '展开候选池' })
  expect(btn).toBeInTheDocument()
  fireEvent.click(btn)
  expect(onToggle).toHaveBeenCalledTimes(1)
})
```

Note: The earlier Plan 2 test `clicking the collapsed trigger calls onToggle` uses `screen.getByText(/展开候选池/)` which would pass even if the element were still a non-interactive `<div>`. This new test uses `getByRole('button', { name: ... })`, which only passes when the element is semantically a button AND has the accessible name `展开候选池` (from `aria-label`).

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run app/javascript/components/planner/__tests__/BacklogList.test.jsx`

Expected: The new test FAILS with `TestingLibraryElementError: Unable to find an accessible element with the role "button" and name "展开候选池"` (the current folded state is a `<Paper>` div with no role). The three pre-existing tests still pass.

- [ ] **Step 3: Modify `BacklogList.jsx` — folded branch + contrast + dashed border**

Open `app/javascript/components/planner/BacklogList.jsx`. Three edits.

**Edit 3a:** At the top of the file, add `UnstyledButton` to the Mantine import line:

Current line 2:
```jsx
import { Paper, Title, Stack, Text, Button, Group, Select } from '@mantine/core'
```

Change to:
```jsx
import { Paper, Title, Stack, Text, Button, Group, Select, UnstyledButton } from '@mantine/core'
```

**Edit 3b:** Replace the folded-branch block (the `if (!open) return (...)` block added in Plan 2 Task 1). Find this exact block:

```jsx
  if (!open) {
    return (
      <Paper
        withBorder
        onClick={onToggle}
        style={{
          cursor: 'pointer',
          background: '#f3f3f3',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Text size="xs" c="dimmed" style={{ writingMode: 'vertical-rl' }}>
          展开候选池 ▸
        </Text>
      </Paper>
    )
  }
```

Replace with:

```jsx
  if (!open) {
    return (
      <UnstyledButton
        onClick={onToggle}
        aria-label="展开候选池"
        style={{
          cursor: 'pointer',
          background: '#f3f3f3',
          border: '1px solid var(--mantine-color-default-border)',
          borderRadius: 4,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: '100%',
          height: '100%',
        }}
      >
        <Text size="xs" c="gray.7" style={{ writingMode: 'vertical-rl' }}>
          展开候选池 ▸
        </Text>
      </UnstyledButton>
    )
  }
```

Three changes in this block: `<Paper withBorder>` → `<UnstyledButton>` (with explicit `border` + `borderRadius` in style since `withBorder` is gone); `aria-label="展开候选池"` added; `c="dimmed"` → `c="gray.7"`; `width/height: 100%` added so the button fills its grid cell.

**Edit 3c:** Update the empty-state hint text color. Find this block (around line 73 in the current file, inside the `{isEmpty && !readOnly && (...)}` JSX):

```jsx
            <Text size="xs" c="dimmed" ta="center">
              先把想去的点塞进这里，再拖到右侧日。
            </Text>
```

Change to:

```jsx
            <Text size="xs" c="gray.7" ta="center">
              先把想去的点塞进这里，再拖到右侧日。
            </Text>
```

**Edit 3d:** Update the dashed frame border color. Find this block in the same `{isEmpty && !readOnly && (...)}` JSX:

```jsx
          <Stack
            gap="xs"
            p="md"
            align="stretch"
            style={{ border: '2px dashed #ccc', borderRadius: 4, background: '#fafafa' }}
          >
```

Change to:

```jsx
          <Stack
            gap="xs"
            p="md"
            align="stretch"
            style={{ border: '2px dashed var(--mantine-color-gray-5)', borderRadius: 4, background: '#fafafa' }}
          >
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run app/javascript/components/planner/__tests__/BacklogList.test.jsx`

Expected: PASS — all 15 tests (11 pre-existing + 3 Plan 2 + 1 new) green.

- [ ] **Step 5: Commit**

```bash
git add app/javascript/components/planner/BacklogList.jsx app/javascript/components/planner/__tests__/BacklogList.test.jsx
git commit -m "$(cat <<'EOF'
fix(planner): a11y hardening for BacklogList folded + empty states

- Folded <Paper onClick> → <UnstyledButton aria-label="展开候选池">
  (WCAG 2.1.1 keyboard + 4.1.2 name/role/value)
- Folded label + empty-state hint: c="dimmed" (~3:1) → c="gray.7"
  (~8:1, WCAG 1.4.3)
- Dashed frame border #ccc (1.61:1) → gray.5 (3.03:1, WCAG 1.4.11)
- New test asserts role=button + accessible name, catching future
  regressions where the element loses its semantic role.
EOF
)"
```

---

## Task 2: ChatPanel folded state → `UnstyledButton` + a11y test (TDD)

**Files:**
- Modify: `app/javascript/components/planner/__tests__/ChatPanel.test.jsx` — append 1 test
- Modify: `app/javascript/components/planner/ChatPanel.jsx` — swap folded branch + contrast

- [ ] **Step 1: Append the failing test**

Open `app/javascript/components/planner/__tests__/ChatPanel.test.jsx`. The existing file already uses a `mockState` module mock for `useChat` and a `renderPanel()` helper that passes `open={true}` by default. Append this test at the bottom of the file:

```jsx
test('folded state exposes role=button with accessible name 展开 AI 对话', () => {
  const onToggle = vi.fn()
  const tour = { id: 42, title: 'Test Tour' }
  render(
    <MantineProvider>
      <ChatPanel tour={tour} open={false} onToggle={onToggle} />
    </MantineProvider>
  )
  const btn = screen.getByRole('button', { name: '展开 AI 对话' })
  expect(btn).toBeInTheDocument()
  fireEvent.click(btn)
  expect(onToggle).toHaveBeenCalledTimes(1)
})
```

The top of the file already imports `render, screen, fireEvent` from `@testing-library/react` and `vi` from `vitest`; no new imports needed.

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run app/javascript/components/planner/__tests__/ChatPanel.test.jsx`

Expected: The new test FAILS with `Unable to find an accessible element with the role "button" and name "展开 AI 对话"`. Pre-existing tests still pass.

- [ ] **Step 3: Modify `ChatPanel.jsx` — folded branch**

Open `app/javascript/components/planner/ChatPanel.jsx`. Two edits.

**Edit 3a:** Add `UnstyledButton` to the Mantine import. Current line 1:

```jsx
import { Paper, Text, Button, Textarea, Stack, Group, Badge, Code } from '@mantine/core'
```

Change to:

```jsx
import { Paper, Text, Button, Textarea, Stack, Group, Badge, Code, UnstyledButton } from '@mantine/core'
```

**Edit 3b:** Replace the folded branch at lines 14–24 (the `if (!open)` block). Find:

```jsx
  if (!open) {
    return (
      <Paper
        withBorder
        onClick={onToggle}
        style={{ cursor: 'pointer', background: '#f3f3f3', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      >
        <Text size="xs" c="dimmed" style={{ writingMode: 'vertical-rl' }}>◂ 展开 AI 对话</Text>
      </Paper>
    )
  }
```

Replace with:

```jsx
  if (!open) {
    return (
      <UnstyledButton
        onClick={onToggle}
        aria-label="展开 AI 对话"
        style={{
          cursor: 'pointer',
          background: '#f3f3f3',
          border: '1px solid var(--mantine-color-default-border)',
          borderRadius: 4,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: '100%',
          height: '100%',
        }}
      >
        <Text size="xs" c="gray.7" style={{ writingMode: 'vertical-rl' }}>◂ 展开 AI 对话</Text>
      </UnstyledButton>
    )
  }
```

Same shape as the BacklogList change: `<Paper>` → `<UnstyledButton>` with explicit border/radius, `aria-label` added, `c="dimmed"` → `c="gray.7"`, `width/height: 100%`.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run app/javascript/components/planner/__tests__/ChatPanel.test.jsx`

Expected: PASS — all pre-existing tests + 1 new test green.

- [ ] **Step 5: Commit**

```bash
git add app/javascript/components/planner/ChatPanel.jsx app/javascript/components/planner/__tests__/ChatPanel.test.jsx
git commit -m "$(cat <<'EOF'
fix(planner): a11y hardening for ChatPanel folded state

Mirrors the BacklogList change in the previous commit: folded
<Paper onClick> → <UnstyledButton aria-label="展开 AI 对话"> so
keyboard users and screen readers can expand the chat pane (WCAG
2.1.1 + 4.1.2). Label color c="dimmed" → c="gray.7" for 4.5:1
contrast (WCAG 1.4.3). New test asserts role=button + accessible
name.
EOF
)"
```

---

## Task 3: Show.jsx collapsed grid width 36 → 44 (#5)

**Files:**
- Modify: `app/javascript/pages/Tour/Show.jsx:145` area (the `gridTemplateColumns` string)

- [ ] **Step 1: Apply the edit**

Open `app/javascript/pages/Tour/Show.jsx`. Find the outer grid div added in Plan 2 Task 3. It starts around line 145 with:

```jsx
        <div style={{
          display: 'grid',
          gridTemplateColumns: `${backlogOpen ? 260 : 36}px 1fr ${chatOpen ? 320 : 36}px`,
          gap: 10,
          padding: 10,
        }}>
```

Change the `gridTemplateColumns` line to use 44 in both collapsed positions:

```jsx
        <div style={{
          display: 'grid',
          gridTemplateColumns: `${backlogOpen ? 260 : 44}px 1fr ${chatOpen ? 320 : 44}px`,
          gap: 10,
          padding: 10,
        }}>
```

- [ ] **Step 2: Run the full JS suite**

Run: `npm test`

Expected: PASS — all tests green. No tests specifically assert the 36/44 value, so this is a visual change only covered by the next step.

- [ ] **Step 3: Commit**

```bash
git add app/javascript/pages/Tour/Show.jsx
git commit -m "$(cat <<'EOF'
fix(planner): collapsed panel width 36 → 44 for touch target (#5)

WCAG 2.5.5 requires interactive targets to be at least 44×44 CSS
pixels. The previous 36px collapsed strips fell short. 1280×800
5-day budget is unaffected (collapsed-side math re-verified in the
spec); both-collapsed still has 1152px middle vs. 632px needed for
5 day cards.
EOF
)"
```

---

## Task 4: Visual + a11y verification via chrome-devtools-mcp

No code changes. Just run the verification pass the spec defined in its Acceptance section.

- [ ] **Step 1: Dev server running**

Worktree dev server should already be up (`bin/worktree-dev up` → port 9101). If not, start it.

- [ ] **Step 2: Load the planner at 1280×800**

With `chrome-devtools-mcp`:
1. `new_page(url: "http://127.0.0.1:9101/auth/developer")` + sign in if needed
2. `navigate_page(url: "http://127.0.0.1:9101/tours/1")` to the 5-day tour from earlier verification
3. Click the 规划 tab if not already on it
4. `resize_page(width: 1280, height: 800)`

- [ ] **Step 3: Assert the role=button + accessible name in both folded states**

Click the "收起 ◂" button in the backlog header to collapse it, then:

```js
// evaluate_script
() => {
  const backlogBtn = Array.from(document.querySelectorAll('button'))
    .find(b => b.getAttribute('aria-label') === '展开候选池')
  const backlogRect = backlogBtn?.getBoundingClientRect()
  return {
    hasBacklogButton: !!backlogBtn,
    backlogWidth: backlogRect ? Math.round(backlogRect.width) : null,
    backlogHeight: backlogRect ? Math.round(backlogRect.height) : null,
  }
}
```

Expected: `hasBacklogButton: true`, `backlogWidth: 44`, `backlogHeight` ≥ 44.

Click "收起 ▸" on the chat panel too, then check the same for `'展开 AI 对话'`. Expected: same shape.

- [ ] **Step 4: Verify contrast of the three audited texts**

```js
// evaluate_script — after both panels are collapsed
() => {
  function parseRgb(s) {
    const m = s.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/)
    return m ? [+m[1], +m[2], +m[3]] : null
  }
  function luminance(rgb) {
    const [r, g, b] = rgb.map(v => { v = v / 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4) })
    return 0.2126 * r + 0.7152 * g + 0.0722 * b
  }
  function ratio(fg, bg) {
    const L1 = luminance(fg), L2 = luminance(bg)
    const [a, b] = L1 > L2 ? [L1, L2] : [L2, L1]
    return (a + 0.05) / (b + 0.05)
  }
  function check(label, fgColor, bgColor) {
    const fg = parseRgb(fgColor), bg = parseRgb(bgColor)
    return { label, contrast: +ratio(fg, bg).toFixed(2), pass: ratio(fg, bg) >= 4.5 }
  }
  const labels = Array.from(document.querySelectorAll('.mantine-Text-root'))
  const backlogLabel = labels.find(e => e.textContent.trim() === '展开候选池 ▸')
  const chatLabel = labels.find(e => e.textContent.trim() === '◂ 展开 AI 对话')
  const backlogBg = backlogLabel ? getComputedStyle(backlogLabel.closest('button')).backgroundColor : null
  const chatBg = chatLabel ? getComputedStyle(chatLabel.closest('button')).backgroundColor : null
  return {
    backlogLabel: backlogLabel ? check('backlog', getComputedStyle(backlogLabel).color, backlogBg) : null,
    chatLabel: chatLabel ? check('chat', getComputedStyle(chatLabel).color, chatBg) : null,
  }
}
```

Expected: both `contrast ≥ 4.5` and `pass: true`. Hint text contrast is covered by unit test coverage on BacklogList (rendered only in empty-state with `c="gray.7"`).

- [ ] **Step 5: Expand both panels and re-verify 5-day layout is still whole**

Click both folded buttons to expand them back. Then:

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

Expected: `bodyOverflow: false`, `dayCount: 5`, `allFullyVisible: true`. This reproduces the Plan 2 acceptance criterion — the Task 3 width bump must not regress it.

- [ ] **Step 6: Take a before/after screenshot of the folded state** (optional, for PR description)

Save to `/tmp/a11y-after.png` via `take_screenshot` at 1280×800 with both panels collapsed. Not committed; used in the eventual PR body.

No commit for Task 4 unless Step 5 exposes a regression, in which case re-run the relevant prior task fix and recommit under its number.

---

## Task 5: CI-matching local verification

- [ ] **Step 1: Run the full CI suite**

Per [CLAUDE.md](CLAUDE.md) "Before claiming done":

```bash
mise exec -- bundle exec rspec
npm test
mise exec -- bundle exec rubocop -f github app/
mise exec -- bundle exec brakeman --no-pager
npm audit
```

Expected:
- RSpec: unchanged from the current baseline (no Ruby touched)
- Vitest: passes with the 2 new tests added (BacklogList + ChatPanel)
- Rubocop on `app/`: no new offenses (pre-existing `db/schema.rb` issues are out of scope)
- Brakeman: 0 warnings
- `npm audit`: 0 vulnerabilities

If all green, the plan is done.

---

## Self-Review

Coverage against [the spec](docs/superpowers/specs/2026-04-18-backlog-chat-folded-a11y-design.md):

- **Finding #1 (folded Paper → UnstyledButton)** → Tasks 1 (BacklogList) + 2 (ChatPanel)
- **Finding #2 (folded label contrast)** → Tasks 1 + 2 (`c="dimmed"` → `c="gray.7"`)
- **Finding #3 (empty hint contrast)** → Task 1 Edit 3c
- **Finding #4 (touch target 36 → 44)** → Task 3
- **Finding #5 (dashed border)** → Task 1 Edit 3d
- **Tests (1 per component)** → Tasks 1 + 2
- **Visual + a11y verification** → Task 4
- **CI parity** → Task 5

No placeholders, no "TODO", no "similar to previous task" (Tasks 1 and 2 each spell out their own full edit, even though the pattern is the same). Component prop names consistent: `open`, `onToggle`, `aria-label` match across tasks. Color tokens consistent: `c="gray.7"` and `var(--mantine-color-gray-5)` specified identically in every edit. `UnstyledButton` imported in both component files.
