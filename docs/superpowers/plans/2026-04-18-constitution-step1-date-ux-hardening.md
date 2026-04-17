# Constitution Step 1 Date UX Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Disable past dates in the Step 1 date picker and replace the silent bidirectional `date range ↔ days count` sync with a Mantine confirm modal that fires only on true conflict.

**Architecture:** Single-file refactor of [Constitution.jsx](app/javascript/pages/Tour/Constitution.jsx). Two new pure helpers (`todayLocal`, `detectDateDaysConflict`) drive a `minDate` on `DatePickerInput` and rewritten `handleDateRangeChange` / `handleDaysChange` handlers. No new dependencies — `modals.openConfirmModal` is already imported at line 6.

**Tech Stack:** React 18, `@mantine/core` v9, `@mantine/dates` v9, `@mantine/modals`, Vitest.

**Reference spec:** [docs/superpowers/specs/2026-04-18-constitution-step1-date-ux-hardening-design.md](docs/superpowers/specs/2026-04-18-constitution-step1-date-ux-hardening-design.md)

---

## File Structure

| File | Action | Responsibility |
|---|---|---|
| [app/javascript/pages/Tour/Constitution.jsx](app/javascript/pages/Tour/Constitution.jsx) | Modify | Add `todayLocal` export, `detectDateDaysConflict` export, wire `minDate`, rewrite two handlers |
| `app/javascript/pages/Tour/__tests__/todayLocal.test.js` | Create | Pure-function tests for `todayLocal` (timezone correctness) |
| `app/javascript/pages/Tour/__tests__/detectDateDaysConflict.test.js` | Create | Pure-function tests for conflict detection |

No other files touched. `ModalsProvider` is already mounted globally in [app/javascript/entrypoints/inertia.jsx](app/javascript/entrypoints/inertia.jsx).

---

## Task 1: `todayLocal()` — timezone-safe "today" (TDD)

**Files:**
- Create: `app/javascript/pages/Tour/__tests__/todayLocal.test.js`
- Modify: `app/javascript/pages/Tour/Constitution.jsx` (add export near the existing `formatDateISO` export)

- [ ] **Step 1: Write the failing test file**

Create `app/javascript/pages/Tour/__tests__/todayLocal.test.js`:

```js
import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest'
import { todayLocal } from '../Constitution'

// We intentionally construct timestamps via `new Date(year, month, day, ...)`,
// which is defined to interpret its arguments as LOCAL time. That lets these
// tests run the same way regardless of the host machine's timezone: they
// assert that todayLocal reads local calendar fields, not UTC ones.
describe('todayLocal', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  test('returns the local calendar date as YYYY-MM-DD', () => {
    vi.setSystemTime(new Date(2026, 3, 18, 8, 0, 0)) // local April 18, 2026, 08:00
    expect(todayLocal()).toBe('2026-04-18')
  })

  test('pads month and day to two digits', () => {
    vi.setSystemTime(new Date(2026, 0, 5, 12, 0, 0)) // local Jan 5, 2026, noon
    expect(todayLocal()).toBe('2026-01-05')
  })

  test('returns an ISO-shaped string', () => {
    vi.setSystemTime(new Date(2026, 11, 31, 23, 59, 59)) // local Dec 31 2026
    expect(todayLocal()).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })

  test('differs from toISOString() slice at 00:00 local in east-of-UTC zones', () => {
    // Asserts the core behavior the helper exists to fix, but only meaningful
    // on hosts with a positive UTC offset (e.g. Asia/Shanghai, UTC+8).
    // Locally construct 2026-04-18 00:00:00 (midnight local). In UTC+8 the UTC
    // timestamp is 2026-04-17T16:00:00Z. toISOString().slice(0,10) would give
    // "2026-04-17"; todayLocal must give "2026-04-18".
    vi.setSystemTime(new Date(2026, 3, 18, 0, 0, 0))
    const offsetMinutes = new Date().getTimezoneOffset()
    if (offsetMinutes >= 0) {
      // UTC or west-of-UTC host: the UTC date doesn't lag the local date at
      // 00:00 local, so the pitfall doesn't manifest. Assert only that the
      // helper returns today's local date.
      expect(todayLocal()).toBe('2026-04-18')
    } else {
      // East-of-UTC host: UTC date IS one day earlier at 00:00 local, so
      // todayLocal must differ from `.toISOString().slice(0,10)`.
      const isoUtc = new Date().toISOString().slice(0, 10)
      expect(todayLocal()).toBe('2026-04-18')
      expect(isoUtc).toBe('2026-04-17')
    }
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run app/javascript/pages/Tour/__tests__/todayLocal.test.js`

Expected: FAIL with import error — `todayLocal` is not exported from `../Constitution`.

- [ ] **Step 3: Add `todayLocal()` to Constitution.jsx**

