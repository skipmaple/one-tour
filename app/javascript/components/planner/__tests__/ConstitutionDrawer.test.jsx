import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MantineProvider } from '@mantine/core'
import { ModalsProvider } from '@mantine/modals'
import { DatesProvider } from '@mantine/dates'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import ConstitutionDrawer from '../ConstitutionDrawer'

const patchMock = vi.fn()
const postMock = vi.fn()

vi.mock('@inertiajs/react', () => ({
  router: {
    patch: (...args) => patchMock(...args),
    post: (...args) => postMock(...args),
  },
}))

vi.mock('@mantine/notifications', () => ({
  notifications: { show: vi.fn() },
}))

vi.mock('@sentry/react', () => ({
  captureException: vi.fn(),
}))

const postJsonMock = vi.fn(() => Promise.resolve({ ok: true }))
vi.mock('../tourSetupHelpers', async (orig) => ({
  ...(await orig()),
  postJson: (...a) => postJsonMock(...a),
}))

vi.mock('../ParameterEditor', () => ({
  default: ({ c, setC }) => (
    <input
      data-testid="param-input"
      value={c.max_daily_driving_minutes || ''}
      onChange={e => setC({ ...c, max_daily_driving_minutes: Number(e.target.value) })}
    />
  ),
}))

vi.mock('../RedHeaderDocument', () => ({
  default: ({ children }) => <div data-testid="red-doc">{children}</div>,
}))

vi.mock('../ConstitutionFullText', () => ({
  default: () => <div data-testid="full-text" />,
}))

const baseTour = {
  id: 42,
  title: '测试旅程',
  constitution: { max_daily_driving_minutes: 360 },
  constitution_accepted: false,
  date_range: null,
  team_size: null,
  days_count: null,
}

function renderDrawer(overrides = {}) {
  const props = {
    tour: baseTour,
    violations: [],
    defaults: { max_daily_driving_minutes: 360 },
    overrides: [],
    initialDaysCount: 1,
    canEdit: true,
    width: 400,
    onWidthChange: vi.fn(),
    onClose: vi.fn(),
    onFix: vi.fn(),
    onAcknowledge: vi.fn(),
    ...overrides,
  }
  return {
    ...render(
      <MantineProvider>
        <DatesProvider settings={{}}>
          <ModalsProvider>
            <ConstitutionDrawer {...props} />
          </ModalsProvider>
        </DatesProvider>
      </MantineProvider>,
    ),
    props,
  }
}

beforeEach(() => {
  localStorage.clear()
  patchMock.mockReset()
  postMock.mockReset()
})

describe('ConstitutionDrawer — onboarding mode', () => {
  it('shows step indicator when constitution_accepted is false and no localStorage marker', () => {
    renderDrawer()
    expect(screen.getByText(/第 1 步/)).toBeInTheDocument()
  })

  it('renders tour metadata inputs (程名 / 日期范围 / 人数 / 天数)', () => {
    renderDrawer()
    expect(screen.getByLabelText(/程名/)).toBeInTheDocument()
    expect(screen.getByLabelText(/日期范围/)).toBeInTheDocument()
    expect(screen.getByLabelText(/人数/)).toBeInTheDocument()
    expect(screen.getByLabelText(/天数/)).toBeInTheDocument()
  })

  it('hides violation list in onboarding mode', () => {
    renderDrawer({ violations: [
      { level: 'hard', message: '行程超过每日上限', rule: 'max_tier_one_per_day' },
    ]})
    expect(screen.queryByText('行程超过每日上限')).not.toBeInTheDocument()
  })

  it('shows close (×) button even in onboarding — gate is skippable', () => {
    renderDrawer()
    expect(screen.getByRole('button', { name: /关闭|close/i })).toBeInTheDocument()
  })
})

