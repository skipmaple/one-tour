import { render, screen, fireEvent } from '@testing-library/react'
import { MantineProvider } from '@mantine/core'
import { DndContext } from '@dnd-kit/core'
import { vi } from 'vitest'
import RoadConnector from '../RoadConnector'

function renderInDnd(ui) {
  return render(<MantineProvider><DndContext>{ui}</DndContext></MantineProvider>)
}

test('synthesized mode renders from leg prop with rc-synthesized class', () => {
  const leg = { distance_m: 45000, duration_s: 3600 }
  const { container } = renderInDnd(
    <RoadConnector leg={leg} fromActivityId={1} toActivityId={2} />
  )
  expect(screen.getByText(/45 公里/)).toBeInTheDocument()
  expect(screen.getByText(/1 小时/)).toBeInTheDocument()
  expect(container.querySelector('.rc-line.rc-synthesized')).toBeInTheDocument()
})

test('renders distance and duration in Chinese units', () => {
  const leg = { distance_m: 28000, duration_s: 2400 }
  renderInDnd(<RoadConnector leg={leg} fromActivityId={1} toActivityId={2} />)
  expect(screen.getByText(/28 公里/)).toBeInTheDocument()
  expect(screen.getByText(/40 分钟/)).toBeInTheDocument()
})

test('renders duration in hours when >= 60 min and divisible by 30', () => {
  const leg = { distance_m: 150000, duration_s: 9000 } // 150 km, 150 min
  renderInDnd(<RoadConnector leg={leg} fromActivityId={1} toActivityId={2} />)
  expect(screen.getByText(/2\.5 小时/)).toBeInTheDocument()
})

test('renders duration in hours when divisible by 60', () => {
  const leg = { distance_m: 100000, duration_s: 7200 } // 100 km, 120 min
  renderInDnd(<RoadConnector leg={leg} fromActivityId={1} toActivityId={2} />)
  expect(screen.getByText(/2 小时/)).toBeInTheDocument()
})

test('renders minutes when duration not divisible by 30', () => {
  const leg = { distance_m: 50000, duration_s: 6000 } // 50 km, 100 min
  renderInDnd(<RoadConnector leg={leg} fromActivityId={1} toActivityId={2} />)
  expect(screen.getByText(/100 分钟/)).toBeInTheDocument()
})

test('renders only distance when only distance_m present', () => {
  const leg = { distance_m: 28000 }
  renderInDnd(<RoadConnector leg={leg} fromActivityId={1} toActivityId={2} />)
  expect(screen.getByText(/28 公里/)).toBeInTheDocument()
  expect(screen.queryByText(/分钟|小时/)).toBeNull()
})

test('renders only duration when only duration_s present', () => {
  const leg = { duration_s: 2400 }
  renderInDnd(<RoadConnector leg={leg} fromActivityId={1} toActivityId={2} />)
  expect(screen.getByText(/40 分钟/)).toBeInTheDocument()
  expect(screen.queryByText(/公里/)).toBeNull()
})

test('renders no text when both distance and duration missing', () => {
  const { container } = renderInDnd(
    <RoadConnector leg={{}} fromActivityId={1} toActivityId={2} />
  )
  expect(screen.queryByText(/公里|分钟|小时/)).toBeNull()
  // Car icon still present
  expect(container.querySelector('.rc-line svg')).toBeInTheDocument()
})

test('synthesized mode is not draggable', () => {
  const leg = { distance_m: 45000, duration_s: 3600 }
  const { container } = renderInDnd(
    <RoadConnector leg={leg} fromActivityId={1} toActivityId={2} />
  )
  expect(container.querySelector('[aria-roledescription="draggable"]')).toBeNull()
})

test('calls onClick(leg) when clicked', () => {
  const onClick = vi.fn()
  const leg = { distance_m: 45000, duration_s: 3600 }
  renderInDnd(
    <RoadConnector leg={leg} fromActivityId={1} toActivityId={2} onClick={onClick} />
  )
  fireEvent.click(screen.getByText(/45 公里/))
  expect(onClick).toHaveBeenCalledWith(leg)
})

test('applies .rc-highlighted class when isHighlighted=true', () => {
  const { container } = renderInDnd(
    <RoadConnector leg={{ distance_m: 10000 }} isHighlighted />
  )
  expect(container.querySelector('.rc-line.rc-highlighted')).toBeInTheDocument()
})

test('calls onHoverConnector(fromId, toId) on mouseenter when both ids present', () => {
  const onHoverConnector = vi.fn()
  const { container } = renderInDnd(
    <RoadConnector
      leg={{ distance_m: 10000 }}
      fromActivityId={10}
      toActivityId={20}
      onHoverConnector={onHoverConnector}
    />
  )
  fireEvent.mouseEnter(container.querySelector('.rc-line'))
  expect(onHoverConnector).toHaveBeenCalledWith(10, 20)
})

test('calls onClearHover on mouseleave', () => {
  const onClearHover = vi.fn()
  const { container } = renderInDnd(
    <RoadConnector
      leg={{ distance_m: 10000 }}
      fromActivityId={10}
      toActivityId={20}
      onClearHover={onClearHover}
    />
  )
  fireEvent.mouseLeave(container.querySelector('.rc-line'))
  expect(onClearHover).toHaveBeenCalled()
})

test('does NOT call onHoverConnector when fromActivityId is null', () => {
  const onHoverConnector = vi.fn()
  const { container } = renderInDnd(
    <RoadConnector
      leg={{ distance_m: 10000 }}
      fromActivityId={null}
      toActivityId={20}
      onHoverConnector={onHoverConnector}
    />
  )
  fireEvent.mouseEnter(container.querySelector('.rc-line'))
  expect(onHoverConnector).not.toHaveBeenCalled()
})

test('renders data-day-color from dayColorName prop', () => {
  const { container } = renderInDnd(
    <RoadConnector leg={{ distance_m: 10000 }} dayColorName="teal" />
  )
  expect(container.querySelector('.rc-line').getAttribute('data-day-color')).toBe('teal')
})

test('uses distance_m_override when present', () => {
  const leg = { distance_m: 45000, duration_s: 3600, distance_m_override: 50000 }
  renderInDnd(<RoadConnector leg={leg} />)
  expect(screen.getByText(/50 公里/)).toBeInTheDocument()
})

test('uses duration_s_override when present', () => {
  const leg = { distance_m: 45000, duration_s: 3600, duration_s_override: 5400 }
  renderInDnd(<RoadConnector leg={leg} />)
  expect(screen.getByText(/1\.5 小时/)).toBeInTheDocument()
})

test('shows overridden mark icon when overridden_at is set', () => {
  const leg = { distance_m: 45000, duration_s: 3600, overridden_at: '2026-01-01T00:00:00Z' }
  const { container } = renderInDnd(<RoadConnector leg={leg} />)
  expect(container.querySelector('.rc-overridden-mark')).toBeInTheDocument()
})
