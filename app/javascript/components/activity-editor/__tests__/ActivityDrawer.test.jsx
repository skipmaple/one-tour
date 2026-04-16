import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MantineProvider } from '@mantine/core'
import { ModalsProvider } from '@mantine/modals'
import { vi } from 'vitest'
import ActivityDrawer from '../ActivityDrawer'

// Mock Inertia router
vi.mock('@inertiajs/react', () => ({
  router: {
    post: vi.fn((url, data, opts) => opts?.onSuccess?.()),
    patch: vi.fn((url, data, opts) => opts?.onSuccess?.()),
    delete: vi.fn((url, opts) => opts?.onSuccess?.()),
  },
}))

// Mock fetch for POI search
global.fetch = vi.fn()

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

test('calls router.post for backlog create (no targetDayId)', async () => {
  const { router } = await import('@inertiajs/react')
  const onClose = vi.fn()
  renderDrawer({ onClose })
  fireEvent.change(screen.getByLabelText('名称', { exact: false }), { target: { value: '测试景点' } })
  fireEvent.click(screen.getByRole('button', { name: '保存' }))
  await waitFor(() => {
    expect(router.post).toHaveBeenCalledWith(
      '/tours/1/backlog_activities',
      expect.objectContaining({ activity: expect.objectContaining({ name: '测试景点' }) }),
      expect.anything()
    )
    expect(onClose).toHaveBeenCalled()
  })
})

test('calls router.post for day create (with targetDayId)', async () => {
  const { router } = await import('@inertiajs/react')
  renderDrawer({ targetDayId: 5 })
  fireEvent.change(screen.getByLabelText('名称', { exact: false }), { target: { value: '午餐' } })
  fireEvent.click(screen.getByRole('button', { name: '保存' }))
  await waitFor(() => {
    expect(router.post).toHaveBeenCalledWith(
      '/tours/1/days/5/activities',
      expect.anything(),
      expect.anything()
    )
  })
})
