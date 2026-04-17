import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MantineProvider } from '@mantine/core'
import { ModalsProvider } from '@mantine/modals'
import { DatesProvider } from '@mantine/dates'
import { vi, beforeEach } from 'vitest'
import DayEditModal from '../DayEditModal'

vi.mock('@inertiajs/react', () => ({
  router: {
    patch: vi.fn((url, data, opts) => opts?.onSuccess?.()),
    delete: vi.fn((url, opts) => opts?.onSuccess?.()),
  },
}))

const mockUndoStack = { push: vi.fn(), executeTop: vi.fn(), stack: [] }
vi.mock('../../../hooks/useUndoStack', () => ({
  useUndoStack: () => mockUndoStack,
  UndoStackProvider: ({ children }) => children,
  UNDO_CAP: 10,
}))

beforeEach(() => {
  mockUndoStack.push.mockClear()
})

function renderModal(props = {}) {
  const defaults = {
    day: { id: 10, day_index: 3, theme: '抵达伊宁', date: '2026-06-10', buffer_day: false },
    tourId: 1,
    onClose: vi.fn(),
  }
  return render(
    <MantineProvider>
      <DatesProvider settings={{ locale: 'zh-cn' }}>
        <ModalsProvider>
          <DayEditModal {...defaults} {...props} />
        </ModalsProvider>
      </DatesProvider>
    </MantineProvider>
  )
}

test('renders nothing when day is null', () => {
  const { container } = render(
    <MantineProvider>
      <DatesProvider settings={{ locale: 'zh-cn' }}>
        <ModalsProvider>
          <DayEditModal day={null} tourId={1} onClose={() => {}} />
        </ModalsProvider>
      </DatesProvider>
    </MantineProvider>
  )
  expect(container.querySelector('.mantine-Modal-content')).not.toBeInTheDocument()
})

test('renders fields populated from day prop', () => {
  renderModal()
  expect(screen.getByText('编辑 D3')).toBeInTheDocument()
  expect(screen.getByDisplayValue('抵达伊宁')).toBeInTheDocument()
})

test('saves changes via router.patch', async () => {
  const { router } = await import('@inertiajs/react')
  const onClose = vi.fn()
  renderModal({ onClose })
  fireEvent.click(screen.getByRole('button', { name: '保存' }))
  await waitFor(() => {
    expect(router.patch).toHaveBeenCalledWith(
      '/tours/1/days/10',
      expect.objectContaining({ day: expect.objectContaining({ theme: '抵达伊宁' }) }),
      expect.anything()
    )
    expect(onClose).toHaveBeenCalled()
  })
})

test('toggles buffer_day checkbox', () => {
  renderModal()
  const cb = screen.getByLabelText(/机动日/)
  expect(cb).not.toBeChecked()
  fireEvent.click(cb)
  expect(cb).toBeChecked()
})

test('save pushes undo entry with prev attrs', async () => {
  const { router } = await import('@inertiajs/react')
  router.patch.mockImplementation((url, data, opts) => opts?.onSuccess?.())
  const onClose = vi.fn()
  renderModal({ onClose })
  fireEvent.click(screen.getByRole('button', { name: '保存' }))
  await waitFor(() => {
    expect(mockUndoStack.push).toHaveBeenCalledWith(
      expect.objectContaining({ label: expect.stringContaining('D3') })
    )
  })
})