Open [app/javascript/pages/Tour/Constitution.jsx](app/javascript/pages/Tour/Constitution.jsx). Immediately after the `formatDateISO` export at lines 362–372, add:

```js
// Returns today's LOCAL calendar date as "YYYY-MM-DD".
// Do not use `new Date().toISOString().slice(0,10)` — in Asia/Shanghai (UTC+8)
// that returns the previous calendar date for the first 8 hours of each day.
export function todayLocal() {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run app/javascript/pages/Tour/__tests__/todayLocal.test.js`

Expected: PASS — all 3 assertions green.

- [ ] **Step 5: Commit**

```bash
git add app/javascript/pages/Tour/Constitution.jsx app/javascript/pages/Tour/__tests__/todayLocal.test.js
git commit -m "$(cat <<'EOF'
feat(tour): add todayLocal() helper for timezone-safe 'today'

`new Date().toISOString().slice(0,10)` returns the UTC calendar date,
which is off by one day for the first 8 hours of each local day in
Asia/Shanghai. todayLocal() uses Date's local getters to return the
actual local calendar date. This will drive minDate on the Step 1
date picker in the next commit.
EOF
)"
```

---

## Task 2: `detectDateDaysConflict()` — pure conflict detection (TDD)

**Files:**
- Create: `app/javascript/pages/Tour/__tests__/detectDateDaysConflict.test.js`
- Modify: `app/javascript/pages/Tour/Constitution.jsx` (add export alongside `todayLocal`)

- [ ] **Step 1: Write the failing test file**

Create `app/javascript/pages/Tour/__tests__/detectDateDaysConflict.test.js`:

```js
import { describe, test, expect } from 'vitest'
import { detectDateDaysConflict } from '../Constitution'

describe('detectDateDaysConflict', () => {
  test('returns null when range is empty', () => {
    expect(detectDateDaysConflict([null, null], 5)).toBeNull()
    expect(detectDateDaysConflict(null, 5)).toBeNull()
    expect(detectDateDaysConflict(undefined, 5)).toBeNull()
  })

  test('returns null when range is half-selected', () => {
    expect(detectDateDaysConflict(['2026-04-20', null], 5)).toBeNull()
    expect(detectDateDaysConflict([null, '2026-04-24'], 5)).toBeNull()
  })

  test('returns null when days is missing or zero', () => {
    expect(detectDateDaysConflict(['2026-04-20', '2026-04-24'], null)).toBeNull()
    expect(detectDateDaysConflict(['2026-04-20', '2026-04-24'], 0)).toBeNull()
    expect(detectDateDaysConflict(['2026-04-20', '2026-04-24'], undefined)).toBeNull()
  })

  test('returns null when days matches the implied range length', () => {
    // Apr 20 -> Apr 24 inclusive = 5 days
    expect(detectDateDaysConflict(['2026-04-20', '2026-04-24'], 5)).toBeNull()
    // Single day
    expect(detectDateDaysConflict(['2026-04-20', '2026-04-20'], 1)).toBeNull()
  })

  test('returns implied/current when they differ', () => {
    // Apr 20 -> May 3 inclusive = 14 days, user has days = 5
    expect(
      detectDateDaysConflict(['2026-04-20', '2026-05-03'], 5)
    ).toEqual({ implied: 14, current: 5 })
  })

  test('accepts Date objects as well as ISO strings', () => {
    const start = new Date(2026, 3, 20) // April = month 3 (0-indexed)
    const end = new Date(2026, 4, 3)    // May = month 4
    expect(
      detectDateDaysConflict([start, end], 5)
    ).toEqual({ implied: 14, current: 5 })
  })

  test('returns null for invalid date strings', () => {
    expect(detectDateDaysConflict(['not-a-date', '2026-04-24'], 5)).toBeNull()
    expect(detectDateDaysConflict(['2026-04-20', 'nonsense'], 5)).toBeNull()
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run app/javascript/pages/Tour/__tests__/detectDateDaysConflict.test.js`

Expected: FAIL with import error — `detectDateDaysConflict` is not exported.

- [ ] **Step 3: Add `detectDateDaysConflict()` to Constitution.jsx**

Add immediately after `todayLocal()`:

```js
// Returns null when the date range and days count are consistent or when
// either side is not fully specified. Returns { implied, current } when
// both are set and disagree.
export function detectDateDaysConflict(range, days) {
  if (!range) return null
  const [start, end] = range
  if (!start || !end) return null
  if (!days || days <= 0) return null
  const s = new Date(start).getTime()
  const e = new Date(end).getTime()
  if (isNaN(s) || isNaN(e)) return null
  const implied = Math.round((e - s) / 86400000) + 1
  if (implied === days) return null
  return { implied, current: days }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run app/javascript/pages/Tour/__tests__/detectDateDaysConflict.test.js`

