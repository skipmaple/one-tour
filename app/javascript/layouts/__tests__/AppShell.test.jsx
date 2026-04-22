import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useMemo } from 'react'
import { MantineProvider } from '@mantine/core'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import AppShell from '../AppShell'
import { useInjectHeaderRight } from '../HeaderSlot'

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
    expect(screen.getByText('全部旅程')).toBeInTheDocument()
  })

  it('renders header title from document.title', () => {
    renderShell()
    expect(screen.getByText('我的旅程')).toBeInTheDocument()
  })

  it('toggle button persists collapsed state to localStorage', async () => {
    const user = userEvent.setup()
    renderShell()
    const toggle = screen.getAllByRole('button', { name: /sidebar/i })[0]
    await user.click(toggle)
    expect(localStorage.getItem('sidebar:collapsed')).toBe('1')
  })

  it('updates header title when document.title changes after mount', async () => {
    renderShell()
    expect(screen.getByText('我的旅程')).toBeInTheDocument()
    act(() => {
      document.title = '概览'
    })
    expect(await screen.findByText('概览')).toBeInTheDocument()
  })

  it('strips " · 路书" site-name suffix from document.title', () => {
    document.title = '概览 · 路书'
    renderShell()
    expect(screen.getByText('概览')).toBeInTheDocument()
    expect(screen.queryByText('概览 · 路书')).not.toBeInTheDocument()
  })

  // Regression: Inertia replaces the <title> element wholesale (rather than
  // mutating its text node). An observer attached to the original <title>
  // element would not fire on subsequent navigations. Observing document.head
  // with subtree:true is what catches both replacement and text mutation.
  it('updates header title when <title> element is replaced (Inertia behavior)', async () => {
    renderShell()
    expect(screen.getByText('我的旅程')).toBeInTheDocument()
    act(() => {
      document.head.querySelector('title')?.remove()
      const next = document.createElement('title')
      next.textContent = '用户'
      document.head.appendChild(next)
    })
    expect(await screen.findByText('用户')).toBeInTheDocument()
  })

  it('renders content injected by useInjectHeaderRight', () => {
    // Consumers of useInjectHeaderRight must memoize the node — passing a fresh
    // JSX element every render would create a new reference and make the
    // hook's useEffect re-fire infinitely (setRight → re-render → new node →
    // setRight). Task 8 uses useMemo; the test mirrors that contract.
    function Injector() {
      const node = useMemo(() => <span data-testid="right-slot">buttons</span>, [])
      useInjectHeaderRight(node)
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
})
