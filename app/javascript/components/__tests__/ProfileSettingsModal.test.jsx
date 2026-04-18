import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MantineProvider } from '@mantine/core'
import { vi } from 'vitest'
import ProfileSettingsModal from '../ProfileSettingsModal'

if (typeof URL.createObjectURL === 'undefined') {
  URL.createObjectURL = vi.fn(() => 'blob:mock')
}

// Keep the real useForm (it's just useState underneath). Only mock usePage
// (component reads current_user from it) and router (component calls
// router.delete for avatar removal).
vi.mock('@inertiajs/react', async () => {
  const actual = await vi.importActual('@inertiajs/react')
  return {
    ...actual,
    usePage: () => ({
      props: {
        current_user: {
          id: 1,
          name: 'skipmaple',
          email: 'skip@example.com',
          avatar_url: null,
          has_custom_avatar: false,
        },
      },
    }),
    router: { delete: vi.fn() },
  }
})

function renderModal(overrides = {}) {
  return render(
    <MantineProvider>
      <ProfileSettingsModal opened onClose={() => {}} {...overrides} />
    </MantineProvider>
  )
}

describe('ProfileSettingsModal', () => {
  test('disables save when the nickname is empty', async () => {
    renderModal()
    const input = screen.getByLabelText(/昵称/)
    await userEvent.clear(input)
    expect(screen.getByRole('button', { name: '保存' })).toBeDisabled()
  })

  test('disables save and shows error when nickname has disallowed chars', async () => {
    renderModal()
    const input = screen.getByLabelText(/昵称/)
    await userEvent.clear(input)
    await userEvent.type(input, 'bad name')
    expect(screen.getByRole('button', { name: '保存' })).toBeDisabled()
    expect(screen.getByText('只能包含字母、数字或中文')).toBeInTheDocument()
  })

  test('hides "使用默认头像" when has_custom_avatar is false', () => {
    renderModal()
    expect(screen.queryByText('使用默认头像')).not.toBeInTheDocument()
  })
})
