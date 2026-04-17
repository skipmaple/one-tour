# DayMetricBar Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the `█░` Unicode tofu progress bars in `DayColumn` and `TimelineDayColumn` with a shared `<DayMetricBar>` component that uses Mantine `<Progress>` with three-tier color signaling (normal / near / over).

**Architecture:** One new presentational component at `app/javascript/components/DayMetricBar.jsx` with a co-located `barColor(value, max)` pure function (exported for direct unit testing). Both call sites replace their inline `progressBar()` helper and raw tofu strings with two `<DayMetricBar>` instances. `TimelineDayColumn` additionally drops the now-redundant `⛔` emoji and the `driveOk`/`tierOneOk` computations that fed it.

**Tech Stack:** React 19, Mantine v9 (`<Progress>`, `<Group>`, `<Text>`), Vitest + @testing-library/react for tests.

Refer to the design spec at [docs/superpowers/specs/2026-04-18-day-metric-bar-design.md](../specs/2026-04-18-day-metric-bar-design.md) for rationale and rejected alternatives.

---

## Task 1: Create `DayMetricBar` component with tests

**Files:**
- Create: `app/javascript/components/DayMetricBar.jsx`
- Create: `app/javascript/components/__tests__/DayMetricBar.test.jsx`

The `__tests__` subdirectory under `components/` does not exist yet — creating the test file will create the directory.

- [ ] **Step 1: Write the failing test file**

Write to `app/javascript/components/__tests__/DayMetricBar.test.jsx`:

```jsx
import { render, screen } from '@testing-library/react'
import { MantineProvider } from '@mantine/core'
import DayMetricBar, { barColor } from '../DayMetricBar'

function renderBar(props) {
  return render(
    <MantineProvider>
      <DayMetricBar {...props} />
    </MantineProvider>
  )
}

describe('barColor', () => {
  test('returns gray.4 when max is 0', () => {
    expect(barColor(3, 0)).toBe('gray.4')
  })

  test('returns gray.4 when max is falsy', () => {
    expect(barColor(3, null)).toBe('gray.4')
    expect(barColor(3, undefined)).toBe('gray.4')
  })

  test('returns gray.5 when pct < 0.9', () => {
    expect(barColor(0, 7)).toBe('gray.5')
    expect(barColor(3, 7)).toBe('gray.5')
    expect(barColor(6.2, 7)).toBe('gray.5')  // 0.885
  })

  test('returns yellow.6 when 0.9 <= pct <= 1.0', () => {
    expect(barColor(6.3, 7)).toBe('yellow.6')  // 0.9
    expect(barColor(7, 7)).toBe('yellow.6')    // 1.0
  })

  test('returns red.6 when pct > 1.0', () => {
    expect(barColor(7.1, 7)).toBe('red.6')
    expect(barColor(14, 7)).toBe('red.6')
  })
})

describe('DayMetricBar', () => {
  test('renders label, value/max, and unit', () => {
    renderBar({ label: '驾驶', value: 3, max: 7, unit: 'h' })
    expect(screen.getByText('驾驶')).toBeInTheDocument()
    expect(screen.getByText('3/7h')).toBeInTheDocument()
  })

  test('renders without unit when unit prop omitted', () => {
    renderBar({ label: '核心', value: 1, max: 3 })
    expect(screen.getByText('1/3')).toBeInTheDocument()
  })

  test('does not crash when max is 0', () => {
    renderBar({ label: '驾驶', value: 2, max: 0, unit: 'h' })
    expect(screen.getByText('2/0h')).toBeInTheDocument()
  })

  test('renders a progressbar role', () => {
    renderBar({ label: '驾驶', value: 3, max: 7, unit: 'h' })
    expect(screen.getByRole('progressbar')).toBeInTheDocument()
  })

  test('progressbar fill value is capped at 100 when value exceeds max', () => {
    renderBar({ label: '驾驶', value: 14, max: 7, unit: 'h' })
    const bar = screen.getByRole('progressbar')
    // Mantine v9 Progress exposes aria-valuenow with the normalized 0-100 value
    expect(bar.getAttribute('aria-valuenow')).toBe('100')
  })

  test('progressbar fill value is 0 when max is 0 (avoid NaN)', () => {
    renderBar({ label: '驾驶', value: 2, max: 0, unit: 'h' })
    const bar = screen.getByRole('progressbar')
    expect(bar.getAttribute('aria-valuenow')).toBe('0')
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- DayMetricBar`

