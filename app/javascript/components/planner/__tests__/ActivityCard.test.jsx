import { render, screen, fireEvent } from '@testing-library/react'
import { DndContext } from '@dnd-kit/core'
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

test('does not fire onClick when readOnly', () => {
  const onClick = vi.fn()
  renderInDnd(<ActivityCard activity={baseActivity} onClick={onClick} readOnly />)
  fireEvent.click(screen.getByText('喀纳斯湖'))
  expect(onClick).not.toHaveBeenCalled()
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
