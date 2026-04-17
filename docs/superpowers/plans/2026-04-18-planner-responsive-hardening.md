# Planner Responsive Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make a 5-day tour fit the 1280×800 planner viewport without horizontal scroll by (A) making the `BacklogList` column collapsible (mirroring `ChatPanel`) and (C) dropping `DayColumn.minWidth` from 170 to 120, with a CSS scroll-shadow affordance on the day strip for when the content does overflow (6+ days).

**Architecture:** Three files touched, each with a single-responsibility change. `Show.jsx` owns the new `backlogOpen` state and adjusts the outer grid template plus the day-strip container's background. `BacklogList.jsx` grows an `open` / `onToggle` prop pair and a folded rendering path that mirrors `ChatPanel`. `DayColumn.jsx` changes one style block (minWidth + explicit flexShrink). No new dependencies, no <1280 work.

**Tech Stack:** React 18, `@mantine/core` v9, `@dnd-kit/core` (unchanged), Vitest + React Testing Library.

**Reference spec:** [docs/superpowers/specs/2026-04-18-planner-responsive-hardening-design.md](docs/superpowers/specs/2026-04-18-planner-responsive-hardening-design.md)

---

## File Structure

| File | Action | Responsibility |
|---|---|---|
| [app/javascript/components/planner/BacklogList.jsx](app/javascript/components/planner/BacklogList.jsx) | Modify | Accept `open` / `onToggle`, render a folded vertical strip when `open=false`; move the title into a header row with a "收起 ◂" button when open |
| [app/javascript/pages/Tour/Show.jsx](app/javascript/pages/Tour/Show.jsx) | Modify | Add `backlogOpen` state; adjust `gridTemplateColumns`; pass props to `BacklogList`; add scroll-shadow to the day strip container |
| [app/javascript/components/planner/DayColumn.jsx](app/javascript/components/planner/DayColumn.jsx) | Modify | Change `minWidth: 170` → `minWidth: 120`, add `flexShrink: 0` |
| [app/javascript/components/planner/__tests__/BacklogList.test.jsx](app/javascript/components/planner/__tests__/BacklogList.test.jsx) | Modify | Add two tests: folded state renders the "展开候选池" trigger; clicking it calls `onToggle` |

---

## Task 1: Extend `BacklogList` with folded state (TDD)

**Files:**
- Modify: `app/javascript/components/planner/__tests__/BacklogList.test.jsx`
- Modify: `app/javascript/components/planner/BacklogList.jsx`

- [ ] **Step 1: Append the two new failing tests**

Open `app/javascript/components/planner/__tests__/BacklogList.test.jsx` and append at the bottom of the file (after the last existing test):

```jsx
test('when open=false, renders a collapsed trigger instead of filters/list', () => {
  const onToggle = vi.fn()
  render(
    <MantineProvider>
      <DndContext>
        <BacklogList
          activities={fixtures}
          open={false}
          onToggle={onToggle}
        />
      </DndContext>
    </MantineProvider>
  )
  // Folded label is present
  expect(screen.getByText(/展开候选池/)).toBeInTheDocument()
  // Fixtures are NOT rendered
  expect(screen.queryByText('赛里木湖')).not.toBeInTheDocument()
  expect(screen.queryByText('独库公路')).not.toBeInTheDocument()
})

test('clicking the collapsed trigger calls onToggle', () => {
  const onToggle = vi.fn()
  render(
    <MantineProvider>
      <DndContext>
        <BacklogList
          activities={fixtures}
          open={false}
          onToggle={onToggle}
        />
      </DndContext>
    </MantineProvider>
  )
  fireEvent.click(screen.getByText(/展开候选池/))
  expect(onToggle).toHaveBeenCalledTimes(1)
})

test('when open=true (default), renders a 收起 button that calls onToggle', () => {
  const onToggle = vi.fn()
  render(
    <MantineProvider>
      <DndContext>
        <BacklogList
          activities={fixtures}
          open={true}
          onToggle={onToggle}
        />
      </DndContext>
    </MantineProvider>
  )
  fireEvent.click(screen.getByRole('button', { name: /收起/ }))
  expect(onToggle).toHaveBeenCalledTimes(1)
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run app/javascript/components/planner/__tests__/BacklogList.test.jsx`

Expected: the three new tests FAIL (the others still pass). The failures will be about missing `展开候选池` text / missing `收起` button / etc.

- [ ] **Step 3: Update `BacklogList.jsx` to support folded + open states**

