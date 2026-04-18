import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
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

// Mock PoiSearchCombobox so tests can drive POI picks via a button instead of
// the real debounce/combobox/keyboard flow (which is covered separately).
vi.mock('../PoiSearchCombobox', () => ({
  default: ({ onPick }) => (
    <div data-testid="poi-stub">
      <button type="button" onClick={() => onPick({ name: '兰州大学(地铁站)', lat: 36.05, lng: 103.82, address: '兰州城关区天水南路' })}>
        pick-lanzhou
      </button>
      <button type="button" onClick={() => onPick({ name: '米生拉', lat: 29.77, lng: 87.25, address: '谢通门县 · 地名' })}>
        pick-misheng
      </button>
    </div>
  ),
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
  expect(screen.getByText('新建行')).toBeInTheDocument()
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
  expect(screen.getByText('编辑行')).toBeInTheDocument()
  expect(screen.getByLabelText('名称', { exact: false })).toHaveValue('赛里木湖')
  expect(screen.getByRole('button', { name: '删除' })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: '移回候选池' })).toBeInTheDocument()
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

test('re-picking a POI overwrites the auto-filled name, but not a user-typed one', async () => {
  renderDrawer({ mode: 'create', targetDayId: 5 })
  const nameInput = screen.getByLabelText('名称', { exact: false })
  // First pick → name filled from POI
  fireEvent.click(screen.getByRole('button', { name: 'pick-lanzhou' }))
  await waitFor(() => expect(nameInput).toHaveValue('兰州大学(地铁站)'))
  // Re-pick different POI without user edit → name should update
  fireEvent.click(screen.getByRole('button', { name: 'pick-misheng' }))
  await waitFor(() => expect(nameInput).toHaveValue('米生拉'))
  // User edits the name manually
  fireEvent.change(nameInput, { target: { value: '我的自定义名字' } })
  // Another pick → name must be preserved
  fireEvent.click(screen.getByRole('button', { name: 'pick-lanzhou' }))
  await waitFor(() => {
    // address should have updated
    expect(screen.getByText(/兰州城关区天水南路/)).toBeInTheDocument()
  })
  expect(nameInput).toHaveValue('我的自定义名字')
})

test('form clears when switching from edit to create mode', async () => {
  // Regression: Mantine's form.resetDirty() overwrites the reset-snapshot, so a
  // naive form.reset() in create mode would restore the previously-edited
  // activity's values. The drawer must explicitly set empty defaults when
  // switching modes.
  const { rerender } = render(
    <MantineProvider>
      <ModalsProvider>
        <ActivityDrawer
          tourId={1}
          opened={true}
          onClose={() => {}}
          mode="edit"
          activity={{
            id: 42,
            name: '金城宾馆',
            kind: 'stay',
            citizen_level: 'tier_three',
            day_id: 5,
            lat: 36.059,
            lng: 103.832,
            address: '兰州南关十字东500米',
            details: {},
          }}
          targetDayId={null}
        />
      </ModalsProvider>
    </MantineProvider>
  )
  expect(screen.getByLabelText('名称', { exact: false })).toHaveValue('金城宾馆')

  rerender(
    <MantineProvider>
      <ModalsProvider>
        <ActivityDrawer
          tourId={1}
          opened={true}
          onClose={() => {}}
          mode="create"
          activity={null}
          targetDayId={7}
        />
      </ModalsProvider>
    </MantineProvider>
  )
  await waitFor(() => {
    expect(screen.getByLabelText('名称', { exact: false })).toHaveValue('')
  })
  expect(screen.queryByText(/兰州南关十字东500米/)).not.toBeInTheDocument()
})

test('shows persisted address (prefixed "地址：", no emoji) when editing', () => {
  renderDrawer({
    mode: 'edit',
    activity: {
      id: 42,
      name: '金城宾馆',
      kind: 'stay',
      citizen_level: 'tier_three',
      day_id: 5,
      lat: 36.059,
      lng: 103.832,
      address: '甘肃省兰州市城关区南关十字东500米',
      details: {},
    },
  })
  expect(screen.getByText('地址：甘肃省兰州市城关区南关十字东500米')).toBeInTheDocument()
  // Coords should NOT be rendered (see spec 2026-04-18-activity-drawer-redesign — decision D)
  expect(screen.queryByText(/36\.0590,\s*103\.8320/)).not.toBeInTheDocument()
})

test('update path includes address in save payload', async () => {
  const { router } = await import('@inertiajs/react')
  router.patch.mockImplementation((url, data, opts) => opts?.onSuccess?.())
  renderDrawer({
    mode: 'edit',
    activity: {
      id: 42,
      name: '金城宾馆',
      kind: 'stay',
      citizen_level: 'tier_three',
      day_id: 5,
      lat: 36.059,
      lng: 103.832,
      address: '甘肃省兰州市城关区南关十字东500米',
      details: {},
    },
  })
  fireEvent.click(screen.getByRole('button', { name: '保存' }))
  await waitFor(() => {
    expect(router.patch).toHaveBeenCalledWith(
      '/activities/42',
      expect.objectContaining({
        activity: expect.objectContaining({
          address: '甘肃省兰州市城关区南关十字东500米',
          lat: 36.059,
          lng: 103.832,
        }),
      }),
      expect.anything()
    )
  })
})

test('备注 writes to desc column on save', async () => {
  const { router } = await import('@inertiajs/react')
  router.patch.mockImplementation((url, data, opts) => opts?.onSuccess?.())
  renderDrawer({
    mode: 'edit',
    activity: { id: 42, name: 'X', kind: 'scenic', citizen_level: 'tier_one', day_id: 5, details: {} },
  })
  const descInput = screen.getByLabelText('备注', { exact: false })
  fireEvent.change(descInput, { target: { value: '测试描述文本' } })
  fireEvent.click(screen.getByRole('button', { name: '保存' }))
  await waitFor(() => {
    expect(router.patch).toHaveBeenCalledWith(
      '/activities/42',
      expect.objectContaining({
        activity: expect.objectContaining({ desc: '测试描述文本' }),
      }),
      expect.anything(),
    )
  })
  const payload = router.patch.mock.calls[0][1]
  expect(payload.activity).not.toHaveProperty('tips')
  expect(payload.activity).not.toHaveProperty('description')
})

test('三段式结构：位置 / 分类与时间 / 详情', () => {
  renderDrawer({ mode: 'create', targetDayId: 5 })
  expect(screen.getByText('位置')).toBeInTheDocument()
  expect(screen.getByText('分类与时间')).toBeInTheDocument()
  expect(screen.getByText('详情')).toBeInTheDocument()
  // "更多设置" 折叠按钮不应再存在
  expect(screen.queryByRole('button', { name: /更多设置/ })).not.toBeInTheDocument()
})

test('开始时间 是 TimeInput（type=time）', () => {
  renderDrawer({ mode: 'create', targetDayId: 5 })
  const input = screen.getByLabelText('开始时间', { exact: false })
  expect(input).toHaveAttribute('type', 'time')
})

test('时长 下方出现预设芯片（30/60/90/120/180），点击写入', () => {
  renderDrawer({ mode: 'create', targetDayId: 5 })
  const durationField = screen.getByTestId('duration-field')
  const durationInput = within(durationField).getByLabelText('时长', { exact: true })
  // aria-label is "设置 时长 为 60"; match with regex on the numeric portion
  expect(within(durationField).getByRole('button', { name: /时长 为 60/ })).toBeInTheDocument()
  fireEvent.click(within(durationField).getByRole('button', { name: /时长 为 120/ }))
  expect(durationInput).toHaveValue('120')
})

test('时长 NumberInput 显示 "分钟" 后缀', () => {
  renderDrawer({ mode: 'create', targetDayId: 5 })
  // drawer 内应能找到 "分钟" 文本（可能出现在多个细节字段上，所以用 getAllByText）
  expect(screen.getAllByText('分钟').length).toBeGreaterThanOrEqual(1)
})

test('备注 字段绑定 desc（原描述+贴士合并）', async () => {
  const { router } = await import('@inertiajs/react')
  router.patch.mockImplementation((url, data, opts) => opts?.onSuccess?.())
  renderDrawer({
    mode: 'edit',
    activity: { id: 42, name: 'X', kind: 'scenic', citizen_level: 'tier_one', day_id: 5, details: {} },
  })
  const note = screen.getByLabelText('备注', { exact: false })
  fireEvent.change(note, { target: { value: '合并后的备注' } })
  fireEvent.click(screen.getByRole('button', { name: '保存' }))
  await waitFor(() => {
    expect(router.patch).toHaveBeenCalledWith(
      '/activities/42',
      expect.objectContaining({ activity: expect.objectContaining({ desc: '合并后的备注' }) }),
      expect.anything(),
    )
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
