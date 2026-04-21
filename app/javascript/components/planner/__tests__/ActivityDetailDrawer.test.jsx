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