describe('ConstitutionDrawer — edit mode (Review)', () => {
  it('renders Review state by default when accepted', () => {
    renderDrawer({ tour: { ...baseTour, constitution_accepted: true } })
    // Review shows the full-text doc + 修宪 button; step indicator absent.
    expect(screen.queryByText(/第 1 步/)).not.toBeInTheDocument()
    expect(screen.getByTestId('red-doc')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '修宪' })).toBeInTheDocument()
  })

  it('renders when localStorage marker set (even if constitution_accepted is false)', () => {
    localStorage.setItem('onboarded:tour:42', '1')
    renderDrawer()
    expect(screen.queryByText(/第 1 步/)).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: '修宪' })).toBeInTheDocument()
  })

  it('hides 修宪 button for read-only users', () => {
    renderDrawer({ tour: { ...baseTour, constitution_accepted: true }, canEdit: false })
    expect(screen.queryByRole('button', { name: '修宪' })).not.toBeInTheDocument()
  })

  it('shows violations in Review state', () => {
    renderDrawer({
      tour: { ...baseTour, constitution_accepted: true },
      violations: [{ level: 'hard', message: '行程超过每日上限', rule: 'max_tier_one_per_day' }],
    })
    expect(screen.getByText('行程超过每日上限')).toBeInTheDocument()
  })

  it('soft violation "知道了" dismisses that row for the session', async () => {
    const user = userEvent.setup()
    renderDrawer({
      tour: { ...baseTour, constitution_accepted: true },
      violations: [{ level: 'soft', message: '整程 0 个机动日', rule: 'min_buffer_days' }],
    })
    expect(screen.getByText('整程 0 个机动日')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '知道了' }))
    expect(screen.queryByText('整程 0 个机动日')).not.toBeInTheDocument()
  })

  it('close button (×) is present in edit mode', () => {
    renderDrawer({ tour: { ...baseTour, constitution_accepted: true } })
    expect(screen.getByRole('button', { name: /关闭|close/i })).toBeInTheDocument()
  })
})

describe('ConstitutionDrawer — edit mode (Editing sub-state after 修宪)', () => {
  it('clicking 修宪 swaps to params editor + 取消/保存 buttons', async () => {
    const user = userEvent.setup()
    renderDrawer({ tour: { ...baseTour, constitution_accepted: true } })
    await user.click(screen.getByRole('button', { name: '修宪' }))
    expect(screen.getByTestId('param-input')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '取消' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '保存' })).toBeInTheDocument()
    // Review body hidden while editing
    expect(screen.queryByRole('button', { name: '修宪' })).not.toBeInTheDocument()
  })

  it('保存 button is disabled when no changes made', async () => {
    const user = userEvent.setup()
    renderDrawer({ tour: { ...baseTour, constitution_accepted: true } })
    await user.click(screen.getByRole('button', { name: '修宪' }))
    expect(screen.getByRole('button', { name: '保存' })).toBeDisabled()
  })

  it('保存 fires explicit PATCH on click', async () => {
    const user = userEvent.setup()
    renderDrawer({ tour: { ...baseTour, constitution_accepted: true } })
    await user.click(screen.getByRole('button', { name: '修宪' }))
    const input = screen.getByTestId('param-input')
    await user.clear(input)
    await user.type(input, '400')
    await user.click(screen.getByRole('button', { name: '保存' }))
    expect(patchMock).toHaveBeenCalledTimes(1)
    expect(patchMock.mock.calls[0][0]).toBe('/tours/42/constitution')
  })

  it('取消 returns to Review state (does NOT fire PATCH)', async () => {
    const user = userEvent.setup()
    renderDrawer({ tour: { ...baseTour, constitution_accepted: true } })
    await user.click(screen.getByRole('button', { name: '修宪' }))
    const input = screen.getByTestId('param-input')
    await user.clear(input)
    await user.type(input, '400')
    await user.click(screen.getByRole('button', { name: '取消' }))
    expect(patchMock).not.toHaveBeenCalled()
    // Back in Review state
    expect(screen.getByRole('button', { name: '修宪' })).toBeInTheDocument()
  })

  it('does NOT render autosave hint anywhere', () => {
    renderDrawer({ tour: { ...baseTour, constitution_accepted: true } })
    expect(screen.queryByText(/已保存/)).not.toBeInTheDocument()
    expect(screen.queryByText(/自动保存/)).not.toBeInTheDocument()
  })
})

