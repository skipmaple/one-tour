# Constitution Chip Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the always-visible `ConstitutionBanner` row at the top of the planner with a compact `Badge` chip next to the tour title that opens a `Popover` with the same per-violation controls.

**Architecture:** New `ConstitutionChip` component is a drop-in replacement for `ConstitutionBanner` (same prop signature: `violations`, `onFix`, `onAcknowledge`, `onDismiss`, `readOnly`). Renders nothing when zero violations / all dismissed. Otherwise renders one Mantine `Badge` (red if any hard, yellow if soft-only) with total count; clicking opens a `Popover` whose body is the existing per-violation `Paper` + button group lifted from `ConstitutionBanner`. `ConstitutionBanner` file stays for potential future reuse in other tabs. `Show.jsx` swaps the banner for the chip and wraps `title + chip` in an inner `<Group gap="xs">` inside the existing `<Group justify="space-between">` so the chip glues to the title and "成员" stays right-aligned.

**Tech Stack:** React 18, Mantine v9 (`Badge`, `Popover`, `Paper`, `Group`, `Text`, `Button`), Vitest + @testing-library/react.

**Spec:** [`docs/superpowers/specs/2026-04-18-constitution-chip-design.md`](docs/superpowers/specs/2026-04-18-constitution-chip-design.md)

---

## File Map

**New files:**
- `app/javascript/components/planner/ConstitutionChip.jsx` — chip + popover component
- `app/javascript/components/planner/__tests__/ConstitutionChip.test.jsx` — 11 unit tests

**Modified files:**
- `app/javascript/pages/Tour/Show.jsx` — replace `<ConstitutionBanner>` with `<ConstitutionChip>` in the title row; wrap title `<div>` + chip in inner `<Group gap="xs">`
- `app/javascript/pages/Tour/__tests__/Show.test.jsx` — adjust selectors only if any test references the prior banner DOM (likely no change needed)

**Untouched:**
- `app/javascript/components/planner/ConstitutionBanner.jsx` — preserved for potential future reuse in 宪法 / 总览 tabs
- `app/javascript/components/planner/__tests__/ConstitutionBanner.test.jsx` — keep passing
- `app/javascript/components/planner/AcknowledgeModal.jsx` — flow unchanged
- `app/javascript/components/planner/ChatPanel.jsx` — `pendingPrompt` auto-expand unchanged
- All backend (`Tour::ConstitutionCheck`, violation model) — no changes

---

## Task 1: ConstitutionChip — render branches (zero / soft / hard / mixed)

**Files:**
- Create: `app/javascript/components/planner/ConstitutionChip.jsx`
- Test: `app/javascript/components/planner/__tests__/ConstitutionChip.test.jsx`

This task only renders the Badge — no Popover yet, no dismiss state.

- [ ] **Step 1.1: Write failing render tests**

Create `app/javascript/components/planner/__tests__/ConstitutionChip.test.jsx`:

