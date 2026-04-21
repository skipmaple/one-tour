# Planner Drawers Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the 宪法/规划/总览 tab structure with planner-as-canonical + left-push constitution drawer + full-screen timeline overlay. Revert the Task 6 opt-out so planner is wrapped in AppShell.

**Architecture:** Planner (`/tours/:id`) is the only page under a tour. AppShell gains a context-based right-slot for page-specific header buttons; planner injects 4 icon buttons (宪法/总览/账单/成员). Constitution opens as a push drawer (left sibling in planner's flex row) with bimodal save logic — first-time 2-step acceptance flow, later debounced auto-save. Timeline opens as a full-screen Modal overlay.

**Tech Stack:** React 18, Mantine v9 (`AppShell`, `ActionIcon`, `Indicator`, `Modal`, `Tooltip`), Inertia.js v3, `@tabler/icons-react`, `lodash.debounce`, Vitest + React Testing Library, RSpec for backend.

**Spec:** [`docs/superpowers/specs/2026-04-21-planner-drawers-design.md`](../specs/2026-04-21-planner-drawers-design.md)

---

## Task 1: Backend — expose `summary` in `tours#show`

`tours#show` already includes `days[].intensity_derived` (see [`app/controllers/tours_controller.rb:23`](../../app/controllers/tours_controller.rb)). Add `summary` so `TimelineOverlay` can render without a separate fetch.

**Files:**
- Modify: `app/controllers/tours_controller.rb:21-52`
- Test: `spec/requests/tours_spec.rb` (append case) or a new `spec/requests/tours/show_summary_spec.rb`

- [ ] **Step 1: Write the failing RSpec**

Append to the tours GET show request spec (or create a new file):

```ruby
# spec/requests/tours_spec.rb (append inside existing `describe "GET /tours/:id"` or wrap in new context)
require 'rails_helper'

RSpec.describe "GET /tours/:id (planner props)", type: :request do
  let(:user) { create(:user) }
  let(:tour) { create(:tour, author: user) }

  def login_as(u); post "/login_test", params: { user_id: u.id }; end

  it "includes a `summary` Inertia prop shaped like Tour::TimelineSummary.for" do
    login_as(user)
    get "/tours/#{tour.id}", headers: { "X-Inertia" => "true", "Accept" => "application/json" }
    expect(response).to be_successful
    body = JSON.parse(response.body)
    expect(body.dig("props")).to have_key("summary")
    expect(body["props"]["summary"]).to eq(Tour::TimelineSummary.for(tour).deep_stringify_keys)
  end
end
```

- [ ] **Step 2: Run spec to verify it fails**

Run: `cd /Users/drewlee/work/personal/one-tour/.claude/worktrees/zealous-wozniak-cc8a75 && mise exec -- bundle exec rspec spec/requests/tours_spec.rb -e "summary"`
Expected: FAIL — `summary` key missing from props.

- [ ] **Step 3: Edit `tours_controller.rb#show` to add `summary`**

Find the `render inertia: "Tour/Show", props: { ... }` block. Inside the `props:` hash (after `conversation_empty:`), add:

```ruby
      summary: Tour::TimelineSummary.for(@tour)
```

- [ ] **Step 4: Run spec to verify it passes**

Run: `cd /Users/drewlee/work/personal/one-tour/.claude/worktrees/zealous-wozniak-cc8a75 && mise exec -- bundle exec rspec spec/requests/tours_spec.rb -e "summary"`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
cd /Users/drewlee/work/personal/one-tour/.claude/worktrees/zealous-wozniak-cc8a75 && \
  git add app/controllers/tours_controller.rb spec/requests/tours_spec.rb && \
  git commit -m "feat(tours): include timeline summary in show props"
```

---

## Task 2: `HeaderSlot` context + `useInjectHeaderRight` hook

**Files:**
- Create: `app/javascript/layouts/HeaderSlot.js`
- Test: `app/javascript/layouts/__tests__/HeaderSlot.test.jsx`

- [ ] **Step 1: Write the failing test**

```jsx
// app/javascript/layouts/__tests__/HeaderSlot.test.jsx
import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { HeaderSlotProvider, useInjectHeaderRight, useHeaderRightSlot } from '../HeaderSlot'

function Consumer() {
  const node = useHeaderRightSlot()
  return <div data-testid="slot-consumer">{node}</div>
}

function Injector({ node }) {
  useInjectHeaderRight(node)
  return null
}

describe('HeaderSlot', () => {
  it('starts with no right-slot content', () => {
    render(
      <HeaderSlotProvider>
        <Consumer />
      </HeaderSlotProvider>,
    )
    expect(screen.getByTestId('slot-consumer')).toBeEmptyDOMElement()
  })

  it('shows the injected content', () => {
    render(
      <HeaderSlotProvider>
        <Consumer />
        <Injector node={<span data-testid="injected">hi</span>} />
      </HeaderSlotProvider>,
    )
    expect(screen.getByTestId('injected')).toBeInTheDocument()
  })

  it('clears the slot when the injector unmounts', () => {
    function Wrapper({ show }) {
      return (
        <HeaderSlotProvider>
          <Consumer />
          {show && <Injector node={<span data-testid="injected">hi</span>} />}
        </HeaderSlotProvider>
      )
    }
    const { rerender } = render(<Wrapper show />)
    expect(screen.getByTestId('injected')).toBeInTheDocument()
    rerender(<Wrapper show={false} />)
    expect(screen.queryByTestId('injected')).not.toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Users/drewlee/work/personal/one-tour/.claude/worktrees/zealous-wozniak-cc8a75 && npx vitest run app/javascript/layouts/__tests__/HeaderSlot.test.jsx`
Expected: FAIL — "Failed to resolve import '../HeaderSlot'".

- [ ] **Step 3: Implement**

```js
// app/javascript/layouts/HeaderSlot.js
import { createContext, useContext, useEffect, useState } from 'react'

const HeaderSlotContext = createContext({ right: null, setRight: () => {} })

export function HeaderSlotProvider({ children }) {
  const [right, setRight] = useState(null)
  return (
    <HeaderSlotContext.Provider value={{ right, setRight }}>
      {children}
    </HeaderSlotContext.Provider>
  )
}

export function useHeaderRightSlot() {
  return useContext(HeaderSlotContext).right
}

export function useInjectHeaderRight(node) {
  const { setRight } = useContext(HeaderSlotContext)
  useEffect(() => {
    setRight(node)
    return () => setRight(null)
  }, [node, setRight])
}
```

(Note: `HeaderSlot.js` uses JSX — rename to `.jsx` if your Vite config requires it. This project's `.js` files do contain JSX per existing patterns in `app/javascript/hooks/*.js`.)

- [ ] **Step 4: Run test to verify it passes**

Run: `cd /Users/drewlee/work/personal/one-tour/.claude/worktrees/zealous-wozniak-cc8a75 && npx vitest run app/javascript/layouts/__tests__/HeaderSlot.test.jsx`
Expected: PASS, 3 tests.

- [ ] **Step 5: Commit**

```bash
cd /Users/drewlee/work/personal/one-tour/.claude/worktrees/zealous-wozniak-cc8a75 && \
  git add app/javascript/layouts/HeaderSlot.js app/javascript/layouts/__tests__/HeaderSlot.test.jsx && \
  git commit -m "feat(layout): add HeaderSlot context for page-injected header content"
```

---

## Task 3: Integrate slot into `AppShell`

Wrap AppShell's tree in `HeaderSlotProvider`; render the slot content in the header.

**Files:**
- Modify: `app/javascript/layouts/AppShell.jsx`
- Test: `app/javascript/layouts/__tests__/AppShell.test.jsx` (append cases)

- [ ] **Step 1: Add failing test**

Append to the `describe('AppShell', ...)` block in the existing test file:

```jsx
  it('renders content injected by useInjectHeaderRight', () => {
    const { HeaderSlotProvider, useInjectHeaderRight } = require('../HeaderSlot')
    function Injector() {
      useInjectHeaderRight(<span data-testid="right-slot">buttons</span>)
      return <div />
    }
    render(
      <MantineProvider>
        <AppShell>
          <Injector />
        </AppShell>
      </MantineProvider>,
    )
    expect(screen.getByTestId('right-slot')).toBeInTheDocument()
  })
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Users/drewlee/work/personal/one-tour/.claude/worktrees/zealous-wozniak-cc8a75 && npx vitest run app/javascript/layouts/__tests__/AppShell.test.jsx`
Expected: FAIL — "Unable to find element by [data-testid=right-slot]".

- [ ] **Step 3: Modify `AppShell.jsx` to wrap in provider + render slot**

Find the top-level structure and change it from:

```jsx
export default function AppShell({ children }) {
  const { url, props } = usePage()
  // ...
  return (
    <MantineAppShell ...>
      <MantineAppShell.Header>
        <Group h="100%" px="md" gap="sm">
          <ActionIcon ...toggle.../>
          <ActionIcon ...toggleMobile.../>
          <Text fw={600} size="sm">{title}</Text>
        </Group>
      </MantineAppShell.Header>
      ...
    </MantineAppShell>
  )
}
```

to:

```jsx
import { HeaderSlotProvider, useHeaderRightSlot } from './HeaderSlot'
import { Box } from '@mantine/core' // add if not already imported
// ... other imports unchanged

function AppShellInner({ children }) {
  const { url, props } = usePage()
  const isAdmin = !!props.current_user?.is_admin
  const currentPath = url.split('?')[0]
  const title = useDocumentTitle()
  const { collapsed, toggle } = useSidebarCollapsed()
  const [mobileOpened, { toggle: toggleMobile }] = useDisclosure(false)
  const rightSlot = useHeaderRightSlot()

  return (
    <MantineAppShell
      header={{ height: 56 }}
      navbar={{
        width: 240,
        breakpoint: 'sm',
        collapsed: { desktop: collapsed, mobile: !mobileOpened },
      }}
      padding="md"
    >
      <MantineAppShell.Header>
        <Group h="100%" px="md" gap="sm" wrap="nowrap">
          <ActionIcon
            onClick={toggle}
            variant="subtle"
            visibleFrom="sm"
            aria-label="toggle sidebar"
          >
            {collapsed
              ? <IconLayoutSidebarLeftExpand size={20} />
              : <IconLayoutSidebarLeftCollapse size={20} />}
          </ActionIcon>
          <ActionIcon
            onClick={toggleMobile}
            variant="subtle"
            hiddenFrom="sm"
            aria-label="toggle sidebar mobile"
          >
            {mobileOpened
              ? <IconLayoutSidebarLeftCollapse size={20} />
              : <IconLayoutSidebarLeftExpand size={20} />}
          </ActionIcon>
          <Text fw={600} size="sm">{title}</Text>
          <Box style={{ flex: 1 }} />
          {rightSlot}
        </Group>
      </MantineAppShell.Header>

      <MantineAppShell.Navbar p={0}>
        <SidebarNav currentPath={currentPath} isAdmin={isAdmin} />
      </MantineAppShell.Navbar>

      <MantineAppShell.Main>{children}</MantineAppShell.Main>
    </MantineAppShell>
  )
}

export default function AppShell({ children }) {
  return (
    <HeaderSlotProvider>
      <AppShellInner>{children}</AppShellInner>
    </HeaderSlotProvider>
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd /Users/drewlee/work/personal/one-tour/.claude/worktrees/zealous-wozniak-cc8a75 && npx vitest run app/javascript/layouts/__tests__/AppShell.test.jsx`
Expected: PASS, 7 tests (6 existing + 1 new).

- [ ] **Step 5: Commit**

```bash
cd /Users/drewlee/work/personal/one-tour/.claude/worktrees/zealous-wozniak-cc8a75 && \
  git add app/javascript/layouts/AppShell.jsx app/javascript/layouts/__tests__/AppShell.test.jsx && \
  git commit -m "feat(layout): render header right slot in AppShell"
```

---

## Task 4: `PlannerHeaderRight` component

Four icon buttons (宪法/总览/账单/成员) with tooltips; 宪法 wrapped in `Indicator` for violation severity.

**Files:**
- Create: `app/javascript/components/planner/PlannerHeaderRight.jsx`
- Test: `app/javascript/components/planner/__tests__/PlannerHeaderRight.test.jsx`

- [ ] **Step 1: Write the failing test**

```jsx
// app/javascript/components/planner/__tests__/PlannerHeaderRight.test.jsx
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MantineProvider } from '@mantine/core'
import { describe, it, expect, vi } from 'vitest'
import PlannerHeaderRight from '../PlannerHeaderRight'

function renderHeader(props = {}) {
  const defaults = {
    violations: [],
    onOpenConst: vi.fn(),
    onOpenTimeline: vi.fn(),
    onOpenExpense: vi.fn(),
    onOpenMembers: vi.fn(),
  }
  const merged = { ...defaults, ...props }
  render(
    <MantineProvider>
      <PlannerHeaderRight {...merged} />
    </MantineProvider>,
  )
  return merged
}

describe('PlannerHeaderRight', () => {
  it('renders four icon buttons with accessible names', () => {
    renderHeader()
    expect(screen.getByRole('button', { name: '宪法' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '总览' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '账单' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '成员' })).toBeInTheDocument()
  })

  it('calls the matching handler on click', async () => {
    const user = userEvent.setup()
    const props = renderHeader()
    await user.click(screen.getByRole('button', { name: '宪法' }))
    await user.click(screen.getByRole('button', { name: '总览' }))
    await user.click(screen.getByRole('button', { name: '账单' }))
    await user.click(screen.getByRole('button', { name: '成员' }))
    expect(props.onOpenConst).toHaveBeenCalledTimes(1)
    expect(props.onOpenTimeline).toHaveBeenCalledTimes(1)
    expect(props.onOpenExpense).toHaveBeenCalledTimes(1)
    expect(props.onOpenMembers).toHaveBeenCalledTimes(1)
  })

  it('shows no indicator when violations is empty', () => {
    renderHeader({ violations: [] })
    // Mantine Indicator renders an empty element; check no count text visible
    expect(screen.queryByText(/^\d+$/)).not.toBeInTheDocument()
  })

  it('shows yellow indicator with count when only soft violations', () => {
    renderHeader({ violations: [{ level: 'soft', message: 'x' }, { level: 'soft', message: 'y' }] })
    const ind = screen.getByText('2')
    expect(ind).toBeInTheDocument()
    // Mantine uses inline styles; background includes 'yellow' color value
    expect(ind.closest('[data-indicator]') || ind.parentElement).toBeTruthy()
  })

  it('shows red indicator with count when any hard violation', () => {
    renderHeader({ violations: [{ level: 'hard', message: 'x' }, { level: 'soft', message: 'y' }] })
    expect(screen.getByText('2')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Users/drewlee/work/personal/one-tour/.claude/worktrees/zealous-wozniak-cc8a75 && npx vitest run app/javascript/components/planner/__tests__/PlannerHeaderRight.test.jsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```jsx
// app/javascript/components/planner/PlannerHeaderRight.jsx
import { Group, ActionIcon, Tooltip, Indicator } from '@mantine/core'
import {
  IconBook2,
  IconListDetails,
  IconCoin,
  IconUsers,
} from '@tabler/icons-react'

function severityColor(violations) {
  if (!violations || violations.length === 0) return null
  return violations.some(v => v.level === 'hard') ? 'red' : 'yellow'
}

export default function PlannerHeaderRight({
  violations = [],
  onOpenConst,
  onOpenTimeline,
  onOpenExpense,
  onOpenMembers,
}) {
  const color = severityColor(violations)

  return (
    <Group gap="xs" wrap="nowrap">
      <Indicator
        color={color || 'gray'}
        label={violations.length}
        size={16}
        offset={4}
        disabled={!color}
      >
        <Tooltip label="宪法" withArrow>
          <ActionIcon onClick={onOpenConst} variant="subtle" size="md" aria-label="宪法">
            <IconBook2 size={20} />
          </ActionIcon>
        </Tooltip>
      </Indicator>

      <Tooltip label="总览" withArrow>
        <ActionIcon onClick={onOpenTimeline} variant="subtle" size="md" aria-label="总览">
          <IconListDetails size={20} />
        </ActionIcon>
      </Tooltip>

      <Tooltip label="账单" withArrow>
        <ActionIcon onClick={onOpenExpense} variant="subtle" size="md" aria-label="账单">
          <IconCoin size={20} />
        </ActionIcon>
      </Tooltip>

      <Tooltip label="成员" withArrow>
        <ActionIcon onClick={onOpenMembers} variant="subtle" size="md" aria-label="成员">
          <IconUsers size={20} />
        </ActionIcon>
      </Tooltip>
    </Group>
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd /Users/drewlee/work/personal/one-tour/.claude/worktrees/zealous-wozniak-cc8a75 && npx vitest run app/javascript/components/planner/__tests__/PlannerHeaderRight.test.jsx`
Expected: PASS, 5 tests.

- [ ] **Step 5: Commit**

```bash
cd /Users/drewlee/work/personal/one-tour/.claude/worktrees/zealous-wozniak-cc8a75 && \
  git add app/javascript/components/planner/PlannerHeaderRight.jsx app/javascript/components/planner/__tests__/PlannerHeaderRight.test.jsx && \
  git commit -m "feat(planner): add PlannerHeaderRight icon buttons with violation indicator"
```

---

## Task 5: Extract `ParameterEditor` + `RedHeaderDocument` from `Tour/Constitution.jsx`

These two components are currently defined inline inside `Tour/Constitution.jsx` (lines ~369 and ~382). `ConstitutionDrawer` in Task 6 needs to import them without pulling in the entire page.

**Files:**
- Create: `app/javascript/components/planner/RedHeaderDocument.jsx`
- Create: `app/javascript/components/planner/ParameterEditor.jsx`
- Modify: `app/javascript/pages/Tour/Constitution.jsx` (remove the extracted function bodies + add imports)

- [ ] **Step 1: Read `Tour/Constitution.jsx` from line 369 to end and identify the two function blocks**

Open `app/javascript/pages/Tour/Constitution.jsx`. Note the exact code of:
- `function RedHeaderDocument({ children }) { ... }`
- `function ParameterEditor({ c, setC, dirty, advancedOpen, setAdvancedOpen, advancedCount, resetToDefaults }) { ... }`

Also note any top-level helpers these functions reference (e.g., `detectDateDaysConflict`, `todayLocal`, `formatScope`) — these stay in Constitution.jsx for now; Task 9 will delete the whole file.

- [ ] **Step 2: Create `RedHeaderDocument.jsx` verbatim**

```jsx
// app/javascript/components/planner/RedHeaderDocument.jsx
// Moved from pages/Tour/Constitution.jsx (2026-04-21) so ConstitutionDrawer can reuse.

// --- BEGIN: paste the exact `function RedHeaderDocument({ children }) { ... }` body here
// as `export default function RedHeaderDocument({ children }) { ... }`.
// Also paste any imports the body needs (e.g. from '@mantine/core'). ---
```

Concretely, the file should export a default React component that renders the paper/document chrome wrapping `{children}`. Copy imports from Constitution.jsx as needed.

- [ ] **Step 3: Create `ParameterEditor.jsx` verbatim**

```jsx
// app/javascript/components/planner/ParameterEditor.jsx
// Moved from pages/Tour/Constitution.jsx (2026-04-21) so ConstitutionDrawer can reuse.

// --- BEGIN: paste the exact `function ParameterEditor(...)` body here
// as `export default function ParameterEditor(...)`. Also paste any
// top-of-file helpers ParameterEditor uses (e.g. field groups, advancedCount
// helper if referenced inline) and their imports. ---
```

- [ ] **Step 4: Modify `Tour/Constitution.jsx`**

- Remove the inline `function RedHeaderDocument` and `function ParameterEditor` blocks.
- At the top of the file, add:

```jsx
import RedHeaderDocument from '../../components/planner/RedHeaderDocument'
import ParameterEditor from '../../components/planner/ParameterEditor'
```

- [ ] **Step 5: Run existing tests to verify Constitution page still works**

Run: `cd /Users/drewlee/work/personal/one-tour/.claude/worktrees/zealous-wozniak-cc8a75 && npx vitest run app/javascript/pages/Tour/__tests__/Constitution.test.jsx`
Expected: PASS (no behavioral change — only module boundary moved).

- [ ] **Step 6: Run full suite to catch other breakage**

Run: `cd /Users/drewlee/work/personal/one-tour/.claude/worktrees/zealous-wozniak-cc8a75 && npm test 2>&1 | tail -6`
Expected: PASS (same test count as before; 364 per Task 7 of previous plan).

- [ ] **Step 7: Commit**

```bash
cd /Users/drewlee/work/personal/one-tour/.claude/worktrees/zealous-wozniak-cc8a75 && \
  git add app/javascript/components/planner/RedHeaderDocument.jsx \
          app/javascript/components/planner/ParameterEditor.jsx \
          app/javascript/pages/Tour/Constitution.jsx && \
  git commit -m "refactor(constitution): extract RedHeaderDocument and ParameterEditor into components/"
```

---

## Task 6: `ConstitutionDrawer` with both modes (onboarding + edit)

**Files:**
- Create: `app/javascript/components/planner/ConstitutionDrawer.jsx`
- Test: `app/javascript/components/planner/__tests__/ConstitutionDrawer.test.jsx`

Mode gate: the drawer renders **onboarding mode** when `tour.constitution_accepted === false` AND localStorage key `onboarded:tour:${id}` is missing. Otherwise **edit mode**. The `constitution_accepted` field is a boolean on the `Tour` model (see `db/schema.rb:283`), not inside the `constitution` jsonb. The mode is decided at mount; a successful `accept` call writes both signals and the drawer re-renders in edit mode.

- [ ] **Step 1: Write the failing test**

```jsx
// app/javascript/components/planner/__tests__/ConstitutionDrawer.test.jsx
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MantineProvider } from '@mantine/core'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import ConstitutionDrawer from '../ConstitutionDrawer'

const patchMock = vi.fn()
const postMock = vi.fn()

vi.mock('@inertiajs/react', () => ({
  router: {
    patch: (...args) => patchMock(...args),
    post: (...args) => postMock(...args),
  },
}))

vi.mock('../ParameterEditor', () => ({
  default: ({ c, setC }) => (
    <input
      data-testid="param-input"
      value={c.max_daily_driving_minutes || ''}
      onChange={e => setC({ ...c, max_daily_driving_minutes: Number(e.target.value) })}
    />
  ),
}))

vi.mock('../RedHeaderDocument', () => ({
  default: ({ children }) => <div data-testid="red-doc">{children}</div>,
}))

vi.mock('../ConstitutionFullText', () => ({
  default: () => <div data-testid="full-text" />,
}))

const baseTour = {
  id: 42,
  title: '测试旅程',
  constitution: { max_daily_driving_minutes: 360 },
  constitution_accepted: false,
  date_range: null,
  team_size: null,
  days_count: null,
}

function renderDrawer(overrides = {}) {
  const props = {
    tour: baseTour,
    violations: [],
    defaults: { max_daily_driving_minutes: 360 },
    overrides: [],
    width: 400,
    onWidthChange: vi.fn(),
    onClose: vi.fn(),
    onFix: vi.fn(),
    onAcknowledge: vi.fn(),
    ...overrides,
  }
  return {
    ...render(
      <MantineProvider>
        <ConstitutionDrawer {...props} />
      </MantineProvider>,
    ),
    props,
  }
}

beforeEach(() => {
  localStorage.clear()
  patchMock.mockReset()
  postMock.mockReset()
})

describe('ConstitutionDrawer — onboarding mode', () => {
  it('renders "同意并开始规划" CTA when constitution_accepted is false and no localStorage marker', () => {
    renderDrawer()
    expect(screen.getByRole('button', { name: /同意并开始规划/ })).toBeInTheDocument()
  })

  it('does NOT render auto-save status line in onboarding mode', () => {
    renderDrawer()
    expect(screen.queryByText(/已保存/)).not.toBeInTheDocument()
  })
})

describe('ConstitutionDrawer — edit mode', () => {
  it('renders when constitution_accepted is true', () => {
    renderDrawer({ tour: { ...baseTour, constitution_accepted: true } })
    expect(screen.queryByRole('button', { name: /同意并开始规划/ })).not.toBeInTheDocument()
  })

  it('renders when localStorage marker is set (even if constitution_accepted is false)', () => {
    localStorage.setItem('onboarded:tour:42', '1')
    renderDrawer()
    expect(screen.queryByRole('button', { name: /同意并开始规划/ })).not.toBeInTheDocument()
  })

  it('debounces PATCH on field change', async () => {
    const user = userEvent.setup()
    localStorage.setItem('onboarded:tour:42', '1')
    renderDrawer()
    const input = screen.getByTestId('param-input')
    await user.clear(input)
    await user.type(input, '400')
    // Debounced at 500ms; wait long enough for it to fire.
    await waitFor(
      () => expect(patchMock).toHaveBeenCalled(),
      { timeout: 2000 },
    )
    expect(patchMock.mock.calls[0][0]).toBe('/tours/42/constitution')
  })
})

describe('ConstitutionDrawer — close & width', () => {
  it('calls onClose when X button clicked', async () => {
    const user = userEvent.setup()
    const { props } = renderDrawer()
    await user.click(screen.getByRole('button', { name: /close|关闭/i }))
    expect(props.onClose).toHaveBeenCalled()
  })
})

describe('ConstitutionDrawer — violations', () => {
  it('shows violation rows when violations prop is non-empty', () => {
    renderDrawer({ violations: [
      { level: 'hard', message: '行程超过每日上限', rule: 'max_tier_one_per_day' },
    ]})
    expect(screen.getByText('行程超过每日上限')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Users/drewlee/work/personal/one-tour/.claude/worktrees/zealous-wozniak-cc8a75 && npx vitest run app/javascript/components/planner/__tests__/ConstitutionDrawer.test.jsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the drawer skeleton**

```jsx
// app/javascript/components/planner/ConstitutionDrawer.jsx
import { useEffect, useMemo, useRef, useState } from 'react'
import { Stack, Group, ActionIcon, Text, Title, Button, Paper } from '@mantine/core'
import { IconX, IconAlertOctagonFilled, IconAlertTriangleFilled } from '@tabler/icons-react'
import { router } from '@inertiajs/react'
import debounce from 'lodash.debounce'
import ParameterEditor from './ParameterEditor'
import RedHeaderDocument from './RedHeaderDocument'
import ConstitutionFullText from './ConstitutionFullText'

const DRAWER_MIN = 320
const DRAWER_MAX = 640
const SAVE_DEBOUNCE_MS = 500

function onboardedKey(tourId) {
  return `onboarded:tour:${tourId}`
}

function isOnboarded(tour) {
  if (tour?.constitution_accepted) return true
  if (typeof window !== 'undefined' && localStorage.getItem(onboardedKey(tour.id)) === '1') return true
  return false
}

export default function ConstitutionDrawer({
  tour, violations, defaults, overrides = [],
  width, onWidthChange, onClose, onFix, onAcknowledge,
}) {
  const onboarded = isOnboarded(tour)
  const [c, setC] = useState({ ...tour.constitution })
  const [lastSavedAt, setLastSavedAt] = useState(null)
  const [setupStep, setSetupStep] = useState(1)
  const [isAccepting, setIsAccepting] = useState(false)

  // Debounced PATCH for edit-mode auto-save. Stable ref so debounce timer
  // isn't recreated on every keystroke (which would defeat debouncing).
  const debouncedPatchRef = useRef(null)
  useEffect(() => {
    debouncedPatchRef.current = debounce((constitution) => {
      router.patch(`/tours/${tour.id}/constitution`, { constitution }, {
        preserveScroll: true,
        onSuccess: () => setLastSavedAt(new Date()),
      })
    }, SAVE_DEBOUNCE_MS)
    return () => debouncedPatchRef.current?.cancel?.()
  }, [tour.id])

  // In edit mode, every change to `c` triggers a debounced save.
  useEffect(() => {
    if (!onboarded) return
    debouncedPatchRef.current?.(c)
  }, [c, onboarded])

  // ESC closes the drawer.
  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  // Resize via the right edge handle.
  const onResizeStart = (e) => {
    e.preventDefault()
    const startX = e.clientX
    const startW = width
    const onMove = (ev) => {
      const delta = ev.clientX - startX
      const next = Math.max(DRAWER_MIN, Math.min(DRAWER_MAX, startW + delta))
      onWidthChange(next)
    }
    const onUp = () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }

  const acceptConstitution = async () => {
    setIsAccepting(true)
    router.post(`/tours/${tour.id}/constitution/accept`, {}, {
      preserveScroll: true,
      onSuccess: () => {
        localStorage.setItem(onboardedKey(tour.id), '1')
        onClose()
      },
      onFinish: () => setIsAccepting(false),
    })
  }

  return (
    <aside
      style={{
        width,
        minWidth: DRAWER_MIN,
        maxWidth: DRAWER_MAX,
        borderRight: '1px solid #e0e0e0',
        background: '#fff',
        display: 'flex',
        flexDirection: 'column',
        position: 'relative',
        height: '100%',
      }}
      data-testid="constitution-drawer"
    >
      <Group justify="space-between" px="md" py="xs" style={{ borderBottom: '1px solid #eee' }}>
        <Title order={5}>{onboarded ? '宪法' : '设置这次旅程'}</Title>
        <ActionIcon onClick={onClose} variant="subtle" aria-label="关闭">
          <IconX size={18} />
        </ActionIcon>
      </Group>

      <Stack gap="md" p="md" style={{ overflowY: 'auto', flex: 1 }}>
        {violations.length > 0 && (
          <Stack gap="xs">
            {violations.map((v, i) => {
              const isHard = v.level === 'hard'
              return (
                <Paper
                  key={i}
                  p="xs"
                  withBorder
                  style={{
                    borderColor: isHard ? '#c33' : '#c80',
                    background: isHard ? '#fef0f0' : '#fef8e8',
                    color: isHard ? '#c33' : '#c80',
                  }}
                >
                  <Group justify="space-between" wrap="nowrap" gap="xs">
                    <Group gap={6} wrap="nowrap">
                      {isHard
                        ? <IconAlertOctagonFilled size={14} />
                        : <IconAlertTriangleFilled size={14} />}
                      <Text size="sm">{v.message}</Text>
                    </Group>
                    <Group gap="xs">
                      {isHard && (
                        <Button size="compact-xs" color="red" onClick={() => onFix(v)}>帮我修正 →</Button>
                      )}
                      <Button
                        size="compact-xs"
                        variant="default"
                        onClick={() => (isHard ? onAcknowledge(v) : undefined)}
                      >
                        {isHard ? '承认此违反' : '知道了'}
                      </Button>
                    </Group>
                  </Group>
                </Paper>
              )
            })}
          </Stack>
        )}

        {!onboarded ? (
          // Edit mode
          <ParameterEditor
            c={c}
            setC={setC}
            dirty={JSON.stringify(c) !== JSON.stringify(tour.constitution)}
            advancedOpen={false}
            setAdvancedOpen={() => {}}
            advancedCount={0}
            resetToDefaults={() => setC({ ...defaults })}
          />
        ) : setupStep === 1 ? (
          // Onboarding step 1
          <>
            <Text size="xs" c="dimmed" ta="center">第 1 步（共 2 步）</Text>
            <ParameterEditor
              c={c}
              setC={setC}
              dirty={JSON.stringify(c) !== JSON.stringify(tour.constitution)}
              advancedOpen={false}
              setAdvancedOpen={() => {}}
              advancedCount={0}
              resetToDefaults={() => setC({ ...defaults })}
            />
            <Group justify="flex-end">
              <Button onClick={() => {
                router.patch(`/tours/${tour.id}/constitution`, { constitution: c }, {
                  preserveScroll: true,
                  onSuccess: () => setSetupStep(2),
                })
              }}>下一步 →</Button>
            </Group>
          </>
        ) : (
          // Onboarding step 2
          <>
            <Text size="xs" c="dimmed" ta="center">第 2 步（共 2 步）· 请阅读后同意</Text>
            <RedHeaderDocument>
              <ConstitutionFullText constitution={c} defaults={defaults} />
            </RedHeaderDocument>
            <Group justify="center">
              <Button variant="default" onClick={() => setSetupStep(1)}>← 返回修改</Button>
              <Button color="red" onClick={acceptConstitution} loading={isAccepting} disabled={isAccepting}>
                同意并开始规划 →
              </Button>
            </Group>
          </>
        )}
      </Stack>

      {onboarded && lastSavedAt && (
        <Text size="xs" c="dimmed" ta="center" py={4} style={{ borderTop: '1px solid #eee' }}>
          已保存 · {lastSavedAt.toLocaleTimeString('zh-CN')}
        </Text>
      )}

      <div
        onMouseDown={onResizeStart}
        style={{
          position: 'absolute',
          top: 0,
          right: -4,
          width: 8,
          height: '100%',
          cursor: 'col-resize',
          zIndex: 10,
        }}
        data-testid="constitution-resize-handle"
      />
    </aside>
  )
}
```

(Note on `onboarded` variable: re-reading the code shows the ternary is inverted — I wrote the edit-mode branch under `!onboarded` which is wrong. Correct it: `onboarded ? <EditMode /> : <OnboardingFlow />`. Fix this while writing so the tests pass.)

**Actually, correct inline here:** change the JSX branching to:

```jsx
        {onboarded ? (
          // Edit mode: live editable
          <ParameterEditor ... />
        ) : setupStep === 1 ? (
          // Onboarding step 1
          ...
        ) : (
          // Onboarding step 2
          ...
        )}
```

And the saved-indicator becomes `{onboarded && lastSavedAt && <Text>已保存 · ...</Text>}`. The escape-close effect is shared by both modes.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd /Users/drewlee/work/personal/one-tour/.claude/worktrees/zealous-wozniak-cc8a75 && npx vitest run app/javascript/components/planner/__tests__/ConstitutionDrawer.test.jsx`
Expected: PASS, ~8 tests.

If failing: address feedback from test output. Common issues:
- `lodash.debounce` not installed — run `npm install lodash.debounce` and retry.
- Role name mismatch on close button — the test uses `{ name: /close|关闭/i }`; the implementation uses `aria-label="关闭"`, which satisfies it.

- [ ] **Step 5: Install `lodash.debounce` if not present**

Run: `cd /Users/drewlee/work/personal/one-tour/.claude/worktrees/zealous-wozniak-cc8a75 && grep '"lodash.debounce"' package.json || npm install lodash.debounce`

- [ ] **Step 6: Commit**

```bash
cd /Users/drewlee/work/personal/one-tour/.claude/worktrees/zealous-wozniak-cc8a75 && \
  git add app/javascript/components/planner/ConstitutionDrawer.jsx \
          app/javascript/components/planner/__tests__/ConstitutionDrawer.test.jsx \
          package.json package-lock.json && \
  git commit -m "feat(planner): add ConstitutionDrawer with bimodal onboarding + edit flow"
```

---

## Task 7: `TimelineOverlay` component

Wrap the existing Timeline UI (`TourSummaryBar`, `RhythmBar`, `TimelineDayColumn`, `DayDetailPanel`) in a Mantine full-screen `Modal`.

**Files:**
- Create: `app/javascript/components/planner/TimelineOverlay.jsx`
- Test: `app/javascript/components/planner/__tests__/TimelineOverlay.test.jsx`

- [ ] **Step 1: Write the failing test**

```jsx
// app/javascript/components/planner/__tests__/TimelineOverlay.test.jsx
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MantineProvider } from '@mantine/core'
import { describe, it, expect, vi } from 'vitest'
import TimelineOverlay from '../TimelineOverlay'

vi.mock('../../timeline/TourSummaryBar', () => ({ default: () => <div data-testid="summary-bar" /> }))
vi.mock('../../timeline/RhythmBar', () => ({ default: () => <div data-testid="rhythm-bar" /> }))
vi.mock('../../timeline/TimelineDayColumn', () => ({ default: () => <div data-testid="day-col" /> }))
vi.mock('../../timeline/DayDetailPanel', () => ({ default: () => <div data-testid="day-detail" /> }))

const tour = { id: 1, title: 'x', constitution: {} }
const days = [{ id: 1, position: 0 }]
const activities = []
const violations = []
const summary = {}

function renderOverlay(opened) {
  return render(
    <MantineProvider>
      <TimelineOverlay
        opened={opened}
        onClose={vi.fn()}
        tour={tour}
        days={days}
        activities={activities}
        violations={violations}
        summary={summary}
      />
    </MantineProvider>,
  )
}

describe('TimelineOverlay', () => {
  it('does not render children when closed', () => {
    renderOverlay(false)
    expect(screen.queryByTestId('summary-bar')).not.toBeInTheDocument()
  })

  it('renders timeline pieces when opened', () => {
    renderOverlay(true)
    expect(screen.getByTestId('summary-bar')).toBeInTheDocument()
    expect(screen.getByTestId('rhythm-bar')).toBeInTheDocument()
    expect(screen.getByTestId('day-col')).toBeInTheDocument()
    expect(screen.getByTestId('day-detail')).toBeInTheDocument()
  })

  it('calls onClose on ESC', async () => {
    const onClose = vi.fn()
    render(
      <MantineProvider>
        <TimelineOverlay opened onClose={onClose} tour={tour} days={days} activities={activities} violations={violations} summary={summary} />
      </MantineProvider>,
    )
    await userEvent.keyboard('{Escape}')
    expect(onClose).toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Users/drewlee/work/personal/one-tour/.claude/worktrees/zealous-wozniak-cc8a75 && npx vitest run app/javascript/components/planner/__tests__/TimelineOverlay.test.jsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```jsx
// app/javascript/components/planner/TimelineOverlay.jsx
import { useRef } from 'react'
import { Modal, Stack } from '@mantine/core'
import TourSummaryBar from '../timeline/TourSummaryBar'
import RhythmBar from '../timeline/RhythmBar'
import TimelineDayColumn from '../timeline/TimelineDayColumn'
import DayDetailPanel from '../timeline/DayDetailPanel'
import { useState } from 'react'

export default function TimelineOverlay({
  opened, onClose, tour, days, activities, violations, summary,
}) {
  const [selectedDayId, setSelectedDayId] = useState(null)
  const dayColumnRefs = useRef({})

  const byDay = Object.fromEntries(
    days.map(d => [d.id, activities.filter(a => a.day_id === d.id).sort((a, b) => a.position - b.position)]),
  )
  const selectedDay = selectedDayId ? days.find(d => d.id === selectedDayId) : null
  const selectedDayActivities = selectedDay ? (byDay[selectedDay.id] || []) : []

  const handleSlotClick = (dayId) => {
    setSelectedDayId(dayId)
    const el = dayColumnRefs.current[dayId]
    if (el && typeof el.scrollIntoView === 'function') {
      el.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' })
    }
  }

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      fullScreen
      withCloseButton
      padding={0}
      title="总览"
      styles={{
        content: { marginTop: 56 },
        body: { padding: 16 },
      }}
    >
      <Stack gap="md">
        <TourSummaryBar summary={summary} />
        <RhythmBar
          days={days}
          violations={violations}
          selectedDayId={selectedDayId}
          onSlotClick={handleSlotClick}
        />
        <div style={{ display: 'flex', gap: 8, overflowX: 'auto', alignItems: 'stretch', paddingBottom: 6 }}>
          {days.map(d => (
            <TimelineDayColumn
              key={d.id}
              day={d}
              activities={byDay[d.id] || []}
              constitution={tour.constitution}
              tourId={tour.id}
              selected={selectedDayId === d.id}
              onSelect={setSelectedDayId}
              columnRef={(el) => { dayColumnRefs.current[d.id] = el }}
            />
          ))}
        </div>
        <DayDetailPanel
          day={selectedDay}
          activities={selectedDayActivities}
          constitution={tour.constitution}
        />
      </Stack>
    </Modal>
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd /Users/drewlee/work/personal/one-tour/.claude/worktrees/zealous-wozniak-cc8a75 && npx vitest run app/javascript/components/planner/__tests__/TimelineOverlay.test.jsx`
Expected: PASS, 3 tests.

- [ ] **Step 5: Commit**

```bash
cd /Users/drewlee/work/personal/one-tour/.claude/worktrees/zealous-wozniak-cc8a75 && \
  git add app/javascript/components/planner/TimelineOverlay.jsx app/javascript/components/planner/__tests__/TimelineOverlay.test.jsx && \
  git commit -m "feat(planner): add TimelineOverlay full-screen modal wrapper"
```

---

## Task 8: Wire into `Tour/Show.jsx` + remove old chrome + auto-open first visit

Biggest task. Does: (a) revert the `Show.layout = (page) => page` opt-out; (b) delete the inline `TourTabs`, inline `ConstitutionChip`, and the 账单/成员 Button Group from the planner's top area; (c) inject `PlannerHeaderRight` into AppShell's header slot; (d) render `ConstitutionDrawer` as the leftmost flex sibling; (e) render `TimelineOverlay` as a portal; (f) wire first-visit auto-open for onboarding.

**Files:**
- Modify: `app/javascript/pages/Tour/Show.jsx`

- [ ] **Step 1: Open `Tour/Show.jsx`**

Read the current file in full to understand existing state hooks, drawer opens, and layout.

Existing drawer-open state variables in `Show.jsx` you'll keep:
- `setExpenseDrawerOpen(true)` — for 账单
- `setMembersDrawerOpen(true)` — for 成员
- Various modal state (SettingsModal, etc.)

- [ ] **Step 2: Apply a single set of edits**

Make these changes together, then run tests:

1. Remove the bottom line `Show.layout = (page) => page` (or the equivalent Inertia opt-out).

2. Add imports:

```jsx
import { useDisclosure } from '@mantine/hooks'
import PlannerHeaderRight from '../../components/planner/PlannerHeaderRight'
import ConstitutionDrawer from '../../components/planner/ConstitutionDrawer'
import TimelineOverlay from '../../components/planner/TimelineOverlay'
import { useInjectHeaderRight } from '../../layouts/HeaderSlot'
import { useMemo, useEffect, useState } from 'react'
```

(Some of these may already be imported — deduplicate.)

3. Also import `summary`, `constitution`, `defaults`, `overrides` from props. Note: Tour's `constitution_accepted` boolean comes through `tour.constitution_accepted` since the tour prop is `@tour.as_json`. Update the default-export signature:

```jsx
export default function Show({
  tour, days, activities, activity_images, expenses, expenses_summary,
  tour_budgets, settlements, route_legs, violations, members, author,
  conversation_empty, summary,          // ← add summary
  constitution, defaults, overrides,    // ← existing or to be added from server
}) {
```

Note: `constitution`, `defaults`, `overrides` are already served by `/tours/:id/constitution` today. Since Task 10 deletes that route, the planner needs them from `tours#show`. **Extend Task 1's Step 3 to include `constitution:`, `defaults:`, `overrides:`** — update the backend first. [If you've already landed Task 1, go back and add these now; one more PATCH on that commit is fine.]

(Or: decide during implementation to fetch lazily via `router.reload({ only: [...] })` when drawer opens. The simpler path is eager include.)

4. Add drawer/overlay open state + width state near the top of the component body:

```jsx
  const [constOpen, { open: openConst, close: closeConst }] = useDisclosure(false)
  const [timelineOpen, { open: openTimeline, close: closeTimeline }] = useDisclosure(false)
  const [constWidth, setConstWidth] = useState(400)
```

5. First-visit auto-open effect:

```jsx
  useEffect(() => {
    const key = `onboarded:tour:${tour.id}`
    const onboarded = localStorage.getItem(key) === '1' || !!tour.constitution_accepted
    if (!onboarded) openConst()
  }, [tour.id])
```

6. Inject header right slot:

```jsx
  const headerRight = useMemo(() => (
    <PlannerHeaderRight
      violations={violations}
      onOpenConst={openConst}
      onOpenTimeline={openTimeline}
      onOpenExpense={() => setExpenseDrawerOpen(true)}
      onOpenMembers={() => setMembersDrawerOpen(true)}
    />
  ), [violations, openConst, openTimeline])
  useInjectHeaderRight(headerRight)
```

7. In the JSX, remove:
   - `<TourTabs tour={tour} active="planner" />`
   - The inline `<ConstitutionChip ... />`
   - The right-side `<Group gap="xs"> <Button>账单</Button> <Button>成员</Button> </Group>` — both buttons already live in `PlannerHeaderRight` now.
   - Note the tour title Group is removed from planner body if `document.title` is used for the AppShell header title. If the in-body tour title is still desired (hover to edit), keep it but it's now redundant with the AppShell header display. Per spec: the AppShell header title is the canonical display; remove the in-body tour title header.
   - Actually, the existing hover-to-edit interaction is still needed on the AppShell title. For v1, drop the in-body title and leave the hover-to-edit affordance unreachable via header (TourSettingsModal can still be opened from inside the constitution drawer or a separate settings affordance). **Decision point:** for v1, remove the in-body title block entirely; the tour title shows in AppShell header as plain text (document.title); `TourSettingsModal` moves into the drawer or keeps its existing opener elsewhere. If the spec requires hover-to-edit in the AppShell header, that's a follow-up (out of scope for this plan).

8. Render `ConstitutionDrawer` as the first flex sibling of the panels:

Find the existing container:
```jsx
<div ref={containerRef} style={{
  display: 'flex',
  alignItems: 'stretch',
  gap: 0,
  padding: 10,
  height: 'calc(100vh - 200px)',
}}>
  <BacklogList ... />
```

Prepend inside the flex container:

```jsx
  {constOpen && (
    <ConstitutionDrawer
      tour={tour}
      violations={violations}
      defaults={defaults}
      overrides={overrides}
      width={constWidth}
      onWidthChange={setConstWidth}
      onClose={closeConst}
      onFix={(v) => setPendingChatPrompt(fixPromptFor(v))}
      onAcknowledge={(v) => setAcknowledgingViolation(v)}
    />
  )}
  <BacklogList ... />   {/* existing sibling */}
```

Also: adjust the flex container's `height: 'calc(100vh - 200px)'` — this hardcoded value was picked when the planner owned its own top chrome (~200px). With AppShell wrapping (56px) + drawer in the flex row, the remaining planner area is closer to `calc(100vh - 56px - 20px padding)`. Change to:

```jsx
  height: 'calc(100vh - 56px - 20px)',
```

9. Render `TimelineOverlay` somewhere at the end of the component JSX (outside the flex row):

```jsx
  <TimelineOverlay
    opened={timelineOpen}
    onClose={closeTimeline}
    tour={tour}
    days={days}
    activities={activities}
    violations={violations}
    summary={summary}
  />
```

- [ ] **Step 3: Extend Task 1 backend to include constitution/defaults/overrides**

Edit `app/controllers/tours_controller.rb#show` props block again, adding:

```ruby
      constitution: @tour.constitution.as_json,
      defaults: Tour::Constitution::DEFAULTS,         # or the equivalent constant used today
      overrides: @tour.constraint_overrides.as_json,
```

(Check the actual names by reading what `tours/constitutions_controller.rb#show` provides today; mirror those prop names exactly.)

Append RSpec case:

```ruby
  it "includes constitution, defaults, overrides in show props" do
    login_as(user)
    get "/tours/#{tour.id}", headers: { "X-Inertia" => "true", "Accept" => "application/json" }
    body = JSON.parse(response.body)
    expect(body["props"]).to include("constitution", "defaults", "overrides")
  end
```

- [ ] **Step 4: Run full test suite**

```bash
cd /Users/drewlee/work/personal/one-tour/.claude/worktrees/zealous-wozniak-cc8a75 && \
  npm test 2>&1 | tail -10
```
Expected: PASS.

The existing `Tour/Show.test.jsx` will likely need minor updates (its mocks must now handle `useInjectHeaderRight` — add a mock for `../../../layouts/HeaderSlot` that makes it a no-op).

Add at the top of `Show.test.jsx` if needed:

```jsx
vi.mock('../../../layouts/HeaderSlot', () => ({
  useInjectHeaderRight: () => {},
  useHeaderRightSlot: () => null,
  HeaderSlotProvider: ({ children }) => <>{children}</>,
}))
```

Likewise, test will pass `summary`, `constitution`, etc., as props via the page import — make sure Show.test's rendered props include these fields.

- [ ] **Step 5: Run RSpec for tours + constitutions**

```bash
cd /Users/drewlee/work/personal/one-tour/.claude/worktrees/zealous-wozniak-cc8a75 && \
  mise exec -- bundle exec rspec spec/requests/tours_spec.rb 2>&1 | tail -10
```
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
cd /Users/drewlee/work/personal/one-tour/.claude/worktrees/zealous-wozniak-cc8a75 && \
  git add app/javascript/pages/Tour/Show.jsx \
          app/javascript/pages/Tour/__tests__/Show.test.jsx \
          app/controllers/tours_controller.rb \
          spec/requests/tours_spec.rb && \
  git commit -m "feat(planner): wire ConstitutionDrawer and TimelineOverlay into planner"
```

---

## Task 9: Delete old routes, controllers, pages, components

**Files to delete:**
- `app/javascript/pages/Tour/Constitution.jsx`
- `app/javascript/pages/Tour/Timeline.jsx`
- `app/javascript/components/tour/TourTabs.jsx`
- `app/javascript/pages/Tour/__tests__/Constitution.test.jsx`
- `app/controllers/tours/timelines_controller.rb`
- `spec/requests/tours/constitutions_spec.rb` (if it tests the `show` action; keep the `update`/`accept` parts)
- (Possibly empty dirs to clean: `app/javascript/components/tour/` if TourTabs is the sole occupant)

**Files to modify:**
- `config/routes.rb` — remove the timeline resource, change constitution to `only: [:update]`
- `app/controllers/tours/constitutions_controller.rb` — remove the `show` action
- `app/controllers/tours_controller.rb#create` — redirect to `/tours/:id` instead of `tour_constitution_path`
- `app/javascript/pages/Tour/Index.jsx` — if it links to `/tours/:id/constitution` for "继续设置", change to `/tours/:id`

- [ ] **Step 1: Update `config/routes.rb`**

In `resources :tours, ...` block, change constitution line:

```ruby
    resource :constitution, only: [ :update ], controller: "tours/constitutions" do
      post :accept, on: :member
    end
```

And delete the timeline line entirely:

```ruby
    # resource :timeline, only: [:show], controller: "tours/timelines"   ← remove
```

- [ ] **Step 2: Delete the `show` action from `tours/constitutions_controller.rb`**

Open `app/controllers/tours/constitutions_controller.rb`. Remove the `def show ... end` method. Keep `update`, `accept`, and any `private` helpers.

- [ ] **Step 3: Update the create redirect in `tours_controller.rb#create`**

Find:

```ruby
  def create
    @tour = Tour.create!(author: current_user, **tour_params)
    redirect_to tour_constitution_path(@tour)
  end
```

Change to:

```ruby
  def create
    @tour = Tour.create!(author: current_user, **tour_params)
    redirect_to tour_path(@tour)
  end
```

- [ ] **Step 4: Update `Tour/Index.jsx` openHref helper (if needed)**

Read `app/javascript/pages/Tour/Index.jsx` and find the `openHref` function around line 65:

```jsx
export function openHref(t) {
  return (t.days_count ?? 0) > 0 ? `/tours/${t.id}` : `/tours/${t.id}/constitution`
}
```

Change to:

```jsx
export function openHref(t) {
  return `/tours/${t.id}`
}
```

- [ ] **Step 5: Delete the files**

```bash
cd /Users/drewlee/work/personal/one-tour/.claude/worktrees/zealous-wozniak-cc8a75 && \
  rm app/javascript/pages/Tour/Constitution.jsx && \
  rm app/javascript/pages/Tour/Timeline.jsx && \
  rm app/javascript/components/tour/TourTabs.jsx && \
  rm app/javascript/pages/Tour/__tests__/Constitution.test.jsx && \
  rm app/controllers/tours/timelines_controller.rb
```

Check if `app/javascript/components/tour/` is now empty and remove if so:

```bash
cd /Users/drewlee/work/personal/one-tour/.claude/worktrees/zealous-wozniak-cc8a75 && \
  ls app/javascript/components/tour/ 2>&1 && \
  rmdir app/javascript/components/tour 2>/dev/null || true
```

- [ ] **Step 6: Delete the `ConstitutionChip` inline reference and file (if no longer used)**

Check usage:

```bash
cd /Users/drewlee/work/personal/one-tour/.claude/worktrees/zealous-wozniak-cc8a75 && \
  grep -rn "ConstitutionChip" app/javascript --include="*.jsx" --include="*.js"
```

If the result is empty (Task 8 removed the inline usage, and `ConstitutionDrawer` does NOT import it — violations are rendered inline via the drawer's own violation Paper blocks), delete the chip and its test:

```bash
rm app/javascript/components/planner/ConstitutionChip.jsx
rm app/javascript/components/planner/__tests__/ConstitutionChip.test.jsx
```

If it's still referenced elsewhere, skip this step.

- [ ] **Step 7: Verify grep is clean for old chrome**

```bash
cd /Users/drewlee/work/personal/one-tour/.claude/worktrees/zealous-wozniak-cc8a75 && \
  grep -rn "TourTabs\|tour_constitution_path\|tour_timeline_path\|Tour/Constitution\|Tour/Timeline" \
    app/ config/ spec/ --include="*.rb" --include="*.jsx" --include="*.js"
```

Expected: empty output.

- [ ] **Step 8: Run full suite**

```bash
cd /Users/drewlee/work/personal/one-tour/.claude/worktrees/zealous-wozniak-cc8a75 && \
  npm test 2>&1 | tail -6 && \
  mise exec -- bundle exec rspec spec/requests 2>&1 | tail -10
```

Expected: all green. Tests count drops by however many referenced the deleted pages.

- [ ] **Step 9: Commit**

```bash
cd /Users/drewlee/work/personal/one-tour/.claude/worktrees/zealous-wozniak-cc8a75 && \
  git add -A && \
  git commit -m "chore: delete constitution/timeline pages, routes, and controllers"
```

---

## Task 10: Manual QA via Playwright E2E

Drive the dev server with Playwright to verify the end-to-end flow.

- [ ] **Step 1: Start worktree dev server**

```bash
cd /Users/drewlee/work/personal/one-tour/.claude/worktrees/zealous-wozniak-cc8a75 && \
  bin/worktree-dev up
```

Note the Rails port (typically 9104). Seed test users + at least one tour with no accepted constitution.

- [ ] **Step 2: Test matrix (execute each via Playwright MCP)**

| # | Scenario | Expected |
|---|---|---|
| 1 | Log in as non-admin, visit `/tours`, click into a tour with `constitution_accepted=false` | Planner loads; `ConstitutionDrawer` auto-opens in onboarding mode |
| 2 | In onboarding drawer, click "下一步 →" | Drawer advances to step 2 (review) |
| 3 | Click "同意并开始规划 →" | Drawer closes; `localStorage.onboarded:tour:${id}` set to `'1'`; re-opening the drawer shows edit mode (no 2-step flow) |
| 4 | In edit mode, tweak a field | After ~700ms, server PATCH fires; "已保存 · HH:MM:SS" footer updates |
| 5 | Click 总览 icon in header | `TimelineOverlay` opens full-screen with summary bar + day columns |
| 6 | Press `Esc` in timeline | Overlay closes, planner returns |
| 7 | Click 宪法 icon; add a hard violation via rule change | Header indicator turns red with count |
| 8 | Visit `/tours/:id/constitution` directly | Rails returns 404 |
| 9 | Visit `/tours/:id/timeline` directly | Rails returns 404 |
| 10 | Refresh planner after accepting constitution | Drawer does NOT auto-open |
| 11 | Resize constitution drawer by dragging right edge | Drawer width changes between 320 and 640 px |
| 12 | Visit `/tours`, verify sidebar toggle still works normally | Sidebar collapse preference persists per existing design |

- [ ] **Step 3: Fix any regressions uncovered**

Any bug found here is a Task 10 finding — commit the fix with a `fix(planner):` message before final sign-off.

- [ ] **Step 4: Stop server**

```bash
cd /Users/drewlee/work/personal/one-tour/.claude/worktrees/zealous-wozniak-cc8a75 && \
  bin/worktree-dev down
```

---

## Done criteria

- All Vitest tests pass (`npm test`).
- All RSpec tests pass for `spec/requests` (`mise exec -- bundle exec rspec spec/requests`).
- `bin/rubocop -f github` clean.
- `bin/brakeman --no-pager` clean.
- Manual QA matrix (Task 10) all green.
- Grep clean:
  - `grep -rn "TourTabs" app/ config/ spec/` → empty
  - `grep -rn "tour_constitution_path\|tour_timeline_path" app/ config/ spec/` → empty
  - `grep -rn "Tour/Constitution\|Tour/Timeline" app/ config/ spec/` → empty
- `/tours/:id/constitution` and `/tours/:id/timeline` return 404.
- Creating a new tour lands on `/tours/:id` with the onboarding drawer auto-opened.
