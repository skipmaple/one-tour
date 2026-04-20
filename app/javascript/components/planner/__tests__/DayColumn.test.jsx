import { describe, test, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MantineProvider } from '@mantine/core'
import { DndContext } from '@dnd-kit/core'
import DayColumn from '../DayColumn'

function renderIt(props = {}) {
  const day = { id: 10, day_index: 1, intensity_derived: 'green' }
  return render(
    <MantineProvider>
      <DndContext>
        <DayColumn day={day} activities={[]} constitution={{ max_daily_driving_minutes: 420 }} {...props} />
      </DndContext>
    </MantineProvider>
  )
}

function renderInDnd(element) {
  return render(
    <MantineProvider>
      <DndContext>
        {element}
      </DndContext>
    </MantineProvider>
  )
}

describe('DayColumn dragWarning', () => {
  test('renders warning banner when dragWarning prop is set', () => {
    renderIt({ dragWarning: { current: 360, incoming: 180, limit: 420, total: 540 } })
    expect(screen.getByText(/加入后驾驶/)).toBeInTheDocument()
    expect(screen.getByText(/540\/420/)).toBeInTheDocument()
  })

  test('does not render warning banner when dragWarning is null', () => {
    renderIt({ dragWarning: null })
    expect(screen.queryByText(/加入后驾驶/)).not.toBeInTheDocument()
  })
})

test('road + tier_one activity renders as ActivityCard, not RoadConnector', () => {
  const activities = [
    { id: 1, name: '独库公路', kind: 'road', citizen_level: 'tier_one', position: 1, day_id: 10 },
  ]
  const { container } = renderInDnd(
    <DayColumn day={{ id: 10, day_index: 1 }} activities={activities} constitution={null} />
  )
  expect(container.querySelector('.ac-card')).toBeInTheDocument()
  expect(container.querySelector('.rc-line')).toBeNull()
})

test('road + non-tier_one activity renders as RoadConnector, not ActivityCard', () => {
  const activities = [
    { id: 2, name: '乌鲁木齐→百丽丹霞', kind: 'road', citizen_level: 'infrastructure', position: 1, day_id: 10, details: { km: 28, drive_min: 40 } },
  ]
  const { container } = renderInDnd(
    <DayColumn day={{ id: 10, day_index: 1 }} activities={activities} constitution={null} />
  )
  expect(container.querySelector('.rc-line')).toBeInTheDocument()
  expect(container.querySelector('.ac-card')).toBeNull()
})

test('synthesizes a read-only RoadConnector between adjacent ActivityCards when route_leg exists', () => {
  const activities = [
    { id: 3, name: '喀纳斯湖',   kind: 'scenic', citizen_level: 'tier_one',  position: 1, day_id: 10, details: {} },
    { id: 4, name: '白哈巴住宿', kind: 'stay',   citizen_level: 'tier_three', position: 2, day_id: 10, details: {} },
  ]
  const routeLegs = [
    { from_activity_id: 3, to_activity_id: 4, mode: 0, distance_m: 28000, duration_s: 2400 },
  ]
  const { container } = renderInDnd(
    <DayColumn day={{ id: 10, day_index: 1 }} activities={activities} constitution={null} routeLegs={routeLegs} />
  )
  expect(container.querySelectorAll('.ac-card')).toHaveLength(2)
  expect(container.querySelector('.rc-line.rc-synthesized')).toBeInTheDocument()
})

test('synthesizes connector when route_leg.mode is the Rails string "driving"', () => {
  const activities = [
    { id: 5, name: '喀纳斯湖',   kind: 'scenic', citizen_level: 'tier_one',  position: 1, day_id: 10, details: {} },
    { id: 6, name: '白哈巴住宿', kind: 'stay',   citizen_level: 'tier_three', position: 2, day_id: 10, details: {} },
  ]
  const routeLegs = [
    { from_activity_id: 5, to_activity_id: 6, mode: 'driving', distance_m: 28000, duration_s: 2400 },
  ]
  const { container } = renderInDnd(
    <DayColumn day={{ id: 10, day_index: 1 }} activities={activities} constitution={null} routeLegs={routeLegs} />
  )
  expect(container.querySelector('.rc-line.rc-synthesized')).toBeInTheDocument()
})

test('does not synthesize between two cards when a connector activity is between them', () => {
  const activities = [
    { id: 7, name: '景点A', kind: 'scenic', citizen_level: 'tier_two', position: 1, day_id: 10, details: {} },
    { id: 8, name: 'A→B',  kind: 'road',   citizen_level: 'infrastructure', position: 2, day_id: 10, details: { km: 40, drive_min: 60 } },
    { id: 9, name: '景点B', kind: 'scenic', citizen_level: 'tier_two', position: 3, day_id: 10, details: {} },
  ]
  const routeLegs = [
    // A → B leg would synthesize a connector if nothing was between them, but
    // activity id=8 already renders as an activity-backed connector so synthesis
    // must be suppressed.
    { from_activity_id: 7, to_activity_id: 9, mode: 'driving', distance_m: 40000, duration_s: 3600 },
  ]
  const { container } = renderInDnd(
    <DayColumn day={{ id: 10, day_index: 1 }} activities={activities} constitution={null} routeLegs={routeLegs} />
  )
  // Exactly ONE connector (the activity-backed one), never a synthesized
  expect(container.querySelectorAll('.rc-line')).toHaveLength(1)
  expect(container.querySelector('.rc-line.rc-synthesized')).toBeNull()
  // Both cards still render
  expect(container.querySelectorAll('.ac-card')).toHaveLength(2)
})
