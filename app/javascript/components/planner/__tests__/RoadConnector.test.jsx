import { render, screen, fireEvent } from '@testing-library/react'
import { DndContext } from '@dnd-kit/core'
import { vi, afterEach } from 'vitest'
import RoadConnector from '../RoadConnector'

// Match the droppable-mock pattern used in ActivityCard.test.jsx so tests
// are hermetic across dnd-kit's useDroppable.
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

const roadActivity = {
  id: 42,
  name: '乌鲁木齐→百丽丹霞',
  kind: 'road',
  citizen_level: 'infrastructure',
  position: 2,
  day_id: 7,
  details: { km: 28, drive_min: 40 },
}

test('renders distance and duration from activity.details in Chinese units', () => {
  renderInDnd(<RoadConnector activity={roadActivity} />)
  expect(screen.getByText(/28 公里/)).toBeInTheDocument()
  expect(screen.getByText(/40 分钟/)).toBeInTheDocument()
})

test('renders duration in hours when >= 60 min and divisible by 30', () => {
  renderInDnd(<RoadConnector activity={{ ...roadActivity, details: { km: 150, drive_min: 150 } }} />)
  expect(screen.getByText(/2\.5 小时/)).toBeInTheDocument()
})

test('renders duration in hours when divisible by 60', () => {
  renderInDnd(<RoadConnector activity={{ ...roadActivity, details: { km: 100, drive_min: 120 } }} />)
  expect(screen.getByText(/2 小时/)).toBeInTheDocument()
})

test('renders minutes when duration not divisible by 30', () => {
  renderInDnd(<RoadConnector activity={{ ...roadActivity, details: { km: 50, drive_min: 100 } }} />)
  expect(screen.getByText(/100 分钟/)).toBeInTheDocument()
})

test('falls back to legFallback when activity details missing', () => {
  const leg = { distance_m: 28000, duration_s: 2400 } // 28 km, 40 min
  renderInDnd(<RoadConnector activity={{ ...roadActivity, details: {} }} legFallback={leg} />)
  expect(screen.getByText(/28 公里/)).toBeInTheDocument()
  expect(screen.getByText(/40 分钟/)).toBeInTheDocument()
})

test('renders only distance when only km present', () => {
  renderInDnd(<RoadConnector activity={{ ...roadActivity, details: { km: 28 } }} />)
  expect(screen.getByText(/28 公里/)).toBeInTheDocument()
  expect(screen.queryByText(/分钟|小时/)).toBeNull()
})

test('renders only duration when only drive_min present', () => {
  renderInDnd(<RoadConnector activity={{ ...roadActivity, details: { drive_min: 40 } }} />)
  expect(screen.getByText(/40 分钟/)).toBeInTheDocument()
  expect(screen.queryByText(/公里/)).toBeNull()
})

test('renders no text when both distance and duration missing', () => {
  const { container } = renderInDnd(<RoadConnector activity={{ ...roadActivity, details: {} }} />)
  expect(screen.queryByText(/公里|分钟|小时/)).toBeNull()
  // Car icon still present
  expect(container.querySelector('.rc-line svg')).toBeInTheDocument()
})

test('activity-backed connector fires onClick with activity id', () => {
  const onClick = vi.fn()
  renderInDnd(<RoadConnector activity={roadActivity} onClick={onClick} />)
  fireEvent.click(screen.getByText(/28 公里/))
  expect(onClick).toHaveBeenCalledWith(42)
})

test('activity-backed connector exposes draggable aria role', () => {
  const { container } = renderInDnd(<RoadConnector activity={roadActivity} />)
  expect(container.querySelector('[aria-roledescription="draggable"]')).not.toBeNull()
})

test('readOnly suppresses onClick and draggable role', () => {
  const onClick = vi.fn()
  const { container } = renderInDnd(<RoadConnector activity={roadActivity} onClick={onClick} readOnly />)
  fireEvent.click(screen.getByText(/28 公里/))
  expect(onClick).not.toHaveBeenCalled()
  expect(container.querySelector('[aria-roledescription="draggable"]')).toBeNull()
})

test('synthesized mode renders from leg prop with rc-synthesized class', () => {
  const leg = { distance_m: 45000, duration_s: 3600 }
  const { container } = renderInDnd(
    <RoadConnector synthesized leg={leg} fromActivityId={1} toActivityId={2} />
  )
  expect(screen.getByText(/45 公里/)).toBeInTheDocument()
  expect(screen.getByText(/1 小时/)).toBeInTheDocument()
  expect(container.querySelector('.rc-line.rc-synthesized')).toBeInTheDocument()
})

test('synthesized mode is not draggable', () => {
  const leg = { distance_m: 45000, duration_s: 3600 }
  const { container } = renderInDnd(
    <RoadConnector synthesized leg={leg} fromActivityId={1} toActivityId={2} />
  )
  expect(container.querySelector('[aria-roledescription="draggable"]')).toBeNull()
})

test('synthesized mode ignores onClick', () => {
  const onClick = vi.fn()
  const leg = { distance_m: 45000, duration_s: 3600 }
  renderInDnd(
    <RoadConnector synthesized leg={leg} fromActivityId={1} toActivityId={2} onClick={onClick} />
  )
  fireEvent.click(screen.getByText(/45 公里/))
  expect(onClick).not.toHaveBeenCalled()
})

test('applies .rc-highlighted class when isHighlighted=true', () => {
  const { container } = renderInDnd(<RoadConnector activity={roadActivity} isHighlighted />)
  expect(container.querySelector('.rc-line.rc-highlighted')).toBeInTheDocument()
})

test('calls onHoverConnector(fromId, toId) on mouseenter when both ids present', () => {
  const onHoverConnector = vi.fn()
  const { container } = renderInDnd(
    <RoadConnector
      activity={roadActivity}
      fromActivityId={10}
      toActivityId={20}
      onHoverConnector={onHoverConnector}
    />
  )
  fireEvent.mouseEnter(container.querySelector('.rc-line'))
  expect(onHoverConnector).toHaveBeenCalledWith(10, 20)
})

test('does NOT call onHoverConnector when fromActivityId is null', () => {
  const onHoverConnector = vi.fn()
  const { container } = renderInDnd(
    <RoadConnector
      activity={roadActivity}
      fromActivityId={null}
      toActivityId={20}
      onHoverConnector={onHoverConnector}
    />
  )
  fireEvent.mouseEnter(container.querySelector('.rc-line'))
  expect(onHoverConnector).not.toHaveBeenCalled()
})

test('renders data-day-color from dayColorName prop', () => {
  const { container } = renderInDnd(<RoadConnector activity={roadActivity} dayColorName="teal" />)
  expect(container.querySelector('.rc-line').getAttribute('data-day-color')).toBe('teal')
})
