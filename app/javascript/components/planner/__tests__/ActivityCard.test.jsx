import { render, screen, fireEvent } from '@testing-library/react'
import { DndContext } from '@dnd-kit/core'
import { MantineProvider } from '@mantine/core'
import { vi, afterEach } from 'vitest'
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
  position: 1,
}

test('renders the name', () => {
  renderInDnd(<ActivityCard activity={baseActivity} />)
  expect(screen.getByText('喀纳斯湖')).toBeInTheDocument()
})

test('renders kind icon svg inside the name row', () => {
  const { container } = renderInDnd(<ActivityCard activity={baseActivity} />)
  expect(container.querySelector('.ac-kind-icon svg')).toBeInTheDocument()
})

test('renders tier1 badge only when citizen_level is tier_one', () => {
  const { rerender } = renderInDnd(<ActivityCard activity={{ ...baseActivity, citizen_level: 'tier_one' }} />)
  expect(screen.getByTestId('tier-badge')).toBeInTheDocument()
  rerender(<DndContext><ActivityCard activity={baseActivity} /></DndContext>)
  expect(screen.queryByTestId('tier-badge')).not.toBeInTheDocument()
})

test('citizen signal carries data-level=tier_one', () => {
  const { container } = renderInDnd(
    <ActivityCard activity={{ ...baseActivity, citizen_level: 'tier_one' }} />
  )
  const signal = container.querySelector('[data-testid="citizen-signal"]')
  expect(signal).toBeInTheDocument()
  expect(signal.getAttribute('data-level')).toBe('tier_one')
})

test('citizen signal carries data-level=infrastructure', () => {
  const { container } = renderInDnd(
    <ActivityCard activity={{ ...baseActivity, citizen_level: 'infrastructure' }} />
  )
  const signal = container.querySelector('[data-testid="citizen-signal"]')
  expect(signal).toBeInTheDocument()
  expect(signal.getAttribute('data-level')).toBe('infrastructure')
})

test('renders planned time when provided', () => {
  renderInDnd(<ActivityCard activity={{ ...baseActivity, planned_start_at: '10:00' }} />)
  expect(screen.getByText('10:00')).toBeInTheDocument()
})

test('formats duration >=60 and divisible by 30 as hours', () => {
  renderInDnd(<ActivityCard activity={{ ...baseActivity, planned_duration_min: 150 }} />)
  expect(screen.getByText('2.5h')).toBeInTheDocument()
})

test('formats duration otherwise as minutes', () => {
  renderInDnd(<ActivityCard activity={{ ...baseActivity, planned_duration_min: 45 }} />)
  expect(screen.getByText('45分')).toBeInTheDocument()
})

test('renders truncated last segment of address', () => {
  renderInDnd(<ActivityCard activity={{ ...baseActivity, address: '新疆阿勒泰 布尔津县' }} />)
  expect(screen.getByText('布尔津县')).toBeInTheDocument()
})

test('renders thumb gradient when _coverUrl present', () => {
  const { container } = renderInDnd(
    <ActivityCard activity={{ ...baseActivity, _coverUrl: 'https://example.com/x.jpg' }} />
  )
  const thumb = container.querySelector('[data-testid="thumb-gradient"]')
  expect(thumb).toBeInTheDocument()
  expect(thumb.style.backgroundImage).toContain('example.com')
})

test('does not render thumb gradient when _coverUrl missing', () => {
  const { container } = renderInDnd(<ActivityCard activity={baseActivity} />)
  expect(container.querySelector('[data-testid="thumb-gradient"]')).not.toBeInTheDocument()
})

test('hides meta cell (not removes) when its data is missing', () => {
  const { container } = renderInDnd(<ActivityCard activity={baseActivity} />)
  // All 4 meta cells should exist in DOM; duration/time cells should have the empty modifier
  const cells = container.querySelectorAll('.ac-meta-cell')
  expect(cells).toHaveLength(4)
  expect(container.querySelector('.ac-meta-cell.ac-meta-cell--empty')).toBeInTheDocument()
})

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
