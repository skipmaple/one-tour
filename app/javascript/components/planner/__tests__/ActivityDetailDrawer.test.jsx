import { render, screen, fireEvent, within } from '@testing-library/react'
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

vi.mock('../../activity-editor/ActivityGalleryLightbox', () => ({
  default: ({ images, initialIndex, onClose }) =>
    initialIndex != null
      ? <div data-testid="mock-lightbox" data-count={images.length} data-index={initialIndex} onClick={onClose} />
      : null,
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
    expect(header).toHaveTextContent('景点')
    expect(header).toHaveTextContent('二等公民（配角）')
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
    const header = screen.getByTestId('detail-header')
    expect(within(header).getByRole('button', { name: /记一笔/ })).toBeInTheDocument()
    expect(within(header).getByRole('button', { name: /编辑/ })).toBeInTheDocument()
  })

  test('canEdit=false hides [+ 记一笔] and [编辑] header buttons', () => {
    renderDrawer({ canEdit: false })
    expect(screen.queryByRole('button', { name: /记一笔/ })).toBeNull()
    expect(screen.queryByRole('button', { name: /编辑/ })).toBeNull()
  })

  test('clicking [+ 记一笔] calls onAddExpense with activity id', () => {
    const onAddExpense = vi.fn()
    renderDrawer({ onAddExpense })
    const header = screen.getByTestId('detail-header')
    fireEvent.click(within(header).getByRole('button', { name: /记一笔/ }))
    expect(onAddExpense).toHaveBeenCalledWith(10)
  })

  test('clicking [编辑] calls onEdit with activity id', () => {
    const onEdit = vi.fn()
    renderDrawer({ onEdit })
    fireEvent.click(screen.getByRole('button', { name: /编辑/ }))
    expect(onEdit).toHaveBeenCalledWith(10)
  })

  test('header [+ 记一笔] is disabled on backlog activity', () => {
    renderDrawer({ canEdit: true, activity: makeActivity({ day_id: null }) })
    const headerBtns = within(screen.getByTestId('detail-header'))
      .getAllByRole('button', { name: /记一笔/ })
    expect(headerBtns[0]).toBeDisabled()
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

  test('handles string lat/lng (Rails decimal serialization) without crashing', () => {
    // Rails serializes decimal columns as JSON strings. The drawer must cope.
    renderDrawer({ activity: makeActivity({ lat: '44.6', lng: '81.2' }) })
    const loc = screen.getByTestId('detail-location')
    expect(loc).toHaveTextContent(/44\.6/)
    expect(loc).toHaveTextContent(/81\.2/)
    expect(screen.getByTestId('mock-mini-map')).toBeInTheDocument()
  })

  test('shows a single "（未定位）" when both address and coords are missing', () => {
    renderDrawer({ activity: makeActivity({ address: null, lat: null, lng: null }) })
    const loc = screen.getByTestId('detail-location')
    // Match occurrences — there should be exactly one "（未定位）"
    const occurrences = (loc.textContent.match(/（未定位）/g) || []).length
    expect(occurrences).toBe(1)
  })

  test('renders checkbox-type kind fields as "是" when true, omits when false', () => {
    // scenic kind has `need_reservation` as a checkbox field in KIND_SCHEMA
    renderDrawer({
      activity: makeActivity({
        details: { altitude: 2073, need_reservation: true, ticket_info: 70 },
      }),
    })
    const loc = screen.getByTestId('detail-location')
    expect(loc).toHaveTextContent('需要预约: 是')  // label from detailsSchema + "是"
    expect(loc).not.toHaveTextContent('true')       // raw bool suppressed
  })

  test('omits checkbox-type kind fields when false or unset', () => {
    renderDrawer({
      activity: makeActivity({
        details: { altitude: 2073, need_reservation: false },
      }),
    })
    const loc = screen.getByTestId('detail-location')
    expect(loc).not.toHaveTextContent('需要预约')  // falsy → omitted entirely
    expect(loc).not.toHaveTextContent('false')
  })
})

describe('ActivityDetailDrawer – description', () => {
  test('renders desc text when present', () => {
    renderDrawer()
    expect(screen.getByTestId('detail-desc')).toHaveTextContent('湖光山色，风景绝美。')
  })

  test('renders newlines as <br> via remark-breaks', () => {
    renderDrawer({ activity: makeActivity({ desc: 'line1\nline2' }) })
    const el = screen.getByTestId('detail-desc')
    expect(el.querySelectorAll('br').length).toBeGreaterThanOrEqual(1)
  })

  test('does not render section when desc is empty', () => {
    renderDrawer({ activity: makeActivity({ desc: '' }) })
    expect(screen.queryByTestId('detail-desc')).toBeNull()
  })

  test('does not render section when desc is null', () => {
    renderDrawer({ activity: makeActivity({ desc: null }) })
    expect(screen.queryByTestId('detail-desc')).toBeNull()
  })
})

describe('ActivityDetailDrawer – gallery', () => {
  const IMAGES = [
    { id: 1, activity_id: 10, url: '/storage/1.jpg', caption: null, position: 1 },
    { id: 2, activity_id: 10, url: '/storage/2.jpg', caption: null, position: 2 },
  ]

  test('renders thumbnails when images present', () => {
    renderDrawer({ activityImages: IMAGES })
    const thumbs = screen.getAllByTestId(/^detail-thumb-/)
    expect(thumbs).toHaveLength(2)
  })

  test('does not render section when images is empty', () => {
    renderDrawer({ activityImages: [] })
    expect(screen.queryByTestId(/^detail-thumb-/)).toBeNull()
  })

  test('clicking a thumbnail opens lightbox at that index', () => {
    renderDrawer({ activityImages: IMAGES })
    fireEvent.click(screen.getByTestId('detail-thumb-1'))
    const box = screen.getByTestId('mock-lightbox')
    expect(box).toHaveAttribute('data-count', '2')
    expect(box).toHaveAttribute('data-index', '1')
  })

  test('only images for this activity are shown (filter by activity_id)', () => {
    const mixed = [
      ...IMAGES,
      { id: 99, activity_id: 999, url: '/storage/other.jpg', caption: null, position: 1 },
    ]
    renderDrawer({ activityImages: mixed })
    expect(screen.getAllByTestId(/^detail-thumb-/)).toHaveLength(2)
  })
})

describe('ActivityDetailDrawer – participants', () => {
  test('default-full (empty participant_user_ids) shows "默认全员 · N 人"', () => {
    renderDrawer()
    const sec = screen.getByTestId('detail-participants')
    expect(sec).toHaveTextContent('默认全员')
    expect(sec).toHaveTextContent('3 人')  // author + 2 members
    expect(sec).toHaveTextContent('Alice')
    expect(sec).toHaveTextContent('Bob')
    expect(sec).toHaveTextContent('Cindy')
  })

  test('explicit subset shows "参与人 · N 人" and lists only those users', () => {
    renderDrawer({ activity: makeActivity({ participant_user_ids: [ 2 ] }) })
    const sec = screen.getByTestId('detail-participants')
    expect(sec).toHaveTextContent('参与人')
    expect(sec).toHaveTextContent('1 人')
    expect(sec).toHaveTextContent('Bob')
    expect(sec).not.toHaveTextContent('Alice')
    expect(sec).not.toHaveTextContent('Cindy')
  })

  test('renders author with isAuthor flag in UserLabel', () => {
    renderDrawer({ activity: makeActivity({ participant_user_ids: [ 1 ] }) })
    const sec = screen.getByTestId('detail-participants')
    expect(sec).toHaveTextContent('作者')
  })
})

describe('ActivityDetailDrawer – expenses', () => {
  const E1 = {
    id: 501, scope: 'activity', activity_id: 10,
    amount_cents: 12000, category: 'ticket',
    paid_by_id: 1, split_strategy: 'equal',
    splits: [ { user_id: 1, amount_cents: 4000 }, { user_id: 2, amount_cents: 4000 }, { user_id: 3, amount_cents: 4000 } ],
  }
  const E2 = {
    id: 502, scope: 'activity', activity_id: 10,
    amount_cents: 8000, category: 'food',
    paid_by_id: 2, split_strategy: 'individual',
    splits: [],
  }
  const OTHER = { id: 503, scope: 'day', activity_id: null, day_id: 1, amount_cents: 5000, category: 'fuel', paid_by_id: 1 }

  test('renders empty state when no activity-scope expenses', () => {
    renderDrawer({ expenses: [] })
    expect(screen.getByTestId('detail-expenses')).toHaveTextContent('还没有花销记录')
  })

  test('filters to activity-scope only and shows count + total', () => {
    renderDrawer({ expenses: [ E1, E2, OTHER ] })
    const sec = screen.getByTestId('detail-expenses')
    expect(sec).toHaveTextContent('2 笔')
    expect(sec).toHaveTextContent('¥200')  // 12000 + 8000 = 20000 cents = ¥200
  })

  test('does not count expenses from other activities', () => {
    const ForeignActivity = { ...E1, id: 999, activity_id: 999 }
    renderDrawer({ expenses: [ E1, ForeignActivity ] })
    expect(screen.getByTestId('detail-expenses')).toHaveTextContent('1 笔')
  })

  test('canEdit=true + non-backlog activity shows section [+ 记一笔] button (enabled)', () => {
    renderDrawer({ canEdit: true })
    const btns = screen.getAllByRole('button', { name: /记一笔/ })
    // Two [+ 记一笔] buttons expected: header + expenses section
    expect(btns).toHaveLength(2)
    expect(btns[1]).not.toBeDisabled()
  })

  test('canEdit=true + backlog activity shows section [+ 记一笔] button disabled', () => {
    renderDrawer({ canEdit: true, activity: makeActivity({ day_id: null }) })
    const sectionBtn = screen.getByTestId('detail-expenses-add-btn')
    expect(sectionBtn).toBeDisabled()
  })

  test('canEdit=false hides section [+ 记一笔] button', () => {
    renderDrawer({ canEdit: false })
    expect(screen.queryByTestId('detail-expenses-add-btn')).toBeNull()
  })

  test('clicking section [+ 记一笔] calls onAddExpense', () => {
    const onAddExpense = vi.fn()
    renderDrawer({ onAddExpense })
    fireEvent.click(screen.getByTestId('detail-expenses-add-btn'))
    expect(onAddExpense).toHaveBeenCalledWith(10)
  })

  test('clicking an expense row calls onFocusExpense with its id', () => {
    const onFocusExpense = vi.fn()
    renderDrawer({ expenses: [ E1 ], onFocusExpense })
    fireEvent.click(screen.getByTestId('detail-expense-row-501'))
    expect(onFocusExpense).toHaveBeenCalledWith(501)
  })

  test('renders negative expense amounts as "-¥N" (refunds)', () => {
    const refund = {
      id: 701, scope: 'activity', activity_id: 10,
      amount_cents: -5000, category: 'refund',
      paid_by_id: 1, split_strategy: 'individual',
      splits: [],
    }
    renderDrawer({ expenses: [ refund ] })
    const row = screen.getByTestId('detail-expense-row-701')
    expect(row).toHaveTextContent('-¥50')
    // And the summary total should also be negative
    expect(screen.getByTestId('detail-expenses')).toHaveTextContent('-¥50')
  })
})
