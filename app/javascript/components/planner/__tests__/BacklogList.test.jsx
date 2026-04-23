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

test('renders all activities by default', () => {
  renderIt(fixtures)
  expect(screen.getByText('赛里木湖')).toBeInTheDocument()
  expect(screen.getByText('独库公路')).toBeInTheDocument()
  expect(screen.getByText('早餐')).toBeInTheDocument()
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

test('empty + editable: shows CTA buttons and no toolbar 加候选 button', () => {
  render(
    <MantineProvider>
      <DndContext>
        <BacklogList
          activities={[]}
          onAddActivity={() => {}}
          onAskAI={() => {}}
          readOnly={false}
        />
      </DndContext>
    </MantineProvider>
  )
  expect(screen.getByRole('button', { name: '加候选' })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'AI 帮选' })).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: /跳到对话/ })).not.toBeInTheDocument()
  expect(screen.queryByRole('button', { name: /^\+ 加一个$/ })).not.toBeInTheDocument()
  expect(screen.getByText(/先把想去的点塞进这里/)).toBeInTheDocument()
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

test('empty + editable: clicking AI 帮选 calls onAskAI', () => {
  const onAskAI = vi.fn()
  render(
    <MantineProvider>
      <DndContext>
        <BacklogList
          activities={[]}
          onAddActivity={() => {}}
          onAskAI={onAskAI}
        />
      </DndContext>
    </MantineProvider>
  )
  fireEvent.click(screen.getByRole('button', { name: 'AI 帮选' }))
  expect(onAskAI).toHaveBeenCalled()
})


test('non-empty backlog: empty-state hint not rendered, toolbar shows both buttons', () => {
  render(
    <MantineProvider>
      <DndContext>
        <BacklogList
          activities={fixtures}
          onAddActivity={() => {}}
          onAskAI={() => {}}
        />
      </DndContext>
    </MantineProvider>
  )
  expect(screen.queryByText(/先把想去的点塞进这里/)).not.toBeInTheDocument()
  expect(screen.getAllByRole('button', { name: '加候选' })).toHaveLength(1)
  expect(screen.getAllByRole('button', { name: 'AI 帮选' })).toHaveLength(1)
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
  // PanelShell renders a rail button with aria-label "展开 候选池"
  expect(screen.getByRole('button', { name: '展开 候选池' })).toBeInTheDocument()
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
  fireEvent.click(screen.getByRole('button', { name: '展开 候选池' }))
  expect(onToggle).toHaveBeenCalledTimes(1)
})

test('when open=true (default), renders a collapse button that calls onToggle', () => {
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
  // PanelShell renders collapse button with aria-label "折叠"
  fireEvent.click(screen.getByRole('button', { name: '折叠' }))
  expect(onToggle).toHaveBeenCalledTimes(1)
})

test('folded state exposes role=button with accessible name 展开 候选池', () => {
  const onToggle = vi.fn()
  render(
    <MantineProvider>
      <DndContext>
        <BacklogList activities={fixtures} open={false} onToggle={onToggle} />
      </DndContext>
    </MantineProvider>
  )
  // PanelShell uses aria-label="展开 ${title}" — note the space
  const btn = screen.getByRole('button', { name: '展开 候选池' })
  expect(btn).toBeInTheDocument()
  fireEvent.click(btn)
  expect(onToggle).toHaveBeenCalledTimes(1)
})

test('non-empty backlog: clicking toolbar AI 帮选 calls onAskAI', () => {
  const onAskAI = vi.fn()
  render(
    <MantineProvider>
      <DndContext>
        <BacklogList
          activities={fixtures}
          onAddActivity={() => {}}
          onAskAI={onAskAI}
        />
      </DndContext>
    </MantineProvider>
  )
  fireEvent.click(screen.getByRole('button', { name: 'AI 帮选' }))
  expect(onAskAI).toHaveBeenCalled()
})

test('hoveredActivityIds=[id] applies .ac-highlighted to the matching card only', () => {
  const { container } = render(
    <MantineProvider>
      <DndContext>
        <BacklogList
          activities={fixtures}
          hoveredActivityIds={[2]}
        />
      </DndContext>
    </MantineProvider>
  )
  const cards = container.querySelectorAll('.ac-card')
  expect(cards).toHaveLength(3)
  // fixtures order: id=1 赛里木湖, id=2 独库公路, id=3 早餐
  expect(cards[0].classList.contains('ac-highlighted')).toBe(false)
  expect(cards[1].classList.contains('ac-highlighted')).toBe(true)
  expect(cards[2].classList.contains('ac-highlighted')).toBe(false)
})

test('card mouseenter calls onHoverActivity(id); mouseleave calls onClearHover', () => {
  const onHoverActivity = vi.fn()
  const onClearHover = vi.fn()
  const { container } = render(
    <MantineProvider>
      <DndContext>
        <BacklogList
          activities={fixtures}
          onHoverActivity={onHoverActivity}
          onClearHover={onClearHover}
        />
      </DndContext>
    </MantineProvider>
  )
  const firstCard = container.querySelectorAll('.ac-card')[0]
  fireEvent.mouseEnter(firstCard)
  expect(onHoverActivity).toHaveBeenCalledWith(1) // fixtures[0].id === 1
  fireEvent.mouseLeave(firstCard)
  expect(onClearHover).toHaveBeenCalled()
})

test('renders activities as-is (no internal filtering)', () => {
  renderIt([fixtures[0]])
  expect(screen.getByText('赛里木湖')).toBeInTheDocument()
  expect(screen.queryByText('早餐')).not.toBeInTheDocument()
  expect(screen.queryByText('独库公路')).not.toBeInTheDocument()
})

test('shows filter banner when filterActive=true', () => {
  render(
    <MantineProvider>
      <DndContext>
        <BacklogList activities={fixtures} filterActive />
      </DndContext>
    </MantineProvider>
  )
  expect(screen.getByText(/筛选中/)).toBeInTheDocument()
})

test('does NOT show filter banner when filterActive=false (default)', () => {
  renderIt(fixtures)
  expect(screen.queryByText(/筛选中/)).not.toBeInTheDocument()
})

test('shows "无匹配" inline message when activities is empty and filterActive', () => {
  render(
    <MantineProvider>
      <DndContext>
        <BacklogList activities={[]} filterActive />
      </DndContext>
    </MantineProvider>
  )
  expect(screen.getByText(/无匹配的活动/)).toBeInTheDocument()
})

test('filterActive forwards draggable=false to cards (data-draggable attr)', () => {
  const { container } = render(
    <MantineProvider>
      <DndContext>
        <BacklogList activities={fixtures} filterActive />
      </DndContext>
    </MantineProvider>
  )
  // Guards the prop-passing contract between BacklogList and ActivityCard —
  // `draggable={!filterActive}` must reach each card's DOM root.
  const cards = container.querySelectorAll('.ac-card')
  cards.forEach(card => {
    expect(card.getAttribute('data-draggable')).toBe('false')
  })
})
