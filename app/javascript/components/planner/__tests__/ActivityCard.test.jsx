import { render, screen, fireEvent } from '@testing-library/react'
import { DndContext } from '@dnd-kit/core'
import { MantineProvider } from '@mantine/core'
import { describe, test, expect, vi, afterEach } from 'vitest'
import ActivityCard, { ActivityCardOverlay } from '../ActivityCard'

// Allow tests to override useDroppable return (used by insert-indicator test)
const mockDroppableReturn = { current: { setNodeRef: () => {}, isOver: false } }
vi.mock('@dnd-kit/core', async () => {
  const actual = await vi.importActual('@dnd-kit/core')
  return {
    ...actual,
    useDroppable: () => mockDroppableReturn.current,
  }
})

afterEach(() => {
  mockDroppableReturn.current = { setNodeRef: () => {}, isOver: false }
})

function renderInDnd(ui) {
  return render(<DndContext>{ui}</DndContext>)
}

// Avatar.Group (Mantine) requires MantineProvider. Use this wrapper for tests
// that exercise participant avatar rendering.
function renderInMantine(ui) {
  return render(<MantineProvider><DndContext>{ui}</DndContext></MantineProvider>)
}

const baseActivity = {
  id: 1,
  name: '喀纳斯湖',
  kind: 'scenic',
  citizen_level: 'tier_two',
  status: 'confirmed',
  position: 1,
}

// ---- identity row -----------------------------------------------------------

test('renders the name', () => {
  renderInDnd(<ActivityCard activity={baseActivity} />)
  expect(screen.getByText('喀纳斯湖')).toBeInTheDocument()
})

test('renders kind icon svg inside the name row', () => {
  const { container } = renderInDnd(<ActivityCard activity={baseActivity} />)
  expect(container.querySelector('.ac-name-row .ac-kind-icon svg')).toBeInTheDocument()
})

test('renders the tier star only when citizen_level is tier_one', () => {
  const { rerender } = renderInDnd(<ActivityCard activity={{ ...baseActivity, citizen_level: 'tier_one' }} />)
  expect(screen.getByTestId('tier-star')).toBeInTheDocument()
  rerender(<DndContext><ActivityCard activity={baseActivity} /></DndContext>)
  expect(screen.queryByTestId('tier-star')).not.toBeInTheDocument()
})

test('adds .ac-tier1 class for tier_one (gold accent)', () => {
  const { container } = renderInDnd(<ActivityCard activity={{ ...baseActivity, citizen_level: 'tier_one' }} />)
  expect(container.querySelector('.ac-card.ac-tier1')).toBeInTheDocument()
})

test('no longer renders the citizen signal bars', () => {
  const { container } = renderInDnd(
    <ActivityCard activity={{ ...baseActivity, citizen_level: 'infrastructure' }} />
  )
  expect(container.querySelector('[data-testid="citizen-signal"]')).toBeNull()
})

// ---- time row ---------------------------------------------------------------

test('renders arrival time labeled with 到', () => {
  renderInDnd(<ActivityCard activity={{ ...baseActivity, planned_start_at: '10:00' }} />)
  expect(screen.getByText('10:00到')).toBeInTheDocument()
})

test('renders duration with a 停留 prefix in human units', () => {
  renderInDnd(<ActivityCard activity={{ ...baseActivity, planned_duration_min: 150 }} />)
  expect(screen.getByText('停留2.5h')).toBeInTheDocument()
})

test('combines time and duration on one line', () => {
  renderInDnd(
    <ActivityCard activity={{ ...baseActivity, planned_start_at: '10:00', planned_duration_min: 120 }} />
  )
  expect(screen.getByText('10:00到 · 停留2h')).toBeInTheDocument()
})

// ---- smart-fact chips -------------------------------------------------------

test('closed status desaturates the card and shows a 暂停开放 chip', () => {
  const { container } = renderInDnd(<ActivityCard activity={{ ...baseActivity, status: 'closed' }} />)
  expect(container.querySelector('.ac-card.ac-status-closed')).toBeInTheDocument()
  expect(screen.getByText('暂停开放')).toBeInTheDocument()
})

test('pending status shows a 待定 chip', () => {
  const { container } = renderInDnd(<ActivityCard activity={{ ...baseActivity, status: 'pending' }} />)
  expect(container.querySelector('.ac-card.ac-status-pending')).toBeInTheDocument()
  expect(screen.getByText('待定')).toBeInTheDocument()
})

test('shows a 需预约 chip when scenic activity needs a reservation', () => {
  renderInDnd(<ActivityCard activity={{ ...baseActivity, details: { need_reservation: true } }} />)
  expect(screen.getByText('需预约')).toBeInTheDocument()
})

test('surfaces a locator chip from the address', () => {
  renderInDnd(<ActivityCard activity={{ ...baseActivity, address: '新疆阿勒泰 布尔津县' }} />)
  expect(screen.getByText('布尔津县')).toBeInTheDocument()
})

test('a confirmed card with no notable data renders no chip row', () => {
  const { container } = renderInDnd(<ActivityCard activity={baseActivity} />)
  expect(container.querySelector('.ac-meta-extra')).toBeNull()
})

