import { render, screen } from '@testing-library/react'
import ActivityCard from '../ActivityCard'

test('renders tier_one as highlighted', () => {
  const { container } = render(<ActivityCard activity={{ id: 1, name: '赛里木湖', kind: 'scenic', citizen_level: 'tier_one' }} />)
  expect(screen.getByText(/一等/)).toBeInTheDocument()
  expect(screen.getByText(/景/)).toBeInTheDocument()
  expect(screen.getByText('赛里木湖')).toBeInTheDocument()
})

test('renders planned time when provided', () => {
  render(<ActivityCard activity={{ id: 1, name: '早餐', kind: 'food', citizen_level: 'tier_three', planned_start_at: '10:00', planned_duration_min: 60 }} />)
  expect(screen.getByText(/10:00/)).toBeInTheDocument()
  expect(screen.getByText(/60 分/)).toBeInTheDocument()
})

test('road infrastructure uses italic+dashed style', () => {
  const { container } = render(<ActivityCard activity={{ id: 1, name: '通勤', kind: 'road', citizen_level: 'infrastructure' }} />)
  expect(screen.getByText('通勤')).toBeInTheDocument()
  expect(screen.getByText(/基础/)).toBeInTheDocument()
})