Expected: PASS — all 7 assertions green.

- [ ] **Step 5: Commit**

```bash
git add app/javascript/pages/Tour/Constitution.jsx app/javascript/pages/Tour/__tests__/detectDateDaysConflict.test.js
git commit -m "$(cat <<'EOF'
feat(tour): add detectDateDaysConflict() pure helper

Returns null when the date range and days count are consistent or when
either is unset; returns { implied, current } when they disagree. This
replaces the silent bidirectional sync in handleDateRangeChange /
handleDaysChange in the next commit.
EOF
)"
```

---

## Task 3: Apply `minDate` to the DatePickerInput (#3)

**Files:**
- Modify: `app/javascript/pages/Tour/Constitution.jsx:159-167`

- [ ] **Step 1: Apply the edit**

Current lines 159–167 look like:

```jsx
<DatePickerInput
  type="range"
  label="日期范围"
  placeholder="选择出发和返回日期"
  value={tourDateRange}
  onChange={handleDateRangeChange}
  valueFormat="YYYY-MM-DD"
  clearable
/>
```

Change to:

```jsx
<DatePickerInput
  type="range"
  label="日期范围"
  placeholder="选择出发和返回日期"
  value={tourDateRange}
  onChange={handleDateRangeChange}
  valueFormat="YYYY-MM-DD"
  minDate={todayLocal()}
  clearable
/>
```

- [ ] **Step 2: Verify the change manually**

Run in the worktree dev server (already `bin/worktree-dev up` on port 9101):

1. Navigate to `/` → "+ 新建程" → Constitution Step 1
2. Click the "日期范围" field to open the picker
3. Confirm that dates before today (e.g. April 17 if today is April 18) are rendered greyed out / unclickable
4. Confirm today and future dates remain clickable

If the project has a visual snapshot test, run `npm test` to confirm no existing tests break.

Expected: `npm test` passes. Historical dates greyed out in the picker.

- [ ] **Step 3: Commit**

```bash
git add app/javascript/pages/Tour/Constitution.jsx
git commit -m "$(cat <<'EOF'
fix(tour): block past dates in Step 1 date picker (#3)

DatePickerInput now has minDate={todayLocal()}, so users can no longer
pick yesterday or earlier as a departure date. Uses the timezone-safe
helper added in the previous commit so the boundary is correct in
Asia/Shanghai.
EOF
)"
```

---

## Task 4: Replace silent sync with confirm modal (#4)

**Files:**
- Modify: `app/javascript/pages/Tour/Constitution.jsx:36-54` (the two handler functions)

- [ ] **Step 1: Add the `askConflict` helper and rewrite the two handlers**

Replace the block at lines 36–54 entirely. The new block is:

```jsx
  // Conflict UX: when both date range and days count are set and disagree,
  // open a confirm modal with two branches. No silent overwrite.
  //
  // openConfirmModal has only two exits — confirm and cancel. Esc, backdrop
  // click, and the close button all fire onCancel, so the "keep days, truncate
  // range" branch is also the Esc fallback. There is no "leave both alone"
  // third path; users who change their mind can edit again to re-trigger.
  const askConflict = ({ implied, current, onUseRange, onUseDays }) => {
    modals.openConfirmModal({
      title: '日期范围和天数对不上',
      children: (
        <Text size="sm">
          你选的是 <b>{implied}</b> 天的日期范围，但当前"天数"填的是 <b>{current}</b>。选一个继续：
        </Text>
      ),
      labels: { confirm: `按日期改为 ${implied} 天`, cancel: `保持 ${current} 天，截断日期` },
      onConfirm: onUseRange,
      onCancel: onUseDays,
    })
  }

  const handleDateRangeChange = (newRange) => {
    const [start, end] = newRange || [null, null]
    // Empty / half-selected / cleared: just setState. Do not autofill, do not
    // probe for conflict.
    if (!start || !end) {
      setTourDateRange(newRange)
      return
    }
    const conflict = detectDateDaysConflict(newRange, tourDays)
    if (!conflict) {
      // No conflict: autofill days. Covers the "days was empty / days matches"
      // cases. Same math as conflict detection so the two stay consistent.
      setTourDateRange(newRange)
      const implied = Math.round(
        (new Date(end).getTime() - new Date(start).getTime()) / 86400000
      ) + 1
      if (implied > 0) setTourDays(implied)
      return
    }
    askConflict({
      implied: conflict.implied,
      current: conflict.current,
      onUseRange: () => {
        setTourDateRange(newRange)
        setTourDays(conflict.implied)
      },
      onUseDays: () => {
        // Keep the user's days, truncate the range.
        const truncatedEnd = new Date(
          new Date(start).getTime() + (conflict.current - 1) * 86400000
        )
        setTourDateRange([start, truncatedEnd])
      },
    })
  }

  const handleDaysChange = (val) => {
    const [start, end] = tourDateRange || [null, null]
    // No start date, or days cleared: just setState.
    if (!start || !val || val <= 0) {
      setTourDays(val)
      return
    }
    // Start exists but no end yet: standard autofill of end.
    if (!end) {
      setTourDays(val)
      const newEnd = new Date(new Date(start).getTime() + (val - 1) * 86400000)
      setTourDateRange([start, newEnd])
      return
    }
    const conflict = detectDateDaysConflict([start, end], val)
    if (!conflict) {
      setTourDays(val)
      return
    }
    askConflict({
      implied: conflict.implied,
      current: val,
      onUseRange: () => {
        // User edited days but chose "use dates": roll days back to what
        // the existing range implies.
        setTourDays(conflict.implied)
      },
      onUseDays: () => {
        setTourDays(val)
        const newEnd = new Date(new Date(start).getTime() + (val - 1) * 86400000)
        setTourDateRange([start, newEnd])
      },
    })
  }
```

