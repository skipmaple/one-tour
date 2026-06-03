import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import { MantineProvider } from '@mantine/core'
import { ModalsProvider } from '@mantine/modals'
import { vi, beforeEach } from 'vitest'
import ActivityDrawer from '../ActivityDrawer'

// Mock Inertia router
vi.mock('@inertiajs/react', () => ({
  router: {
    post:   vi.fn((url, data, opts) => opts?.onSuccess?.()),
    patch:  vi.fn((url, data, opts) => opts?.onSuccess?.()),
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

// Mock LocationPicker so tests can drive POI picks via a button instead of
// the real debounce/combobox/keyboard flow (which is covered separately).
vi.mock('../LocationPicker', () => ({
  default: ({ onChange }) => (
    <div data-testid="location-picker-stub">
      <button type="button" onClick={() => onChange({
        name: '兰州大学(地铁站)', lat: 36.05, lng: 103.82, address: '兰州城关区天水南路',
        pname: '甘肃省', cityname: '兰州市', adname: '城关区', type: '地铁站',
        place: { rating: '4.8', keytag: '高档型', photo: 'https://x/p.jpg', typecode: '100100', opentime: '', tel: '' }
      })}>pick-lanzhou</button>
      <button type="button" onClick={() => onChange({
        name: '米生拉', lat: 29.77, lng: 87.25, address: '谢通门县 · 地名',
        pname: '西藏自治区', cityname: '日喀则市', adname: '谢通门县', type: '地名'
      })}>pick-misheng</button>
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
    canEdit: true,
    author:  { user_id: 1, name: '作者', email: 'a@x', avatar_url: null },
    members: [
      { user_id: 2, name: '乙', email: 'b@x', avatar_url: null, role: 'editor' },
      { user_id: 3, name: '丙', email: 'c@x', avatar_url: null, role: 'reader' },
    ],
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
    // name should remain as user typed, not overwritten by the pick
    expect(nameInput).toHaveValue('我的自定义名字')
  })
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
          author={{ user_id: 1, name: '作者', email: 'a@x', avatar_url: null }}
          members={[]}
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
          author={{ user_id: 1, name: '作者', email: 'a@x', avatar_url: null }}
          members={[]}
        />
      </ModalsProvider>
    </MantineProvider>
  )
  await waitFor(() => {
    expect(screen.getByLabelText('名称', { exact: false })).toHaveValue('')
  })
  expect(screen.queryByText(/兰州南关十字东500米/)).not.toBeInTheDocument()
})

test('editing activity with location renders LocationPicker (no raw coords in drawer)', () => {
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
  // LocationPicker stub is rendered; location display is handled by LocationPicker
  expect(screen.getByTestId('location-picker-stub')).toBeInTheDocument()
  // Raw coordinates should NOT be rendered directly in the drawer
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
  // MarkdownEditor Textarea is the native <textarea> element; 名称 is an <input>
  const descInput = screen.getAllByRole('textbox').find(el => el.tagName === 'TEXTAREA')
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

test('分段结构：位置 / 分类与时间 / 备注 / 类型细节 / 参与人', () => {
  renderDrawer({ mode: 'create', targetDayId: 5 })
  expect(screen.getByText('位置')).toBeInTheDocument()
  expect(screen.getByText('分类与时间')).toBeInTheDocument()
  expect(screen.getByText('备注')).toBeInTheDocument()
  // 类型细节 and 参与人 are collapsible section buttons
  expect(screen.getByRole('button', { name: /类型细节/ })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: /参与人/ })).toBeInTheDocument()
  // "更多设置" 折叠按钮不应再存在
  expect(screen.queryByRole('button', { name: /更多设置/ })).not.toBeInTheDocument()
})

test('开始时间 渲染为 TimePicker（3 个 number 输入：时/分/秒?）', () => {
  renderDrawer({ mode: 'create', targetDayId: 5 })
  // Mantine TimePicker renders separate hours/minutes spinners rather than a
  // single <input type="time">. Verify the label is present and the picker
  // exposes at least the hours input (aria-label "小时" per Mantine default).
  expect(screen.getByText('开始时间')).toBeInTheDocument()
  expect(screen.getByLabelText(/小时|hours/i)).toBeInTheDocument()
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
  // MarkdownEditor Textarea is the native <textarea> element; 名称 is an <input>
  const note = screen.getAllByRole('textbox').find(el => el.tagName === 'TEXTAREA')
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

test('create payload includes user_ids=[] when participants are untouched (默认全员)', async () => {
  global.fetch.mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ id: 999, position: 1 }) })
  renderDrawer({ targetDayId: 10 })
  fireEvent.change(screen.getByLabelText('名称', { exact: false }), { target: { value: '午餐' } })
  fireEvent.click(screen.getByRole('button', { name: '保存' }))
  await waitFor(() => expect(global.fetch).toHaveBeenCalled())
  const [, opts] = global.fetch.mock.calls[0]
  const body = JSON.parse(opts.body)
  expect(body.user_ids).toEqual([])
})

test('create payload carries explicit user_ids after unchecking a member', async () => {
  global.fetch.mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ id: 999, position: 1 }) })
  renderDrawer({ targetDayId: 10 })
  fireEvent.change(screen.getByLabelText('名称', { exact: false }), { target: { value: '午餐' } })
  fireEvent.click(screen.getByRole('button', { name: /参与人/ }))
  fireEvent.click(screen.getByLabelText(/乙/))
  fireEvent.click(screen.getByRole('button', { name: '保存' }))
  await waitFor(() => expect(global.fetch).toHaveBeenCalled())
  const [, opts] = global.fetch.mock.calls[0]
  const body = JSON.parse(opts.body)
  expect(body.user_ids).toEqual(expect.arrayContaining([ 1, 3 ]))
  expect(body.user_ids).toHaveLength(2)
})

