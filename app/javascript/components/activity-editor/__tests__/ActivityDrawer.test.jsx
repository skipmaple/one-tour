import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MantineProvider } from '@mantine/core'
import { ModalsProvider } from '@mantine/modals'
import { vi, beforeEach } from 'vitest'
import ActivityDrawer from '../ActivityDrawer'

// Mock Inertia router
vi.mock('@inertiajs/react', () => ({
  router: {
    post: vi.fn((url, data, opts) => opts?.onSuccess?.()),
    patch: vi.fn((url, data, opts) => opts?.onSuccess?.()),
    delete: vi.fn((url, opts) => opts?.onSuccess?.()),
    reload: vi.fn(),
  },
}))

const mockUndoStack = { push: vi.fn(), executeTop: vi.fn(), stack: [] }
vi.mock('../../../hooks/useUndoStack', () => ({
  useUndoStack: () => mockUndoStack,
  UndoStackProvider: ({ children }) => children,
  UNDO_CAP: 10,
}))

// Mock fetch for POI search and activity create/delete
global.fetch = vi.fn()

beforeEach(async () => {
  const { router } = await import('@inertiajs/react')
  router.post.mockClear()
  router.patch.mockClear()
  router.delete.mockClear()
  router.reload.mockClear()
  mockUndoStack.push.mockClear()
  global.fetch.mockReset()
})

function renderDrawer(props = {}) {
  const defaults = {
    tourId: 1,
    opened: true,
    onClose: vi.fn(),
    mode: 'create',
    activity: null,
    targetDayId: null,
  }
  return render(
    <MantineProvider>
      <ModalsProvider>
        <ActivityDrawer {...defaults} {...props} />
      </ModalsProvider>
    </MantineProvider>
  )
}

test('renders create mode with empty form', () => {
  renderDrawer()
  expect(screen.getByText('新建 Activity')).toBeInTheDocument()
  expect(screen.getByLabelText('名称', { exact: false })).toHaveValue('')
  expect(screen.getByRole('button', { name: '保存' })).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: '删除' })).not.toBeInTheDocument()
})

test('renders edit mode with populated form', () => {
  renderDrawer({
    mode: 'edit',
    activity: {
      id: 42,
      name: '赛里木湖',
      kind: 'scenic',
      citizen_level: 'tier_one',
      day_id: 5,
      details: { altitude: 2073 },
    },
  })
  expect(screen.getByText('编辑 Activity')).toBeInTheDocument()
  expect(screen.getByLabelText('名称', { exact: false })).toHaveValue('赛里木湖')
  expect(screen.getByRole('button', { name: '删除' })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: '移回 Backlog' })).toBeInTheDocument()
})

test('validates name is required on save', async () => {
  renderDrawer()
  fireEvent.click(screen.getByRole('button', { name: '保存' }))
  await waitFor(() => {
    expect(screen.getByText('名称不能为空')).toBeInTheDocument()
  })
})

test('calls fetch for backlog create (no targetDayId)', async () => {
  const { router } = await import('@inertiajs/react')
  const onClose = vi.fn()
  global.fetch.mockResolvedValueOnce({
    ok: true,
    json: () => Promise.resolve({ id: 999, position: 1 })
  })
  renderDrawer({ onClose })
  fireEvent.change(screen.getByLabelText('名称', { exact: false }), { target: { value: '测试景点' } })
  fireEvent.click(screen.getByRole('button', { name: '保存' }))
  await waitFor(() => {
    expect(global.fetch).toHaveBeenCalledWith(
      '/tours/1/backlog_activities',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ 'Content-Type': 'application/json' })
      })
    )
    expect(router.reload).toHaveBeenCalled()
    expect(onClose).toHaveBeenCalled()
    expect(mockUndoStack.push).toHaveBeenCalledWith(
      expect.objectContaining({ label: expect.stringContaining('测试景点') })
    )
  })
})

test('calls fetch for day create (with targetDayId)', async () => {
  const { router } = await import('@inertiajs/react')
  global.fetch.mockResolvedValueOnce({
    ok: true,
    json: () => Promise.resolve({ id: 888, position: 1 })
  })
  renderDrawer({ targetDayId: 5 })
  fireEvent.change(screen.getByLabelText('名称', { exact: false }), { target: { value: '午餐' } })
  fireEvent.click(screen.getByRole('button', { name: '保存' }))
  await waitFor(() => {
    expect(global.fetch).toHaveBeenCalledWith(
      '/tours/1/days/5/activities',
      expect.objectContaining({ method: 'POST' })
    )
    expect(router.reload).toHaveBeenCalled()
  })
})

test('update path pushes undo entry on save success', async () => {
  const { router } = await import('@inertiajs/react')
  router.patch.mockImplementation((url, data, opts) => opts?.onSuccess?.())
  const onClose = vi.fn()
  renderDrawer({
    mode: 'edit',
    activity: { id: 42, name: 'X', kind: 'scenic', citizen_level: 'tier_one', day_id: 5, details: {} },
    onClose,
  })
  fireEvent.change(screen.getByLabelText('名称', { exact: false }), { target: { value: 'X 改' } })
  fireEvent.click(screen.getByRole('button', { name: '保存' }))
  await waitFor(() => {
    expect(mockUndoStack.push).toHaveBeenCalledWith(
      expect.objectContaining({ label: expect.stringContaining('X 改') })
    )
  })
})
