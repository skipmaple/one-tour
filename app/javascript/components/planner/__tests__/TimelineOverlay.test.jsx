import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MantineProvider } from '@mantine/core'
import { describe, it, expect, vi } from 'vitest'
import TimelineOverlay from '../TimelineOverlay'

vi.mock('../../timeline/TourSummaryBar', () => ({ default: () => <div data-testid="summary-bar" /> }))
vi.mock('../../timeline/RhythmBar', () => ({ default: () => <div data-testid="rhythm-bar" /> }))
vi.mock('../../timeline/TimelineDayColumn', () => ({ default: () => <div data-testid="day-col" /> }))
vi.mock('../../timeline/DayDetailPanel', () => ({ default: () => <div data-testid="day-detail" /> }))

const tour = { id: 1, title: 'x', constitution: {} }
const days = [{ id: 1, position: 0 }]
const violations = []
const summary = {}

function renderOverlay({ opened = true, activities = [], onClose = vi.fn() } = {}) {
  return render(
    <MantineProvider>
      <TimelineOverlay
        opened={opened}
        onClose={onClose}
        tour={tour}
        days={days}
        activities={activities}
        violations={violations}
        summary={summary}
      />
    </MantineProvider>,
  )
}

describe('TimelineOverlay', () => {
  it('does not render children when closed', () => {
    renderOverlay({ opened: false })
    expect(screen.queryByTestId('summary-bar')).not.toBeInTheDocument()
  })

  it('renders summary + rhythm + day-detail always when opened', () => {
    renderOverlay({ opened: true })
    expect(screen.getByTestId('summary-bar')).toBeInTheDocument()
    expect(screen.getByTestId('rhythm-bar')).toBeInTheDocument()
    expect(screen.getByTestId('day-detail')).toBeInTheDocument()
  })

  it('shows empty-state card when no activities', () => {
    renderOverlay({ opened: true, activities: [] })
    expect(screen.queryByTestId('day-col')).not.toBeInTheDocument()
    expect(screen.getByText(/还没有任何行程/)).toBeInTheDocument()
  })

  it('renders day columns when activities exist', () => {
    renderOverlay({ opened: true, activities: [{ id: 10, day_id: 1, position: 0 }] })
    expect(screen.getByTestId('day-col')).toBeInTheDocument()
    expect(screen.queryByText(/还没有任何行程/)).not.toBeInTheDocument()
  })

  it('calls onClose on ESC', async () => {
    const onClose = vi.fn()
    renderOverlay({ opened: true, onClose })
    await userEvent.keyboard('{Escape}')
    expect(onClose).toHaveBeenCalled()
  })
})
