import { render, screen } from '@testing-library/react'
import { MantineProvider } from '@mantine/core'
import { describe, test, expect, vi } from 'vitest'
import Constitution from '../Constitution'

vi.mock('@inertiajs/react', () => ({
  Head: ({ children, title }) => null,
  router: {
    patch: vi.fn(),
    visit: vi.fn(),
  },
}))

const defaults = {
  max_daily_driving_minutes: 420,
  max_mountain_road_minutes: 240,
  max_tier_one_per_day: 3,
  min_buffer_days: 1,
  min_daily_buffer_minutes: 90,
  max_tier_two_food_per_tour: 3,
  max_fuel_emergency_per_tour: 1,
  max_yurt_nights: 1
}

function renderPage(overrides = {}) {
  return render(
    <MantineProvider>
      <Constitution tour={{ id: 42 }} constitution={{ ...defaults, ...overrides }} defaults={defaults} />
    </MantineProvider>
  )
}

test('renders 3 key constraints always visible', () => {
  renderPage()
  expect(screen.getByText('每天最多驾驶')).toBeInTheDocument()
  expect(screen.getByText(/每天最多.*核心景点/)).toBeInTheDocument()
  expect(screen.getByText('整程至少机动日')).toBeInTheDocument()
})

test('shows "use defaults" button when unmodified', () => {
  renderPage()
  expect(screen.getByRole('button', { name: /使用默认宪法/ })).toBeInTheDocument()
})

test('switches to "save" button when dirty', () => {
  renderPage({ max_daily_driving_minutes: 360 })
  expect(screen.getByText(/保存修改并开始/)).toBeInTheDocument()
})