test('edit payload preserves existing explicit participant_user_ids', async () => {
  const { router } = await import('@inertiajs/react')
  renderDrawer({
    mode: 'edit',
    activity: {
      id: 42, name: '赛里木湖', kind: 'scenic', citizen_level: 'tier_one',
      day_id: 5, details: {}, participant_user_ids: [ 1, 2 ],
    },
  })
  fireEvent.click(screen.getByRole('button', { name: '保存' }))
  await waitFor(() => expect(router.patch).toHaveBeenCalled())
  const [, data] = router.patch.mock.calls[0]
  expect(data.user_ids).toEqual([ 1, 2 ])
})

test('edit save invokes onClose on success (drawer closes)', async () => {
  const onClose = vi.fn()
  renderDrawer({
    onClose,
    mode: 'edit',
    activity: {
      id: 42, name: '赛里木湖', kind: 'scenic', citizen_level: 'tier_one',
      day_id: 5, details: {},
    },
  })
  fireEvent.click(screen.getByRole('button', { name: '保存' }))
  await waitFor(() => expect(onClose).toHaveBeenCalled())
})

test('create save invokes onClose on success (drawer closes)', async () => {
  global.fetch.mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ id: 999, position: 1 }) })
  const onClose = vi.fn()
  renderDrawer({ onClose, targetDayId: 10 })
  fireEvent.change(screen.getByLabelText('名称', { exact: false }), { target: { value: '午餐' } })
  fireEvent.click(screen.getByRole('button', { name: '保存' }))
  await waitFor(() => expect(onClose).toHaveBeenCalled())
})