// ---- no inline thumbnail (photos live in the detail drawer) -----------------

test('never renders an inline thumbnail on the card face, even with a cover or place photo', () => {
  const a = renderInDnd(<ActivityCard activity={{ ...baseActivity, _coverUrl: 'https://example.com/x.jpg' }} />)
  expect(a.container.querySelector('.ac-thumb')).toBeNull()
  expect(a.container.querySelector('.ac-card.ac-has-thumb')).toBeNull()

  const b = renderInDnd(<ActivityCard activity={{ ...baseActivity, details: { place: { photo: 'https://amap.example/x.jpg' } } }} />)
  expect(b.container.querySelector('.ac-thumb')).toBeNull()
})

test('compact variant marks the card (narrow backlog, single-line name)', () => {
  const { container } = renderInDnd(<ActivityCard activity={baseActivity} compact />)
  expect(container.querySelector('.ac-card.ac-compact')).toBeInTheDocument()
})

// ---- interaction / behavior (unchanged contract) ----------------------------

test('fires onClick when card body is clicked', () => {
  const onClick = vi.fn()
  renderInDnd(<ActivityCard activity={baseActivity} onClick={onClick} />)
  fireEvent.click(screen.getByText('喀纳斯湖'))
  expect(onClick).toHaveBeenCalledWith(1)
})

test('readOnly=true does NOT gate onClick — reader can click to open detail', () => {
  const onClick = vi.fn()
  renderInDnd(<ActivityCard activity={baseActivity} onClick={onClick} readOnly />)
  fireEvent.click(screen.getByText('喀纳斯湖'))
  expect(onClick).toHaveBeenCalledWith(1)
})

test('does not expose draggable aria role when readOnly', () => {
  renderInDnd(<ActivityCard activity={baseActivity} readOnly />)
  expect(
    screen.queryByText('喀纳斯湖').closest('[aria-roledescription="draggable"]')
  ).toBeNull()
})

test('outer card exposes draggable aria role when not readOnly', () => {
  renderInDnd(<ActivityCard activity={baseActivity} />)
  expect(
    screen.getByText('喀纳斯湖').closest('[aria-roledescription="draggable"]')
  ).not.toBeNull()
})

test('applies ac-readonly class when readOnly and onClick are both set', () => {
  const { container } = renderInDnd(
    <ActivityCard activity={baseActivity} onClick={() => {}} readOnly />
  )
  expect(container.querySelector('.ac-card.ac-readonly')).toBeInTheDocument()
})

test('does not apply ac-readonly class without onClick', () => {
  const { container } = renderInDnd(<ActivityCard activity={baseActivity} readOnly />)
  expect(container.querySelector('.ac-card.ac-readonly')).not.toBeInTheDocument()
})

test('shows drop indicator when isOver=true', () => {
  mockDroppableReturn.current = { setNodeRef: () => {}, isOver: true }
  renderInDnd(<ActivityCard activity={baseActivity} />)
  expect(screen.getByTestId('drop-indicator')).toBeInTheDocument()
})

test('hides drop indicator when isOver=false', () => {
  mockDroppableReturn.current = { setNodeRef: () => {}, isOver: false }
  renderInDnd(<ActivityCard activity={baseActivity} />)
  expect(screen.queryByTestId('drop-indicator')).not.toBeInTheDocument()
})

test('ActivityCardOverlay renders name without drag handlers', () => {
  render(<ActivityCardOverlay activity={baseActivity} />)
  expect(screen.getByText('喀纳斯湖')).toBeInTheDocument()
})

test('applies .ac-highlighted class when isHighlighted=true', () => {
  const { container } = renderInDnd(<ActivityCard activity={baseActivity} isHighlighted />)
  expect(container.querySelector('.ac-card.ac-highlighted')).toBeInTheDocument()
})

test('does NOT apply .ac-highlighted class when isHighlighted=false', () => {
  const { container } = renderInDnd(<ActivityCard activity={baseActivity} isHighlighted={false} />)
  expect(container.querySelector('.ac-card.ac-highlighted')).toBeNull()
})

test('calls onHoverActivity(activity.id) on mouseenter and onClearHover on mouseleave', () => {
  const onHoverActivity = vi.fn()
  const onClearHover    = vi.fn()
  const { container } = renderInDnd(
    <ActivityCard
      activity={baseActivity}
      onHoverActivity={onHoverActivity}
      onClearHover={onClearHover}
    />
  )
  const card = container.querySelector('.ac-card')
  fireEvent.mouseEnter(card)
  expect(onHoverActivity).toHaveBeenCalledWith(baseActivity.id)
  fireEvent.mouseLeave(card)
  expect(onClearHover).toHaveBeenCalled()
})

test('renders data-day-color attribute from dayColorName prop', () => {
  const { container } = renderInDnd(<ActivityCard activity={baseActivity} dayColorName="blue" />)
  expect(container.querySelector('.ac-card').getAttribute('data-day-color')).toBe('blue')
})

const AUTHOR  = { user_id: 1, name: '甲', avatar_url: null }
const MEMBERS = [
  { user_id: 2, name: '乙', avatar_url: null },
  { user_id: 3, name: '丙', avatar_url: null },
  { user_id: 4, name: '丁', avatar_url: null },
]

