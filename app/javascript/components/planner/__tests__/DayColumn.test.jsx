import { describe, test, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MantineProvider } from '@mantine/core'
import { DndContext } from '@dnd-kit/core'
import DayColumn from '../DayColumn'

function renderIt(props = {}) {
  const day = { id: 10, day_index: 1, intensity_derived: 'green' }
  return render(
    <MantineProvider>
      <DndContext>
        <DayColumn day={day} activities={[]} constitution={{ max_daily_driving_minutes: 420 }} {...props} />
      </DndContext>
    </MantineProvider>
  )
}

describe('DayColumn dragWarning', () => {
  test('renders warning banner when dragWarning prop is set', () => {
    renderIt({ dragWarning: { current: 360, incoming: 180, limit: 420, total: 540 } })
    expect(screen.getByText(/加入后驾驶/)).toBeInTheDocument()
    expect(screen.getByText(/540\/420/)).toBeInTheDocument()
  })

  test('does not render warning banner when dragWarning is null', () => {
    renderIt({ dragWarning: null })
    expect(screen.queryByText(/加入后驾驶/)).not.toBeInTheDocument()
  })
})
