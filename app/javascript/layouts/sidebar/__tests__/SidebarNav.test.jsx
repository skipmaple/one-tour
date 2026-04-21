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
  it('renders business item "全部旅程" for any user', () => {
    renderNav({ isAdmin: false })
    expect(screen.getByText('全部旅程')).toBeInTheDocument()
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
    // Business nav is "全部旅程"; admin still has "旅程" as its entry — distinct labels.
    expect(screen.getByText('全部旅程')).toBeInTheDocument()
    expect(screen.getByText('旅程')).toBeInTheDocument()
  })

  it('marks business "全部旅程" active when currentPath starts with /tours', () => {
    renderNav({ currentPath: '/tours/42', isAdmin: false })
    const link = screen.getByText('全部旅程').closest('a')
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