test('does not render participant avatar group when participant_user_ids is empty (默认全员)', () => {
  const { container } = renderInMantine(
    <ActivityCard
      activity={{ ...baseActivity, participant_user_ids: [] }}
      author={AUTHOR}
      members={MEMBERS}
    />
  )
  expect(container.querySelector('[data-testid="activity-participants"]')).toBeNull()
})

test('renders avatar group with overflow when 4 explicit participants', () => {
  const { container } = renderInMantine(
    <ActivityCard
      activity={{ ...baseActivity, participant_user_ids: [ 1, 2, 3, 4 ] }}
      author={AUTHOR}
      members={MEMBERS}
    />
  )
  expect(container.querySelector('[data-testid="activity-participants"]')).toBeInTheDocument()
  expect(screen.getByText('+1')).toBeInTheDocument()
})

test('click on thumb area (outside .ac-body) still opens detail', () => {
  const onClick = vi.fn()
  const { container } = renderInDnd(
    <ActivityCard activity={baseActivity} readOnly={true} onClick={onClick} />
  )
  const card = container.querySelector('.ac-card')
  fireEvent.click(card)
  expect(onClick).toHaveBeenCalledWith(1)
})

test('readOnly card has button role and is keyboard-accessible', () => {
  const onClick = vi.fn()
  renderInDnd(<ActivityCard activity={baseActivity} readOnly={true} onClick={onClick} />)
  const card = screen.getByRole('button', { name: baseActivity.name })
  expect(card).toHaveAttribute('tabindex', '0')
  card.focus()
  fireEvent.keyDown(card, { key: 'Enter' })
  expect(onClick).toHaveBeenCalledWith(baseActivity.id)
})

test('renders avatar group without "+N" when exactly 3 explicit participants', () => {
  renderInMantine(
    <ActivityCard
      activity={{ ...baseActivity, participant_user_ids: [ 1, 2, 3 ] }}
      author={AUTHOR}
      members={MEMBERS}
    />
  )
  expect(screen.queryByText(/^\+\d+$/)).not.toBeInTheDocument()
})

test('draggable=true (default) → data-draggable="true" on .ac-card root', () => {
  const { container } = renderInDnd(<ActivityCard activity={baseActivity} />)
  expect(container.querySelector('.ac-card').getAttribute('data-draggable')).toBe('true')
})

test('draggable=false → data-draggable="false" on .ac-card root', () => {
  const { container } = renderInDnd(
    <ActivityCard activity={baseActivity} draggable={false} />
  )
  expect(container.querySelector('.ac-card').getAttribute('data-draggable')).toBe('false')
})

function renderCard(props = {}) {
  const activity = {
    id: 1, name: '赛里木湖', kind: 'scenic', citizen_level: 'tier_one',
    status: 'confirmed', day_id: 10, position: 1, details: {},
  }
  return render(
    <MantineProvider>
      <DndContext>
        <ActivityCard activity={activity} {...props} />
      </DndContext>
    </MantineProvider>
  )
}

describe('ActivityCard context menu', () => {
  test('right-click calls onCardContextMenu with activity + coords and prevents default', () => {
    const onCardContextMenu = vi.fn()
    const { container } = renderCard({ onCardContextMenu })
    const card = container.querySelector('.ac-card')
    const evt = new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 120, clientY: 200 })
    card.dispatchEvent(evt)
    expect(onCardContextMenu).toHaveBeenCalledTimes(1)
    const [act, x, y] = onCardContextMenu.mock.calls[0]
    expect(act.id).toBe(1)
    expect(x).toBe(120)
    expect(y).toBe(200)
    expect(evt.defaultPrevented).toBe(true)
  })

  test('does not prevent default / call back when onCardContextMenu is absent (no callback)', () => {
    const { container } = renderCard({}) // no callback
    const card = container.querySelector('.ac-card')
    const evt = new MouseEvent('contextmenu', { bubbles: true, cancelable: true })
    card.dispatchEvent(evt)
    expect(evt.defaultPrevented).toBe(false)
  })

  test('a normal left-click still triggers onClick', () => {
    const onClick = vi.fn()
    const { container } = renderCard({ onClick })
    const card = container.querySelector('.ac-card')
    card.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    expect(onClick).toHaveBeenCalledWith(1)
  })

  test('a click right after a touch long-press is swallowed (detail does not open)', () => {
    vi.useFakeTimers()
    try {
      const onCardContextMenu = vi.fn()
      const onClick = vi.fn()
      const { container } = renderCard({ draggable: false, onCardContextMenu, onClick })
      const card = container.querySelector('.ac-card')

      fireEvent.pointerDown(card, { pointerType: 'touch', clientX: 30, clientY: 40 })
      vi.advanceTimersByTime(500)
      expect(onCardContextMenu).toHaveBeenCalledWith(expect.objectContaining({ id: 1 }), 30, 40)

      fireEvent.click(card)
      expect(onClick).not.toHaveBeenCalled()
    } finally {
      vi.useRealTimers()
    }
  })
})
