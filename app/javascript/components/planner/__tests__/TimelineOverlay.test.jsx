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
const activities = []
const violations = []
const summary = {}

function renderOverlay(opened) {
  return render(
    <MantineProvider>
      <TimelineOverlay
        opened={opened}
        onClose={vi.fn()}
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
    renderOverlay(false)
    expect(screen.queryByTestId('summary-bar')).not.toBeInTheDocument()
  })

  it('renders timeline pieces when opened', () => {
    renderOverlay(true)
    expect(screen.getByTestId('summary-bar')).toBeInTheDocument()
    expect(screen.getByTestId('rhythm-bar')).toBeInTheDocument()
    expect(screen.getByTestId('day-col')).toBeInTheDocument()
    expect(screen.getByTestId('day-detail')).toBeInTheDocument()
  })

  it('calls onClose on ESC', async () => {
    const onClose = vi.fn()
    render(
      <MantineProvider>
        <TimelineOverlay opened onClose={onClose} tour={tour} days={days} activities={activities} violations={violations} summary={summary} />
      </MantineProvider>,
    )
    await userEvent.keyboard('{Escape}')
    expect(onClose).toHaveBeenCalled()
  })
})
