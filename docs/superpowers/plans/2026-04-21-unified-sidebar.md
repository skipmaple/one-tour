# Unified Sidebar Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the dual `AppLayout` (frontend) + `AdminShell` (admin) chrome with a single unified `AppShell` containing a collapsible sidebar with business nav, admin nav (admin-only), and a bottom user area.

**Architecture:** One Mantine `AppShell` shell auto-wrapping all Inertia pages via `entrypoints/inertia.jsx`. Two pages opt out (`Tour/Show` planner, `Auth/Login`) by setting `Page.layout = (page) => page`. Sidebar collapse state persisted in `localStorage`; admin section gated by `usePage().props.current_user.is_admin`. Header title derived from `document.title` via `MutationObserver`.

**Tech Stack:** React 18, Mantine v9 (`AppShell`, `NavLink`, `ActionIcon`, `Menu`), Inertia.js, `@tabler/icons-react`, Vitest + React Testing Library.

**Spec:** [`docs/superpowers/specs/2026-04-21-unified-sidebar-design.md`](../specs/2026-04-21-unified-sidebar-design.md)

---

## Task 1: `useSidebarCollapsed` hook

**Files:**
- Create: `app/javascript/layouts/sidebar/useSidebarCollapsed.js`
- Test: `app/javascript/layouts/sidebar/__tests__/useSidebarCollapsed.test.js`

- [ ] **Step 1: Write the failing test**

```jsx
// app/javascript/layouts/sidebar/__tests__/useSidebarCollapsed.test.js
import { describe, it, expect, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useSidebarCollapsed } from '../useSidebarCollapsed'

describe('useSidebarCollapsed', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('defaults to false when no localStorage value', () => {
    const { result } = renderHook(() => useSidebarCollapsed())
    expect(result.current.collapsed).toBe(false)
  })

  it('reads "1" from localStorage as collapsed=true', () => {
    localStorage.setItem('sidebar:collapsed', '1')
    const { result } = renderHook(() => useSidebarCollapsed())
    expect(result.current.collapsed).toBe(true)
  })

  it('toggle flips state and writes to localStorage', () => {
    const { result } = renderHook(() => useSidebarCollapsed())
    act(() => result.current.toggle())
    expect(result.current.collapsed).toBe(true)
    expect(localStorage.getItem('sidebar:collapsed')).toBe('1')
    act(() => result.current.toggle())
    expect(result.current.collapsed).toBe(false)
    expect(localStorage.getItem('sidebar:collapsed')).toBe('0')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run app/javascript/layouts/sidebar/__tests__/useSidebarCollapsed.test.js`
Expected: FAIL — "Failed to resolve import '../useSidebarCollapsed'"

- [ ] **Step 3: Implement the hook**

```js
// app/javascript/layouts/sidebar/useSidebarCollapsed.js
import { useState, useCallback } from 'react'

const KEY = 'sidebar:collapsed'

export function useSidebarCollapsed() {
  const [collapsed, setCollapsed] = useState(() => {
    if (typeof window === 'undefined') return false
    return localStorage.getItem(KEY) === '1'
  })

  const toggle = useCallback(() => {
    setCollapsed((prev) => {
      const next = !prev
      localStorage.setItem(KEY, next ? '1' : '0')
      return next
    })
  }, [])

  return { collapsed, toggle }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run app/javascript/layouts/sidebar/__tests__/useSidebarCollapsed.test.js`
Expected: PASS, 3 tests

- [ ] **Step 5: Commit**

```bash
git add app/javascript/layouts/sidebar/useSidebarCollapsed.js app/javascript/layouts/sidebar/__tests__/useSidebarCollapsed.test.js
git commit -m "feat(sidebar): add useSidebarCollapsed hook with localStorage persistence"
```

---

## Task 2: `UserSection` component

Bottom-of-sidebar avatar + name + Mantine `Menu` (个人设置, 退出). Owns `ProfileSettingsModal` open state.

**Files:**
- Create: `app/javascript/layouts/sidebar/UserSection.jsx`
- Test: `app/javascript/layouts/sidebar/__tests__/UserSection.test.jsx`

- [ ] **Step 1: Write the failing test**