```jsx
import { render, screen, fireEvent } from '@testing-library/react'
import { describe, test, expect, vi } from 'vitest'
import { MantineProvider } from '@mantine/core'
import ConstitutionChip from '../ConstitutionChip'

function renderChip(props) {
  return render(
    <MantineProvider><ConstitutionChip {...props} /></MantineProvider>
  )
}

const softV  = { level: 'soft', rule: 'min_buffer_days', scope: {}, message: '建议 ≥ 1 个机动日' }
const softV2 = { level: 'soft', rule: 'tier_one',       scope: {}, message: '一等景超 3' }
const hardV  = { level: 'hard', rule: 'driving',        scope: { day_index: 3 }, message: 'D3 驾驶超 7h' }
const hardV2 = { level: 'hard', rule: 'driving',        scope: { day_index: 5 }, message: 'D5 驾驶超 7h' }

describe('ConstitutionChip · render', () => {
  test('renders nothing when violations is empty array', () => {
    renderChip({ violations: [] })
    expect(screen.queryByTestId('constitution-chip')).not.toBeInTheDocument()
  })

  test('renders nothing when violations is undefined', () => {
    renderChip({ violations: undefined })
    expect(screen.queryByTestId('constitution-chip')).not.toBeInTheDocument()
  })

  test('soft-only: yellow chip with ⚠ {count}', () => {
    renderChip({ violations: [softV, softV2] })
    const chip = screen.getByTestId('constitution-chip')
    expect(chip).toBeInTheDocument()
    expect(chip).toHaveTextContent('⚠ 2')
    // Mantine Badge applies color via classname; sanity-check by querying for the
    // background containing yellow shade (Mantine v9 sets data-variant style).
    expect(chip.className).toMatch(/yellow|var\(--mantine-color-yellow/i)
  })

  test('any hard violation makes the chip red, count is total', () => {
    renderChip({ violations: [softV, hardV, softV2] })
    const chip = screen.getByTestId('constitution-chip')
    expect(chip).toHaveTextContent('⛔ 3')
    expect(chip.className).toMatch(/red|var\(--mantine-color-red/i)
  })

  test('all hard: still red with count', () => {
    renderChip({ violations: [hardV, hardV2] })
    expect(screen.getByTestId('constitution-chip')).toHaveTextContent('⛔ 2')
  })
})
```

- [ ] **Step 1.2: Run tests — verify they fail**

```bash
npm test -- app/javascript/components/planner/__tests__/ConstitutionChip.test.jsx
```

Expected: 5 tests FAIL with "Cannot find module '../ConstitutionChip'".

- [ ] **Step 1.3: Implement Badge-only render**

Create `app/javascript/components/planner/ConstitutionChip.jsx`:

```jsx
import { Badge } from '@mantine/core'

const noop = () => {}

export default function ConstitutionChip({
  violations,
  onFix = noop,           // eslint-disable-line no-unused-vars
  onAcknowledge = noop,   // eslint-disable-line no-unused-vars
  onDismiss = noop,       // eslint-disable-line no-unused-vars
  readOnly = false,       // eslint-disable-line no-unused-vars
}) {
  if (!violations || violations.length === 0) return null

  const hasHard = violations.some(v => v.level === 'hard')
  const color = hasHard ? 'red' : 'yellow'
  const icon = hasHard ? '⛔' : '⚠'

  return (
    <Badge
      color={color}
      size="sm"
      data-testid="constitution-chip"
      style={{ cursor: 'pointer', userSelect: 'none' }}
    >
      {icon} {violations.length}
    </Badge>
  )
}
```

The unused-but-declared props (`onFix`, `onAcknowledge`, etc.) are intentional — Tasks 2/3 will wire them up. Adding them now means the prop signature is stable from the start.

- [ ] **Step 1.4: Run tests — verify all 5 pass**

```bash
npm test -- app/javascript/components/planner/__tests__/ConstitutionChip.test.jsx
```

Expected: 5/5 PASS.

- [ ] **Step 1.5: Commit**

```bash
git add app/javascript/components/planner/ConstitutionChip.jsx app/javascript/components/planner/__tests__/ConstitutionChip.test.jsx
git commit -m "feat(planner): ConstitutionChip Badge render (zero/soft/hard/mixed)"
```

---

## Task 2: ConstitutionChip — Popover open/close + violation list

**Files:**
- Modify: `app/javascript/components/planner/ConstitutionChip.jsx`
- Modify: `app/javascript/components/planner/__tests__/ConstitutionChip.test.jsx`