Expected: ALL FAIL with "Cannot find module '../DayMetricBar'" (component does not exist yet).

- [ ] **Step 3: Create the component**

Write to `app/javascript/components/DayMetricBar.jsx`:

```jsx
import { Group, Text, Progress } from '@mantine/core'

export function barColor(value, max) {
  if (!max || max <= 0) return 'gray.4'
  const pct = value / max
  if (pct > 1.0) return 'red.6'
  if (pct >= 0.9) return 'yellow.6'
  return 'gray.5'
}

export default function DayMetricBar({ label, value, max, unit = '' }) {
  const hasCap = !!max && max > 0
  const fillPct = hasCap ? Math.min((value / max) * 100, 100) : 0
  const color = barColor(value, max)

  return (
    <Group gap={6} wrap="nowrap">
      <Text size="xs" c="dimmed" w={28}>{label}</Text>
      <Progress
        size="sm"
        value={fillPct}
        color={color}
        style={{ flex: 1, minWidth: 40 }}
      />
      <Text size="xs" c="dimmed">{value}/{max}{unit}</Text>
    </Group>
  )
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- DayMetricBar`

Expected: All 12 tests pass (5 in `describe('barColor')`, 7 in `describe('DayMetricBar')`).

If the `aria-valuenow` assertions fail because Mantine v9 does not expose that attribute, replace those two assertions with:
```js
const bar = screen.getByRole('progressbar')
// Mantine sets --progress-value CSS variable on the root
expect(bar.style.getPropertyValue('--progress-value')).toBe('100%')
```
Run again and confirm pass.

- [ ] **Step 5: Commit**

```bash
git add app/javascript/components/DayMetricBar.jsx app/javascript/components/__tests__/DayMetricBar.test.jsx
git commit -m "feat(components): add DayMetricBar with three-tier color progress

Shared component for per-day metric progress bars used by DayColumn
(planner) and TimelineDayColumn (overview). Replaces the
████░ Unicode box-drawing tofu with Mantine <Progress>.

Tiers: gray.5 normal, yellow.6 at >=90%, red.6 at >100%, gray.4 when
no cap is configured (max<=0)."
```

---

## Task 2: Wire `DayColumn` to `DayMetricBar`

**Files:**
- Modify: `app/javascript/components/planner/DayColumn.jsx` (lines 1, 98-110)

- [ ] **Step 1: Add the import**

In `app/javascript/components/planner/DayColumn.jsx`, current line 1:

```jsx
import { Paper, Text, Stack, Group, Button } from '@mantine/core'
import { useDroppable } from '@dnd-kit/core'
import ActivityCard from './ActivityCard'
```

Change to add the `DayMetricBar` import after `ActivityCard`:

```jsx
import { Paper, Text, Stack, Group, Button } from '@mantine/core'
import { useDroppable } from '@dnd-kit/core'
import ActivityCard from './ActivityCard'
import DayMetricBar from '../DayMetricBar'
```

- [ ] **Step 2: Replace footer and delete helper**

In the same file, find this block (the `<div>` footer with the old `progressBar()` calls):

```jsx
      <div style={{ borderTop: '1px dashed #ccc', padding: '4px 8px', fontSize: 10, color: '#666' }}>
        驾驶 {progressBar(driveH, maxH)} {driveH}/{maxH}h<br />
        核心 {progressBar(tierOneCount, maxTier1, 3)} {tierOneCount}/{maxTier1}
        {day.buffer_day && <> · 机动</>}
      </div>
```

Replace with:

```jsx
      <div style={{ borderTop: '1px dashed #ccc', padding: '4px 8px' }}>
        <DayMetricBar label="驾驶" value={driveH} max={maxH} unit="h" />
        <DayMetricBar label="核心" value={tierOneCount} max={maxTier1} />
        {day.buffer_day && <Text size="xs" c="dimmed" mt={2}>机动</Text>}
      </div>
```

