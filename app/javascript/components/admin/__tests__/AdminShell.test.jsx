import { render, screen } from '@testing-library/react'
import { MantineProvider } from '@mantine/core'
import { describe, it, expect, vi } from 'vitest'
import AdminShell from '../AdminShell'

vi.mock('@inertiajs/react', () => ({
  Link: ({ href, children, ...props }) => <a href={href} {...props}>{children}</a>,
}))

function renderWithShell(ui, { currentPath = '/admin' } = {}) {
  return render(
    <MantineProvider>
      <AdminShell currentPath={currentPath}>
        {ui}
      </AdminShell>
    </MantineProvider>,
  )
}

describe('AdminShell', () => {
  it('renders all three nav items', () => {
    renderWithShell(<div>child</div>)
    expect(screen.getByText('Dashboard')).toBeInTheDocument()
    expect(screen.getByText('用户')).toBeInTheDocument()
    expect(screen.getByText('Tour')).toBeInTheDocument()
  })

  it('renders children', () => {
    renderWithShell(<div data-testid="child">hello</div>)
    expect(screen.getByTestId('child')).toBeInTheDocument()
  })

  it('renders "Admin" badge in header', () => {
    renderWithShell(<div />)
    expect(screen.getByText('Admin')).toBeInTheDocument()
  })

  it('highlights Dashboard nav when currentPath is /admin', () => {
    renderWithShell(<div />, { currentPath: '/admin' })
    const dashLink = screen.getByText('Dashboard').closest('a')
    expect(dashLink).toHaveAttribute('data-active', 'true')
  })

  it('highlights Users nav when currentPath starts with /admin/users', () => {
    renderWithShell(<div />, { currentPath: '/admin/users/42' })
    const usersLink = screen.getByText('用户').closest('a')
    expect(usersLink).toHaveAttribute('data-active', 'true')
  })
})
