import { render, screen, fireEvent } from '@testing-library/react'
import { MantineProvider } from '@mantine/core'
import { vi } from 'vitest'
import TimelineDayColumn from '../TimelineDayColumn'

vi.mock('@inertiajs/react', () => ({
  router: { visit: vi.fn() },
}))

const day = { id: 1, day_index: 2, date: '2026-06-11', intensity_derived: 'yellow', buffer_day: false, theme: '伊宁 → 那拉提' }
const activities = [
  { id: 100, name: '早餐', kind: 'food', citizen_level: 'tier_three', planned_start_at: '10:00', planned_duration_min: 60 },
  { id: 101, name: '赛里木湖', kind: 'scenic', citizen_level: 'tier_one', planned_start_at: '14:00', planned_duration_min: 240 },
]
const constitution = { max_daily_driving_minutes: 420, max_tier_one_per_day: 3 }

function renderCol(props = {}) {
  return render(
    <MantineProvider>
      <TimelineDayColumn day={day} activities={activities} constitution={constitution} tourId={42} {...props} />
    </MantineProvider>
  )
}

test('renders day header with index, date, weekday, and theme', () => {
  renderCol()
  expect(screen.getByText('D2')).toBeInTheDocument()
  expect(screen.getByText(/06-11/)).toBeInTheDocument()
  expect(screen.getByText(/周/)).toBeInTheDocument()
  expect(screen.getByText('伊宁 → 那拉提')).toBeInTheDocument()
})

test('renders all activities', () => {
  renderCol()
  expect(screen.getByText('早餐')).toBeInTheDocument()
  expect(screen.getByText('赛里木湖')).toBeInTheDocument()
})

test('calls onSelect with day.id when header clicked', () => {
  const onSelect = vi.fn()
  renderCol({ onSelect })
  fireEvent.click(screen.getByTestId('timeline-header-2'))
  expect(onSelect).toHaveBeenCalledWith(1)
})

test('navigates to Planner with hash when activity clicked', async () => {
  const { router } = await import('@inertiajs/react')
  renderCol()
  fireEvent.click(screen.getByText('赛里木湖'))
  expect(router.visit).toHaveBeenCalledWith('/tours/42#activity-101')
})

test('shows buffer badge when buffer_day=true', () => {
  render(
    <MantineProvider>
      <TimelineDayColumn
        day={{ ...day, buffer_day: true }}
        activities={[]}
        constitution={constitution}
        tourId={42}
      />
    </MantineProvider>
  )
  expect(screen.getByText('buffer')).toBeInTheDocument()
})
