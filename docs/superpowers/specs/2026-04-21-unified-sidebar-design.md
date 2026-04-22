# Unified Sidebar — Design

**Date:** 2026-04-21
**Status:** Spec, ready for review

## Goal

Eliminate the "前台 / 后台" (frontend / admin-backend) shell split. Replace the two layouts (`AppLayout`, `AdminShell`) with one unified `AppShell` that hosts a single collapsible sidebar containing business navigation, admin navigation (admin users only), and a bottom user area. Login and the Tour planner page opt out and render with no chrome.

## Non-Goals

- Changing any business or admin page content. Only the surrounding shell changes.
- Adding new nav entries beyond what already exists.
- Backend changes. `current_user.is_admin` is already exposed via `usePage().props` and is reused as-is.
- Per-user sidebar preferences server-side. Collapse state stays in `localStorage`.

## Current State

- [`app/javascript/layouts/AppLayout.jsx`](../../../app/javascript/layouts/AppLayout.jsx) — header-only shell. Logo "路书" left, avatar dropdown right (个人设置 / 管理后台 / 退出).
- [`app/javascript/components/admin/AdminShell.jsx`](../../../app/javascript/components/admin/AdminShell.jsx) — header + left navbar (概览 / 用户 / 旅程). Right side has "返回前台" link.
- [`app/javascript/entrypoints/inertia.jsx`](../../../app/javascript/entrypoints/inertia.jsx) auto-wraps non-`Admin/*` pages with `AppLayout`. Admin pages manually wrap with `AdminShell`.
- `Tour/Show` (planner) is a multi-panel workspace (ChatPanel, Map, Backlog, DayPanel) currently wrapped in `AppLayout`.
- `Login` opts out via `Login.layout = (page) => page`.

## Design

### File structure

**New**
- `app/javascript/layouts/AppShell.jsx` — the single shell.
- `app/javascript/layouts/sidebar/SidebarNav.jsx` — sidebar body (business + admin sections + user area).
- `app/javascript/layouts/sidebar/UserSection.jsx` — bottom avatar + name + Mantine Menu (个人设置, 退出).
- `app/javascript/layouts/sidebar/useSidebarCollapsed.js` — localStorage-backed collapse state hook.

**Modified**
- `app/javascript/entrypoints/inertia.jsx` — drop the `isAdminPage` skip; wrap every page (with no opt-out flag) in `AppShell`.
- `app/javascript/pages/Tour/Show.jsx` — append `Show.layout = (page) => page` to opt out completely.
- `app/javascript/pages/Admin/{Dashboard,UsersIndex,UsersShow,ToursIndex,ToursShow}.jsx` — remove `import AdminShell`, remove `<AdminShell>` wrapper and `currentPath` prop derivation, add `<Head>` per page so the new header title renders. Concrete titles: Dashboard `概览`, UsersIndex `用户`, UsersShow `{user.name}`, ToursIndex `旅程`, ToursShow `{tour.title}`.

**Deleted**
- `app/javascript/layouts/AppLayout.jsx`
- `app/javascript/components/admin/AdminShell.jsx`
- `app/javascript/components/admin/__tests__/AdminShell.test.jsx` (and any other AdminShell-targeted test file under that `__tests__` dir).

### Shell layout

```
┌─────────────────────────────────────────────────┐
│ Header (h=56)                                   │
│  [⊟ 切换按钮]  当前页面标题                       │
├──────────┬──────────────────────────────────────┤
│ Sidebar  │                                      │
│ (240px)  │           Main 内容                  │
│  ...     │                                      │
└──────────┴──────────────────────────────────────┘
```

- Built on Mantine `AppShell` with `header={{ height: 56 }}` and `navbar={{ width: 240, breakpoint: 'sm', collapsed: { desktop, mobile } }}`.
- Header content: left = collapse toggle ActionIcon; middle/left-after = current page title (read from `document.title`, see below); right = empty.
- No logo anywhere (explicit user requirement).

### Page title

Each page already (or should) emit `<Head title="..." />` via Inertia. AppShell reads `document.title` on mount and on Inertia navigation events to render the header title. Strip a trailing `" · 路书"` site-name suffix if present.

