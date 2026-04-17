import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MantineProvider } from '@mantine/core'
import { Notifications } from '@mantine/notifications'
import { vi } from 'vitest'
import AcknowledgeModal from '../AcknowledgeModal'

vi.mock('@inertiajs/react', () => ({
  router: {
    post: vi.fn((url, data, opts) => opts?.onSuccess?.()),
  },
}))

const violation = { level: 'hard', rule: 'max_daily_driving_minutes', scope: { day_id: 3 }, message: 'D3 驾驶超时' }

function renderModal(props = {}) {
  return render(
    <MantineProvider>
      <Notifications />
      <AcknowledgeModal violation={violation} tourId={1} onClose={vi.fn()} {...props} />
    </MantineProvider>
  )
}

test('renders nothing when violation is null', () => {
  render(
    <MantineProvider><AcknowledgeModal violation={null} tourId={1} onClose={() => {}} /></MantineProvider>
  )
  expect(screen.queryByText('承认此违反')).not.toBeInTheDocument()
  expect(screen.queryByRole('button', { name: '我确认承认' })).not.toBeInTheDocument()
})

test('confirm button is disabled when reason is too short', () => {
  renderModal()
  const btn = screen.getByRole('button', { name: '我确认承认' })
  expect(btn).toBeDisabled()
})

test('confirm button enables when reason reaches 10 chars', () => {
  renderModal()
  fireEvent.change(screen.getByLabelText(/承认原因/), { target: { value: '独库公路是本程核心无法压缩' } })
  expect(screen.getByRole('button', { name: '我确认承认' })).not.toBeDisabled()
})

test('submits override via router.post', async () => {
  const { router } = await import('@inertiajs/react')
  const onClose = vi.fn()
  renderModal({ onClose })
  fireEvent.change(screen.getByLabelText(/承认原因/), { target: { value: '独库公路是本程核心无法压缩' } })
  fireEvent.click(screen.getByRole('button', { name: '我确认承认' }))
  await waitFor(() => {
    expect(router.post).toHaveBeenCalledWith(
      '/tours/1/overrides',
      expect.objectContaining({ rule: 'max_daily_driving_minutes', reason: '独库公路是本程核心无法压缩' }),
      expect.anything()
    )
    expect(onClose).toHaveBeenCalled()
  })
})