Replace the entire file contents of `app/javascript/components/planner/BacklogList.jsx` with:

```jsx
import { useState, useMemo } from 'react'
import { Paper, Title, Stack, Text, Button, Group, Select } from '@mantine/core'
import { useDroppable } from '@dnd-kit/core'
import ActivityCard from './ActivityCard'

const KIND_FILTER_OPTIONS = [
  { value: '',       label: '所有类型' },
  { value: 'scenic', label: '景' },
  { value: 'road',   label: '路' },
  { value: 'food',   label: '食' },
  { value: 'stay',   label: '住' },
  { value: 'fuel',   label: '油' },
  { value: 'other',  label: '其他' },
]

const LEVEL_FILTER_OPTIONS = [
  { value: '',               label: '所有等级' },
  { value: 'tier_one',       label: '一等' },
  { value: 'tier_two',       label: '二等' },
  { value: 'tier_three',     label: '三等' },
  { value: 'infrastructure', label: '基础' },
]

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
  // Hooks must run unconditionally every render (Rules of Hooks). The folded
  // branch below is an early return AFTER all hooks have been called.
  const [kindFilter, setKindFilter] = useState('')
  const [levelFilter, setLevelFilter] = useState('')

  const filtered = useMemo(() => {
    return activities.filter(a => {
      if (kindFilter && a.kind !== kindFilter) return false
      if (levelFilter && a.citizen_level !== levelFilter) return false
      return true
    })
  }, [activities, kindFilter, levelFilter])

  // Droppable uses full activities.length so dropped items are appended to
  // the true end (not after the filtered subset).
  const { setNodeRef, isOver } = useDroppable({
    id: 'backlog',
    data: { dayId: null, position: activities.length + 1 }
  })

  // Folded rendering: mirror ChatPanel's collapsed vertical strip.
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

  const isEmpty = activities.length === 0
  const hasFilter = kindFilter || levelFilter

  // Three exclusive modes:
  //  - isEmpty + !readOnly → dashed three-CTA frame (onboarding path)
  //  - isEmpty + readOnly → plain "尚无候选" text
  //  - !isEmpty → normal behavior (filters + top "+ 加一个" + cards)

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
          <Text size="xs" c="dimmed">尚无候选</Text>
        )}

        {isEmpty && !readOnly && (
          <Stack
            gap="xs"
            p="md"
            align="stretch"
            style={{ border: '2px dashed #ccc', borderRadius: 4, background: '#fafafa' }}
          >
            <Text size="xs" c="dimmed" ta="center">
              先把想去的点塞进这里，再拖到右侧日。
            </Text>
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
            {onFocusChat && (
              <Button size="xs" variant="subtle" onClick={onFocusChat}>
                ▸ 跳到对话输入框
              </Button>
            )}
          </Stack>
        )}

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

            {!readOnly && onAddActivity && (
              <Button size="compact-xs" variant="light" fullWidth mb="xs" onClick={() => onAddActivity(null)}>
                + 加一个
              </Button>
            )}

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
}
```

Notes on the diff beyond the obvious:
- Title moved from inline `mb="xs"` into a header `Group`, matching `ChatPanel`'s pattern.
- `Paper p="sm"` is replaced by an inner `<div style={{ padding: 12 }}>` so the header row can sit flush against the paper border without affecting body padding.
- `onToggle` is optional (`if (onToggle)`) so existing callers without the prop still render.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run app/javascript/components/planner/__tests__/BacklogList.test.jsx`

Expected: PASS — all new and pre-existing tests green.

- [ ] **Step 5: Commit**

```bash
git add app/javascript/components/planner/BacklogList.jsx app/javascript/components/planner/__tests__/BacklogList.test.jsx
git commit -m "$(cat <<'EOF'
feat(planner): add collapsible state to BacklogList

Mirrors ChatPanel's open/onToggle pattern so the outer grid in Show.jsx
can collapse the candidate pool to a 36px vertical strip, reclaiming
horizontal space for the day cards. Pure component change — Show.jsx
is still passing the old prop set on main, so onToggle is optional and
defaults to open=true.
EOF
)"
```

---

## Task 2: Shrink `DayColumn.minWidth` and lock `flexShrink` (#C)

**Files:**
- Modify: `app/javascript/components/planner/DayColumn.jsx:37`

- [ ] **Step 1: Apply the edit**

Current line 37 of `app/javascript/components/planner/DayColumn.jsx`:

```jsx
    <Paper withBorder style={{ minWidth: 170, display: 'flex', flexDirection: 'column' }}>