describe('省市区消歧义持久化 (details jsonb)', () => {
  it('create payload 把 pname/cityname/adname/type 写进 activity.details', async () => {
    global.fetch.mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ id: 777, position: 1 }) })
    renderDrawer({ mode: 'create', targetDayId: 5 })
    fireEvent.click(screen.getByRole('button', { name: 'pick-lanzhou' }))
    await waitFor(() => expect(screen.getByLabelText('名称', { exact: false })).toHaveValue('兰州大学(地铁站)'))
    fireEvent.click(screen.getByRole('button', { name: '保存' }))
    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        '/tours/1/days/5/activities',
        expect.objectContaining({
          body: expect.stringMatching(/"cityname":"兰州市"/),
        })
      )
    })
    const body = JSON.parse(global.fetch.mock.calls[0][1].body)
    expect(body.activity.details).toMatchObject({
      pname: '甘肃省',
      cityname: '兰州市',
      adname: '城关区',
      type: '地铁站',
    })
    // 顶层不应该携带这 4 个字段（后端 strong params 会忽略）
    expect(body.activity.cityname).toBeUndefined()
    expect(body.activity.pname).toBeUndefined()
  })

  it('把 AMAP place 元数据(评分/标签/照片)写进 activity.details.place', async () => {
    global.fetch.mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ id: 777, position: 1 }) })
    renderDrawer({ mode: 'create', targetDayId: 5 })
    fireEvent.click(screen.getByRole('button', { name: 'pick-lanzhou' }))
    await waitFor(() => expect(screen.getByLabelText('名称', { exact: false })).toHaveValue('兰州大学(地铁站)'))
    fireEvent.click(screen.getByRole('button', { name: '保存' }))
    await waitFor(() => expect(global.fetch).toHaveBeenCalled())
    const body = JSON.parse(global.fetch.mock.calls[0][1].body)
    expect(body.activity.details.place).toMatchObject({ rating: '4.8', keytag: '高档型', photo: 'https://x/p.jpg' })
  })

  it('edit mode 从 activity.details 读回省市区字段', async () => {
    const { router } = await import('@inertiajs/react')
    router.patch.mockImplementation((url, data, opts) => opts?.onSuccess?.())
    renderDrawer({
      mode: 'edit',
      activity: {
        id: 88, name: '春丽和金刚小酒馆', kind: 'food', citizen_level: 'tier_three',
        day_id: 5, lat: 28.18, lng: 113.00, address: '福达银座5楼',
        details: { pname: '湖南省', cityname: '长沙市', adname: '岳麓区', type: '餐饮' },
      },
    })
    fireEvent.click(screen.getByRole('button', { name: '保存' }))
    await waitFor(() => {
      expect(router.patch).toHaveBeenCalledWith(
        '/activities/88',
        expect.objectContaining({
          activity: expect.objectContaining({
            details: expect.objectContaining({
              pname: '湖南省', cityname: '长沙市', adname: '岳麓区', type: '餐饮',
            }),
          }),
        }),
        expect.anything()
      )
    })
  })
})

describe('状态 (status)', () => {
  it('renders a 状态 select control in 分类与时间', () => {
    renderDrawer({ mode: 'create', targetDayId: 5 })
    expect(screen.getByRole('combobox', { name: '状态' })).toBeInTheDocument()
  })

  it('create payload defaults status to confirmed', async () => {
    global.fetch.mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ id: 999, position: 1 }) })
    renderDrawer({ targetDayId: 5 })
    fireEvent.change(screen.getByLabelText('名称', { exact: false }), { target: { value: '景点' } })
    fireEvent.click(screen.getByRole('button', { name: '保存' }))
    await waitFor(() => expect(global.fetch).toHaveBeenCalled())
    const body = JSON.parse(global.fetch.mock.calls[0][1].body)
    expect(body.activity.status).toBe('confirmed')
  })

  it('edit mode loads status and includes it in the save payload', async () => {
    const { router } = await import('@inertiajs/react')
    router.patch.mockImplementation((url, data, opts) => opts?.onSuccess?.())
    renderDrawer({
      mode: 'edit',
      activity: {
        id: 42, name: '乌沙安集海大峡谷', kind: 'scenic', citizen_level: 'tier_one',
        status: 'closed', day_id: 5, details: {},
      },
    })
    fireEvent.click(screen.getByRole('button', { name: '保存' }))
    await waitFor(() => {
      expect(router.patch).toHaveBeenCalledWith(
        '/activities/42',
        expect.objectContaining({ activity: expect.objectContaining({ status: 'closed' }) }),
        expect.anything(),
      )
    })
  })
})

