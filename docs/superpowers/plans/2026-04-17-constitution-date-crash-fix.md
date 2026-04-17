# Constitution Date-Crash Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the silent `formatDateISO` crash that blocks "宪法 → 规划" Step 1, and add visible error feedback (toast + Sentry) around all async work in [Constitution.jsx](app/javascript/pages/Tour/Constitution.jsx).

**Architecture:** Single-file refactor. Make `formatDateISO` tolerant of Mantine 9's string output, add a file-local `postJson` helper that checks `response.ok`, wrap both `proceedToReview` and `agreeAndStart` in try/catch with `isSaving`/`isAccepting` loading states, replace `window.confirm` with Mantine `openConfirmModal`. No project-wide helpers, no data-shape refactors.

**Tech Stack:** React 18, `@mantine/core` v9, `@mantine/dates` v9, `@mantine/notifications`, `@mantine/modals`, `@sentry/react`, Vitest.

**Reference spec:** [docs/superpowers/specs/2026-04-17-constitution-date-crash-fix-design.md](docs/superpowers/specs/2026-04-17-constitution-date-crash-fix-design.md)

---

## File Structure

| File | Action | Responsibility |
|---|---|---|
| [app/javascript/pages/Tour/Constitution.jsx](app/javascript/pages/Tour/Constitution.jsx) | Modify | All behavioral changes (5 functions, 2 buttons, 3 imports) |
| `app/javascript/pages/Tour/__tests__/formatDateISO.test.js` | Create | Unit tests for the only pure function we're changing |

No other files touched. `ModalsProvider` and `Notifications` are already mounted globally in [app/javascript/entrypoints/inertia.jsx:57](app/javascript/entrypoints/inertia.jsx:57).

---

## Task 1: Make `formatDateISO` tolerant (TDD)

**Files:**
- Modify: `app/javascript/pages/Tour/Constitution.jsx` (export + rewrite lines 320–325)
- Create: `app/javascript/pages/Tour/__tests__/formatDateISO.test.js`

- [ ] **Step 1: Write the failing test file**

Create `app/javascript/pages/Tour/__tests__/formatDateISO.test.js`:

```js
import { describe, test, expect } from 'vitest'
import { formatDateISO } from '../Constitution'

describe('formatDateISO', () => {
  test('returns an already-ISO string unchanged', () => {
    expect(formatDateISO('2026-04-16')).toBe('2026-04-16')
  })

  test('normalizes a non-padded ISO-ish string by parsing it', () => {
    expect(formatDateISO('2026-4-16')).toBe('2026-04-16')
  })

  test('formats a Date object (month is 0-indexed in JS)', () => {
    expect(formatDateISO(new Date(2026, 3, 16))).toBe('2026-04-16')
  })

  test('returns null for null', () => {
    expect(formatDateISO(null)).toBeNull()
  })

  test('returns null for undefined', () => {
    expect(formatDateISO(undefined)).toBeNull()
  })

  test('returns null for empty string', () => {
    expect(formatDateISO('')).toBeNull()
  })

  test('returns null for Invalid Date', () => {
    expect(formatDateISO(new Date('bogus'))).toBeNull()
  })

  test('returns null for a plain object', () => {
    expect(formatDateISO({})).toBeNull()
  })

  test('returns null for a number', () => {
    expect(formatDateISO(12345)).toBeNull()
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run app/javascript/pages/Tour/__tests__/formatDateISO.test.js`