```

Change to:

```jsx
    <Paper withBorder style={{ minWidth: 120, flexShrink: 0, display: 'flex', flexDirection: 'column' }}>
```

- [ ] **Step 2: Run the DayColumn test suite**

Run: `npx vitest run app/javascript/components/planner/__tests__/DayColumn.test.jsx`

Expected: PASS. The existing tests don't assert on minWidth, so they stay green.

- [ ] **Step 3: Commit**

```bash
git add app/javascript/components/planner/DayColumn.jsx
git commit -m "$(cat <<'EOF'
fix(planner): shrink DayColumn minWidth 170 → 120 (#2)

At 1280×800 with both side panels open the middle column gets 660px —
5 × 170 + gap = 882px didn't fit and D5 was clipped behind the day
strip's overflow-x. At 120, 5 × 120 + gap = 632px fits comfortably.
flexShrink: 0 is explicit now (previously implicit) so the strip can't
squeeze individual cards below minWidth when the container is exactly
at the budget.
EOF
)"
```

---

## Task 3: Wire `backlogOpen` in `Show.jsx` and add scroll-shadow (#A)

**Files:**
- Modify: `app/javascript/pages/Tour/Show.jsx`

- [ ] **Step 1: Add the `backlogOpen` state**

Near the top of the component where other `useState` calls live (around line 25, next to `const [chatOpen, setChatOpen] = useState(true)`), add:

```jsx
  const [backlogOpen, setBacklogOpen] = useState(true)
```

- [ ] **Step 2: Update the grid template + `BacklogList` props + day strip background**

Locate the block starting at line 145 (the outer grid div that contains `BacklogList`, the middle column, and `ChatPanel`). Replace that whole block — lines 145 through the closing `</div>` at line 180 — with the following:

```jsx
        <div style={{
          display: 'grid',
          gridTemplateColumns: `${backlogOpen ? 260 : 36}px 1fr ${chatOpen ? 320 : 36}px`,
          gap: 10,
          padding: 10,
        }}>
          <BacklogList
            activities={backlog}
            onAddActivity={canEdit ? openCreate : undefined}
            onEditActivity={canEdit ? openEdit : undefined}
            onAskAI={canEdit ? () => setPendingChatPrompt(ASK_AI_BACKLOG_PROMPT) : undefined}
            onFocusChat={canEdit ? () => setChatOpen(true) : undefined}
            readOnly={!canEdit}
            open={backlogOpen}
            onToggle={() => setBacklogOpen(v => !v)}
          />
          <div style={{ display: 'grid', gridTemplateRows: 'auto 1fr', gap: 10 }}>
            <PlannerMap activities={activities} days={days} />
            <div style={{
              display: 'flex',
              gap: 8,
              overflowX: 'auto',
              alignItems: 'stretch',
              // Scroll-shadow trick (Roma Komarov): two white "covers" scroll
              // with the content (background-attachment: local), two shadows
              // stay fixed. When content doesn't overflow, the covers sit on
              // top of the shadows and hide them.
              background: `
                linear-gradient(to right, white, white),
                linear-gradient(to left, white, white),
                linear-gradient(to right, rgba(0,0,0,0.1), rgba(0,0,0,0)),
                linear-gradient(to left, rgba(0,0,0,0.1), rgba(0,0,0,0))
              `,
              backgroundPosition: 'left center, right center, left center, right center',
              backgroundSize: '20px 100%, 20px 100%, 10px 100%, 10px 100%',
              backgroundRepeat: 'no-repeat',
              backgroundAttachment: 'local, local, scroll, scroll',
            }}>
              {days.map(d => (
                <DayColumn
                  key={d.id}
                  day={d}
                  activities={byDay[d.id] || []}
                  constitution={tour.constitution}
                  onAddActivity={canEdit ? openCreate : undefined}
                  onEditActivity={canEdit ? openEdit : undefined}
                  onEditDay={canEdit ? setEditingDayId : undefined}
                  readOnly={!canEdit}
                  dragWarning={dragWarning?.dayId === d.id ? dragWarning : null}
                />
              ))}
              <AddDayButton tour={tour} nextDayIndex={nextDayIndex} empty={days.length === 0} />
            </div>
          </div>
          <ChatPanel
            tour={tour}
            open={chatOpen}
            onToggle={() => setChatOpen(!chatOpen)}
            pendingPrompt={pendingChatPrompt}
            onPromptConsumed={() => setPendingChatPrompt(null)}
          />
        </div>