test('shows AMAP place info (photo / rating / 营业 / 电话) in the drawer detail', () => {
  renderDrawer({
    mode: 'edit',
    activity: {
      id: 99, name: '赛里木湖', kind: 'scenic', citizen_level: 'tier_one', day_id: 5,
      details: { place: { photo: 'https://amap.example/p.jpg', rating: '4.9', keytag: '5A景区', opentime: '09:00-18:00', tel: '0909-7659990' } },
    },
  })
  const block = screen.getByTestId('poi-place-info')
  expect(block).toBeInTheDocument()
  expect(screen.getByText('4.9')).toBeInTheDocument()
  expect(screen.getByText('5A景区')).toBeInTheDocument()
  expect(screen.getByText(/0909-7659990/)).toBeInTheDocument()
  expect(block.querySelector('img').getAttribute('src')).toContain('amap.example/p.jpg')
})

describe('create mode defaults', () => {
  it('new-activity create defaults 重点层级 to 想去 (tier_two)', async () => {
    renderDrawer({})   // create mode — blank drawer
    expect(await screen.findByRole('radio', { name: '想去' })).toBeChecked()
  })

  it('shows the 高德选点 rich-card hint in the location section', async () => {
    renderDrawer({})
    expect(await screen.findByText(/用高德搜索选点/)).toBeInTheDocument()
  })
})

describe('重点层级 field label and tier hint', () => {
  it('citizen_level field is labeled 重点层级 with a tier hint', async () => {
    renderDrawer({ activity: { id: 1, name: 'X', kind: 'scenic', citizen_level: 'tier_three', day_id: 5, details: {} } })
    expect(await screen.findByText('重点层级')).toBeInTheDocument()
    expect(screen.queryByText('公民等级')).not.toBeInTheDocument()
    expect(screen.getByText(/必去=核心/)).toBeInTheDocument()
  })

  it('road kind shows the 景观公路→必去 explanation instead of the tier hint', async () => {
    renderDrawer({ mode: 'edit', activity: { id: 2, name: 'R', kind: 'road', citizen_level: 'tier_one', day_id: 5, details: {} } })
    expect(await screen.findByText(/景观公路本身就是核心体验/)).toBeInTheDocument()
  })
})

describe('road kind (景观公路)', () => {
  // Helper: open the kind Select and pick "景观公路"
  async function switchToRoad() {
    // Mantine Select renders a combobox input associated with the "类型" label
    const kindInput = screen.getByRole('combobox', { name: '类型' })
    fireEvent.click(kindInput)
    // Wait for the dropdown option to appear, then click it
    const option = await screen.findByRole('option', { name: '景观公路' })
    fireEvent.click(option)
  }

  it('auto-sets citizen_level=tier_one when switching to road', async () => {
    renderDrawer()
    await switchToRoad()
    // "必去" radio input should be checked
    await waitFor(() => {
      expect(screen.getByLabelText('必去')).toBeChecked()
    })
  })

  it('disables non-tier_one radios when kind=road', async () => {
    renderDrawer()
    await switchToRoad()
    // All radios except tier_one must be disabled
    await waitFor(() => {
      expect(screen.getByLabelText('想去')).toBeDisabled()
      expect(screen.getByLabelText('备选')).toBeDisabled()
      expect(screen.getByLabelText('后勤')).toBeDisabled()
    })
    // tier_one itself should NOT be disabled
    expect(screen.getByLabelText('必去')).not.toBeDisabled()
  })
})
