import { render, screen, fireEvent } from '@testing-library/react'
import { describe, test, expect, vi } from 'vitest'
import { MantineProvider } from '@mantine/core'
import { DndContext } from '@dnd-kit/core'
import DayPanel from '../DayPanel'

function renderPanel(props = {}) {
  const defaults = {
    days: [
      { id: 1, day_index: 1, date: '2026-05-10', buffer_day: false },
      { id: 2, day_index: 2, date: '2026-05-11', buffer_day: false },
    ],
    byDay: { 1: [], 2: [] },
    tour: { id: 42, constitution: { max_daily_driving_minutes: 420 } },
    nextDayIndex: 3,
    open: true,
    onToggle: () => {},
    canToggle: true,
    autoFit: true,
    onToggleAutoFit: () => {},
    flexStyle: { flex: '0 0 432px', minWidth: 200 },
    onAddActivity: () => {},
    onEditActivity: () => {},
    onEditDay: () => {},
    readOnly: false,
    dragWarning: null,
  }
  return render(
    <MantineProvider>
      <DndContext>
        <DayPanel {...defaults} {...props} />
      </DndContext>
    </MantineProvider>
  )
}

describe('DayPanel', () => {
  test('renders panel header with day count', () => {
    renderPanel()
    expect(screen.getByText(/日程/)).toBeInTheDocument()
  })

  test('renders one DayColumn per day', () => {
    renderPanel()
    expect(screen.getByText(/D1/)).toBeInTheDocument()
    expect(screen.getByText(/D2/)).toBeInTheDocument()
  })

  test('renders AddDayButton', () => {
    renderPanel()
    expect(screen.getByTestId('add-day-slot')).toBeInTheDocument()
  })

  test('shows auto-fit button when autoFit=true (active style)', () => {
    renderPanel({ autoFit: true })
    const button = screen.getByLabelText(/auto-fit/i)
    expect(button).toBeInTheDocument()
    // Active state: blue background
    expect(button).toHaveAttribute('data-active', 'true')
  })

  test('shows auto-fit button when autoFit=false (inactive style — "恢复")', () => {
    renderPanel({ autoFit: false })
    const button = screen.getByLabelText(/auto-fit/i)
    expect(button).toHaveAttribute('data-active', 'false')
  })

  test('clicking auto-fit button calls onToggleAutoFit', () => {
    const onToggleAutoFit = vi.fn()
    renderPanel({ onToggleAutoFit })
    fireEvent.click(screen.getByLabelText(/auto-fit/i))
    expect(onToggleAutoFit).toHaveBeenCalledOnce()
  })

  test('renders rail when open=false (no DayColumns)', () => {
    renderPanel({ open: false })
    expect(screen.queryByText(/D1/)).not.toBeInTheDocument()
    expect(screen.getByLabelText(/展开 日程/)).toBeInTheDocument()
  })

  test('filterActive prop is forwarded to each DayColumn', () => {
    renderPanel({ filterActive: true })
    const banners = screen.getAllByText(/筛选中/)
    expect(banners.length).toBeGreaterThanOrEqual(2)
  })
})