```jsx
// app/javascript/layouts/sidebar/__tests__/UserSection.test.jsx
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MantineProvider } from '@mantine/core'
import { describe, it, expect, vi } from 'vitest'
import UserSection from '../UserSection'

vi.mock('@inertiajs/react', () => ({
  usePage: () => ({ props: { current_user: { name: '张三', email: 'zhang@example.com', avatar_url: null } } }),
  Link: ({ href, children, ...props }) => <a href={href} {...props}>{children}</a>,
  router: { on: () => () => {} },
}))

vi.mock('../../../components/ProfileSettingsModal', () => ({
  default: ({ opened }) => (opened ? <div data-testid="profile-modal" /> : null),
}))

function renderWithProvider(ui) {
  return render(<MantineProvider>{ui}</MantineProvider>)
}

describe('UserSection', () => {
  it('renders avatar and user name', () => {
    renderWithProvider(<UserSection />)
    expect(screen.getByText('张三')).toBeInTheDocument()
  })

  it('opens menu on click and shows 个人设置 / 退出 (no 管理后台)', async () => {
    const user = userEvent.setup()
    renderWithProvider(<UserSection />)
    await user.click(screen.getByText('张三'))
    expect(await screen.findByText('个人设置')).toBeInTheDocument()
    expect(screen.getByText('退出')).toBeInTheDocument()
    expect(screen.queryByText('管理后台')).not.toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run app/javascript/layouts/sidebar/__tests__/UserSection.test.jsx`
Expected: FAIL — "Failed to resolve import '../UserSection'"

- [ ] **Step 3: Implement the component**

```jsx
// app/javascript/layouts/sidebar/UserSection.jsx
import { Group, Avatar, Text, Menu, UnstyledButton } from '@mantine/core'
import { useDisclosure } from '@mantine/hooks'
import { Link, usePage } from '@inertiajs/react'
import ProfileSettingsModal from '../../components/ProfileSettingsModal'

export default function UserSection() {
  const { current_user } = usePage().props
  const [opened, { open, close }] = useDisclosure(false)

  if (!current_user) return null

  return (
    <>
      <Menu shadow="md" width={220} position="top-start">
        <Menu.Target>
          <UnstyledButton px="sm" py="xs" w="100%">
            <Group gap="sm" wrap="nowrap">
              <Avatar src={current_user.avatar_url} radius="xl" size="sm">
                {current_user.name?.[0]?.toUpperCase()}
              </Avatar>
              <Text size="sm" truncate>{current_user.name}</Text>
            </Group>
          </UnstyledButton>
        </Menu.Target>
        <Menu.Dropdown>
          <Menu.Label>{current_user.name}</Menu.Label>
          {current_user.email && (
            <Menu.Label c="dimmed" fz="xs" style={{ fontWeight: 'normal' }}>
              {current_user.email}
            </Menu.Label>
          )}
          <Menu.Divider />
          <Menu.Item onClick={open}>个人设置</Menu.Item>
          <Menu.Item component={Link} href="/logout" method="delete" as="button">
            退出
          </Menu.Item>
        </Menu.Dropdown>
      </Menu>
      <ProfileSettingsModal opened={opened} onClose={close} />
    </>
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run app/javascript/layouts/sidebar/__tests__/UserSection.test.jsx`
Expected: PASS, 2 tests

- [ ] **Step 5: Commit**

```bash
git add app/javascript/layouts/sidebar/UserSection.jsx app/javascript/layouts/sidebar/__tests__/UserSection.test.jsx
git commit -m "feat(sidebar): add UserSection bottom component (avatar + name + menu)"
```

---

## Task 3: `SidebarNav` component

Renders business items + (admin-only) admin section + `<UserSection />` pinned to bottom. Active state via per-item `match(currentPath)` predicate.

**Files:**
- Create: `app/javascript/layouts/sidebar/SidebarNav.jsx`
- Test: `app/javascript/layouts/sidebar/__tests__/SidebarNav.test.jsx`

- [ ] **Step 1: Write the failing test**