Admin pages currently lack `<Head>`; add one per page during the cleanup so the header title is non-empty there.

### Sidebar internal structure

```
┌──────────────────────┐
│  📍 旅程              │   ← Business section (no label)
│                      │
│ 管理                 │   ← Admin section label, admin users only
│  📊 概览              │
│  👥 用户              │
│  🗺  旅程             │
│                      │
│ (mt="auto" 推到底)    │
│                      │
│ 👤 张三               │   ← UserSection: avatar + name + Menu
└──────────────────────┘
```

**Nav data** (constants inside `SidebarNav.jsx`):

```jsx
const BUSINESS_ITEMS = [
  { label: '旅程', href: '/tours', icon: IconMap, match: (p) => p.startsWith('/tours') },
]

const ADMIN_ITEMS = [
  { label: '概览', href: '/admin',       icon: IconLayoutDashboard, match: (p) => p === '/admin' },
  { label: '用户', href: '/admin/users', icon: IconUsers,           match: (p) => p.startsWith('/admin/users') },
  { label: '旅程', href: '/admin/tours', icon: IconMap,             match: (p) => p.startsWith('/admin/tours') },
]
```

Rendering rules:
- Business section: render unconditionally, no section label.
- Admin section: render the "管理" label + the three items only when `current_user.is_admin === true`. Non-admin users see only the business section + bottom user area.
- No `Divider` above the user area; rely on `mt="auto"` spacing.
- Section label style: `<Text size="xs" c="dimmed" tt="uppercase" px="md" pt="md" pb="xs">管理</Text>`.
- Active state: each item's `match(currentPath)` against `usePage().url.split('?')[0]`. Pass to Mantine `NavLink` as `active={...}`.
- Icons: `@tabler/icons-react`, all chrome icons must come from this library per project icon convention.

### User section (bottom)

Reuse the existing avatar + Mantine `Menu` from [`AppLayout.jsx:21-43`](../../../app/javascript/layouts/AppLayout.jsx) with two changes:
1. Layout becomes a horizontal row: `Avatar` + `Text` (name), wrapped in the `Menu.Target`.
2. Drop the "管理后台" menu item — the admin section in the sidebar is now the canonical entry, so duplicating it here would be noise.

Final menu items: `个人设置` (opens `ProfileSettingsModal`) · `退出` (DELETE `/logout`).

`ProfileSettingsModal` open state lives in `UserSection.jsx` via `useDisclosure`, same as today.

### Collapse behavior

- **Desktop (≥ sm)**: sidebar default expanded, occupies layout (pushes main content). When collapsed it disappears entirely (`collapsed.desktop = true`); the toggle icon in the header switches to "expand" state.
- **Mobile (< sm)**: sidebar always renders as overlay (`navbar.breakpoint = 'sm'` makes Mantine treat it as overlay below the breakpoint). Default closed; toggle opens overlay above content.
- **Persistence**: desktop state writes to `localStorage` key `sidebar:collapsed` (values `'1'` / `'0'`). Mobile overlay state is session-only (Mantine `useDisclosure`).

```js
// useSidebarCollapsed.js
export function useSidebarCollapsed() {
  const [collapsed, setCollapsed] = useState(() => {
    if (typeof window === 'undefined') return false
    return localStorage.getItem('sidebar:collapsed') === '1'
  })
  const toggle = useCallback(() => {
    setCollapsed(prev => {
      const next = !prev
      localStorage.setItem('sidebar:collapsed', next ? '1' : '0')
      return next
    })
  }, [])
  return { collapsed, toggle }
}
```

### Toggle button icons

Two distinct Tabler icons reflecting state:
- Sidebar visible → `IconLayoutSidebarLeftCollapse` (click to hide)
- Sidebar hidden → `IconLayoutSidebarLeftExpand` (click to reveal)

Render in header as `Mantine ActionIcon` (`variant="subtle"`, size 20). Two instances:
- One bound to desktop `collapsed` state, `visibleFrom="sm"`.
- One bound to mobile `mobileOpened` state, `hiddenFrom="sm"`.

### Page opt-out