```

- [ ] **Step 3: Run the full JS suite**

Run: `npm test`

Expected: PASS — no existing tests regress.

- [ ] **Step 4: Commit**

```bash
git add app/javascript/pages/Tour/Show.jsx
git commit -m "$(cat <<'EOF'
feat(planner): collapsible backlog + day-strip scroll-shadow (#2)

Adds backlogOpen state mirroring chatOpen; the outer grid now contracts
the candidate pool to 36px when collapsed, giving the day cards an
extra 224px at typical 1280×800 laptops. The day-strip container grows
a pure-CSS scroll-shadow so 6+ day tours that still overflow get a
visual hint that there's more content off-screen.
EOF
)"
```

---

## Task 4: Verify at 1280×800 with chrome-devtools-mcp

- [ ] **Step 1: Ensure dev server is running**

The worktree dev server should already be up from brainstorming/verification (`bin/worktree-dev up` → port 9101). If not, start it.

- [ ] **Step 2: Open the planner at 1280×800 with a 5-day tour**

Use `chrome-devtools-mcp` tools:

```
new_page(url: "http://127.0.0.1:9101/auth/developer")
fill_form({ ... }) → sign in
navigate_page(url: "http://127.0.0.1:9101/tours/1")  // or whichever existing 5-day tour
click the 规划 tab
resize_page(width: 1280, height: 800)
```

- [ ] **Step 3: Assert D1–D5 visible and no body overflow**

Run `evaluate_script`:

```js
() => {
  const body = document.body
  const dCards = Array.from(document.querySelectorAll('[data-testid="day-header"]'))
  const visibility = dCards.map(el => {
    const r = el.getBoundingClientRect()
    return { text: el.textContent.trim().slice(0, 10), left: Math.round(r.left), right: Math.round(r.right) }
  })
  return {
    bodyOverflow: body.scrollWidth > body.clientWidth,
    dayCount: dCards.length,
    allVisible: dCards.every(el => {
      const r = el.getBoundingClientRect()
      // Each day header's right edge must be <= viewport width AND > 0
      return r.right <= window.innerWidth && r.right > 0
    }),
    visibility,
  }
}
```

Expected:
- `bodyOverflow: false`
- `dayCount: 5`
- `allVisible: true`
- All 5 rects have `left` within `[0, 1280]` and `right` within `[0, 1280]`

- [ ] **Step 4: Test the backlog collapse**

```
take_snapshot() → find the 收起 ◂ button in the backlog header
click that button
take_snapshot() → confirm "展开候选池 ▸" vertical label is now present
click that label
take_snapshot() → confirm the header "收起 ◂" button is back
```

- [ ] **Step 5: (Optional) Test scroll-shadow on 7+ days**

If a 7-day tour exists, navigate to it at 1280×800 and take a screenshot. Expected: right edge of the day strip shows a subtle shadow; after scrolling to the right end, left edge shows a shadow instead.

If no 7-day tour exists, skip this step — the CSS is load-bearing only at >5 days and the non-overflow case is verified in Step 3.

- [ ] **Step 6: Commit the verification report (if any artifacts)**

No new files to commit unless the screenshots were saved under `tmp/` or `docs/`. If the verification touched no tracked files, skip this step.

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

Expected:
- RSpec: unchanged (no Ruby touched)
- Vitest: the 3 new BacklogList tests pass; existing tests unchanged
- Rubocop/Brakeman: unchanged
- `npm audit`: unchanged

If everything green, the plan is done.

---

## Self-Review

Coverage against [the spec](docs/superpowers/specs/2026-04-18-planner-responsive-hardening-design.md):

- **A: collapsible BacklogList mirroring ChatPanel** → Task 1 (component) + Task 3 (wiring)
- **C: DayColumn minWidth 170 → 120 + flexShrink: 0** → Task 2
- **Scroll-shadow on day strip** → Task 3 Step 2 (background styles)
- **1280×800 5-day acceptance check** → Task 4
- **CI parity** → Task 5

No placeholders, no "TODO", no "similar to...". Component prop names consistent: `open`, `onToggle` match `ChatPanel`'s prop names. `backlogOpen` state symmetric with `chatOpen`. Grid template literal types match on every mention.

Out-of-scope reminder (per spec "非目标"): <1280 responsive behavior, backlog state persistence, BacklogList folded badge for pending items. Do not drift into these during implementation.