```jsx
// app/javascript/layouts/sidebar/__tests__/SidebarNav.test.jsx
import { render, screen } from '@testing-library/react'
import { MantineProvider } from '@mantine/core'
import { describe, it, expect, vi } from 'vitest'
import SidebarNav from '../SidebarNav'

vi.mock('@inertiajs/react', () => ({
  usePage: () => ({ props: { current_user: { name: '张三', avatar_url: null } } }),
  Link: ({ href, children, ...props }) => <a href={href} {...props}>{children}</a>,
  router: { on: () => () => {} },
}))

vi.mock('../UserSection', () => ({
  default: () => <div data-testid="user-section" />,
}))

function renderNav({ currentPath = '/tours', isAdmin = false } = {}) {
  return render(
    <MantineProvider>
      <SidebarNav currentPath={currentPath} isAdmin={isAdmin} />
    </MantineProvider>,
  )
}

describe('SidebarNav', () => {
  it('renders business item "旅程" for any user', () => {
    renderNav({ isAdmin: false })
    expect(screen.getByText('旅程')).toBeInTheDocument()
  })

  it('hides admin section + label for non-admin users', () => {
    renderNav({ isAdmin: false })
    expect(screen.queryByText('管理')).not.toBeInTheDocument()
    expect(screen.queryByText('概览')).not.toBeInTheDocument()
    expect(screen.queryByText('用户')).not.toBeInTheDocument()
  })

  it('renders admin section for admin users', () => {
    renderNav({ isAdmin: true })
    expect(screen.getByText('管理')).toBeInTheDocument()
    expect(screen.getByText('概览')).toBeInTheDocument()
    expect(screen.getByText('用户')).toBeInTheDocument()
    // Two "旅程" entries: business + admin
    expect(screen.getAllByText('旅程')).toHaveLength(2)
  })

  it('marks business "旅程" active when currentPath starts with /tours', () => {
    renderNav({ currentPath: '/tours/42', isAdmin: false })
    const link = screen.getByText('旅程').closest('a')
    expect(link).toHaveAttribute('data-active', 'true')
  })

  it('marks admin "概览" active when currentPath is exactly /admin', () => {
    renderNav({ currentPath: '/admin', isAdmin: true })
    const link = screen.getByText('概览').closest('a')
    expect(link).toHaveAttribute('data-active', 'true')
  })

  it('marks admin "用户" active when currentPath starts with /admin/users', () => {
    renderNav({ currentPath: '/admin/users/7', isAdmin: true })
    const link = screen.getByText('用户').closest('a')
    expect(link).toHaveAttribute('data-active', 'true')
  })

  it('renders UserSection at bottom', () => {
    renderNav()
    expect(screen.getByTestId('user-section')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run app/javascript/layouts/sidebar/__tests__/SidebarNav.test.jsx`
Expected: FAIL — "Failed to resolve import '../SidebarNav'"

- [ ] **Step 3: Implement the component**

```jsx
// app/javascript/layouts/sidebar/SidebarNav.jsx
import { Stack, NavLink, Text } from '@mantine/core'
import { Link } from '@inertiajs/react'
import {
  IconLayoutDashboard, IconUsers, IconMap,
} from '@tabler/icons-react'
import UserSection from './UserSection'

const BUSINESS_ITEMS = [
  { label: '旅程', href: '/tours', icon: IconMap, match: (p) => p.startsWith('/tours') },
]

const ADMIN_ITEMS = [
  { label: '概览', href: '/admin',       icon: IconLayoutDashboard, match: (p) => p === '/admin' },
  { label: '用户', href: '/admin/users', icon: IconUsers,           match: (p) => p.startsWith('/admin/users') },
  { label: '旅程', href: '/admin/tours', icon: IconMap,             match: (p) => p.startsWith('/admin/tours') },
]

function renderItem(item, currentPath) {
  const active = item.match(currentPath)
  const Icon = item.icon
  return (
    <NavLink
      key={item.href}
      component={Link}
      href={item.href}
      label={item.label}
      leftSection={<Icon size={18} stroke={1.5} />}
      active={active}
      data-active={active || undefined}
    />
  )
}

export default function SidebarNav({ currentPath = '', isAdmin = false }) {
  return (
    <Stack gap={0} h="100%">
      <Stack gap={2} px="xs" pt="xs">
        {BUSINESS_ITEMS.map((item) => renderItem(item, currentPath))}
      </Stack>

      {isAdmin && (
        <Stack gap={2} px="xs">
          <Text size="xs" c="dimmed" tt="uppercase" px="md" pt="md" pb="xs">
            管理
          </Text>
          {ADMIN_ITEMS.map((item) => renderItem(item, currentPath))}
        </Stack>
      )}

      <Stack mt="auto" px={0} pb="xs">
        <UserSection />
      </Stack>
    </Stack>
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run app/javascript/layouts/sidebar/__tests__/SidebarNav.test.jsx`
Expected: PASS, 7 tests

- [ ] **Step 5: Commit**