- [ ] **Step 2: Run the full JS suite**

Run: `npm test`

Expected: PASS — the pure-function tests from Tasks 1–2 still pass, and no existing tests regress.

- [ ] **Step 3: Manual verification in the worktree**

Server already on port 9101. Exercise each row of the conflict table from the spec:

| Scenario | Action | Expected |
|---|---|---|
| First-time date pick | days still 1, pick Apr 20 – Apr 24 | days auto-fills to 5, no modal |
| First-time days | range empty, fill days = 5 | days = 5, no modal, no end date created |
| Days with start only | pick Apr 20 (start only), then fill days = 5 | end auto-fills to Apr 24, no modal |
| Matching change | range = Apr 20–Apr 24 (5), days = 5, re-pick same range | no modal |
| Conflict: change range | days = 5, range = Apr 20–Apr 24, then pick Apr 20–May 3 | modal opens; confirm → days = 14; cancel → end truncated to Apr 24 |
| Conflict: change days | range = Apr 20–Apr 24 (5), change days to 10 | modal opens; confirm → days back to 5; cancel → end extended to Apr 29 |
| Esc on conflict | reach the conflict modal, press Esc | same effect as clicking cancel (keep days, truncate range) |
| Clear range | range has full pair, hit the × clear button | range clears, days untouched |
| Clear days | range has full pair, clear days input | days clears, range untouched |

Optional: use `chrome-devtools-mcp` (`take_snapshot`, `click`, `fill`) to capture each confirmation.

- [ ] **Step 4: Commit**

```bash
git add app/javascript/pages/Tour/Constitution.jsx
git commit -m "$(cat <<'EOF'
fix(tour): replace silent date/days sync with confirm modal (#4)

handleDateRangeChange and handleDaysChange used to overwrite the other
field silently, turning 'days=5, pick a 14-day range' into 'days=14'
without any feedback. Now: when both fields are set and a change would
make them disagree, open a Mantine confirm modal with two branches
('change days to match dates' / 'keep days, truncate dates'). No
modal on first-time autofill or matching edits. Esc / backdrop click /
close button all fall through to 'keep days' because openConfirmModal
binds them to onCancel.
EOF
)"
```

---

## Task 5: CI-matching local verification

- [ ] **Step 1: Run the CI suite locally**

From [CLAUDE.md](CLAUDE.md) "Before claiming done":

```bash
mise exec -- bundle exec rspec
npm test
bin/rubocop -f github
bin/brakeman --no-pager
npm audit
```

Expected: RSpec unchanged (no Ruby touched). Vitest passes with the new tests. Rubocop/Brakeman unchanged. `npm audit` unchanged.

- [ ] **Step 2: Smoke-test the integrated flow**

With `bin/worktree-dev up` still running, walk the full Step 1 happy path once end-to-end:

1. Log in as a dev user → "+ 新建程"
2. Pick a date range (today or later; confirm today is the min)
3. Click 下一步
4. Land on Step 2 (the constitution full text) without console errors

Check `preview_console_logs` or the Rails log for errors. No crashes. No stale modal state.

If all checks pass, the plan is done.

---

## Self-Review

Coverage against [the spec](docs/superpowers/specs/2026-04-18-constitution-step1-date-ux-hardening-design.md):

- **#3 disable past dates** → Task 3
- **`todayLocal()` local-timezone helper** → Task 1
- **`detectDateDaysConflict()` pure helper** → Task 2
- **Conflict modal + rewritten handlers** → Task 4
- **Conflict table scenarios** → Task 4 Step 3 manual verification
- **CI parity** → Task 5

No placeholders, no "TODO", no "similar to...". Type names consistent: `todayLocal`, `detectDateDaysConflict`, `askConflict` all spelled identically across tasks.
