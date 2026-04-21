# Activity Detail Drawer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a new "activity detail drawer" — unified click-target for all roles — containing the full activity info + a "记一笔" shortcut tied to that activity, while opening reader access to details they previously couldn't see.

**Architecture:** New `ActivityDetailDrawer.jsx` (drawer shell + 6 inline section components). Click on `ActivityCard` now opens detail drawer for ALL roles (including reader — we remove the existing `readOnly` click gate). "编辑" button inside detail drawer opens the existing `ActivityDrawer` (edit mode unchanged). "记一笔" button opens existing `AddExpenseDialog` with a new `initialActivityId` prop pre-selecting the activity. No backend changes — everything sources from Tour/Show payload.

**Tech Stack:** React 19 + Mantine + Inertia.js. Vitest for unit tests. No new Ruby code.

**Spec:** `docs/superpowers/specs/2026-04-21-activity-detail-drawer-design.md`

**Base branch:** `feat/activity-detail-drawer` (branched from `origin/main` @ `f82b327`)

---

## File Structure

**JS — create:**
- `app/javascript/components/planner/ActivityDetailDrawer.jsx` (drawer shell + 6 inline section functions)
- `app/javascript/components/planner/ActivityMiniMap.jsx` (AMap single-marker wrapper for §2.2's mini-map)
- `app/javascript/components/planner/__tests__/ActivityDetailDrawer.test.jsx`

**JS — modify:**
- `app/javascript/components/planner/ActivityCard.jsx` (remove `readOnly` gate inside `handleBodyClick`)
- `app/javascript/components/planner/__tests__/ActivityCard.test.jsx` (update readOnly expectations)
- `app/javascript/components/planner/AddExpenseDialog.jsx` (accept new `initialActivityId` prop; use in create-mode init)
- `app/javascript/components/planner/ExpenseDrawer.jsx` (accept new `initialExpenseId` prop; open edit dialog for that expense when the drawer opens and prop is set)
- `app/javascript/pages/Tour/Show.jsx` (new `detailViewer` state; new handlers `openDetail`/`openEditFromDetail`/`openAddExpenseForActivity`/`openExpenseById`; render `<ActivityDetailDrawer>`; reroute `onEditActivity` calls to `openDetail`)

**Prerequisites (not a code task):**
- Dev server + seed in the `activity-detail-drawer` worktree for manual E2E at Task 13 time (setup script at §Setup below)

---

## Setup (before Task 1)

- [ ] **S.1: Symlink env + master.key (worktree plumbing)**

Run:

```
cd /Users/drewlee/work/personal/one-tour/.claude/worktrees/activity-detail-drawer
ln -sf ../../../.env .env
ln -sf ../../../config/master.key config/master.key
```

- [ ] **S.2: Install deps + baseline tests**

Run:

```
cd /Users/drewlee/work/personal/one-tour/.claude/worktrees/activity-detail-drawer
npm install
mise trust . && mise exec -- bundle install --quiet
mise exec -- bundle exec rails db:migrate RAILS_ENV=test
npm test
mise exec -- bundle exec rspec
```

Expected: both test suites green. Record the numbers as the baseline (e.g., "346 Vitest, 462 RSpec"). If RSpec fails with `AMAP_API_KEY` KeyError, the `.env` symlink step (S.1) was skipped — go back.

---

## Task 1: Extend `AddExpenseDialog` with `initialActivityId` prop

Enable the detail drawer's 记一笔 button to pre-select the activity in the dialog. This is the smallest, most contained prerequisite for the drawer's main flow.

**Files:**
- Modify: `app/javascript/components/planner/AddExpenseDialog.jsx:44` (signature), `:158-169` (create-mode defaults)
- Modify: `app/javascript/components/planner/__tests__/AddExpenseDialog.test.jsx` (new test case if the file exists; otherwise leave — it exists after PR #34 but may not be on this branch yet)

- [ ] **Step 1.1: Write failing test in AddExpenseDialog.test.jsx (only if the file exists on this branch)**

Check first:

```
ls /Users/drewlee/work/personal/one-tour/.claude/worktrees/activity-detail-drawer/app/javascript/components/planner/__tests__/AddExpenseDialog.test.jsx
```

- **If file doesn't exist (likely — PR #34 may not be in yet):** Skip writing a unit test here. The new behavior will be covered by `ActivityDetailDrawer.test.jsx` in Task 9 (end-to-end assertion that clicking 记一笔 in the drawer opens a dialog with the correct activity preselected).
- **If file exists:** Append this test case to the `describe('AddExpenseDialog – prefill participants on activity change')` block (or create a new describe):

```jsx
test('initialActivityId prop forces create-mode default to that activity', () => {
  renderDialog({
    expense: null,
    activities: [
      { id: 10, day_id: 1, position: 1, name: 'A-default',  participant_user_ids: [] },
      { id: 20, day_id: 1, position: 2, name: 'B-just-Bob', participant_user_ids: [ 2 ] },
    ],
    initialActivityId: 20,
  })

  // B-just-Bob should be preselected — participant list should reflect B's [Bob].
  expect(checkboxFor('Bob')).toBeChecked()
  expect(checkboxFor('Alice')).not.toBeChecked()
  expect(checkboxFor('Cindy')).not.toBeChecked()
})
```

- [ ] **Step 1.2: Run test to see it fail (if you added one in 1.1)**

```
cd /Users/drewlee/work/personal/one-tour/.claude/worktrees/activity-detail-drawer
npm test -- --run app/javascript/components/planner/__tests__/AddExpenseDialog.test.jsx
```

Expected: the new case fails — `initialActivityId` prop is ignored; default is still `nonBacklogActivities[0].id` (A-default), so Alice/Bob/Cindy all checked.

- [ ] **Step 1.3: Add the prop + use it in create-mode default**

Edit `app/javascript/components/planner/AddExpenseDialog.jsx`. Change the signature on line 44 from:

```jsx
export default function AddExpenseDialog({ opened, onClose, tour, days, activities, members, author, expense, readOnly = false }) {
```

to:

```jsx
export default function AddExpenseDialog({ opened, onClose, tour, days, activities, members, author, expense, readOnly = false, initialActivityId = null }) {
```

Then find the create-mode branch of the init useEffect (around line 157-174, the `else` branch of `isEdit ? {...} : {...}`). Change the `activityId:` default from:

```jsx
activityId: nonBacklogActivities[0] ? String(nonBacklogActivities[0].id) : '',
```

to:

```jsx
activityId: initialActivityId
  ? String(initialActivityId)
  : (nonBacklogActivities[0] ? String(nonBacklogActivities[0].id) : ''),
```

Also, if the post-PR-#34 `participantIds` default (the `(() => { ... effectiveParticipants(firstActivity, ...) })()` IIFE) is present on this branch, wrap it so it picks the right activity:

```jsx
participantIds: (() => {
  const targetId = initialActivityId ? Number(initialActivityId) : nonBacklogActivities[0]?.id
  const targetActivity = targetId ? activities.find((a) => a.id === targetId) : null
  if (!targetActivity) return allUsers.map((u) => u.user_id)
  return effectiveParticipants(targetActivity, { author, members })
})(),
```

If the existing code just does `participantIds: allUsers.map((u) => u.user_id)` (pre-PR-#34), leave it as-is — the detail drawer's 记一笔 flow will still preselect the right `activityId`; the participants default being "all users" is a minor cosmetic gap resolved when PR #34 merges.

- [ ] **Step 1.4: Re-run test to see it pass (if added in 1.1)**

```
npm test -- --run app/javascript/components/planner/__tests__/AddExpenseDialog.test.jsx
```

Expected: pass.

- [ ] **Step 1.5: Commit**

```bash
cd /Users/drewlee/work/personal/one-tour/.claude/worktrees/activity-detail-drawer
git add app/javascript/components/planner/AddExpenseDialog.jsx
# Also add test file if you modified it
git add app/javascript/components/planner/__tests__/AddExpenseDialog.test.jsx 2>/dev/null || true
git commit -m "$(cat <<'EOF'
feat(expense): accept initialActivityId prop in AddExpenseDialog

让后续的 ActivityDetailDrawer "记一笔" 按钮可以打开 dialog 并预选特定 activity，
而不是总是默认回第一个 nonBacklogActivity。create 模式下若传入 prop 则用它，
否则保持原行为；edit 模式完全不受影响（expense.activity_id 依然是权威来源）。

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: `ActivityMiniMap` — AMap single-marker wrapper

Build a small, focused map component for the detail drawer's 地点 section.

**Files:**
- Create: `app/javascript/components/planner/ActivityMiniMap.jsx`

No Vitest for this component — it relies on the AMap SDK which is not sensibly mockable in jsdom, and the logic is thin. Manual E2E at Task 13 is the acceptance gate.

- [ ] **Step 2.1: Create `ActivityMiniMap.jsx`**

Write the entire file:

```jsx
import { useEffect, useRef } from 'react'
import { usePage } from '@inertiajs/react'
import { Paper, Text } from '@mantine/core'
import useAmap from '../../hooks/useAmap'

// Small, read-only map showing one activity's location. Read-only means:
// no zoom/drag interaction (disables user manipulation), no map type switcher,
// no popup on marker click. Mounts once per (lat, lng), destroys on unmount.
//
// SDK loading is shared with PlannerMap via `useAmap` — if the main map has
// already kicked off the SDK load, this component waits on the same ready
// event instead of re-loading.
//
// Returns `null` if SDK credentials are absent (dev/local without AMAP keys);
// the parent section handles coords-missing layout separately.
export default function ActivityMiniMap({ lat, lng, height = 160 }) {
  const { amap_js_api_key, amap_js_security_code } = usePage().props
  const sdkState = useAmap(amap_js_api_key, amap_js_security_code)
  const containerRef = useRef(null)
  const mapRef = useRef(null)
  const markerRef = useRef(null)

  useEffect(() => {
    if (sdkState !== 'ready') return
    if (!containerRef.current || lat == null || lng == null) return

    const map = new window.AMap.Map(containerRef.current, {
      zoom: 14,
      center: [ lng, lat ],
      dragEnable: false,
      zoomEnable: false,
      doubleClickZoom: false,
      scrollWheel: false,
      keyboardEnable: false,
    })
    mapRef.current = map

    const marker = new window.AMap.Marker({
      position: [ lng, lat ],
      map,
      anchor: 'bottom-center',
    })
    markerRef.current = marker

    return () => {
      marker?.setMap(null)
      map?.destroy()
      mapRef.current = null
      markerRef.current = null
    }
  }, [sdkState, lat, lng])

  if (sdkState === 'idle' || sdkState === 'error') {
    return (
      <Paper withBorder p="xs" style={{ height, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Text size="xs" c="dimmed">地图不可用</Text>
      </Paper>
    )
  }

  return (
    <div
      ref={containerRef}
      data-testid="activity-mini-map"
      style={{ width: '100%', height, borderRadius: 4, overflow: 'hidden' }}
    />
  )
}
```

- [ ] **Step 2.2: Commit**

```bash
git add app/javascript/components/planner/ActivityMiniMap.jsx
git commit -m "$(cat <<'EOF'
feat(map): add ActivityMiniMap — single-marker read-only map

给 ActivityDetailDrawer 的"地点"段落用：只读、无交互（禁用拖拽/缩放/滚轮），
单 marker，160px 高。复用 useAmap hook 共享 SDK 加载，不与 PlannerMap 抢加载。

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: `ActivityDetailDrawer` scaffold — drawer shell only (no sections yet)

Build the empty drawer first. Later tasks plug in sections one by one. This makes the TDD loop fast: each section gets its own test against a working shell.

**Files:**
- Create: `app/javascript/components/planner/ActivityDetailDrawer.jsx`
- Create: `app/javascript/components/planner/__tests__/ActivityDetailDrawer.test.jsx`

- [ ] **Step 3.1: Write failing shell test**

Create `app/javascript/components/planner/__tests__/ActivityDetailDrawer.test.jsx`:

```jsx
import { render, screen, fireEvent } from '@testing-library/react'
import { MantineProvider } from '@mantine/core'
import { vi, beforeEach, describe, test, expect } from 'vitest'
import ActivityDetailDrawer from '../ActivityDetailDrawer'

vi.mock('@inertiajs/react', () => ({
  router: {
    reload: vi.fn(),
    put: vi.fn((url, data, opts) => opts?.onSuccess?.()),
  },
  usePage: () => ({ props: { amap_js_api_key: null, amap_js_security_code: null } }),
}))

// Hoisted mock — any jsx file importing '../ActivityMiniMap' gets a dumb div.
// The real SDK component is exercised in manual E2E only.
vi.mock('../ActivityMiniMap', () => ({
  default: ({ lat, lng }) => <div data-testid="mock-mini-map" data-lat={lat} data-lng={lng} />,
}))

const AUTHOR  = { user_id: 1, name: 'Alice', email: 'a@x', avatar_url: null }
const MEMBERS = [
  { user_id: 2, name: 'Bob',   email: 'b@x', avatar_url: null, role: 'editor' },
  { user_id: 3, name: 'Cindy', email: 'c@x', avatar_url: null, role: 'reader' },
]
const DAYS = [ { id: 1, day_index: 1 } ]

function makeActivity(overrides = {}) {
  return {
    id: 10,
    name: '赛里木湖',
    kind: 'scenic',
    citizen_level: 'tier_two',
    day_id: 1,
    position: 1,
    lat: 44.6,
    lng: 81.2,
    address: '新疆伊犁州赛里木湖风景区',
    planned_start_at: '14:00',
    planned_duration_min: 120,
    desc: '湖光山色，风景绝美。',
    details: { altitude: 2073, ticket_info: 70 },
    participant_user_ids: [],
    ...overrides,
  }
}

function renderDrawer(props = {}) {
  const defaults = {
    opened: true,
    onClose: vi.fn(),
    tour: { id: 1, currency: 'CNY' },
    days: DAYS,
    activity: makeActivity(),
    activityImages: [],
    author: AUTHOR,
    members: MEMBERS,
    expenses: [],
    canEdit: true,
    onEdit: vi.fn(),
    onAddExpense: vi.fn(),
    onFocusExpense: vi.fn(),
  }
  return render(
    <MantineProvider>
      <ActivityDetailDrawer {...defaults} {...props} />
    </MantineProvider>
  )
}

describe('ActivityDetailDrawer – shell', () => {
  test('renders the activity name as a heading', () => {
    renderDrawer()
    expect(screen.getByRole('heading', { name: '赛里木湖' })).toBeInTheDocument()
  })

  test('calls onClose when the close button is clicked', () => {
    const onClose = vi.fn()
    renderDrawer({ onClose })
    // Mantine Drawer's built-in close button has accessible name "Close"
    const closeBtn = screen.getByRole('button', { name: /close/i })
    fireEvent.click(closeBtn)
    expect(onClose).toHaveBeenCalled()
  })

  test('renders nothing when opened=false', () => {
    const { container } = renderDrawer({ opened: false })
    expect(container.querySelector('[role="dialog"]')).toBeNull()
  })
})
```

- [ ] **Step 3.2: Run test — should fail (module missing)**

```
npm test -- --run app/javascript/components/planner/__tests__/ActivityDetailDrawer.test.jsx
```

Expected: "Cannot find module '../ActivityDetailDrawer'" or similar.

- [ ] **Step 3.3: Create shell component**

Create `app/javascript/components/planner/ActivityDetailDrawer.jsx`:

```jsx
import { Drawer, Stack, Title } from '@mantine/core'

// Read-only detail view for a single Activity. Unified entry point for all
// roles when clicking an activity card — author/editor see [+ 记一笔] and
// [编辑] buttons; reader sees only the close button.
//
// Sections (from top to bottom, single-column scroll):
//   1. Header       — name + meta + action buttons
//   2. Location     — address + coords + kind-specific fields + mini-map
//   3. Description  — activity.desc (hidden when empty)
//   4. Gallery      — image thumbnails (hidden when empty)
//   5. Participants — read-only roster (default-全员 or explicit list)
//   6. Expenses     — activity-scope expense list + summary + [+ 记一笔]
//
// All data comes from props supplied by Tour/Show.jsx — zero network calls
// in this component. "记一笔" and "编辑" delegate to callback props; the
// parent wires them to AddExpenseDialog / ActivityDrawer.
export default function ActivityDetailDrawer({
  opened, onClose,
  tour, days, activity, activityImages, author, members, expenses,
  canEdit,
  onEdit, onAddExpense, onFocusExpense,
}) {
  return (
    <Drawer
      opened={opened}
      onClose={onClose}
      position="right"
      size={480}
      padding="md"
      withCloseButton
      title={activity ? <Title order={3}>{activity.name}</Title> : null}
    >
      {activity && (
        <Stack gap="md">
          {/* Sections plugged in by Tasks 4-8 */}
        </Stack>
      )}
    </Drawer>
  )
}
```

- [ ] **Step 3.4: Run test — expect pass**

```
npm test -- --run app/javascript/components/planner/__tests__/ActivityDetailDrawer.test.jsx
```

Expected: all 3 shell tests pass.

- [ ] **Step 3.5: Commit**

```bash
git add app/javascript/components/planner/ActivityDetailDrawer.jsx \
        app/javascript/components/planner/__tests__/ActivityDetailDrawer.test.jsx
git commit -m "$(cat <<'EOF'
feat(detail): ActivityDetailDrawer shell — drawer + title + close

空壳，只渲染 Drawer + activity.name 作为 Title + Mantine 自带 close 按钮。
section 填充在后续 task 里逐个加，每个 section 有独立测试。

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Header section — meta line + action buttons

Inside the drawer shell, add the meta line (D-label · kind · tier · time · duration) and the three header buttons ([+ 记一笔], [编辑], [X]).

**Files:**
- Modify: `app/javascript/components/planner/ActivityDetailDrawer.jsx`
- Modify: `app/javascript/components/planner/__tests__/ActivityDetailDrawer.test.jsx`

- [ ] **Step 4.1: Append failing tests for header**

Add to `ActivityDetailDrawer.test.jsx` (after the existing describe block):

```jsx
describe('ActivityDetailDrawer – header meta + actions', () => {
  test('renders meta line with D-label, kind, tier, time, duration', () => {
    renderDrawer()
    const header = screen.getByTestId('detail-header')
    expect(header).toHaveTextContent('D1')
    expect(header).toHaveTextContent('scenic')
    expect(header).toHaveTextContent('tier_two')
    expect(header).toHaveTextContent('14:00')
    expect(header).toHaveTextContent('2h')
  })

  test('backlog activity (day_id null) shows "候选池" instead of Dn', () => {
    renderDrawer({ activity: makeActivity({ day_id: null }) })
    const header = screen.getByTestId('detail-header')
    expect(header).toHaveTextContent('候选池')
    expect(header).not.toHaveTextContent(/^D\d/)
  })

  test('canEdit=true renders [+ 记一笔] and [编辑] header buttons', () => {
    renderDrawer({ canEdit: true })
    expect(screen.getByRole('button', { name: /记一笔/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /编辑/ })).toBeInTheDocument()
  })

  test('canEdit=false hides [+ 记一笔] and [编辑] header buttons', () => {
    renderDrawer({ canEdit: false })
    expect(screen.queryByRole('button', { name: /记一笔/ })).toBeNull()
    expect(screen.queryByRole('button', { name: /编辑/ })).toBeNull()
  })

  test('clicking [+ 记一笔] calls onAddExpense with activity id', () => {
    const onAddExpense = vi.fn()
    renderDrawer({ onAddExpense })
    fireEvent.click(screen.getByRole('button', { name: /记一笔/ }))
    expect(onAddExpense).toHaveBeenCalledWith(10)
  })

  test('clicking [编辑] calls onEdit with activity id', () => {
    const onEdit = vi.fn()
    renderDrawer({ onEdit })
    fireEvent.click(screen.getByRole('button', { name: /编辑/ }))
    expect(onEdit).toHaveBeenCalledWith(10)
  })
})
```

- [ ] **Step 4.2: Run — expect 6 failures (testid and buttons don't exist yet)**

```
npm test -- --run app/javascript/components/planner/__tests__/ActivityDetailDrawer.test.jsx
```

- [ ] **Step 4.3: Implement header in `ActivityDetailDrawer.jsx`**

Update imports and the component body:

```jsx
import { Drawer, Stack, Title, Group, Text, Button } from '@mantine/core'
import { IconPlus, IconPencil } from '@tabler/icons-react'

function formatDuration(min) {
  if (min == null) return null
  if (min >= 60 && min % 30 === 0) return `${min / 60}h`
  return `${min}分`
}

function DetailHeaderSection({ activity, days, canEdit, onEdit, onAddExpense }) {
  const day = days.find((d) => d.id === activity.day_id)
  const dayLabel = day ? `D${day.day_index}` : '候选池'
  const duration = formatDuration(activity.planned_duration_min)
  return (
    <Stack gap={6} data-testid="detail-header">
      <Group justify="space-between" wrap="nowrap" align="flex-start">
        <Text size="xs" c="dimmed" component="div">
          {[ dayLabel, activity.kind, activity.citizen_level, activity.planned_start_at, duration ]
            .filter(Boolean).join(' · ')}
        </Text>
        {canEdit && (
          <Group gap="xs" wrap="nowrap">
            <Button
              size="xs"
              variant="filled"
              leftSection={<IconPlus size={14} />}
              onClick={() => onAddExpense(activity.id)}
            >
              记一笔
            </Button>
            <Button
              size="xs"
              variant="subtle"
              leftSection={<IconPencil size={14} />}
              onClick={() => onEdit(activity.id)}
            >
              编辑
            </Button>
          </Group>
        )}
      </Group>
    </Stack>
  )
}
```

Then wire it into the drawer body:

```jsx
      {activity && (
        <Stack gap="md">
          <DetailHeaderSection
            activity={activity}
            days={days}
            canEdit={canEdit}
            onEdit={onEdit}
            onAddExpense={onAddExpense}
          />
          {/* Sections plugged in by Tasks 5-8 */}
        </Stack>
      )}
```

- [ ] **Step 4.4: Run — expect all header tests pass (9 total including shell)**

```
npm test -- --run app/javascript/components/planner/__tests__/ActivityDetailDrawer.test.jsx
```

- [ ] **Step 4.5: Commit**

```bash
git add app/javascript/components/planner/ActivityDetailDrawer.jsx \
        app/javascript/components/planner/__tests__/ActivityDetailDrawer.test.jsx
git commit -m "$(cat <<'EOF'
feat(detail): header meta line + [+ 记一笔] / [编辑] buttons

Meta 行显示 D-label / kind / tier / 时间 / 时长；backlog 活动显示"候选池"代替 Dn。
canEdit=true 渲染两个操作按钮并绑定 onAddExpense / onEdit 回调；
canEdit=false 全部隐藏，只剩 Drawer 自带的关闭按钮。

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: Location section — address + kind-specific fields + mini-map

**Files:**
- Modify: `app/javascript/components/planner/ActivityDetailDrawer.jsx`
- Modify: `app/javascript/components/planner/__tests__/ActivityDetailDrawer.test.jsx`

- [ ] **Step 5.1: Append failing tests for location**

Add to the test file:

```jsx
describe('ActivityDetailDrawer – location', () => {
  test('renders address + coords when present', () => {
    renderDrawer()
    const loc = screen.getByTestId('detail-location')
    expect(loc).toHaveTextContent('新疆伊犁州赛里木湖风景区')
    expect(loc).toHaveTextContent(/44\.6/)
    expect(loc).toHaveTextContent(/81\.2/)
  })

  test('renders kind-specific detail fields (altitude, ticket_info for scenic)', () => {
    renderDrawer()
    const loc = screen.getByTestId('detail-location')
    expect(loc).toHaveTextContent('2073')  // altitude
    expect(loc).toHaveTextContent('70')    // ticket_info
  })

  test('renders mini-map when lat/lng present', () => {
    renderDrawer()
    const map = screen.getByTestId('mock-mini-map')
    expect(map).toHaveAttribute('data-lat', '44.6')
    expect(map).toHaveAttribute('data-lng', '81.2')
  })

  test('omits mini-map and shows "（未定位）" when lat/lng missing', () => {
    renderDrawer({ activity: makeActivity({ lat: null, lng: null }) })
    expect(screen.queryByTestId('mock-mini-map')).toBeNull()
    const loc = screen.getByTestId('detail-location')
    expect(loc).toHaveTextContent('（未定位）')
  })
})
```

- [ ] **Step 5.2: Run — expect 4 failures**

```
npm test -- --run app/javascript/components/planner/__tests__/ActivityDetailDrawer.test.jsx
```

- [ ] **Step 5.3: Implement location section**

At the top of `ActivityDetailDrawer.jsx`, add the import:

```jsx
import ActivityMiniMap from './ActivityMiniMap'
import { KIND_SCHEMA } from '../activity-editor/detailsSchema'
import { IconMapPin } from '@tabler/icons-react'
```

(Merge with existing imports — don't duplicate.)

Add the section function below `DetailHeaderSection`:

```jsx
function DetailLocationSection({ activity }) {
  const hasCoords = activity.lat != null && activity.lng != null
  const kindFields = KIND_SCHEMA[activity.kind] || []
  const detailEntries = kindFields
    .map((f) => {
      const raw = activity.details?.[f.key]
      if (raw == null || raw === '') return null
      const suffix = f.suffix ? `${f.suffix}` : ''
      return { key: f.key, label: f.label, text: `${raw}${suffix}` }
    })
    .filter(Boolean)

  return (
    <Stack gap={6} data-testid="detail-location">
      <Group gap="xs" wrap="nowrap" align="flex-start">
        <IconMapPin size={14} style={{ marginTop: 3, flexShrink: 0 }} />
        <Text size="sm">
          {activity.address || '（未定位）'}
          {hasCoords && (
            <Text component="span" size="xs" c="dimmed" ml="xs">
              {activity.lat.toFixed(4)}, {activity.lng.toFixed(4)}
            </Text>
          )}
        </Text>
      </Group>
      {detailEntries.length > 0 && (
        <Group gap="md" wrap="wrap">
          {detailEntries.map((e) => (
            <Text key={e.key} size="xs" c="dimmed">
              {e.label}: {e.text}
            </Text>
          ))}
        </Group>
      )}
      {hasCoords && <ActivityMiniMap lat={activity.lat} lng={activity.lng} height={160} />}
    </Stack>
  )
}
```

Plug it into the drawer body:

```jsx
      {activity && (
        <Stack gap="md">
          <DetailHeaderSection ... />
          <DetailLocationSection activity={activity} />
          {/* Sections plugged in by Tasks 6-8 */}
        </Stack>
      )}
```

**Verify KIND_SCHEMA field shape before finalizing**: open `app/javascript/components/activity-editor/detailsSchema.js` and confirm each field has `{ key, label, suffix? }`. If `suffix` is named differently (e.g., `unit`), adjust the `const suffix = f.suffix ? ...` line. Also confirm how fields are stored — `details[key]` is the right accessor per `activity.rb:63-81`.

- [ ] **Step 5.4: Run — expect all pass**

```
npm test -- --run app/javascript/components/planner/__tests__/ActivityDetailDrawer.test.jsx
```

- [ ] **Step 5.5: Commit**

```bash
git add app/javascript/components/planner/ActivityDetailDrawer.jsx \
        app/javascript/components/planner/__tests__/ActivityDetailDrawer.test.jsx
git commit -m "$(cat <<'EOF'
feat(detail): location section — address + coords + kind fields + mini-map

从 KIND_SCHEMA 按 activity.kind 渲染 detail 字段（altitude/ticket_info 等）；
有坐标时渲染 ActivityMiniMap（160px 高），无坐标时显示"（未定位）"。
mini-map 走 mock 在单测里，真实 SDK 走手动 E2E 验证。

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: Description section

**Files:**
- Modify: `app/javascript/components/planner/ActivityDetailDrawer.jsx`
- Modify: `app/javascript/components/planner/__tests__/ActivityDetailDrawer.test.jsx`

- [ ] **Step 6.1: Append failing tests**

```jsx
describe('ActivityDetailDrawer – description', () => {
  test('renders desc text when present', () => {
    renderDrawer()
    expect(screen.getByTestId('detail-desc')).toHaveTextContent('湖光山色，风景绝美。')
  })

  test('preserves newlines via white-space: pre-wrap', () => {
    renderDrawer({ activity: makeActivity({ desc: 'line1\nline2' }) })
    const el = screen.getByTestId('detail-desc')
    expect(el).toHaveStyle({ whiteSpace: 'pre-wrap' })
  })

  test('does not render section when desc is empty', () => {
    renderDrawer({ activity: makeActivity({ desc: '' }) })
    expect(screen.queryByTestId('detail-desc')).toBeNull()
  })

  test('does not render section when desc is null', () => {
    renderDrawer({ activity: makeActivity({ desc: null }) })
    expect(screen.queryByTestId('detail-desc')).toBeNull()
  })
})
```

- [ ] **Step 6.2: Run — expect 4 failures**

```
npm test -- --run app/javascript/components/planner/__tests__/ActivityDetailDrawer.test.jsx
```

- [ ] **Step 6.3: Implement**

Add (imports: `Divider` — add if not already):

```jsx
import { Divider } from '@mantine/core'  // merge with existing import
```

Add section function:

```jsx
function DetailDescSection({ activity }) {
  if (!activity.desc) return null
  return (
    <>
      <Divider />
      <Stack gap={6}>
        <Text size="xs" c="dimmed">介绍</Text>
        <Text size="sm" data-testid="detail-desc" style={{ whiteSpace: 'pre-wrap' }}>
          {activity.desc}
        </Text>
      </Stack>
    </>
  )
}
```

Plug into body:

```jsx
          <DetailHeaderSection ... />
          <DetailLocationSection activity={activity} />
          <DetailDescSection activity={activity} />
          {/* Sections plugged in by Tasks 7-8 */}
```

- [ ] **Step 6.4: Run — expect all pass**

```
npm test -- --run app/javascript/components/planner/__tests__/ActivityDetailDrawer.test.jsx
```

- [ ] **Step 6.5: Commit**

```bash
git add app/javascript/components/planner/ActivityDetailDrawer.jsx \
        app/javascript/components/planner/__tests__/ActivityDetailDrawer.test.jsx
git commit -m "$(cat <<'EOF'
feat(detail): description section

activity.desc 的只读展示，pre-wrap 保留换行。空值/null 整段不渲染（无占位噪音）。

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: Gallery section

**Files:**
- Modify: `app/javascript/components/planner/ActivityDetailDrawer.jsx`
- Modify: `app/javascript/components/planner/__tests__/ActivityDetailDrawer.test.jsx`

- [ ] **Step 7.1: Append failing tests**

Add to test file (include the lightbox mock at the top — near the ActivityMiniMap mock):

```jsx
vi.mock('../../activity-editor/ActivityGalleryLightbox', () => ({
  default: ({ images, initialIndex, onClose }) =>
    initialIndex != null
      ? <div data-testid="mock-lightbox" data-count={images.length} data-index={initialIndex} onClick={onClose} />
      : null,
}))
```

Then the describe block:

```jsx
describe('ActivityDetailDrawer – gallery', () => {
  const IMAGES = [
    { id: 1, activity_id: 10, url: '/storage/1.jpg', caption: null, position: 1 },
    { id: 2, activity_id: 10, url: '/storage/2.jpg', caption: null, position: 2 },
  ]

  test('renders thumbnails when images present', () => {
    renderDrawer({ activityImages: IMAGES })
    const thumbs = screen.getAllByTestId(/^detail-thumb-/)
    expect(thumbs).toHaveLength(2)
  })

  test('does not render section when images is empty', () => {
    renderDrawer({ activityImages: [] })
    expect(screen.queryByTestId(/^detail-thumb-/)).toBeNull()
  })

  test('clicking a thumbnail opens lightbox at that index', () => {
    renderDrawer({ activityImages: IMAGES })
    fireEvent.click(screen.getByTestId('detail-thumb-1'))
    const box = screen.getByTestId('mock-lightbox')
    expect(box).toHaveAttribute('data-count', '2')
    expect(box).toHaveAttribute('data-index', '1')
  })

  test('only images for this activity are shown (filter by activity_id)', () => {
    const mixed = [
      ...IMAGES,
      { id: 99, activity_id: 999, url: '/storage/other.jpg', caption: null, position: 1 },
    ]
    renderDrawer({ activityImages: mixed })
    expect(screen.getAllByTestId(/^detail-thumb-/)).toHaveLength(2)
  })
})
```

- [ ] **Step 7.2: Run — expect failures**

```
npm test -- --run app/javascript/components/planner/__tests__/ActivityDetailDrawer.test.jsx
```

- [ ] **Step 7.3: Implement**

Add imports:

```jsx
import { useState } from 'react'
import ActivityGalleryLightbox from '../activity-editor/ActivityGalleryLightbox'
```

Section function:

```jsx
function DetailGallerySection({ activity, activityImages }) {
  const images = (activityImages || []).filter((img) => img.activity_id === activity.id)
  const [ lightboxIndex, setLightboxIndex ] = useState(null)

  if (images.length === 0) return null

  return (
    <>
      <Divider />
      <Stack gap={6}>
        <Text size="xs" c="dimmed">图集 · {images.length}</Text>
        <Group gap="xs" wrap="nowrap" style={{ overflowX: 'auto' }}>
          {images.map((img, idx) => (
            <button
              key={img.id}
              type="button"
              data-testid={`detail-thumb-${idx}`}
              onClick={() => setLightboxIndex(idx)}
              style={{
                width: 80, height: 80, border: 0, padding: 0, cursor: 'pointer',
                backgroundImage: `url(${img.url})`, backgroundSize: 'cover', backgroundPosition: 'center',
                borderRadius: 4, flexShrink: 0,
              }}
              aria-label={`Image ${idx + 1}`}
            />
          ))}
        </Group>
      </Stack>
      <ActivityGalleryLightbox
        images={images}
        initialIndex={lightboxIndex}
        onClose={() => setLightboxIndex(null)}
      />
    </>
  )
}
```

Plug into body:

```jsx
          <DetailDescSection activity={activity} />
          <DetailGallerySection activity={activity} activityImages={activityImages} />
```

- [ ] **Step 7.4: Run — expect pass**

```
npm test -- --run app/javascript/components/planner/__tests__/ActivityDetailDrawer.test.jsx
```

- [ ] **Step 7.5: Commit**

```bash
git add app/javascript/components/planner/ActivityDetailDrawer.jsx \
        app/javascript/components/planner/__tests__/ActivityDetailDrawer.test.jsx
git commit -m "$(cat <<'EOF'
feat(detail): gallery section — thumbnails + lightbox

按 activity_id 过滤 activityImages，80×80 缩略图横排；点击开既有
ActivityGalleryLightbox。空列表整段不渲染。

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 8: Participants section — readonly roster

**Files:**
- Modify: `app/javascript/components/planner/ActivityDetailDrawer.jsx`
- Modify: `app/javascript/components/planner/__tests__/ActivityDetailDrawer.test.jsx`

- [ ] **Step 8.1: Append failing tests**

```jsx
describe('ActivityDetailDrawer – participants', () => {
  test('default-full (empty participant_user_ids) shows "默认全员 · N 人"', () => {
    renderDrawer()
    const sec = screen.getByTestId('detail-participants')
    expect(sec).toHaveTextContent('默认全员')
    expect(sec).toHaveTextContent('3 人')  // author + 2 members
    expect(sec).toHaveTextContent('Alice')
    expect(sec).toHaveTextContent('Bob')
    expect(sec).toHaveTextContent('Cindy')
  })

  test('explicit subset shows "参与人 · N 人" and lists only those users', () => {
    renderDrawer({ activity: makeActivity({ participant_user_ids: [ 2 ] }) })
    const sec = screen.getByTestId('detail-participants')
    expect(sec).toHaveTextContent('参与人')
    expect(sec).toHaveTextContent('1 人')
    expect(sec).toHaveTextContent('Bob')
    expect(sec).not.toHaveTextContent('Alice')
    expect(sec).not.toHaveTextContent('Cindy')
  })

  test('renders author with isAuthor flag in UserLabel', () => {
    renderDrawer({ activity: makeActivity({ participant_user_ids: [ 1 ] }) })
    const sec = screen.getByTestId('detail-participants')
    expect(sec).toHaveTextContent('作者')
  })
})
```

- [ ] **Step 8.2: Run — expect failures**

```
npm test -- --run app/javascript/components/planner/__tests__/ActivityDetailDrawer.test.jsx
```

- [ ] **Step 8.3: Implement**

Add imports:

```jsx
import UserLabel from './UserLabel'
import { effectiveParticipants, isFullRoster } from '../../lib/effectiveParticipants'
```

Section function:

```jsx
function DetailParticipantsSection({ activity, author, members }) {
  const ids = effectiveParticipants(activity, { author, members })
  const isDefault = isFullRoster(activity)
  const allUsers = [
    { ...author, isAuthor: true },
    ...members.map((m) => ({ ...m, isAuthor: false })),
  ]
  const displayed = ids
    .map((id) => allUsers.find((u) => u.user_id === id))
    .filter(Boolean)

  const title = isDefault ? '默认全员' : '参与人'

  return (
    <>
      <Divider />
      <Stack gap={6} data-testid="detail-participants">
        <Text size="xs" c="dimmed">{title} · {displayed.length} 人</Text>
        <Stack gap={4}>
          {displayed.map((u) => (
            <UserLabel key={u.user_id} user={u} isAuthor={u.isAuthor} size={22} fz="sm" />
          ))}
        </Stack>
      </Stack>
    </>
  )
}
```

Plug into body:

```jsx
          <DetailGallerySection activity={activity} activityImages={activityImages} />
          <DetailParticipantsSection activity={activity} author={author} members={members} />
```

- [ ] **Step 8.4: Run — expect pass**

```
npm test -- --run app/javascript/components/planner/__tests__/ActivityDetailDrawer.test.jsx
```

- [ ] **Step 8.5: Commit**

```bash
git add app/javascript/components/planner/ActivityDetailDrawer.jsx \
        app/javascript/components/planner/__tests__/ActivityDetailDrawer.test.jsx
git commit -m "$(cat <<'EOF'
feat(detail): participants section — readonly roster

默认全员 → 标题"默认全员 · N 人"；显式子集 → "参与人 · N 人"。
每行 UserLabel（头像 + 姓名 + 作者标签），只读无编辑入口。

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 9: Expenses section — list + summary + [+ 记一笔]

**Files:**
- Modify: `app/javascript/components/planner/ActivityDetailDrawer.jsx`
- Modify: `app/javascript/components/planner/__tests__/ActivityDetailDrawer.test.jsx`

- [ ] **Step 9.1: Append failing tests**

```jsx
describe('ActivityDetailDrawer – expenses', () => {
  const E1 = {
    id: 501, scope: 'activity', activity_id: 10,
    amount_cents: 12000, category: 'ticket',
    paid_by_id: 1, split_strategy: 'equal',
    splits: [ { user_id: 1, amount_cents: 4000 }, { user_id: 2, amount_cents: 4000 }, { user_id: 3, amount_cents: 4000 } ],
  }
  const E2 = {
    id: 502, scope: 'activity', activity_id: 10,
    amount_cents: 8000, category: 'food',
    paid_by_id: 2, split_strategy: 'individual',
    splits: [],
  }
  const OTHER = { id: 503, scope: 'day', activity_id: null, day_id: 1, amount_cents: 5000, category: 'fuel', paid_by_id: 1 }

  test('renders empty state when no activity-scope expenses', () => {
    renderDrawer({ expenses: [] })
    expect(screen.getByTestId('detail-expenses')).toHaveTextContent('还没有花销记录')
  })

  test('filters to activity-scope only and shows count + total', () => {
    renderDrawer({ expenses: [ E1, E2, OTHER ] })
    const sec = screen.getByTestId('detail-expenses')
    expect(sec).toHaveTextContent('2 笔')
    expect(sec).toHaveTextContent('¥200')  // 12000 + 8000 = 20000 cents = ¥200
  })

  test('does not count expenses from other activities', () => {
    const ForeignActivity = { ...E1, id: 999, activity_id: 999 }
    renderDrawer({ expenses: [ E1, ForeignActivity ] })
    expect(screen.getByTestId('detail-expenses')).toHaveTextContent('1 笔')
  })

  test('canEdit=true + non-backlog activity shows section [+ 记一笔] button (enabled)', () => {
    renderDrawer({ canEdit: true })
    const btns = screen.getAllByRole('button', { name: /记一笔/ })
    // Two [+ 记一笔] buttons expected: header + expenses section
    expect(btns).toHaveLength(2)
    expect(btns[1]).not.toBeDisabled()
  })

  test('canEdit=true + backlog activity shows section [+ 记一笔] button disabled', () => {
    renderDrawer({ canEdit: true, activity: makeActivity({ day_id: null }) })
    const btns = screen.getAllByRole('button', { name: /记一笔/ })
    // Header button is enabled (backlog gate is only the section/expense side);
    // section button is disabled with tooltip.
    // We'll assert the section button's disabled state specifically.
    const sectionBtn = screen.getByTestId('detail-expenses-add-btn')
    expect(sectionBtn).toBeDisabled()
  })

  test('canEdit=false hides section [+ 记一笔] button', () => {
    renderDrawer({ canEdit: false })
    expect(screen.queryByTestId('detail-expenses-add-btn')).toBeNull()
  })

  test('clicking section [+ 记一笔] calls onAddExpense', () => {
    const onAddExpense = vi.fn()
    renderDrawer({ onAddExpense })
    fireEvent.click(screen.getByTestId('detail-expenses-add-btn'))
    expect(onAddExpense).toHaveBeenCalledWith(10)
  })

  test('clicking an expense row calls onFocusExpense with its id', () => {
    const onFocusExpense = vi.fn()
    renderDrawer({ expenses: [ E1 ], onFocusExpense })
    fireEvent.click(screen.getByTestId('detail-expense-row-501'))
    expect(onFocusExpense).toHaveBeenCalledWith(501)
  })
})
```

- [ ] **Step 9.2: Run — expect failures**

```
npm test -- --run app/javascript/components/planner/__tests__/ActivityDetailDrawer.test.jsx
```

- [ ] **Step 9.3: Implement**

Imports:

```jsx
import { Button, Tooltip } from '@mantine/core'  // merge with existing
import { IconPlus } from '@tabler/icons-react'    // already imported in Task 4
```

Category labels helper (add near the top of the file, outside the component):

```jsx
const CATEGORY_LABELS = {
  food: '吃饭', fuel: '加油', lodging: '住宿', ticket: '门票', refund: '退款', misc: '其他',
}

function formatYuan(cents) {
  const yuan = Math.round(cents / 100)
  return `¥${yuan.toLocaleString('zh-CN')}`
}

function usersById(author, members) {
  const map = { [author.user_id]: author }
  for (const m of members) map[m.user_id] = m
  return map
}
```

Section function:

```jsx
function DetailExpensesSection({ activity, expenses, author, members, canEdit, onAddExpense, onFocusExpense }) {
  const mine = (expenses || []).filter((e) => e.scope === 'activity' && e.activity_id === activity.id)
  const total = mine.reduce((sum, e) => sum + (e.amount_cents || 0), 0)
  const users = usersById(author, members)
  const isBacklog = activity.day_id == null

  return (
    <>
      <Divider />
      <Stack gap="xs" data-testid="detail-expenses">
        <Group justify="space-between" wrap="nowrap">
          <Text size="xs" c="dimmed">
            {mine.length === 0
              ? '账单'
              : `账单 · 共 ${formatYuan(total)} · ${mine.length} 笔`}
          </Text>
        </Group>

        {mine.length === 0 ? (
          <Text size="sm" c="dimmed">还没有花销记录。</Text>
        ) : (
          <Stack gap={4}>
            {mine.map((e) => {
              const payer = users[e.paid_by_id]
              const payerName = payer?.name || `用户 ${e.paid_by_id}`
              const strategyText = e.split_strategy === 'individual'
                ? '个人'
                : `AA ${e.splits?.length || 0} 人分`
              return (
                <button
                  key={e.id}
                  type="button"
                  data-testid={`detail-expense-row-${e.id}`}
                  onClick={() => onFocusExpense(e.id)}
                  style={{
                    textAlign: 'left', border: 0, background: 'transparent',
                    padding: '6px 4px', cursor: 'pointer', borderBottom: '1px solid #f0f0f0',
                  }}
                >
                  <Text size="sm">
                    {formatYuan(e.amount_cents)}  {CATEGORY_LABELS[e.category] || e.category}  ·  {payerName} 付  ·  {strategyText}
                  </Text>
                </button>
              )
            })}
          </Stack>
        )}

        {canEdit && (
          isBacklog ? (
            <Tooltip label="候选池活动无法记账，请先排入某一天">
              <Button
                data-testid="detail-expenses-add-btn"
                fullWidth
                variant="filled"
                leftSection={<IconPlus size={14} />}
                disabled
              >
                记一笔
              </Button>
            </Tooltip>
          ) : (
            <Button
              data-testid="detail-expenses-add-btn"
              fullWidth
              variant="filled"
              leftSection={<IconPlus size={14} />}
              onClick={() => onAddExpense(activity.id)}
            >
              记一笔
            </Button>
          )
        )}
      </Stack>
    </>
  )
}
```

Plug into body:

```jsx
          <DetailParticipantsSection activity={activity} author={author} members={members} />
          <DetailExpensesSection
            activity={activity}
            expenses={expenses}
            author={author}
            members={members}
            canEdit={canEdit}
            onAddExpense={onAddExpense}
            onFocusExpense={onFocusExpense}
          />
```

- [ ] **Step 9.4: Run — expect pass**

```
npm test -- --run app/javascript/components/planner/__tests__/ActivityDetailDrawer.test.jsx
```

- [ ] **Step 9.5: Commit**

```bash
git add app/javascript/components/planner/ActivityDetailDrawer.jsx \
        app/javascript/components/planner/__tests__/ActivityDetailDrawer.test.jsx
git commit -m "$(cat <<'EOF'
feat(detail): expenses section — list + summary + [+ 记一笔]

按 scope=activity + activity_id 过滤 expenses；汇总 "共 ¥X · N 笔"；
每条一行（金额 / 类别 / 付款人 / 分账策略）点击走 onFocusExpense；
canEdit=true 显示底部"记一笔"按钮，backlog 活动 disabled + tooltip。

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 10: Remove `readOnly` gate in ActivityCard

Until Show.jsx is wired (Task 11), this change is "live but inert" — reader clicks fire `onClick`, but the parent hasn't yet re-routed to the detail drawer, so nothing visible happens. That's intentional: ship the gate removal as a focused commit, wire the drawer separately.

**Files:**
- Modify: `app/javascript/components/planner/ActivityCard.jsx:179-181`
- Modify: `app/javascript/components/planner/__tests__/ActivityCard.test.jsx`

- [ ] **Step 10.1: Update test expectations**

Open `app/javascript/components/planner/__tests__/ActivityCard.test.jsx` and search for tests referencing `readOnly` with click assertions. Find any test asserting that `readOnly=true` **prevents** onClick from being called and replace with the opposite assertion. If no such test exists, add one:

```jsx
test('readOnly=true does NOT gate onClick — reader can click to open detail', () => {
  const onClick = vi.fn()
  renderInDnd(
    <ActivityCard activity={baseActivity} readOnly={true} onClick={onClick} />
  )
  const card = screen.getByText('喀纳斯湖').closest('.ac-card')
  fireEvent.click(card)
  expect(onClick).toHaveBeenCalledWith(1)
})
```

- [ ] **Step 10.2: Run — expect this test to fail (current code gates on readOnly)**

```
npm test -- --run app/javascript/components/planner/__tests__/ActivityCard.test.jsx
```

- [ ] **Step 10.3: Remove the gate**

Open `app/javascript/components/planner/ActivityCard.jsx:179-181`. Change:

```jsx
const handleBodyClick = () => {
  if (!readOnly && onClick) onClick(activity.id)
}
```

to:

```jsx
const handleBodyClick = () => {
  if (onClick) onClick(activity.id)
}
```

- [ ] **Step 10.4: Run — expect all ActivityCard tests pass**

```
npm test -- --run app/javascript/components/planner/__tests__/ActivityCard.test.jsx
```

- [ ] **Step 10.5: Commit**

```bash
git add app/javascript/components/planner/ActivityCard.jsx \
        app/javascript/components/planner/__tests__/ActivityCard.test.jsx
git commit -m "$(cat <<'EOF'
fix(card): remove readOnly click gate — reader can open detail drawer

Before: handleBodyClick swallowed clicks when readOnly=true → reader couldn't
see activity details at all. Now: all roles' clicks fan out through onClick;
Tour/Show.jsx routes them into the new ActivityDetailDrawer (next task).
readOnly prop is still received (used for cursor styling / drag affordance),
just no longer gates the click handler.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 11: Wire Show.jsx — detailViewer state, handlers, drawer render

The integration task. After this, `npm run dev` + browser = feature visibly works.

**Files:**
- Modify: `app/javascript/pages/Tour/Show.jsx` (state, handlers, drawer render, re-route `onEditActivity` prop to detail)

- [ ] **Step 11.1: Read current Show.jsx critical regions**

Skim lines 114-130 (state block), 316-360 (drawer renders), and where `onEditActivity` is passed into child components (grep for `onEditActivity`). Anchor edit decisions on what you see. Key existing reference: `openEdit` at line ~127 currently takes an activityId and does `setEditor({ open: true, mode: 'edit', activityId, targetDayId: null })`. We will **rename** that internal callback's usage (the `onEditActivity` prop passed to DayPanel/BacklogList keeps its shape; what it calls changes).

- [ ] **Step 11.2: Add detailViewer state + handlers**

Near the existing `editor` state declaration (line ~117), add:

```jsx
const [detailViewer, setDetailViewer] = useState({ open: false, activityId: null })
const [initialExpenseActivityId, setInitialExpenseActivityId] = useState(null)
const [initialExpenseId, setInitialExpenseId] = useState(null)
```

Below the existing `openEdit` function, add these handlers:

```jsx
// New: cards now route here instead of directly to the edit drawer.
const openDetail = (activityId) => {
  setDetailViewer({ open: true, activityId })
}

const closeDetail = () => {
  setDetailViewer({ open: false, activityId: null })
}

// User clicked [编辑] inside the detail drawer → switch drawers.
const openEditFromDetail = (activityId) => {
  setDetailViewer({ open: false, activityId: null })
  setEditor({ open: true, mode: 'edit', activityId, targetDayId: null })
}

// User clicked [+ 记一笔] inside the detail drawer → stack AddExpenseDialog
// on top via ExpenseDrawer with a prefilled activity.
const openAddExpenseForActivity = (activityId) => {
  setInitialExpenseActivityId(activityId)
  setInitialExpenseId(null)
  setExpenseDrawerOpen(true)
}

// User clicked a specific expense row in detail → jump into ExpenseDrawer
// with that expense focused for editing.
const openExpenseById = (expenseId) => {
  setDetailViewer({ open: false, activityId: null })
  setInitialExpenseActivityId(null)
  setInitialExpenseId(expenseId)
  setExpenseDrawerOpen(true)
}
```

- [ ] **Step 11.3: Re-route `onEditActivity` prop**

Find every place passing `onEditActivity` as a prop in Show.jsx (typically DayPanel and BacklogList). Change the value from `openEdit` to `openDetail`:

Before:
```jsx
<DayPanel ... onEditActivity={openEdit} ... />
<BacklogList ... onEditActivity={openEdit} ... />
```

After:
```jsx
<DayPanel ... onEditActivity={openDetail} ... />
<BacklogList ... onEditActivity={openDetail} ... />
```

Note: the DOWNSTREAM prop name stays `onEditActivity` because DayPanel/BacklogList pass it to `ActivityCard.onClick` — renaming the outer prop would ripple through those intermediaries with no functional change. Keep the existing prop name; only the bound callback changes.

- [ ] **Step 11.4: Add `<ActivityDetailDrawer>` render below `<MembershipDrawer>`**

Find the `<MembershipDrawer>` render (line ~338-345). After its closing `/>`, add the import at the top of the file (merge with existing planner imports):

```jsx
import ActivityDetailDrawer from '../../components/planner/ActivityDetailDrawer'
```

Then render:

```jsx
<ActivityDetailDrawer
  opened={detailViewer.open}
  onClose={closeDetail}
  tour={tour}
  days={days}
  activity={detailViewer.activityId ? activities.find((a) => a.id === detailViewer.activityId) : null}
  activityImages={activity_images || []}
  author={author || { user_id: tour.author_id, name: '', email: '', avatar_url: null }}
  members={members || []}
  expenses={expenses || []}
  canEdit={canEdit}
  onEdit={openEditFromDetail}
  onAddExpense={openAddExpenseForActivity}
  onFocusExpense={openExpenseById}
/>
```

(The exact names of payload variables — `activity_images`, `expenses`, `members`, `author`, `canEdit` — may differ by a hair. Use whatever names Show.jsx already destructures from `usePage().props` or receives as page props.)

- [ ] **Step 11.5: Pass new props to existing `<ExpenseDrawer>`**

Find the `<ExpenseDrawer>` render (line ~347). Add two new props:

```jsx
<ExpenseDrawer
  opened={expenseDrawerOpen}
  onClose={() => {
    setExpenseDrawerOpen(false)
    setInitialExpenseActivityId(null)
    setInitialExpenseId(null)
  }}
  {...existingProps}
  initialActivityId={initialExpenseActivityId}
  initialExpenseId={initialExpenseId}
/>
```

(ExpenseDrawer accepting/forwarding `initialActivityId` and `initialExpenseId` is added in Task 12.)

- [ ] **Step 11.6: Run full JS suite — no regressions**

```
cd /Users/drewlee/work/personal/one-tour/.claude/worktrees/activity-detail-drawer
npm test
```

Expected: all tests pass. Show.jsx itself has no unit tests (it's integration-level); manual E2E at Task 13 is the real verification.

- [ ] **Step 11.7: Commit**

```bash
git add app/javascript/pages/Tour/Show.jsx
git commit -m "$(cat <<'EOF'
feat(show): wire ActivityDetailDrawer as unified card-click target

- New detailViewer state (open, activityId)
- Card onClick (via existing onEditActivity prop chain) now routes to openDetail
- New handlers for detail→edit, detail→add-expense, detail→focus-expense
- ExpenseDrawer gets initialActivityId / initialExpenseId props (consumed in Task 12)

Behavior change: editor previously clicked card → edit drawer. Now all roles
click card → detail drawer, with "编辑" as an in-drawer action. Per spec §1
unified-entry decision.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 12: ExpenseDrawer — accept `initialActivityId` + `initialExpenseId`

Forwards the two new props down to `AddExpenseDialog`. `initialExpenseId` opens the dialog in edit mode for that expense on drawer-open.

**Files:**
- Modify: `app/javascript/components/planner/ExpenseDrawer.jsx`

- [ ] **Step 12.1: Extend signature and initialization**

Open `ExpenseDrawer.jsx`. Change the signature (line ~40-42) to include the two new props:

```jsx
export default function ExpenseDrawer({
  opened, onClose, tour, days, activities, members, author,
  expenses, summary, budgets, settlements, canEdit,
  initialActivityId = null, initialExpenseId = null,
}) {
```

Near the existing `dialogOpen` + `editingExpenseId` state (line ~44-45), add a useEffect that reacts to `opened + initialExpenseId/initialActivityId`:

```jsx
// When the drawer opens with initial* hints from Tour/Show (e.g., from the
// ActivityDetailDrawer), immediately launch the AddExpenseDialog in the
// appropriate mode. Reset on close (handled by parent via state reset).
useEffect(() => {
  if (!opened) return
  if (initialExpenseId != null) {
    setEditingExpenseId(initialExpenseId)
    setDialogOpen(true)
  } else if (initialActivityId != null) {
    setEditingExpenseId(null)
    setDialogOpen(true)
  }
}, [opened, initialExpenseId, initialActivityId])
```

(Make sure `useEffect` is in the React imports — it likely is already.)

- [ ] **Step 12.2: Forward `initialActivityId` to `AddExpenseDialog`**

Find where `<AddExpenseDialog>` is rendered inside `ExpenseDrawer.jsx`. Add the prop:

```jsx
<AddExpenseDialog
  opened={dialogOpen}
  onClose={() => setDialogOpen(false)}
  tour={tour}
  days={days}
  activities={activities}
  members={members}
  author={author}
  expense={editingExpense}
  initialActivityId={initialActivityId}
/>
```

- [ ] **Step 12.3: Run full JS suite**

```
npm test
```

Expected: all tests pass. ExpenseDrawer has no unit test for this new path; the integration is covered by the ActivityDetailDrawer tests (Task 9) asserting `onAddExpense(activityId)` is called with the correct id, and manual E2E in Task 13.

- [ ] **Step 12.4: Commit**

```bash
git add app/javascript/components/planner/ExpenseDrawer.jsx
git commit -m "$(cat <<'EOF'
feat(expense): ExpenseDrawer accepts initialActivityId + initialExpenseId

Two new props let Tour/Show pre-open the drawer in the right dialog state:
- initialExpenseId → open AddExpenseDialog in edit mode for that expense
- initialActivityId → open AddExpenseDialog in create mode with activity preselected

Forwards initialActivityId to AddExpenseDialog (Task 1 gave the dialog the
prop). Used by the new ActivityDetailDrawer's "[+ 记一笔]" and "click expense
row to focus" flows.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 13: CI checks + manual E2E

Full verification. Seed the worktree's dev DB and drive the browser per the spec's E2E checklist.

- [ ] **Step 13.1: Run all CI checks**

```
cd /Users/drewlee/work/personal/one-tour/.claude/worktrees/activity-detail-drawer
mise exec -- bundle exec rspec
npm test
mise exec -- bundle exec rubocop app/ config/ spec/ lib/
mise exec -- bundle exec brakeman --no-pager
npm audit --audit-level=high
```

Expected: all green. `rspec` count should equal baseline (no backend changes); `npm test` count should be baseline + ~25 new cases from `ActivityDetailDrawer.test.jsx` + the 1 updated `ActivityCard.test.jsx` case.

- [ ] **Step 13.2: Start worktree dev server**

```
bin/worktree-dev up
```

Expected: output like `Creating DB one_tour_dev_activity_detail_drawer + loading schema…` and `Waiting for Rails on 91NN.. ✓`. Record the port (typically 9101 if no other worktree servers active; 9103+ otherwise).

- [ ] **Step 13.3: Seed test data**

```
cd /Users/drewlee/work/personal/one-tour/.claude/worktrees/activity-detail-drawer
DB_NAME=$(grep DB_NAME tmp/worktree-dev.state | cut -d= -f2)
DATABASE_URL=postgres://postgres:postgres@localhost/${DB_NAME} mise exec -- bundle exec rails runner '
Encoding.default_external = Encoding::UTF_8
author = User.create!(email: "author@e2e.test", name: "Alice")
bob    = User.create!(email: "bob@e2e.test",    name: "Bob")
cindy  = User.create!(email: "cindy@e2e.test",  name: "Cindy")
tour = Tour.create!(title: "Detail Drawer Test Trip", author: author)
tour.tour_memberships.create!(user: bob,   role: :editor)
tour.tour_memberships.create!(user: cindy, role: :reader)
day = tour.days.first
act_a = tour.activities.create!(name: "A default (all members)",  day: day, kind: :scenic, citizen_level: :tier_two,   position: 1, lat: 44.6, lng: 81.2, address: "赛里木湖", details: { altitude: 2073, ticket_info: 70 }, desc: "湖光山色，风景绝美。")
act_b = tour.activities.create!(name: "B only Bob",               day: day, kind: :food,   citizen_level: :tier_three, position: 2)
act_c = tour.activities.create!(name: "C Alice and Cindy",        day: day, kind: :scenic, citizen_level: :tier_three, position: 3)
backlog = tour.activities.create!(name: "Backlog activity",       day: nil, kind: :scenic, citizen_level: :tier_three, position: 1)
ActivityParticipant.create!(activity: act_b, user: bob)
ActivityParticipant.create!(activity: act_c, user: author)
ActivityParticipant.create!(activity: act_c, user: cindy)
puts "SEED_OK tour=#{tour.id}  A=#{act_a.id} B=#{act_b.id} C=#{act_c.id} backlog=#{backlog.id}"
puts "URL: http://localhost:$(grep RAILS_PORT tmp/worktree-dev.state | cut -d= -f2)/tours/#{tour.id}"
' 2>&1 | grep -E "(SEED_OK|URL)"
```

- [ ] **Step 13.4: Run the manual E2E checklist from the spec**

Open the URL printed in Step 13.3. Use `/auth/developer` to sign in as each role. Work through all 14 checkpoints from spec §5 "交付前手动 E2E":

1. Alice clicks A → detail drawer opens, 6 sections present, mini-map shows
2. Header has [+ 记一笔] + [编辑] + [X]
3. 账单 initially empty; click [+ 记一笔] → dialog with A preselected → save → back to detail, 账单 updated
4. Click the new expense row → ExpenseDrawer opens in edit mode for it
5. Click [编辑] → detail closes, edit drawer opens
6. Save in edit drawer → back to planner; re-click A → detail reflects updates
7. Click the backlog activity → detail opens; section-bottom [+ 记一笔] disabled with tooltip
8. Sign in as Cindy → click A → detail opens (was no-op before)
9. Header has only [X]
10. All 6 sections scrollable
11. 账单 list visible, no [+ 记一笔] buttons
12. In browser console: `fetch('/tours/1/expenses', { method: 'POST', headers: { 'X-CSRF-Token': document.querySelector('meta[name=csrf-token]').content, 'Content-Type': 'application/json' }, body: JSON.stringify({ expense: { scope: 'activity', activity_id: 1, amount_cents: 100, paid_by_id: 3, category: 'misc', split_strategy: 'individual' } }) }).then(r => console.log('status', r.status))` → `status 403`
13. Existing activity edit drawer (basics/gallery/route/participants tabs + save/cancel/delete/移回候选池) all still work
14. Existing ExpenseDrawer top "记一笔" button still works (independent entry point)

Take screenshots of the key states (empty detail drawer as reader; detail with avatars + expenses; backlog tooltip) and save as `e2e-detail-1.png` through `e2e-detail-6.png` in the worktree root for PR evidence. **Delete them before committing** — they're artifacts, not source.

- [ ] **Step 13.5: Stop dev server (optional)**

If you're done testing:

```
bin/worktree-dev down
```

- [ ] **Step 13.6: Push branch + open PR**

```
git push -u origin feat/activity-detail-drawer
gh pr create --title "feat(planner): activity detail drawer — unified click target + 记一笔 shortcut" --body "$(cat <<'EOF'
## Summary

- 新 **ActivityDetailDrawer**：所有角色（author / editor / reader）点击活动卡片的统一入口
- reader 原本点卡片无反应，现在能看完整详情（6 段：头部 / 地点+小地图 / 介绍 / 图集 / 参与人 / 账单）
- editor/author 在详情里看到 **[+ 记一笔]**（两处：header + 账单段落）和 **[编辑]** 按钮；记一笔预填活动，编辑跳到既有 ActivityDrawer
- 点详情里某条账单 → 跳 ExpenseDrawer 编辑那条
- backlog 活动的账单段落 [+ 记一笔] 自动 disabled + tooltip（后端 `activity_not_backlog` 兜底）
- 后端零改动：全部基于 Tour/Show 既有 payload

## Spec & Plan

- Spec: [docs/superpowers/specs/2026-04-21-activity-detail-drawer-design.md](docs/superpowers/specs/2026-04-21-activity-detail-drawer-design.md)
- Plan: [docs/superpowers/plans/2026-04-21-activity-detail-drawer.md](docs/superpowers/plans/2026-04-21-activity-detail-drawer.md)

## Test Plan

- [x] `mise exec -- bundle exec rspec` — baseline (no backend changes)
- [x] `npm test` — baseline + new ActivityDetailDrawer.test.jsx cases
- [x] `mise exec -- bundle exec rubocop app/ config/ spec/ lib/` — clean
- [x] `mise exec -- bundle exec brakeman --no-pager` — 0 new warnings
- [x] `npm audit --audit-level=high` — 0 new vulns
- [x] Manual E2E 14 条（Alice / Bob / Cindy 三角色 · backlog 活动 · 账单跳转 · 权限矩阵）
- [ ] 部署后在 staging/prod 抽查：reader 点卡片、editor 记一笔、编辑按钮路径

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

---

## Done criteria

- [ ] All 12 implementation tasks checked
- [ ] `mise exec -- bundle exec rspec` green (baseline count)
- [ ] `npm test` green (baseline + ~25 new cases)
- [ ] `mise exec -- bundle exec rubocop app/ config/ spec/ lib/` no offenses
- [ ] `mise exec -- bundle exec brakeman --no-pager` no new warnings
- [ ] `npm audit --audit-level=high` no new vulns
- [ ] Manual E2E 14 条全部通过，截图留存
- [ ] PR opened against `main`
