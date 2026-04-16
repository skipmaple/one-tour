import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MantineProvider } from '@mantine/core'
import { ModalsProvider } from '@mantine/modals'
import { Notifications } from '@mantine/notifications'
import { vi } from 'vitest'
import MembershipDrawer from '../MembershipDrawer'

vi.mock('@inertiajs/react', () => ({
  router: {
    post: vi.fn((url, data, opts) => opts?.onSuccess?.()),
    patch: vi.fn((url, data, opts) => opts?.onSuccess?.()),
    delete: vi.fn((url, opts) => opts?.onSuccess?.()),
  },
  usePage: () => ({ props: { current_user: { id: 1, email: 'author@test.com' } } }),
}))

const tour = { id: 42, title: 'Test' }
const author = { user_id: 1, email: 'author@test.com' }
const members = [
  { id: 10, user_id: 2, email: 'editor@test.com', role: 'editor' },
  { id: 11, user_id: 3, email: 'reader@test.com', role: 'reader' },
]

function renderDrawer(props = {}) {
  return render(
    <MantineProvider>
      <ModalsProvider>
        <Notifications />
        <MembershipDrawer
          opened={true}
          onClose={vi.fn()}
          tour={tour}
          members={members}
          author={author}
          {...props}
        />
      </ModalsProvider>
    </MantineProvider>
  )
}

test('renders author row with badge and member rows', () => {
  renderDrawer()
  expect(screen.getByText('author@test.com')).toBeInTheDocument()
  expect(screen.getByText('当前成员')).toBeInTheDocument()
  expect(screen.getByText('editor@test.com')).toBeInTheDocument()
  expect(screen.getByText('reader@test.com')).toBeInTheDocument()
})

test('shows invite section for author', () => {
  renderDrawer()
  expect(screen.getByPlaceholderText('email@example.com')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: '邀请' })).not.toBeDisabled()
})

test('shows remove button for members when user is author', () => {
  renderDrawer()
  const removeButtons = screen.getAllByRole('button', { name: '移除' })
  expect(removeButtons.length).toBe(2)
})

test('renders permission matrix in accordion', () => {
  renderDrawer()
  expect(screen.getByText('权限矩阵')).toBeInTheDocument()
})
