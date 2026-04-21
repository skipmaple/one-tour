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
