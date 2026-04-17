import { render, screen, fireEvent } from '@testing-library/react'
import { MantineProvider } from '@mantine/core'
import { vi } from 'vitest'
import TourTabs from '../TourTabs'

vi.mock('@inertiajs/react', () => ({
  router: { visit: vi.fn() },
}))

function renderTabs(active = 'planner') {
  return render(
    <MantineProvider>
      <TourTabs tour={{ id: 42 }} active={active} />
    </MantineProvider>
  )
}

test('renders three tabs', () => {
  renderTabs()
  expect(screen.getByRole('tab', { name: '规划' })).toBeInTheDocument()
  expect(screen.getByRole('tab', { name: '年表' })).toBeInTheDocument()
  expect(screen.getByRole('tab', { name: '宪法' })).toBeInTheDocument()
})

test('marks the active tab', () => {
  renderTabs('timeline')
  expect(screen.getByRole('tab', { name: '年表' })).toHaveAttribute('data-active', 'true')
})

test('navigates via router.visit on tab change', async () => {
  const { router } = await import('@inertiajs/react')
  renderTabs('planner')
  fireEvent.click(screen.getByRole('tab', { name: '年表' }))
  expect(router.visit).toHaveBeenCalledWith('/tours/42/timeline', expect.anything())
})

test('does not navigate when clicking the active tab', async () => {
  const { router } = await import('@inertiajs/react')
  router.visit.mockClear()
  renderTabs('planner')
  fireEvent.click(screen.getByRole('tab', { name: '规划' }))
  expect(router.visit).not.toHaveBeenCalled()
})
