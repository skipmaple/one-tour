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

function renderPage(constitutionOverrides = {}, pageProps = {}) {
  return render(
    <MantineProvider>
      <Constitution
        tour={{ id: 42 }}
        constitution={{ ...defaults, ...constitutionOverrides }}
        defaults={defaults}
        is_setup={true}
        {...pageProps}
      />
    </MantineProvider>
  )
}

test('renders 3 key constraints always visible in setup step 1', () => {
  renderPage()
  expect(screen.getByText('每天最多驾驶')).toBeInTheDocument()
  expect(screen.getByText(/每天最多.*核心景点/)).toBeInTheDocument()
  expect(screen.getByText('整程至少机动日')).toBeInTheDocument()
})

test('shows "下一步" button in setup step 1', () => {
  renderPage()
  expect(screen.getByRole('button', { name: /下一步/ })).toBeInTheDocument()
})

test('review mode shows full constitution text and 修宪 button', () => {
  renderPage({}, { is_setup: false })
  expect(screen.getByText('《本程宪法》')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: /修宪/ })).toBeInTheDocument()
})