Then delete the `progressBar()` function block at the bottom of the file:

```jsx
function progressBar(value, max, width = 5) {
  const filled = Math.min(Math.round((value / max) * width), width)
  return '█'.repeat(filled) + '░'.repeat(width - filled)
}
```

The file now ends at the closing brace of the `DayColumn` default export. Verify with: `grep -n 'progressBar\|█\|░' app/javascript/components/planner/DayColumn.jsx` — expected no matches.

- [ ] **Step 3: Run existing DayColumn tests**

Run: `npm test -- DayColumn`

Expected: All existing `DayColumn.test.jsx` cases pass unchanged (they assert on rendered text like `0/4h`, which `DayMetricBar` still renders).

If any test fails because it matched `0/4h` via a regex or contained-text query that now breaks because of the bar element between label and ratio, inspect the specific assertion and adjust the test to use `screen.getByText('0/4h')` (exact text match on the separate `<Text>` node). Commit any such test adjustments as part of this task.

- [ ] **Step 4: Run the full JS test suite**

Run: `npm test`

Expected: All tests pass. Note any unrelated failures separately but do not attempt to fix in this task.

- [ ] **Step 5: Commit**

```bash
git add app/javascript/components/planner/DayColumn.jsx
git commit -m "refactor(planner): DayColumn uses DayMetricBar for drive/core caps

Removes the inline progressBar() helper that rendered █░ Unicode
tofu at 10px #666 with no warning color. DayMetricBar now shows
yellow when >=90% and red when over, at 12px Mantine <Text> size."
```

---

## Task 3: Wire `TimelineDayColumn` to `DayMetricBar` and drop the `⛔` emoji

**Files:**
- Modify: `app/javascript/components/timeline/TimelineDayColumn.jsx`

- [ ] **Step 1: Inspect current state**

Run: `cat app/javascript/components/timeline/TimelineDayColumn.jsx | head -115`

Expected sections to replace:
- Import line (add `DayMetricBar`)
- The `driveOk` / `tierOneOk` computations (wherever they appear above the JSX)
- Footer `<div>` with `驾驶 {progressBar(...)} ... {driveOk ? '' : '⛔'}<br />` (lines 70-73 per the spec)
- `function progressBar(...)` helper (lines 107-110 per the spec)

- [ ] **Step 2: Add the import**

Add to the top of `app/javascript/components/timeline/TimelineDayColumn.jsx` (after any existing Mantine/react imports; match existing import style in the file):

```jsx
import DayMetricBar from '../DayMetricBar'
```

- [ ] **Step 3: Replace the footer**

Find this block (lines 70-73):

```jsx
      <div style={{ borderTop: '1px dashed #ccc', padding: '4px 8px', fontSize: 10, color: '#666' }}>
        驾驶 {progressBar(driveH, maxH)} {driveH}/{maxH}h {driveOk ? '' : '⛔'}<br />
        核心 {progressBar(tierOneCount, maxTier1, 3)} {tierOneCount}/{maxTier1} {tierOneOk ? '' : '⛔'}
      </div>
```

Replace with:

```jsx
      <div style={{ borderTop: '1px dashed #ccc', padding: '4px 8px' }}>
        <DayMetricBar label="驾驶" value={driveH} max={maxH} unit="h" />
        <DayMetricBar label="核心" value={tierOneCount} max={maxTier1} />
      </div>
```

- [ ] **Step 4: Delete the `progressBar()` helper**

Remove the entire `function progressBar(value, max, width = 5) { ... }` block (lines 107-110):

```jsx
function progressBar(value, max, width = 5) {
  const filled = Math.min(Math.round((value / max) * width), width)
  return '█'.repeat(filled) + '░'.repeat(width - filled)
}
```

- [ ] **Step 5: Delete the now-dead `driveOk` / `tierOneOk` computations**

