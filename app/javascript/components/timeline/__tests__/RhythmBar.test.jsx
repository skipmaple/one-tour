import { render, screen, fireEvent } from '@testing-library/react'
import { MantineProvider } from '@mantine/core'
import { vi } from 'vitest'
import RhythmBar from '../RhythmBar'

const days = [
  { id: 1, day_index: 1, buffer_day: true, intensity_derived: 'green' },
  { id: 2, day_index: 2, buffer_day: false, intensity_derived: 'yellow' },
  { id: 3, day_index: 3, buffer_day: false, intensity_derived: 'red' },
]

test('renders one slot per day', () => {
  render(<MantineProvider><RhythmBar days={days} violations={[]} /></MantineProvider>)
  expect(screen.getByTestId('rhythm-slot-1')).toBeInTheDocument()
  expect(screen.getByTestId('rhythm-slot-2')).toBeInTheDocument()
  expect(screen.getByTestId('rhythm-slot-3')).toBeInTheDocument()
})

test('marks buffer_day slot with 机动 / 适应日 label', () => {
  render(<MantineProvider><RhythmBar days={days} violations={[]} /></MantineProvider>)
  const slot1 = screen.getByTestId('rhythm-slot-1')
  expect(slot1).toHaveTextContent('适应日')
})

test('shows ⛔ when a day has a hard violation', () => {
  const violations = [{ level: 'hard', rule: 'max_daily_driving_minutes', scope: { day_index: 3 } }]
  render(<MantineProvider><RhythmBar days={days} violations={violations} /></MantineProvider>)
  const slot3 = screen.getByTestId('rhythm-slot-3')
  expect(slot3).toHaveTextContent('⛔')
})

test('calls onSlotClick with day.id when slot clicked', () => {
  const onSlotClick = vi.fn()
  render(<MantineProvider><RhythmBar days={days} violations={[]} onSlotClick={onSlotClick} /></MantineProvider>)
  fireEvent.click(screen.getByTestId('rhythm-slot-2'))
  expect(onSlotClick).toHaveBeenCalledWith(2)
})
