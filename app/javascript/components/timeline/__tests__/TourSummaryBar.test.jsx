import { render, screen } from '@testing-library/react'
import { MantineProvider } from '@mantine/core'
import TourSummaryBar from '../TourSummaryBar'

const summary = {
  day_count: 10,
  activity_count: 34,
  tier_one_total: 18,
  tier_one_limit: 3,
  buffer_count: 1,
  buffer_min: 1,
  hard_count: 1,
  soft_count: 2
}

test('renders all 5 summary cells', () => {
  render(<MantineProvider><TourSummaryBar summary={summary} /></MantineProvider>)
  expect(screen.getByText('10')).toBeInTheDocument()
  expect(screen.getByText('34')).toBeInTheDocument()
  expect(screen.getByText('18')).toBeInTheDocument()
  expect(screen.getByText(/≤ 3\/日/)).toBeInTheDocument()
  expect(screen.getByText(/≥ 1\/程/)).toBeInTheDocument()
  expect(screen.getByText('1 hard · 2 soft')).toBeInTheDocument()
})

test('shows ✅ when buffer count meets minimum', () => {
  render(<MantineProvider><TourSummaryBar summary={{ ...summary, buffer_count: 2 }} /></MantineProvider>)
  expect(screen.getByText(/✅/)).toBeInTheDocument()
})

test('shows 0 for violations when none', () => {
  render(<MantineProvider><TourSummaryBar summary={{ ...summary, hard_count: 0, soft_count: 0 }} /></MantineProvider>)
  expect(screen.getByText('0')).toBeInTheDocument()
})
