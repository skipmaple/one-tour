import { render, screen, fireEvent } from '@testing-library/react'
import { MantineProvider } from '@mantine/core'
import { DndContext } from '@dnd-kit/core'
import BacklogList from '../BacklogList'

function renderIt(activities) {
  return render(
    <MantineProvider>
      <DndContext>
        <BacklogList activities={activities} />
      </DndContext>
    </MantineProvider>
  )
}

const fixtures = [
  { id: 1, name: '赛里木湖', kind: 'scenic', citizen_level: 'tier_one', day_id: null, position: 1 },
  { id: 2, name: '独库公路', kind: 'road', citizen_level: 'tier_one', day_id: null, position: 2 },
  { id: 3, name: '早餐', kind: 'food', citizen_level: 'tier_three', day_id: null, position: 3 },
]

// Mantine Select renders a readonly combobox input. @testing-library/user-event
// skips readonly inputs, so we open the dropdown with fireEvent.click (which
// Mantine's onClick handler handles) and select options with fireEvent.click too.
function openAndSelect(comboboxIndex, optionName) {
  const inputs = document.querySelectorAll('input[role="combobox"]')
  fireEvent.click(inputs[comboboxIndex])
  fireEvent.click(screen.getByRole('option', { name: optionName }))
}

test('renders all activities by default', () => {
  renderIt(fixtures)
  expect(screen.getByText('赛里木湖')).toBeInTheDocument()
  expect(screen.getByText('独库公路')).toBeInTheDocument()
  expect(screen.getByText('早餐')).toBeInTheDocument()
})

test('filters by kind', () => {
  renderIt(fixtures)
  openAndSelect(0, '景')
  expect(screen.getByText('赛里木湖')).toBeInTheDocument()
  expect(screen.queryByText('独库公路')).not.toBeInTheDocument()
  expect(screen.queryByText('早餐')).not.toBeInTheDocument()
})

test('filters by level', () => {
  renderIt(fixtures)
  openAndSelect(1, '三等')
  expect(screen.getByText('早餐')).toBeInTheDocument()
  expect(screen.queryByText('赛里木湖')).not.toBeInTheDocument()
})

test('shows empty state when filter matches nothing', () => {
  renderIt(fixtures)
  openAndSelect(0, '住')
  expect(screen.getByText(/无匹配的候选/)).toBeInTheDocument()
})

test('shows "no backlog" message when activities is empty', () => {
  renderIt([])
  expect(screen.getByText(/尚无候选/)).toBeInTheDocument()
})