```bash
git add app/javascript/layouts/sidebar/SidebarNav.jsx app/javascript/layouts/sidebar/__tests__/SidebarNav.test.jsx
git commit -m "feat(sidebar): add SidebarNav with business + admin sections"
```

---

## Task 4: `AppShell` layout

Mantine `AppShell` host with header (toggle + page title) + navbar (`SidebarNav`) + main. Page title from `document.title` via `MutationObserver`.

**Files:**
- Create: `app/javascript/layouts/AppShell.jsx`
- Test: `app/javascript/layouts/__tests__/AppShell.test.jsx`

- [ ] **Step 1: Write the failing test**

```jsx
// app/javascript/layouts/__tests__/AppShell.test.jsx
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MantineProvider } from '@mantine/core'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import AppShell from '../AppShell'

vi.mock('@inertiajs/react', () => ({
  usePage: () => ({
    url: '/tours',
    props: { current_user: { id: 1, name: '张三', is_admin: false, avatar_url: null } },
  }),
  Link: ({ href, children, ...props }) => <a href={href} {...props}>{children}</a>,
  router: { on: () => () => {} },
}))

vi.mock('../../components/ProfileSettingsModal', () => ({
  default: () => null,
}))

beforeEach(() => {
  localStorage.clear()
  document.title = '我的旅程'
})

function renderShell(child = <div data-testid="child">child</div>) {
  return render(
    <MantineProvider>
      <AppShell>{child}</AppShell>
    </MantineProvider>,
  )
}

describe('AppShell', () => {
  it('renders children inside main', () => {
    renderShell()
    expect(screen.getByTestId('child')).toBeInTheDocument()
  })

  it('renders business nav item', () => {
    renderShell()
    expect(screen.getByText('旅程')).toBeInTheDocument()
  })

  it('renders header title from document.title', () => {
    renderShell()
    expect(screen.getByText('我的旅程')).toBeInTheDocument()
  })

  it('toggle button persists collapsed state to localStorage', async () => {
    const user = userEvent.setup()
    renderShell()
    const toggle = screen.getByRole('button', { name: /sidebar/i })
    await user.click(toggle)
    expect(localStorage.getItem('sidebar:collapsed')).toBe('1')
  })
})
```

Note: the toggle button gets `aria-label="toggle sidebar"` in implementation so the test can locate it by accessible name.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run app/javascript/layouts/__tests__/AppShell.test.jsx`
Expected: FAIL — "Failed to resolve import '../AppShell'"

- [ ] **Step 3: Implement the component**

```jsx
// app/javascript/layouts/AppShell.jsx
import { useEffect, useState } from 'react'
import { AppShell as MantineAppShell, Group, ActionIcon, Text } from '@mantine/core'
import { useDisclosure } from '@mantine/hooks'
import { usePage } from '@inertiajs/react'
import {
  IconLayoutSidebarLeftCollapse,
  IconLayoutSidebarLeftExpand,
} from '@tabler/icons-react'
import SidebarNav from './sidebar/SidebarNav'
import { useSidebarCollapsed } from './sidebar/useSidebarCollapsed'

function useDocumentTitle() {
  const [title, setTitle] = useState(() =>
    typeof document !== 'undefined' ? document.title : ''
  )
  useEffect(() => {
    if (typeof document === 'undefined') return
    setTitle(document.title)
    const titleEl = document.querySelector('title')
    if (!titleEl) return
    const observer = new MutationObserver(() => setTitle(document.title))
    observer.observe(titleEl, { childList: true })
    return () => observer.disconnect()
  }, [])
  return title
}