describe('dismissible in onboarding (skippable gate)', () => {
  beforeEach(() => {
    localStorage.removeItem('onboarded:tour:42')
  })

  it('shows the × close button even before accepting', () => {
    renderDrawer()
    expect(screen.getByLabelText('关闭')).toBeInTheDocument()
  })

  it('× click calls onClose', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    renderDrawer({ onClose })
    await user.click(screen.getByLabelText('关闭'))
    expect(onClose).toHaveBeenCalled()
  })
})

function renderOnboarding(extra = {}) {
  const defaultTour = {
    id: 1,
    title: '',
    constitution: { max_daily_driving_minutes: 420 },
    constitution_accepted: false,
    date_range: null,
    team_size: null,
  }
  const props = {
    tour: extra.tour || defaultTour,
    violations: [],
    defaults: { max_daily_driving_minutes: 420 },
    overrides: [],
    initialDaysCount: extra.initialDaysCount != null ? extra.initialDaysCount : 1,
    days: extra.days || [],
    canEdit: true,
    width: 400,
    onWidthChange: vi.fn(),
    onClose: vi.fn(),
    onFix: vi.fn(),
    onAcknowledge: vi.fn(),
  }
  return render(
    <MantineProvider>
      <DatesProvider settings={{}}>
        <ModalsProvider>
          <ConstitutionDrawer {...props} />
        </ModalsProvider>
      </DatesProvider>
    </MantineProvider>,
  )
}

describe('express + date spread', () => {
  beforeEach(() => {
    postJsonMock.mockClear()
    postMock.mockClear()
    localStorage.removeItem('onboarded:tour:1')
  })

  it('accept does not show the old 从候选池加点 toast', async () => {
    const { notifications } = await import('@mantine/notifications')
    // Make postMock call onSuccess so the acceptConstitution success handler runs
    postMock.mockImplementationOnce((_url, _data, { onSuccess, onFinish } = {}) => {
      onSuccess?.()
      onFinish?.()
    })
    renderOnboarding()
    await userEvent.click(screen.getByText('用推荐设置开始'))
    const msgs = notifications.show.mock.calls.map(c => c[0]?.message || '')
    expect(msgs.some(m => m.includes('从左侧候选池'))).toBe(false)
  })

  it('renders 用推荐设置开始 button in step 1', () => {
    renderOnboarding()
    expect(screen.getByText('用推荐设置开始')).toBeInTheDocument()
  })

  it('用推荐设置开始 persists then accepts', async () => {
    renderOnboarding()
    await userEvent.click(screen.getByText('用推荐设置开始'))
    expect(postJsonMock).toHaveBeenCalledWith('/tours/1', 'PATCH', expect.anything())
    expect(postJsonMock).toHaveBeenCalledWith('/tours/1/constitution', 'PATCH', expect.anything())
    expect(postMock).toHaveBeenCalledWith('/tours/1/constitution/accept', {}, expect.anything())
  })

  it('express with no date range issues no day date PATCH/POST', async () => {
    renderOnboarding({
      tour: { id: 1, title: '', constitution: { max_daily_driving_minutes: 420 }, constitution_accepted: false, date_range: null, team_size: null },
      initialDaysCount: 1, days: [{ id: 10, day_index: 1 }],
    })
    await userEvent.click(screen.getByText('用推荐设置开始'))
    // no range → no day should be PATCHed/POSTed with a date
    const dayDateCalls = postJsonMock.mock.calls.filter(c => c[2]?.day?.date)
    expect(dayDateCalls).toHaveLength(0)
  })

  it('下一步 spreads the date range onto existing + new days', async () => {
    renderOnboarding({
      tour: { id: 1, title: '', constitution: { max_daily_driving_minutes: 420 }, constitution_accepted: false, date_range: '2026-06-10 ~ 2026-06-11', team_size: null },
      initialDaysCount: 1, days: [{ id: 10, day_index: 1 }],
    })
    await userEvent.type(screen.getByLabelText(/程名/), '测试程')
    await userEvent.click(screen.getByText('下一步 →'))
    expect(postJsonMock).toHaveBeenCalledWith('/tours/1/days/10', 'PATCH', { day: { date: '2026-06-10' } })
    expect(postJsonMock).toHaveBeenCalledWith('/tours/1/days', 'POST', { day: { day_index: 2, date: '2026-06-11' } })
  })
})
