# Backlog Empty State V4 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bring back a V1-style dashed light-gray frame around the empty-state hint and buttons; make the frame fade out during drag so V2's outer Body drop-zone visuals take over without double-framing.

**Architecture:** Single-block edit in `BacklogList.jsx`. Replace the V3 `<Stack gap="xs" mt="auto">` wrapper with a `<Stack>` that has `flex: 1`, `justify="center"`, and dynamic `border` + `background` tied to the existing `dragState` variable. Use `transition: border-color 120ms` (matching the V2 Body transition) for a crossfade effect. Outer hint gets `ta="center"` to match the reference mockup. No test changes.

**Tech Stack:** React 18, `@mantine/core` v9, existing `useDroppable` hook and `dragState` variable from V2.

**Reference spec:** [docs/superpowers/specs/2026-04-18-backlog-empty-state-v4-design.md](docs/superpowers/specs/2026-04-18-backlog-empty-state-v4-design.md)

---

## File Structure

| File | Action | Responsibility |
|---|---|---|
| [app/javascript/components/planner/BacklogList.jsx](app/javascript/components/planner/BacklogList.jsx) | Modify | Replace the empty-state `<Stack>` block (V3 version pinned to bottom) with V4 version (flex:1 centered dashed frame that fades during drag) |

No test changes. No other files touched.

---

## Task 1: Replace V3 empty-state Stack with V4 dashed frame

**Files:**
- Modify: `app/javascript/components/planner/BacklogList.jsx`

- [ ] **Step 1: Replace the empty-state JSX block**

Open `app/javascript/components/planner/BacklogList.jsx`. Locate the V3 empty-state block (inside the Body div, after the readOnly empty check). Find:

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

Replace with:

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

Six conceptual changes in this replacement:

1. `Stack gap="xs" mt="auto"` → `Stack gap="xs" p="md" justify="center" style={{...}}`. Removes bottom-pinning; adds 16px inner padding + center-vertical flex layout; adds inline style object for drag-aware border/bg.
2. `flex: 1` — Stack fills Body's remaining vertical space (Body is flex column; the Stack is its main child in empty state).
3. `border: '2px dashed ' + (dragState === 'idle' ? 'var(--mantine-color-gray-5)' : 'transparent')` — border-width constant at 2px; color toggles between `gray-5` (idle) and `transparent` (drag).
4. `background: dragState === 'idle' ? '#fafafa' : 'transparent'` — light gray fill when idle; transparent during drag.
5. `transition: 'border-color 120ms ease, background-color 120ms ease'` — matches V2 Body transition timing for synchronized crossfade (V2's Body transition is defined around line 106 of the current file).
6. Hint `<Text>` gains `ta="center"` — matches the reference mockup's centered hint.

Buttons and Group are unchanged (fw=500/700, grow, labels).

- [ ] **Step 2: Run the full test suite**

Run: `npm test`

Expected: 175 passed. No test asserts on empty-state CSS; the hint text assertion (flipped in V3 Task 1 to `getByText`) still passes because the hint still renders. Button role+name assertions unchanged.

- [ ] **Step 3: Commit**

```bash
git add app/javascript/components/planner/BacklogList.jsx
git commit -m "$(cat <<'EOF'
refactor(planner): V4 — dashed frame returns to empty state, fades on drag

V3 pinned the empty-state hint + buttons to the bottom of Body,
leaving ~70% of the panel as bare white space. Reference design
wants V1's dashed light-gray container back, to convey "pool".

V4 does that, conditionally:
- Idle: Stack has 2px dashed gray-5 border + #fafafa background,
  fills Body via flex:1, content centered vertically + horizontally
- Drag (active or over): border-color and background fade to
  transparent over 120ms, letting the outer Body's drop-zone
  visuals (added in V2) take over without a double-frame

border-width stays 2px throughout so content has zero layout
shift. Matches V2's Body transition timing (120ms border-color +
background-color) for synchronized crossfade.

Non-empty state unchanged — keeps V3's filter → cards → toolbar
bottom layout.
EOF
)"
```

---

## Task 2: Visual verification via chrome-devtools-mcp

No code changes. Verify both idle and drag states match the design.

- [ ] **Step 1: Dev server up**

`bin/worktree-dev up` on port 9101. If not running, start it.

- [ ] **Step 2: Load planner with empty backlog, 1280×800**

```
navigate_page(url: "http://127.0.0.1:9101/tours/<empty-backlog-tour-id>")
click 规划 tab if needed
resize_page(width: 1280, height: 800)
```

- [ ] **Step 3: Verify idle state — dashed frame visible, centered, filling Body**

```js
// evaluate_script
() => {
  const paper = Array.from(document.querySelectorAll('.mantine-Paper-root'))
    .find(p => p.textContent.includes('候选池'))
  const body = Array.from(paper.children).find(c => !c.className.includes('mantine-Group-root'))
  const stack = body.querySelector('.mantine-Stack-root')
  const cs = stack ? getComputedStyle(stack) : null
  const bodyRect = body.getBoundingClientRect()
  const stackRect = stack ? stack.getBoundingClientRect() : null

  return {
    stackBorder: cs ? `${cs.borderWidth} ${cs.borderStyle} ${cs.borderColor}` : null,
    stackBg: cs ? cs.backgroundColor : null,
    stackTextAlign: cs ? cs.textAlign : null,
    stackFillsBody: bodyRect && stackRect
      ? +(stackRect.height / bodyRect.height).toFixed(2)
      : null,
    hintCentered: (() => {
      const hint = Array.from(paper.querySelectorAll('.mantine-Text-root'))
        .find(e => e.textContent.trim().startsWith('先把想去的点塞进这里'))
      return hint ? getComputedStyle(hint).textAlign : null
    })(),
  }
}
```

Expected:
- `stackBorder`: `"2px dashed rgb(173, 181, 189)"` (gray-5 in Mantine's default theme)
- `stackBg`: `"rgb(250, 250, 250)"` (#fafafa)
- `stackFillsBody`: ≥ 0.85 (Stack fills most of Body's available height via flex:1)
- `hintCentered`: `"center"` (the `ta="center"` prop applied)

- [ ] **Step 4: Verify drag state — inner frame fades out**

This step requires simulating an active drag, which is fiddly to automate via chrome-devtools-mcp. Two options:

**Option 4a (manual):** Drag an ActivityCard from any day column with at least one card. While hovering mid-drag (not yet released), run:

```js
() => {
  const paper = Array.from(document.querySelectorAll('.mantine-Paper-root'))
    .find(p => p.textContent.includes('候选池'))
  const body = Array.from(paper.children).find(c => !c.className.includes('mantine-Group-root'))
  const stack = body.querySelector('.mantine-Stack-root')
  const stackCs = stack ? getComputedStyle(stack) : null
  const bodyCs = getComputedStyle(body)
  return {
    outerBodyBorder: `${bodyCs.borderWidth} ${bodyCs.borderStyle} ${bodyCs.borderColor}`,
    outerBodyBg: bodyCs.backgroundColor,
    innerStackBorderColor: stackCs?.borderColor,
    innerStackBg: stackCs?.backgroundColor,
  }
}
```

Expected mid-drag: outer Body has dashed `gray-5` border + non-transparent bg; inner Stack border-color is `rgba(0, 0, 0, 0)` or `transparent` AND Stack bg is also `rgba(0, 0, 0, 0)` or `transparent`. This confirms the inner frame faded out while the outer took over.

**Option 4b (code-only inspection):** Accept visual verification by reading the implementation in source and confirming the `dragState` ternaries are wired to the expected CSS values. Run the idle check (Step 3) and trust Mantine's transition CSS to do the right thing when `dragState` changes to `active` or `over`. This skips the manual drag dance at the cost of less end-to-end confidence.

- [ ] **Step 5: Regression check — non-empty state still has V3 layout**

Add a candidate to the backlog (click `加候选`, fill out the drawer, save). Then:

```js
() => {
  const paper = Array.from(document.querySelectorAll('.mantine-Paper-root'))
    .find(p => p.textContent.includes('候选池'))
  const body = Array.from(paper.children).find(c => !c.className.includes('mantine-Group-root'))
  const children = Array.from(body.children).map(c => {
    if (c.className.includes('mantine-Group-root')) {
      const btnLabels = Array.from(c.querySelectorAll('button')).map(b => b.textContent.trim())
      if (btnLabels.includes('加候选') && btnLabels.includes('AI 帮选')) return 'toolbar'
      return 'filter'
    }
    if (c.className.includes('mantine-Stack-root')) return 'cards'
    return 'other'
  })
  return {
    order: children,
    expectedLast: children[children.length - 1] === 'toolbar',
  }
}
```

Expected: `order` ends with `"toolbar"` (V3 non-empty layout unchanged — filter → cards → toolbar).

- [ ] **Step 6: Screenshot for PR body** (optional)

`take_screenshot({ filePath: '/tmp/v4-empty.png' })` at idle empty state. Compare with the reference mockup attached to the user's V4 request.

No commit for Task 2. If a regression surfaces, go back to Task 1 and fix.

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

Coverage against [the spec](docs/superpowers/specs/2026-04-18-backlog-empty-state-v4-design.md):

- **Core empty-state Stack replacement** → Task 1 Step 1 (6 specific changes enumerated)
- **Drag-state crossfade** → Task 1 Step 1 (border-color + bg via `dragState` ternary) + Task 2 Step 4 verification
- **Zero layout shift via constant 2px border-width** → encoded in the CSS string `'2px dashed ' + color` pattern
- **Non-empty unchanged** → Task 2 Step 5 regression check
- **Tests unchanged** → explicit in spec and plan; no test file touched
- **Verification + CI** → Tasks 2 and 3

No placeholders. The `dragState` variable referenced in the replacement JSX is the same variable defined around line 50 of BacklogList.jsx by the V2 refactor — it's already in scope inside the empty-state block. One string concatenation (`'2px dashed ' + ...`) is intentional over a full ternary template string, for readability.