This task adds the Popover wrapper and renders the violation list inside (without action buttons yet — that's Task 3).

- [ ] **Step 2.1: Append failing popover tests**

Append to `app/javascript/components/planner/__tests__/ConstitutionChip.test.jsx`:

```jsx
describe('ConstitutionChip · popover', () => {
  test('clicking the chip opens the popover with violation messages', () => {
    renderChip({ violations: [softV, hardV] })
    // Popover content not yet visible
    expect(screen.queryByText(/D3 驾驶超 7h/)).not.toBeInTheDocument()

    fireEvent.click(screen.getByTestId('constitution-chip'))

    expect(screen.getByText(/建议 ≥ 1 个机动日/)).toBeInTheDocument()
    expect(screen.getByText(/D3 驾驶超 7h/)).toBeInTheDocument()
  })

  test('clicking the chip again closes the popover', () => {
    renderChip({ violations: [softV] })
    const chip = screen.getByTestId('constitution-chip')

    fireEvent.click(chip)
    expect(screen.getByText(/建议 ≥ 1 个机动日/)).toBeInTheDocument()

    fireEvent.click(chip)
    expect(screen.queryByText(/建议 ≥ 1 个机动日/)).not.toBeInTheDocument()
  })
})
```

- [ ] **Step 2.2: Run tests — verify they fail**

```bash
npm test -- app/javascript/components/planner/__tests__/ConstitutionChip.test.jsx
```

Expected: 2 new tests FAIL (popover content not in DOM).

- [ ] **Step 2.3: Add Popover wrapper + violation list (no action buttons yet)**

Replace the body of `app/javascript/components/planner/ConstitutionChip.jsx`:

```jsx
import { useState } from 'react'
import { Badge, Popover, Stack, Paper, Group, Text } from '@mantine/core'

const noop = () => {}

export default function ConstitutionChip({
  violations,
  onFix = noop,           // eslint-disable-line no-unused-vars
  onAcknowledge = noop,   // eslint-disable-line no-unused-vars
  onDismiss = noop,       // eslint-disable-line no-unused-vars
  readOnly = false,       // eslint-disable-line no-unused-vars
}) {
  const [opened, setOpened] = useState(false)

  if (!violations || violations.length === 0) return null

  const hasHard = violations.some(v => v.level === 'hard')
  const color = hasHard ? 'red' : 'yellow'
  const icon = hasHard ? '⛔' : '⚠'

  return (
    <Popover opened={opened} onChange={setOpened} position="bottom-start" shadow="md" withinPortal>
      <Popover.Target>
        <Badge
          color={color}
          size="sm"
          data-testid="constitution-chip"
          style={{ cursor: 'pointer', userSelect: 'none' }}
          onClick={() => setOpened(o => !o)}
        >
          {icon} {violations.length}
        </Badge>
      </Popover.Target>

      <Popover.Dropdown p="xs" style={{ maxWidth: 420 }}>
        <Stack gap={4}>
          {violations.map((v, i) => (
            <Paper
              key={i}
              p="xs"
              withBorder
              style={{
                borderColor: v.level === 'hard' ? '#c33' : '#c80',
                background:  v.level === 'hard' ? '#fef0f0' : '#fef8e8',
                color:       v.level === 'hard' ? '#c33' : '#c80',
              }}
            >
              <Text size="sm">
                {v.level === 'hard' ? '⛔ ' : '⚠ '}{v.message}
              </Text>
            </Paper>
          ))}
        </Stack>
      </Popover.Dropdown>
    </Popover>
  )
}
```

- [ ] **Step 2.4: Run tests — verify all 7 pass**

```bash
npm test -- app/javascript/components/planner/__tests__/ConstitutionChip.test.jsx
```

Expected: 7/7 PASS (5 from Task 1 + 2 new).

- [ ] **Step 2.5: Commit**

```bash
git add app/javascript/components/planner/ConstitutionChip.jsx app/javascript/components/planner/__tests__/ConstitutionChip.test.jsx
git commit -m "feat(planner): ConstitutionChip popover open/close + violation list"
```

---

## Task 3: ConstitutionChip — action buttons + dismiss state

**Files:**
- Modify: `app/javascript/components/planner/ConstitutionChip.jsx`
- Modify: `app/javascript/components/planner/__tests__/ConstitutionChip.test.jsx`

Add the three action buttons (`帮我修正 →` / `承认此违反` / `知道了`), the readOnly conditional, the internal `dismissed` Set, and the auto-close-on-last-dismiss behavior.

- [ ] **Step 3.1: Append failing action-button tests**

Append to `app/javascript/components/planner/__tests__/ConstitutionChip.test.jsx`:

```jsx
describe('ConstitutionChip · action buttons', () => {
  test('hard violation in popover shows 帮我修正 + 承认此违反 + onFix wires through', () => {
    const onFix = vi.fn()
    renderChip({ violations: [hardV], onFix })
    fireEvent.click(screen.getByTestId('constitution-chip'))
    fireEvent.click(screen.getByRole('button', { name: /帮我修正/ }))
    expect(onFix).toHaveBeenCalledWith(hardV)
    // popover closes after action
    expect(screen.queryByText(/D3 驾驶超 7h/)).not.toBeInTheDocument()
  })

  test('hard violation 承认此违反 → onAcknowledge + popover closes', () => {
    const onAcknowledge = vi.fn()
    renderChip({ violations: [hardV], onAcknowledge })
    fireEvent.click(screen.getByTestId('constitution-chip'))
    fireEvent.click(screen.getByRole('button', { name: '承认此违反' }))
    expect(onAcknowledge).toHaveBeenCalledWith(hardV)
    expect(screen.queryByText(/D3 驾驶超 7h/)).not.toBeInTheDocument()
  })

  test('soft violation 知道了 → onDismiss + count decreases, popover stays open', () => {
    const onDismiss = vi.fn()
    renderChip({ violations: [softV, softV2], onDismiss })
    fireEvent.click(screen.getByTestId('constitution-chip'))
    // Click 知道了 on the first soft violation
    const dismissButtons = screen.getAllByRole('button', { name: '知道了' })
    expect(dismissButtons).toHaveLength(2)
    fireEvent.click(dismissButtons[0])
    expect(onDismiss).toHaveBeenCalledWith(softV)
    // Chip count went from 2 to 1
    expect(screen.getByTestId('constitution-chip')).toHaveTextContent('⚠ 1')
    // Popover still open showing the remaining soft
    expect(screen.getByText(/一等景超 3/)).toBeInTheDocument()
  })

  test('dismissing the last soft violation removes the chip and closes popover', () => {
    renderChip({ violations: [softV] })
    fireEvent.click(screen.getByTestId('constitution-chip'))
    fireEvent.click(screen.getByRole('button', { name: '知道了' }))
    // Chip removed
    expect(screen.queryByTestId('constitution-chip')).not.toBeInTheDocument()
    // Popover content gone
    expect(screen.queryByText(/建议 ≥ 1 个机动日/)).not.toBeInTheDocument()
  })

  test('readOnly: hard violation only has 知道了 (no 帮我修正 / 承认此违反)', () => {
    renderChip({ violations: [hardV], readOnly: true })
    fireEvent.click(screen.getByTestId('constitution-chip'))
    expect(screen.queryByRole('button', { name: /帮我修正/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '承认此违反' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: '知道了' })).toBeInTheDocument()
  })
})
```

- [ ] **Step 3.2: Run tests — verify the 5 new tests fail**

```bash
npm test -- app/javascript/components/planner/__tests__/ConstitutionChip.test.jsx
```

Expected: 5 fail (no action buttons rendered yet).

- [ ] **Step 3.3: Add action buttons + dismiss state to ConstitutionChip**

Replace the body of `app/javascript/components/planner/ConstitutionChip.jsx`:

```jsx
import { useState } from 'react'
import { Badge, Popover, Stack, Paper, Group, Text, Button } from '@mantine/core'

const noop = () => {}

export default function ConstitutionChip({
  violations,
  onFix = noop,
  onAcknowledge = noop,
  onDismiss = noop,
  readOnly = false,
}) {
  const [opened, setOpened] = useState(false)
  const [dismissed, setDismissed] = useState(new Set())

  if (!violations || violations.length === 0) return null
  const visible = violations
    .map((v, i) => ({ v, i }))
    .filter(({ i }) => !dismissed.has(i))
  if (visible.length === 0) return null

  const hasHard = visible.some(({ v }) => v.level === 'hard')
  const color = hasHard ? 'red' : 'yellow'
  const icon = hasHard ? '⛔' : '⚠'

  const closePopover = () => setOpened(false)

  const handleFix = (v) => {
    onFix(v)
    closePopover()
  }
  const handleAcknowledge = (v) => {
    onAcknowledge(v)
    closePopover()
  }
  const handleDismissOne = (i, v) => {
    const next = new Set(dismissed)
    next.add(i)
    setDismissed(next)
    onDismiss(v)
    // If this was the last visible one, close popover (chip will unmount on
    // the next render because visible.length will be 0).
    if (visible.length === 1) closePopover()
  }

  return (
    <Popover opened={opened} onChange={setOpened} position="bottom-start" shadow="md" withinPortal>
      <Popover.Target>
        <Badge
          color={color}
          size="sm"
          data-testid="constitution-chip"
          style={{ cursor: 'pointer', userSelect: 'none' }}
          onClick={() => setOpened(o => !o)}
        >
          {icon} {visible.length}
        </Badge>
      </Popover.Target>

      <Popover.Dropdown p="xs" style={{ maxWidth: 420 }}>
        <Stack gap={4}>
          {visible.map(({ v, i }) => {
            const isHard = v.level === 'hard'
            const showHardActions = isHard && !readOnly
            return (
              <Paper
                key={i}
                p="xs"
                withBorder
                style={{
                  borderColor: isHard ? '#c33' : '#c80',
                  background:  isHard ? '#fef0f0' : '#fef8e8',
                  color:       isHard ? '#c33' : '#c80',
                }}
              >
                <Group justify="space-between" wrap="nowrap" gap="xs">
                  <Text size="sm">
                    {isHard ? '⛔ ' : '⚠ '}{v.message}
                  </Text>
                  <Group gap="xs" wrap="nowrap">
                    {showHardActions && (
                      <Button size="compact-xs" color="red" onClick={() => handleFix(v)}>
                        帮我修正 →
                      </Button>
                    )}
                    <Button
                      size="compact-xs"
                      variant="default"
                      onClick={() => {
                        if (showHardActions) handleAcknowledge(v)
                        else handleDismissOne(i, v)
                      }}
                    >
                      {showHardActions ? '承认此违反' : '知道了'}
                    </Button>
                  </Group>
                </Group>
              </Paper>
            )
          })}
        </Stack>
      </Popover.Dropdown>
    </Popover>
  )
}
```

- [ ] **Step 3.4: Run tests — verify all 12 pass**

```bash
npm test -- app/javascript/components/planner/__tests__/ConstitutionChip.test.jsx
```

Expected: 12/12 PASS (5 + 2 + 5).

- [ ] **Step 3.5: Commit**

```bash
git add app/javascript/components/planner/ConstitutionChip.jsx app/javascript/components/planner/__tests__/ConstitutionChip.test.jsx
git commit -m "feat(planner): ConstitutionChip action buttons + dismiss state"
```

---

## Task 4: Wire ConstitutionChip into Show.jsx

**Files:**
- Modify: `app/javascript/pages/Tour/Show.jsx`
- Modify: `app/javascript/pages/Tour/__tests__/Show.test.jsx` (only if needed — likely no change)

Atomic swap: remove the banner row, add the chip glued to the title.

- [ ] **Step 4.1: Read existing Show.jsx imports + title row**

```bash
grep -n "ConstitutionBanner\|tour-title-text\|setMembersDrawerOpen" app/javascript/pages/Tour/Show.jsx | head -10
```

Confirm the layout:
- Around line 12: `import ConstitutionBanner from '../../components/planner/ConstitutionBanner'`
- Around line 122: outer `<Group justify="space-between" mb="xs" mt="sm">` with title `<div>` and "成员" `<Button>`
- Around line 138-144: `<ConstitutionBanner violations={violations} onFix={...} onAcknowledge={...} onDismiss={() => {}} readOnly={!canEdit} />`

- [ ] **Step 4.2: Swap import**

In `app/javascript/pages/Tour/Show.jsx`, find:

```jsx
import ConstitutionBanner from '../../components/planner/ConstitutionBanner'
```

Replace with:

```jsx
import ConstitutionChip from '../../components/planner/ConstitutionChip'
```

- [ ] **Step 4.3: Wrap title in inner Group + add chip; remove banner**

In `app/javascript/pages/Tour/Show.jsx`, find the title row (around line 122):

```jsx
<Group justify="space-between" mb="xs" mt="sm">
  <div
    onClick={() => canEdit && setSettingsOpen(true)}
    style={{ cursor: canEdit ? 'pointer' : 'default' }}
    className={canEdit ? 'tour-title-editable' : undefined}
  >
    <Text fw={700} size="lg" className="tour-title-text">{tour.title}</Text>
    {canEdit && <Text fw={700} size="lg" c="gray.5" className="tour-title-edit-hint" style={{ display: 'none' }}>✎ 编辑</Text>}
    {canEdit && (
      <style>{`
        .tour-title-editable:hover .tour-title-text { display: none; }
        .tour-title-editable:hover .tour-title-edit-hint { display: inline !important; }
      `}</style>
    )}
  </div>
  <Button
    size="compact-xs"
    variant="default"
    onClick={() => setMembersDrawerOpen(true)}
  >
    成员
  </Button>
</Group>
```

Replace with (wrap title `<div>` and chip in inner `<Group gap="xs">`):

```jsx
<Group justify="space-between" mb="xs" mt="sm">
  <Group gap="xs" wrap="nowrap">
    <div
      onClick={() => canEdit && setSettingsOpen(true)}
      style={{ cursor: canEdit ? 'pointer' : 'default' }}
      className={canEdit ? 'tour-title-editable' : undefined}
    >
      <Text fw={700} size="lg" className="tour-title-text">{tour.title}</Text>
      {canEdit && <Text fw={700} size="lg" c="gray.5" className="tour-title-edit-hint" style={{ display: 'none' }}>✎ 编辑</Text>}
      {canEdit && (
        <style>{`
          .tour-title-editable:hover .tour-title-text { display: none; }
          .tour-title-editable:hover .tour-title-edit-hint { display: inline !important; }
        `}</style>
      )}
    </div>
    <ConstitutionChip
      violations={violations}
      onFix={(v) => setPendingChatPrompt(fixPromptFor(v))}
      onAcknowledge={(v) => setAcknowledgingViolation(v)}
      onDismiss={() => {}}
      readOnly={!canEdit}
    />
  </Group>
  <Button
    size="compact-xs"
    variant="default"
    onClick={() => setMembersDrawerOpen(true)}
  >
    成员
  </Button>
</Group>
```

Then find the `<ConstitutionBanner ... />` block (around line 138-144) and DELETE it entirely. The whole block to remove looks like:

```jsx
<ConstitutionBanner
  violations={violations}
  onFix={(v) => setPendingChatPrompt(fixPromptFor(v))}
  onAcknowledge={(v) => setAcknowledgingViolation(v)}
  onDismiss={() => {}}
  readOnly={!canEdit}
/>
```

(Adjust to match exact existing whitespace and prop ordering — the props are the same set already passed to the chip.)

- [ ] **Step 4.4: Run Show + ConstitutionChip + ConstitutionBanner tests**

```bash
npm test -- app/javascript/pages/Tour/__tests__/Show.test.jsx app/javascript/components/planner/__tests__/ConstitutionChip.test.jsx app/javascript/components/planner/__tests__/ConstitutionBanner.test.jsx
```

Expected: all PASS. If any Show.test assertion fails because it referenced ConstitutionBanner DOM, update the selector to query the chip's `data-testid="constitution-chip"` instead. Do not change behavioral assertions.

- [ ] **Step 4.5: Manual smoke test**

Dev server should already be up at `http://127.0.0.1:9103`. Open `/tours/1` (a 13-day empty tour with 1 soft violation):

1. Title row shows `新旅程111` then a yellow `⚠ 1` Badge glued to the right of the title; "成员" button stays right-aligned at the far right
2. The 4-panel flex area starts ~50px higher than before (no orange banner row)
3. Click the chip → Popover opens below it with the soft violation's message + a `知道了` button
4. Click `知道了` → chip disappears, popover closes; title row is now just `新旅程111` + 成员
5. Reload → soft violation reappears (dismissed Set is session-only by design)

Take a screenshot for the PR description: `chrome-devtools-mcp` `take_screenshot` on the page (or your manual choice).

- [ ] **Step 4.6: Commit**

```bash
git add app/javascript/pages/Tour/Show.jsx app/javascript/pages/Tour/__tests__/Show.test.jsx
git commit -m "feat(planner): swap ConstitutionBanner for ConstitutionChip in title row"
```

(Include the test file in the commit only if you actually had to modify it. If unchanged, omit it.)

---

## Task 5: Final test/lint sweep

- [ ] **Step 5.1: Full JS test suite**

```bash
npm test 2>&1 | tail -8
```

Expected: 240/240 PASS or thereabouts (228 prior + 12 new ConstitutionChip = 240).

- [ ] **Step 5.2: Ruby checks (no Ruby code changed; sanity)**

```bash
mise exec -- bundle exec rubocop -f github 2>&1 | tail -5
mise exec -- bundle exec brakeman --no-pager 2>&1 | tail -5
mise exec -- bundle exec rspec 2>&1 | tail -5
```

Expected: RuboCop has only the pre-existing `db/schema.rb` errors (out of scope). Brakeman clean. RSpec passes.

- [ ] **Step 5.3: npm audit**

```bash
npm audit 2>&1 | tail -3
```

Expected: 0 vulnerabilities.

- [ ] **Step 5.4: If any post-sweep fixes were needed, commit**

```bash
git add -u
git commit -m "fix(planner): post-chip-sweep cleanup"
```

If everything was already green, skip this step.

---

## Self-Review Checklist (run after writing the plan)

- [x] **Spec coverage**:
  - 视觉 (Badge color/icon/count) → Task 1
  - Popover open/close → Task 2
  - Per-violation actions (帮我修正 / 承认 / 知道了) → Task 3
  - readOnly conditional → Task 3
  - dismissed Set + last-one-closes-popover → Task 3
  - Show.jsx title row wiring → Task 4
  - Banner row removal → Task 4
  - Manual smoke test → Task 4.5
  - Final lint/test → Task 5

- [x] **No placeholders**: Each step has actual code or commands. The `{...handlers}` shorthand is NOT used; props are spelled out.

- [x] **Type / name consistency**:
  - `data-testid="constitution-chip"` used in both impl and tests
  - Prop names: `violations`, `onFix`, `onAcknowledge`, `onDismiss`, `readOnly` — consistent across spec, tests, impl
  - Icon strings `⛔` / `⚠`, color names `red` / `yellow` consistent
  - `dismissed` Set is `Set<index>` (using `i` from map), consistent
  - `visible` array shape `{v, i}` consistent

- [x] **Files map matches tasks**: Only 2 new files, only 1-2 modified files. Untouched list explicit.

- [x] **Each task is bite-sized (TDD 5-step)**: All 4 implementation tasks follow `test → fail → impl → pass → commit`.