Two pages render with no shell at all (no header, no sidebar):
- `Login` — already opts out via `Login.layout = (page) => page`. Keep.
- `Tour/Show` (planner) — append the same line. Rationale: heavy multi-panel workspace; sidebar would steal layout space and the page already has its own internal navigation (TourTabs).

The Tour planner has no escape hatch back to navigation while opted out — users return to the tour list via browser back or by typing the URL. Acceptable because the planner has its own `TourTabs` navigation among tour-internal views, and entering the planner is always preceded by a list-page click that the user can navigate back from.

### inertia.jsx

```jsx
createInertiaApp({
  resolve: name => {
    const pages = import.meta.glob(
      ['../pages/**/*.jsx', '!../pages/**/__tests__/**', '!../pages/**/*.test.jsx'],
      { eager: true }
    )
    const page = pages[`../pages/${name}.jsx`]
    if (!page.default.layout) {
      page.default.layout = (page) => <AppShell>{page}</AppShell>
    }
    return page
  },
  // ...
})
```

The `isAdminPage` branch goes away. Pages opt out by setting `.layout = (page) => page` themselves (Login, Tour/Show).

## Component contracts

### `AppShell({ children })`

- Reads `current_user` from `usePage().props` for admin gating in sidebar.
- Reads `document.title` for header title (subscribes to Inertia navigation events to refresh).
- Renders Mantine `AppShell` with header + navbar + main; navbar collapsed bindings come from `useSidebarCollapsed()` (desktop) and a local `useDisclosure()` (mobile).
- Pure presentational; no data fetching.

### `SidebarNav({ currentPath, isAdmin })`

- Renders business items, optionally admin section (label + items), and `<UserSection />` pinned to bottom via `mt="auto"` on a `Stack` parent.
- `currentPath` is computed once in `AppShell` from `usePage().url.split('?')[0]` and passed down.

### `UserSection()`

- Reads `current_user` from `usePage().props`.
- Owns `ProfileSettingsModal` open state.
- Renders avatar + name in a `Menu.Target`; menu items are 个人设置 and 退出.

### `useSidebarCollapsed()`

- Returns `{ collapsed: boolean, toggle: () => void }`.
- Persists to `localStorage['sidebar:collapsed']`.

## Testing

Replace AdminShell tests with AppShell tests covering:

1. Renders business section ("旅程" link) regardless of user role.
2. Renders admin section (label "管理" + three items) only when `current_user.is_admin === true`.
3. Active state matches the current path via the items' `match` predicate.
4. Toggle button switches `localStorage['sidebar:collapsed']` between `'1'` and `'0'` and triggers `collapsed.desktop` flip.
5. `UserSection` menu shows 个人设置 and 退出 (and **not** 管理后台).
6. Header title reflects `<Head title="...">` from the wrapped page.

No page-level snapshot tests exist for Admin pages today (`pages/Admin/__tests__/` does not exist), so no test updates beyond removing `AdminShell.test.jsx`.

Tour planner: add an assertion (or update existing one) that `Show.layout` is the identity function so future refactors don't accidentally re-wrap it.

## Migration sequence

1. Land `AppShell` + `SidebarNav` + `UserSection` + `useSidebarCollapsed` (new files).
2. Switch `inertia.jsx` to wrap everything; opt out `Tour/Show`.
3. Remove `<AdminShell>` from the five admin pages, add `<Head>` to each.
4. Delete `AppLayout.jsx`, `AdminShell.jsx`, AdminShell tests.
5. Run Vitest + RSpec request specs (admin routes still need to render). Manual QA: log in as admin and non-admin, verify sidebar visibility differs; toggle collapse and reload; visit planner and confirm no chrome.

## Risks & open questions

- **`document.title` read timing**: AppShell renders before child page's `<Head>` mounts. Need to subscribe to Inertia's `router.on('navigate')` event (or use `useEffect` with no deps + a `MutationObserver` on `<title>`) to keep header title fresh. Decide during implementation.
- **Admin page snapshot tests**: any existing snapshot tests under `pages/Admin/__tests__/` need regenerating once the wrapper changes.
- **Planner left scrollbar**: with no header, `Tour/Show` becomes the document root for chrome. Confirm no existing CSS assumed an outer `AppShell.Main` padding.