Expected: FAIL with import error — `formatDateISO` is not exported from `../Constitution` (it's currently a file-local function).

- [ ] **Step 3: Update `formatDateISO` in Constitution.jsx**

Open [app/javascript/pages/Tour/Constitution.jsx](app/javascript/pages/Tour/Constitution.jsx). Replace the function at lines 320–325 with the tolerant version and add `export`:

```js
export function formatDateISO(d) {
  if (!d) return null
  if (typeof d === 'string') {
    return /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : formatDateISO(new Date(d))
  }
  if (!(d instanceof Date) || isNaN(d)) return null
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run app/javascript/pages/Tour/__tests__/formatDateISO.test.js`

Expected: PASS — all 9 assertions green.

- [ ] **Step 5: Run the full JS test suite to confirm no regressions**

Run: `npm test`

Expected: PASS — no previously-passing tests fail.

- [ ] **Step 6: Commit**

```bash
git add app/javascript/pages/Tour/Constitution.jsx app/javascript/pages/Tour/__tests__/formatDateISO.test.js
git commit -m "fix(tour): tolerate string date inputs in formatDateISO

Mantine 9's DatePickerInput[type=range] emits [string, string] not
[Date, Date]. The previous implementation called .getFullYear() on a
string and threw silently inside an async handler, blocking 'Next' on
tour setup. Now accept string | Date | null/undefined and return null
for invalid inputs; callers already guard with && on the result."
```

---

## Task 2: Add `postJson` helper + harden `proceedToReview`

**Files:**
- Modify: `app/javascript/pages/Tour/Constitution.jsx` — add helper, add imports, rewrite `proceedToReview`, update its button.

- [ ] **Step 1: Add imports**

At the top of [app/javascript/pages/Tour/Constitution.jsx](app/javascript/pages/Tour/Constitution.jsx) (after the existing imports on lines 1–6), add:

```js
import { notifications } from '@mantine/notifications'
import * as Sentry from '@sentry/react'
```

(The `modals` import is added in Task 4.)

- [ ] **Step 2: Add the `postJson` helper**

Add this function above `formatDateISO` (so both exist in the file-level function area). Suggested location: right before `function formatDateISO(d)` near line 320.

```js
async function postJson(url, method, body) {
  const token = document.querySelector('meta[name=csrf-token]')?.getAttribute('content') || ''
  const res = await fetch(url, {
    method,
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'X-CSRF-Token': token,
    },
    body: body ? JSON.stringify(body) : undefined,
  })
  if (!res.ok) throw new Error(`${method} ${url} 失败 (${res.status})`)
  return res
}
```

- [ ] **Step 3: Add the `isSaving` state**

Inside the `Constitution` component, after the existing `useState` block (the last one is `const [tourDays, setTourDays] = useState(tour.days_count || 1)` on line 29), append:

```js
const [isSaving, setIsSaving] = useState(false)
```

- [ ] **Step 4: Rewrite `proceedToReview`**

Replace the entire `proceedToReview` function (currently lines 55–89) with:

```js
const proceedToReview = async () => {
  if (!tourTitle.trim()) {
    notifications.show({ message: '请先填写程名', color: 'red' })
    return
  }
  if (isSaving) return
  setIsSaving(true)
  try {
    const [startDate, endDate] = tourDateRange
    const s = formatDateISO(startDate)
    const e = formatDateISO(endDate)
    const dateRangeStr = (s && e) ? `${s} ~ ${e}` : null

    await postJson(`/tours/${tour.id}`, 'PATCH', {
      tour: { title: tourTitle.trim(), date_range: dateRangeStr, team_size: tourTeamSize || null },
    })
    await postJson(`/tours/${tour.id}/constitution`, 'PATCH', { constitution: c })

    const currentDayCount = tour.days_count || 1
    const targetDayCount = tourDays || 1
    for (let i = currentDayCount + 1; i <= targetDayCount; i++) {
      await postJson(`/tours/${tour.id}/days`, 'POST', { day: { day_index: i } })
    }

    setSetupStep(2)
    window.scrollTo(0, 0)
  } catch (err) {
    notifications.show({ message: `保存失败：${err.message}`, color: 'red' })
    Sentry.captureException(err, {
      tags: { area: 'tour_setup', op: 'save_params' },
      extra: { tour_id: tour.id },
    })
  } finally {
    setIsSaving(false)
  }
}
```

- [ ] **Step 5: Update the Step 1 "下一步" button**

Line 169 currently reads:

```jsx
<Button onClick={proceedToReview}>下一步 →</Button>
```

Replace with:

```jsx
<Button onClick={proceedToReview} loading={isSaving} disabled={isSaving}>
  {isSaving ? '保存中…' : '下一步 →'}
</Button>
```

- [ ] **Step 6: Verify the build and dev server still load**

Run: `npm test`

Expected: PASS — `formatDateISO` test still green; no other tests regress.

- [ ] **Step 7: Manual regression (happy path + error path)**

Start the dev server if not already running. In a browser at `http://127.0.0.1:9000`:

1. Log in via `/auth/developer` with any name/email.
2. Click "+ 新建程" → "调整本程参数" appears.
3. Set 程名 = "测试 A"; pick any valid date range; 天数 = 3.
4. Click "下一步 →" → button shows "保存中…" briefly, then Step 2 `《本程宪法》` appears. **Previously this crashed silently.**
5. Back to Step 1 ("← 返回修改参数"). Clear the 程名. Click "下一步 →" → red toast `请先填写程名`; Step 2 not entered.
6. Stop the Rails server (`mise exec -- kamal app exec …` is not needed — just Ctrl+C the local `bin/dev`), or use browser DevTools "Offline" mode. Click "下一步 →" → red toast `保存失败：PATCH /tours/37 失败 (…)`. Restart server.
7. Open Sentry dev project; confirm one event tagged `area=tour_setup`, `op=save_params` with `tour_id` in `extra`.

- [ ] **Step 8: Commit**

```bash
git add app/javascript/pages/Tour/Constitution.jsx
git commit -m "fix(tour): harden proceedToReview with loading state + toast

Wrap the async fetch chain in try/catch, check response.ok via a
file-local postJson helper, surface failures via notifications.show and
Sentry.captureException, and gate double-clicks behind an isSaving
flag. Empty-title case now toasts instead of silently returning."
```

---

## Task 3: Harden `agreeAndStart`

**Files:**
- Modify: `app/javascript/pages/Tour/Constitution.jsx` — rewrite `agreeAndStart`, update its button.

- [ ] **Step 1: Add `isAccepting` state**

In the same `useState` block (near where `isSaving` was added), append:

```js
const [isAccepting, setIsAccepting] = useState(false)
```

- [ ] **Step 2: Rewrite `agreeAndStart`**

Replace the entire `agreeAndStart` function (currently lines 92–99) with:

```js
const agreeAndStart = async () => {
  if (isAccepting) return
  setIsAccepting(true)
  try {
    await postJson(`/tours/${tour.id}/constitution/accept`, 'POST')
    router.visit(`/tours/${tour.id}`)
  } catch (err) {
    notifications.show({ message: `无法开始规划：${err.message}`, color: 'red' })
    Sentry.captureException(err, {
      tags: { area: 'tour_setup', op: 'accept_constitution' },
      extra: { tour_id: tour.id },
    })
    setIsAccepting(false)
  }
  // On success: router.visit leaves the page; no need to reset isAccepting.
}
```

- [ ] **Step 3: Update the Step 2 "同意并开始规划" button**

Line 186 currently reads:

```jsx
<Button color="red" onClick={agreeAndStart}>同意并开始规划 →</Button>
```

Replace with:

```jsx
<Button color="red" onClick={agreeAndStart} loading={isAccepting} disabled={isAccepting}>
  {isAccepting ? '开始规划中…' : '同意并开始规划 →'}
</Button>
```

- [ ] **Step 4: Manual regression**

1. Complete Step 1 (valid params, click "下一步 →"); land on Step 2.
2. Click "同意并开始规划 →" → button shows spinner; page navigates to `/tours/{id}` with the planner.
3. Back to Step 2 (click "宪法" tab, then "← 返回修改参数", then "下一步 →" again). This time, block the network before clicking: in DevTools, right-click the accept request row to "Block URL" → `/constitution/accept`. Click the button → red toast `无法开始规划：POST /tours/37/constitution/accept 失败 (…)`; button returns to active state (can retry).
4. Unblock; click again → succeeds.
5. Confirm Sentry dev project shows an event tagged `area=tour_setup`, `op=accept_constitution`.

- [ ] **Step 5: Commit**

```bash
git add app/javascript/pages/Tour/Constitution.jsx
git commit -m "fix(tour): harden agreeAndStart with loading state + toast

Mirror the proceedToReview pattern on the Step 2 'accept' button:
try/catch around postJson, toast + Sentry on failure, isAccepting flag
to prevent double-clicks. On success router.visit unmounts so we don't
reset the flag."
```

---

## Task 4: Replace `window.confirm` with Mantine confirm modal

**Files:**
- Modify: `app/javascript/pages/Tour/Constitution.jsx` — add `modals` import, rewrite `resetToDefaults`.

- [ ] **Step 1: Add the `modals` import**

At the top of the file, alongside the imports added in Task 2, add:

```js
import { modals } from '@mantine/modals'
```

- [ ] **Step 2: Rewrite `resetToDefaults`**

Replace the existing `resetToDefaults` function (currently lines 108–114) with:

```js
const resetToDefaults = () => {
  if (!dirty) return
  const changedCount = Object.keys(defaults)
    .filter(k => String(c[k]) !== String(defaults[k])).length
  modals.openConfirmModal({
    title: '恢复默认参数？',
    children: (
      <Text size="sm">
        恢复默认会丢弃你已修改的 {changedCount} 个参数，确认吗？
      </Text>
    ),
    labels: { confirm: '恢复默认', cancel: '取消' },
    confirmProps: { color: 'red' },
    onConfirm: () => setC({ ...defaults }),
  })
}
```

`Text` is already part of the existing import on line 2 (`import { Stack, Group, Title, Button, Paper, Text, Select, Divider, TextInput, NumberInput } from '@mantine/core'`) — no import change needed.

Note: this function is called from two buttons in the same file (line 168 in Step 1 and line 200 in review mode); updating the one `resetToDefaults` function fixes both call sites.

- [ ] **Step 3: Manual regression**

1. New trip → Step 1. Change one of the "关键约束" comboboxes (e.g., 每天最多驾驶 → 6 小时). The "↺ 恢复默认" button should become enabled (this is a pre-existing bug noted in the spec; if it remains disabled, report back — but don't fix in this plan).
2. Assuming it's enabled, click "↺ 恢复默认" → a Mantine modal appears (centered, with backdrop) titled "恢复默认参数？" — **not** a native browser confirm.
3. Click "取消" → modal closes; value unchanged.
4. Click "↺ 恢复默认" again → "恢复默认" (red button) → modal closes; combobox reverts.

- [ ] **Step 4: Commit**

```bash
git add app/javascript/pages/Tour/Constitution.jsx
git commit -m "refactor(tour): use Mantine confirm modal for reset-to-defaults

Brand consistency: every other destructive confirm in the app uses
modals.openConfirmModal (Show.jsx, ActivityDrawer.jsx). The native
window.confirm here was the odd one out."
```

---

## Task 5: Full CI gate + integration sanity

**Files:** none (verification only; may produce a fixup commit if something fails).

- [ ] **Step 1: Run the JS test suite**

Run: `npm test`

Expected: PASS — including the new `formatDateISO.test.js`. No prior test regresses.

- [ ] **Step 2: Run the Ruby suite (no backend changes expected, but sanity)**

Run: `mise exec -- bundle exec rspec`

Expected: PASS.

- [ ] **Step 3: Lint**

Run: `bin/rubocop -f github`

Expected: no offenses. (No `.rb` changes were made, but the CI hook runs it.)

- [ ] **Step 4: Security scan**

Run: `bin/brakeman --no-pager`

Expected: no new warnings.

- [ ] **Step 5: npm audit**

Run: `npm audit`

Expected: no new advisories introduced (pre-existing advisories are fine).

- [ ] **Step 6: End-to-end manual pass**

Fresh dev login. Execute the full flow top-to-bottom without hitting any console errors:

1. "+ 新建程" → Step 1.
2. Set 程名 "川西测试", 日期 2026-05-01 ~ 2026-05-05, 人数 3.
3. Open "▾ 高级参数". Change "单日山路驾驶上限" to 3 小时. "↺ 恢复默认" becomes enabled → test the modal once → cancel.
4. Click "下一步 →" → button shows "保存中…" → Step 2 appears, "《本程宪法》".
5. Scroll to bottom. Click "同意并开始规划 →" → button shows "开始规划中…" → `/tours/{id}` planner loads.
6. Open browser console. Confirm zero errors related to `formatDateISO`, `proceedToReview`, or `agreeAndStart`.

- [ ] **Step 7: If everything is green, there's nothing to commit for this task** — the gates just confirm Tasks 1–4 left the repo healthy. If a fix was needed, commit it as `fix(tour): …` or `chore(tour): …` as appropriate.

---

## Summary

| Task | Commits | Visible outcome |
|---|---|---|
| 1 | 1 | `formatDateISO` tolerates strings; unit-tested |
| 2 | 1 | Step 1 "下一步" no longer crashes; loading + toast + Sentry |
| 3 | 1 | Step 2 "同意并开始规划" has same robustness |
| 4 | 1 | Reset confirm uses Mantine modal |
| 5 | 0–1 | CI gates pass |

Total: 4–5 commits, all scoped to `Constitution.jsx` + one new test file.
