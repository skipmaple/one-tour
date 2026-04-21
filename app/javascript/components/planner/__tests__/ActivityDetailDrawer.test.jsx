import { render, screen, fireEvent } from '@testing-library/react'
import { MantineProvider } from '@mantine/core'
import { vi, beforeEach, describe, test, expect } from 'vitest'
import ActivityDetailDrawer from '../ActivityDetailDrawer'

vi.mock('@inertiajs/react', () => ({
  router: {
    reload: vi.fn(),
    put: vi.fn((url, data, opts) => opts?.onSuccess?.()),
  },
  usePage: () => ({ props: { amap_js_api_key: null, amap_js_security_code: null } }),
}))

// Hoisted mock — any jsx file importing '../ActivityMiniMap' gets a dumb div.
// The real SDK component is exercised in manual E2E only.
vi.mock('../ActivityMiniMap', () => ({
  default: ({ lat, lng }) => <div data-testid="mock-mini-map" data-lat={lat} data-lng={lng} />,
}))

const AUTHOR  = { user_id: 1, name: 'Alice', email: 'a@x', avatar_url: null }
const MEMBERS = [
  { user_id: 2, name: 'Bob',   email: 'b@x', avatar_url: null, role: 'editor' },
  { user_id: 3, name: 'Cindy', email: 'c@x', avatar_url: null, role: 'reader' },
]
const DAYS = [ { id: 1, day_index: 1 } ]

function makeActivity(overrides = {}) {
  return {
    id: 10,
    name: '赛里木湖',
    kind: 'scenic',
    citizen_level: 'tier_two',
    day_id: 1,
    position: 1,
    lat: 44.6,
    lng: 81.2,
    address: '新疆伊犁州赛里木湖风景区',
    planned_start_at: '14:00',
    planned_duration_min: 120,
    desc: '湖光山色，风景绝美。',
    details: { altitude: 2073, ticket_info: 70 },
    participant_user_ids: [],
    ...overrides,
  }
}

function renderDrawer(props = {}) {
  const defaults = {
    opened: true,
    onClose: vi.fn(),
    tour: { id: 1, currency: 'CNY' },
    days: DAYS,
    activity: makeActivity(),
    activityImages: [],
    author: AUTHOR,
    members: MEMBERS,
    expenses: [],
    canEdit: true,
    onEdit: vi.fn(),
    onAddExpense: vi.fn(),
    onFocusExpense: vi.fn(),
  }
  return render(
    <MantineProvider>
      <ActivityDetailDrawer {...defaults} {...props} />
    </MantineProvider>
  )
}

describe('ActivityDetailDrawer – shell', () => {
  test('renders the activity name as a heading', () => {
    renderDrawer()
    expect(screen.getByRole('heading', { name: '赛里木湖' })).toBeInTheDocument()
  })

  test('calls onClose when the close button is clicked', () => {
    const onClose = vi.fn()
    renderDrawer({ onClose })
    // Mantine Drawer's built-in close button has accessible name "Close"
    const closeBtn = screen.getByRole('button', { name: /close/i })
    fireEvent.click(closeBtn)
    expect(onClose).toHaveBeenCalled()
  })

  test('renders nothing when opened=false', () => {
    const { container } = renderDrawer({ opened: false })
    expect(container.querySelector('[role="dialog"]')).toBeNull()
  })
})

describe('ActivityDetailDrawer – header meta + actions', () => {
  test('renders meta line with D-label, kind, tier, time, duration', () => {
    renderDrawer()
    const header = screen.getByTestId('detail-header')
    expect(header).toHaveTextContent('D1')
    expect(header).toHaveTextContent('scenic')
    expect(header).toHaveTextContent('tier_two')
    expect(header).toHaveTextContent('14:00')
    expect(header).toHaveTextContent('2h')
  })

  test('backlog activity (day_id null) shows "候选池" instead of Dn', () => {
    renderDrawer({ activity: makeActivity({ day_id: null }) })
    const header = screen.getByTestId('detail-header')
    expect(header).toHaveTextContent('候选池')
    expect(header).not.toHaveTextContent(/^D\d/)
  })

  test('canEdit=true renders [+ 记一笔] and [编辑] header buttons', () => {
    renderDrawer({ canEdit: true })
    expect(screen.getByRole('button', { name: /记一笔/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /编辑/ })).toBeInTheDocument()
  })

  test('canEdit=false hides [+ 记一笔] and [编辑] header buttons', () => {
    renderDrawer({ canEdit: false })
    expect(screen.queryByRole('button', { name: /记一笔/ })).toBeNull()
    expect(screen.queryByRole('button', { name: /编辑/ })).toBeNull()
  })

  test('clicking [+ 记一笔] calls onAddExpense with activity id', () => {
    const onAddExpense = vi.fn()
    renderDrawer({ onAddExpense })
    fireEvent.click(screen.getByRole('button', { name: /记一笔/ }))
    expect(onAddExpense).toHaveBeenCalledWith(10)
  })

  test('clicking [编辑] calls onEdit with activity id', () => {
    const onEdit = vi.fn()
    renderDrawer({ onEdit })
    fireEvent.click(screen.getByRole('button', { name: /编辑/ }))
    expect(onEdit).toHaveBeenCalledWith(10)
  })
})

describe('ActivityDetailDrawer – location', () => {
  test('renders address + coords when present', () => {
    renderDrawer()
    const loc = screen.getByTestId('detail-location')
    expect(loc).toHaveTextContent('新疆伊犁州赛里木湖风景区')
    expect(loc).toHaveTextContent(/44\.6/)
    expect(loc).toHaveTextContent(/81\.2/)
  })

  test('renders kind-specific detail fields (altitude, ticket_info for scenic)', () => {
    renderDrawer()
    const loc = screen.getByTestId('detail-location')
    expect(loc).toHaveTextContent('2073')  // altitude
    expect(loc).toHaveTextContent('70')    // ticket_info
  })

  test('renders mini-map when lat/lng present', () => {
    renderDrawer()
    const map = screen.getByTestId('mock-mini-map')
    expect(map).toHaveAttribute('data-lat', '44.6')
    expect(map).toHaveAttribute('data-lng', '81.2')
  })

  test('omits mini-map and shows "（未定位）" when lat/lng missing', () => {
    renderDrawer({ activity: makeActivity({ lat: null, lng: null }) })
    expect(screen.queryByTestId('mock-mini-map')).toBeNull()
    const loc = screen.getByTestId('detail-location')
    expect(loc).toHaveTextContent('（未定位）')
  })

  test('shows a single "（未定位）" when both address and coords are missing', () => {
    renderDrawer({ activity: makeActivity({ address: null, lat: null, lng: null }) })
    const loc = screen.getByTestId('detail-location')
    // Match occurrences — there should be exactly one "（未定位）"
    const occurrences = (loc.textContent.match(/（未定位）/g) || []).length
    expect(occurrences).toBe(1)
  })
})
