import { render, screen, fireEvent } from '@testing-library/react'
import { vi } from 'vitest'
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

test('shows "no backlog" message when activities is empty and readOnly', () => {
  render(
    <MantineProvider>
      <DndContext>
        <BacklogList activities={[]} readOnly={true} />
      </DndContext>
    </MantineProvider>
  )
  expect(screen.getByText(/尚无候选/)).toBeInTheDocument()
})

test('empty + editable: shows three CTA buttons and no top "+ 加一个" button', () => {
  render(
    <MantineProvider>
      <DndContext>
        <BacklogList
          activities={[]}
          onAddActivity={() => {}}
          onAskAI={() => {}}
          onFocusChat={() => {}}
          readOnly={false}
        />
      </DndContext>
    </MantineProvider>
  )
  expect(screen.getByText(/先把想去的点塞进这里/)).toBeInTheDocument()
  expect(screen.getByRole('button', { name: /\+ 手动添加行/ })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: /💬 让 AI 帮列候选/ })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: /跳到对话/ })).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: /^\+ 加一个$/ })).not.toBeInTheDocument()
})

test('empty + readOnly: shows simple "尚无候选" text, no CTAs', () => {
  render(
    <MantineProvider>
      <DndContext>
        <BacklogList activities={[]} readOnly={true} />
      </DndContext>
    </MantineProvider>
  )
  expect(screen.getByText('尚无候选')).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: /手动添加/ })).not.toBeInTheDocument()
  expect(screen.queryByRole('button', { name: /帮列/ })).not.toBeInTheDocument()
  expect(screen.queryByRole('button', { name: /跳到对话/ })).not.toBeInTheDocument()
})

test('empty + editable: clicking 💬 让 AI 帮列候选 calls onAskAI', () => {
  const onAskAI = vi.fn()
  render(
    <MantineProvider>
      <DndContext>
        <BacklogList
          activities={[]}
          onAddActivity={() => {}}
          onAskAI={onAskAI}
          onFocusChat={() => {}}
        />
      </DndContext>
    </MantineProvider>
  )
  fireEvent.click(screen.getByRole('button', { name: /💬 让 AI 帮列候选/ }))
  expect(onAskAI).toHaveBeenCalled()
})

test('empty + editable: clicking 跳到对话 calls onFocusChat', () => {
  const onFocusChat = vi.fn()
  render(
    <MantineProvider>
      <DndContext>
        <BacklogList
          activities={[]}
          onAddActivity={() => {}}
          onAskAI={() => {}}
          onFocusChat={onFocusChat}
        />
      </DndContext>
    </MantineProvider>
  )
  fireEvent.click(screen.getByRole('button', { name: /跳到对话/ }))
  expect(onFocusChat).toHaveBeenCalled()
})

test('non-empty backlog: empty-CTAs not rendered, top "+ 加一个" still shows', () => {
  render(
    <MantineProvider>
      <DndContext>
        <BacklogList
          activities={fixtures}
          onAddActivity={() => {}}
          onAskAI={() => {}}
          onFocusChat={() => {}}
        />
      </DndContext>
    </MantineProvider>
  )
  expect(screen.queryByText(/先把想去的点塞进这里/)).not.toBeInTheDocument()
  expect(screen.getByRole('button', { name: '+ 加一个' })).toBeInTheDocument()
})

test('filter hides all but "无匹配" does NOT show empty-CTA frame', () => {
  render(
    <MantineProvider>
      <DndContext>
        <BacklogList
          activities={fixtures}
          onAddActivity={() => {}}
          onAskAI={() => {}}
          onFocusChat={() => {}}
        />
      </DndContext>
    </MantineProvider>
  )
  // Filter to kind that no fixture matches
  openAndSelect(0, '住')
  expect(screen.getByText(/无匹配的候选/)).toBeInTheDocument()
  // Still show top + 加一个 (normal mode)
  expect(screen.getByRole('button', { name: '+ 加一个' })).toBeInTheDocument()
  // Do NOT show empty-state three-button frame
  expect(screen.queryByText(/先把想去的点塞进这里/)).not.toBeInTheDocument()
})

test('when open=false, renders a collapsed trigger instead of filters/list', () => {
  const onToggle = vi.fn()
  render(
    <MantineProvider>
      <DndContext>
        <BacklogList
          activities={fixtures}
          open={false}
          onToggle={onToggle}
        />
      </DndContext>
    </MantineProvider>
  )
  // Folded label is present
  expect(screen.getByText(/展开候选池/)).toBeInTheDocument()
  // Fixtures are NOT rendered
  expect(screen.queryByText('赛里木湖')).not.toBeInTheDocument()
  expect(screen.queryByText('独库公路')).not.toBeInTheDocument()
})

test('clicking the collapsed trigger calls onToggle', () => {
  const onToggle = vi.fn()
  render(
    <MantineProvider>
      <DndContext>
        <BacklogList
          activities={fixtures}
          open={false}
          onToggle={onToggle}
        />
      </DndContext>
    </MantineProvider>
  )
  fireEvent.click(screen.getByText(/展开候选池/))
  expect(onToggle).toHaveBeenCalledTimes(1)
})

test('when open=true (default), renders a 收起 button that calls onToggle', () => {
  const onToggle = vi.fn()
  render(
    <MantineProvider>
      <DndContext>
        <BacklogList
          activities={fixtures}
          open={true}
          onToggle={onToggle}
        />
      </DndContext>
    </MantineProvider>
  )
  fireEvent.click(screen.getByRole('button', { name: /收起/ }))
  expect(onToggle).toHaveBeenCalledTimes(1)
})
