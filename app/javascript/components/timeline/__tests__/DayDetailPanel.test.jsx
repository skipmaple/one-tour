import { render, screen } from '@testing-library/react'
import { MantineProvider } from '@mantine/core'
import DayDetailPanel from '../DayDetailPanel'

const constitution = { max_daily_driving_minutes: 420, max_tier_one_per_day: 3 }

test('returns null when day is null', () => {
  const { container } = render(
    <MantineProvider>
      <DayDetailPanel day={null} activities={[]} constitution={constitution} />
    </MantineProvider>
  )
  expect(container.querySelector('[data-testid="day-detail-panel"]')).not.toBeInTheDocument()
})

test('shows empty-state message when no activities have planned_start_at', () => {
  const day = { id: 1, day_index: 2 }
  render(
    <MantineProvider>
      <DayDetailPanel day={day} activities={[{ id: 1, name: 'X', kind: 'scenic', citizen_level: 'tier_one' }]} constitution={constitution} />
    </MantineProvider>
  )
  expect(screen.getByText(/本日无时间安排/)).toBeInTheDocument()
})

test('renders hourly grid when activities have planned_start_at', () => {
  const day = { id: 1, day_index: 2 }
  const activities = [
    { id: 1, name: '早餐', kind: 'food', citizen_level: 'tier_three', planned_start_at: '10:00', planned_duration_min: 60 },
    { id: 2, name: '赛里木湖', kind: 'scenic', citizen_level: 'tier_one', planned_start_at: '14:00', planned_duration_min: 240 },
  ]
  render(
    <MantineProvider>
      <DayDetailPanel day={day} activities={activities} constitution={constitution} />
    </MantineProvider>
  )
  // Rows from 09:00 to 16:00 (10-1 to 14+2)
  expect(screen.getByText('09:00')).toBeInTheDocument()
  expect(screen.getByText('10:00')).toBeInTheDocument()
  expect(screen.getByText('14:00')).toBeInTheDocument()
  expect(screen.getByText('16:00')).toBeInTheDocument()
  expect(screen.getByTestId('detail-activity-1')).toBeInTheDocument()
  expect(screen.getByTestId('detail-activity-2')).toBeInTheDocument()
})

test('shows driving summary and tier_one summary with checkmark when within limits', () => {
  const day = { id: 1, day_index: 2 }
  const activities = [
    { id: 1, name: 'drive', kind: 'road', citizen_level: 'tier_one', planned_start_at: '10:00', details: { drive_min: 200 } },
  ]
  render(
    <MantineProvider>
      <DayDetailPanel day={day} activities={activities} constitution={constitution} />
    </MantineProvider>
  )
  expect(screen.getByText(/200\/420/)).toBeInTheDocument()
  expect(screen.getByText(/1\/3/)).toBeInTheDocument()
})

test('shows "超限" icon when driving exceeds limit', () => {
  const day = { id: 1, day_index: 2 }
  const activities = [
    { id: 1, name: 'drive', kind: 'road', citizen_level: 'tier_three', planned_start_at: '10:00', details: { drive_min: 500 } },
  ]
  const { container } = render(
    <MantineProvider>
      <DayDetailPanel day={day} activities={activities} constitution={constitution} />
    </MantineProvider>
  )
  expect(screen.getByText(/500\/420/)).toBeInTheDocument()
  // "达标" check icon should NOT render on the drive cell; "超限" icon should.
  expect(container.querySelector('[aria-label="超限"]')).toBeInTheDocument()
})