Grep the file for `driveOk` and `tierOneOk`. They are now only referenced in the deleted footer. Delete their declarations. Also delete any helper variables that fed them (e.g. `maxH`, `maxTier1`, `driveH`, `tierOneCount` are still used by `DayMetricBar` — keep those).

Run: `grep -n 'driveOk\|tierOneOk' app/javascript/components/timeline/TimelineDayColumn.jsx`

Expected: no matches. If any remain, you missed a deletion — re-read and remove.

- [ ] **Step 6: Run the full JS test suite**

Run: `npm test`

Expected: All tests pass. `TimelineDayColumn` has no dedicated test file, so the only way this task breaks tests is through transitive imports — unlikely but verify.

- [ ] **Step 7: Commit**

```bash
git add app/javascript/components/timeline/TimelineDayColumn.jsx
git commit -m "refactor(timeline): TimelineDayColumn uses DayMetricBar, drops ⛔

Color on the bar (red >100%, yellow >=90%) now carries the overflow
signal, so the ⛔ emoji is redundant and removed. driveOk /
tierOneOk booleans are deleted as their only consumer (the emoji)
is gone."
```

---

## Task 4: Visual verification in running dev server

**Files:** (no code changes)

The spec's acceptance is mostly visual. Run a preview to confirm the three-tier color renders correctly and that the 170px day column does not overflow.

- [ ] **Step 1: Ensure the dev server on port 9103 is up**

Run: `curl -sSo /dev/null -w '%{http_code}\n' http://127.0.0.1:9103/`

Expected: `200` or `302`. If the server is not running, run `bin/worktree-dev up` and wait for it to report ready.

- [ ] **Step 2: Attach a preview client**

Use the preview MCP's `preview_start` with config `worktree-dev` (already registered in `.claude/launch.json`; if not, add it back with `runtimeExecutable: "sleep", runtimeArgs: ["86400"], port: 9103` as a shim — see the conversation that produced this plan).

Login via `/auth/developer` with any name/email. Create a tour if needed, then navigate to `/tours/:id` (the planner page).

- [ ] **Step 3: Verify planner DayColumn footer**

Take a screenshot or `preview_inspect` on the first `.mantine-Progress-root` inside a day column:

```js
// in preview_eval
(() => {
  const bars = document.querySelectorAll('.mantine-Progress-root')
  if (bars.length === 0) return 'no bars'
  const first = bars[0]
  return {
    count: bars.length,
    firstColor: getComputedStyle(first).getPropertyValue('--progress-section-color') || getComputedStyle(first.querySelector('.mantine-Progress-section'))?.backgroundColor,
    firstWidth: first.getBoundingClientRect().width,
  }
})()
```

Expected: at least 2 bars per visible day column, color resolves to a gray shade (no activities yet → pct=0).

- [ ] **Step 4: Verify over-threshold rendering**

In the same preview session, temporarily add activities with high drive minutes to exceed the cap (or `preview_eval` an Inertia call). Re-snapshot and confirm the bar color is red.

If this is too much setup overhead, settle for: (a) bars render, (b) screenshot shows no tofu, and leave tier-color verification to the unit tests which already cover this.

- [ ] **Step 5: Verify timeline page**

Navigate to the `总览` (overview) tab on the same tour. Inspect `TimelineDayColumn` footer: confirm no `⛔` anywhere and bars render.

- [ ] **Step 6: Report findings**

No commit in this task. Summarize the verification output (screenshot path or inspect result) in the final PR message.

---

## Task 5: Final verification and handoff

**Files:** (no code changes)

- [ ] **Step 1: Run all JS tests one more time**

Run: `npm test`

Expected: All tests pass.

- [ ] **Step 2: Lint / typecheck (JS side has no typecheck; Ruby lint not applicable here)**

Skip. This change touches only `.jsx` files and the project does not run `eslint` in CI per `CLAUDE.md`.

- [ ] **Step 3: Confirm git log**

Run: `git log --oneline main..HEAD`

Expected: 4 commits matching the task commits above, all attributed and signed per repo conventions.

- [ ] **Step 4: Summarize change for the user**

List: files created, files modified, lines removed, visual proof from Task 4.

The work is complete. User can decide whether to open a PR.
