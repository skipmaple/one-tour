import { render, screen, waitFor } from '@testing-library/react'
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

  it('does NOT render autosave status line in onboarding mode', () => {
    renderDrawer()
    expect(screen.queryByText(/已保存/)).not.toBeInTheDocument()
    expect(screen.queryByText(/自动保存/)).not.toBeInTheDocument()
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
})

describe('ConstitutionDrawer — edit mode', () => {
  it('renders when constitution_accepted is true', () => {
    renderDrawer({ tour: { ...baseTour, constitution_accepted: true } })
    expect(screen.queryByText(/第 1 步/)).not.toBeInTheDocument()
  })

  it('renders when localStorage marker is set (even if constitution_accepted is false)', () => {
    localStorage.setItem('onboarded:tour:42', '1')
    renderDrawer()
    expect(screen.queryByText(/第 1 步/)).not.toBeInTheDocument()
  })

  it('shows persistent autosave hint before any save', () => {
    renderDrawer({ tour: { ...baseTour, constitution_accepted: true } })
    expect(screen.getByText('所有更改将自动保存')).toBeInTheDocument()
  })

  it('shows violation list in edit mode', () => {
    renderDrawer({
      tour: { ...baseTour, constitution_accepted: true },
      violations: [{ level: 'hard', message: '行程超过每日上限', rule: 'max_tier_one_per_day' }],
    })
    expect(screen.getByText('行程超过每日上限')).toBeInTheDocument()
  })

  it('debounces PATCH on field change', async () => {
    const user = userEvent.setup()
    localStorage.setItem('onboarded:tour:42', '1')
    renderDrawer()
    const input = screen.getByTestId('param-input')
    await user.clear(input)
    await user.type(input, '400')
    await waitFor(
      () => expect(patchMock).toHaveBeenCalled(),
      { timeout: 2000 },
    )
    expect(patchMock.mock.calls[0][0]).toBe('/tours/42/constitution')
  })
})

describe('ConstitutionDrawer — close', () => {
  it('calls onClose when close button clicked', async () => {
    const user = userEvent.setup()
    const { props } = renderDrawer()
    await user.click(screen.getByRole('button', { name: /关闭|close/i }))
    expect(props.onClose).toHaveBeenCalled()
  })
})