export default function AppShell({ children }) {
  const { url, props } = usePage()
  const isAdmin = !!props.current_user?.is_admin
  const currentPath = url.split('?')[0]
  const title = useDocumentTitle()

  const { collapsed, toggle } = useSidebarCollapsed()
  const [mobileOpened, { toggle: toggleMobile }] = useDisclosure(false)

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
        <Group h="100%" px="md" gap="sm">
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
        </Group>
      </MantineAppShell.Header>

      <MantineAppShell.Navbar p={0}>
        <SidebarNav currentPath={currentPath} isAdmin={isAdmin} />
      </MantineAppShell.Navbar>

      <MantineAppShell.Main>{children}</MantineAppShell.Main>
    </MantineAppShell>
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run app/javascript/layouts/__tests__/AppShell.test.jsx`
Expected: PASS, 4 tests

- [ ] **Step 5: Commit**

```bash
git add app/javascript/layouts/AppShell.jsx app/javascript/layouts/__tests__/AppShell.test.jsx
git commit -m "feat(layout): add unified AppShell (header + sidebar + main)"
```

---

## Task 5: Clean up Admin pages (remove `<AdminShell>`, add `<Head>`)

Each Admin page currently wraps content in `<AdminShell currentPath={...}>`. Remove the wrapper, drop the `currentPath` derivation, and add an Inertia `<Head title="...">` so the new AppShell header reads it.

**Files (each modified independently):**
- Modify: `app/javascript/pages/Admin/Dashboard.jsx`
- Modify: `app/javascript/pages/Admin/UsersIndex.jsx`
- Modify: `app/javascript/pages/Admin/UsersShow.jsx`
- Modify: `app/javascript/pages/Admin/ToursIndex.jsx`
- Modify: `app/javascript/pages/Admin/ToursShow.jsx`

- [ ] **Step 1: Edit `Dashboard.jsx`**

  - Remove `import AdminShell from '../../components/admin/AdminShell'`
  - Add `Head` to existing `@inertiajs/react` import: `import { usePage, router, Head } from '@inertiajs/react'`
  - Replace `<AdminShell currentPath={url.split('?')[0]}>` opening tag and corresponding `</AdminShell>` closing tag with `<>` and `</>`
  - Insert `<Head title="概览" />` as the first child inside the fragment
  - Remove the now-unused `url` destructure (only `props` is used after the change). Recheck — `url` was only feeding `currentPath`; if no other use remains, drop it from `usePage()` destructure.

- [ ] **Step 2: Edit `UsersIndex.jsx`** — same pattern, `<Head title="用户" />`

- [ ] **Step 3: Edit `UsersShow.jsx`** — same pattern, `<Head title={user.name} />` (use the `user` prop the page already receives)

- [ ] **Step 4: Edit `ToursIndex.jsx`** — same pattern, `<Head title="旅程" />`

- [ ] **Step 5: Edit `ToursShow.jsx`** — same pattern, `<Head title={tour.title} />` (use the `tour` prop the page receives)

- [ ] **Step 6: Run JS test suite**

Run: `npm test`
Expected: PASS — note that the OLD `AdminShell.test.jsx` is still present and still passes because `AdminShell.jsx` itself hasn't been deleted yet (Task 7).

- [ ] **Step 7: Commit**

```bash
git add app/javascript/pages/Admin/
git commit -m "refactor(admin): drop AdminShell wrapper from admin pages, add Head titles"
```

---

## Task 6: Switch `inertia.jsx` to AppShell, opt-out `Tour/Show`

After this task, every page is wrapped in the new `AppShell` except `Auth/Login` and `Tour/Show`.

**Files:**
- Modify: `app/javascript/entrypoints/inertia.jsx:13` and `app/javascript/entrypoints/inertia.jsx:48-51`
- Modify: `app/javascript/pages/Tour/Show.jsx` (append opt-out at end of file)

- [ ] **Step 1: Edit `inertia.jsx`**

Replace the `import AppLayout` line and the `resolve` block:

Find:
```jsx
import AppLayout from '../layouts/AppLayout'
```
Replace with:
```jsx
import AppShell from '../layouts/AppShell'
```

Find:
```jsx
    const page = pages[`../pages/${name}.jsx`]
    const isAdminPage = name.startsWith('Admin/')
    if (!page.default.layout && !isAdminPage) {
      page.default.layout = (page) => <AppLayout>{page}</AppLayout>
    }
    return page
```
Replace with:
```jsx
    const page = pages[`../pages/${name}.jsx`]
    if (!page.default.layout) {
      page.default.layout = (page) => <AppShell>{page}</AppShell>
    }
    return page
```

- [ ] **Step 2: Append opt-out to `Tour/Show.jsx`**

At end of file, after the default `export default function Show(...)` declaration, add:

```jsx
Show.layout = (page) => page
```

(Place this after `Show` is defined as the default-exported function, mirroring [`Login.jsx:77`](../../app/javascript/pages/Auth/Login.jsx).)

- [ ] **Step 3: Run JS test suite**

Run: `npm test`
Expected: PASS — all existing tests + 4 new AppShell + 7 SidebarNav + 2 UserSection + 3 useSidebarCollapsed + the still-present AdminShell tests.

- [ ] **Step 4: Run RSpec request specs**

Run: `mise exec -- bundle exec rspec spec/requests`
Expected: PASS — request specs assert HTTP status / response shape, unaffected by the React layout swap, but worth confirming nothing rendered server-side broke.

- [ ] **Step 5: Commit**

```bash
git add app/javascript/entrypoints/inertia.jsx app/javascript/pages/Tour/Show.jsx
git commit -m "refactor(layout): wrap all pages in AppShell, opt out planner"
```

---

## Task 7: Delete obsolete files

Now that nothing imports them, remove the old shells and their tests.

**Files:**
- Delete: `app/javascript/layouts/AppLayout.jsx`
- Delete: `app/javascript/components/admin/AdminShell.jsx`
- Delete: `app/javascript/components/admin/__tests__/AdminShell.test.jsx`

- [ ] **Step 1: Verify no remaining imports**

Run:
```bash
grep -rn "AppLayout\|AdminShell" app/javascript --include="*.jsx" --include="*.js"
```
Expected output: empty (no references remain).

If anything still references them, stop and fix the reference before deleting.

- [ ] **Step 2: Delete the files**

```bash
rm app/javascript/layouts/AppLayout.jsx
rm app/javascript/components/admin/AdminShell.jsx
rm app/javascript/components/admin/__tests__/AdminShell.test.jsx
```

- [ ] **Step 3: Check if `app/javascript/components/admin/` is now empty**

Run: `ls app/javascript/components/admin/__tests__/ && ls app/javascript/components/admin/`
If both are empty, also remove the empty directories:
```bash
rmdir app/javascript/components/admin/__tests__
rmdir app/javascript/components/admin
```

- [ ] **Step 4: Run full JS test suite**

Run: `npm test`
Expected: PASS — total test count is now (old total − 5 AdminShell tests + 16 new tests).

- [ ] **Step 5: Run lint to catch dead imports**

Run: `bin/rubocop -f github` and (no JS linter is configured per [`package.json`](../../package.json), so just confirm `npm test` passes).

- [ ] **Step 6: Commit**

```bash
git add -A app/javascript/
git commit -m "chore(layout): remove obsolete AppLayout and AdminShell"
```

---

## Task 8: Manual QA in browser

The dev-server must be the worktree-isolated one per [`CLAUDE.md`](../../CLAUDE.md) gotchas section.

- [ ] **Step 1: Start the worktree dev server**

Run: `bin/worktree-dev up`
Expected: Rails on a 9100+ port, Vite on a 3100+ port. Note the URLs.

- [ ] **Step 2: QA as non-admin user**

Log in as a regular (non-admin) user. Verify in `http://localhost:<rails-port>/tours`:
- Sidebar visible on the left, default expanded.
- Sidebar shows only the business item "旅程" + bottom user area.
- No "管理" section label, no admin items.
- Header shows "我的旅程" (page title from `<Head>`).
- Click the toggle icon in header → sidebar disappears, icon flips to expand variant.
- Reload the page → sidebar stays collapsed (localStorage works).
- Click toggle again → sidebar re-appears.
- Click the avatar/name at sidebar bottom → menu shows 个人设置 and 退出 (no 管理后台).

- [ ] **Step 3: QA as admin user**

Log in as an admin user. Verify:
- Sidebar shows business "旅程" + "管理" label + 概览 / 用户 / 旅程 admin items.
- Click each admin link, header title updates (概览 / 用户 / 旅程).
- Active highlight follows the current path.
- Visit `/tours/<id>` (planner) → sidebar and header are completely absent (no chrome).
- Browser back to `/tours` → sidebar and header reappear.

- [ ] **Step 4: QA mobile layout**

In browser devtools, switch to a narrow viewport (< 768px). Verify:
- Sidebar is hidden by default.
- Toggle button in header is now the mobile variant; clicking opens sidebar as overlay (does not push content).
- Tap outside or toggle again to close.

- [ ] **Step 5: Stop dev server**

Run: `bin/worktree-dev down`

- [ ] **Step 6: Final commit (only if Manual QA exposed any fixes)**

If QA exposed any bugs and you fixed them, commit the fix here. Otherwise skip.

---

## Done criteria

- All Vitest tests pass (`npm test`).
- All RSpec tests pass (`mise exec -- bundle exec rspec`).
- `bin/rubocop -f github` clean.
- `bin/brakeman --no-pager` clean.
- Manual QA in §Task 8 all green.
- `grep -rn "AppLayout\|AdminShell\|返回前台" app/javascript` returns empty.
