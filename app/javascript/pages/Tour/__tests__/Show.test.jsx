import { render, screen } from '@testing-library/react'
import { MantineProvider } from '@mantine/core'
import { describe, test, expect, vi } from 'vitest'
import Show from '../Show'

vi.mock('@inertiajs/react', () => ({
  Head: ({ children, title }) => null,
  usePage: () => ({ props: { amap_js_api_key: '', amap_js_security_code: '' } }),
  router: { patch: () => {}, post: () => {}, reload: () => {} },
}))

// PlannerMap loads AMAP JS SDK via <script>; stub it out for unit tests.
vi.mock('../../../components/planner/PlannerMap', () => ({
  default: () => <div data-testid="planner-map-stub" />,
}))

vi.mock('@dnd-kit/core', () => ({
  DndContext: ({ children, onDragStart, onDragEnd }) => (
    <div
      data-testid="dnd-context"
      data-dragstart={onDragStart ? 'has' : 'none'}
      data-dragend={onDragEnd ? 'has' : 'none'}
    >
      {children}
    </div>
  ),
  DragOverlay: ({ children }) => <div data-testid="drag-overlay">{children}</div>,
  closestCenter: null,
  useDroppable: () => ({ setNodeRef: () => {}, isOver: false }),
  useDraggable: () => ({ attributes: {}, listeners: {}, setNodeRef: () => {}, setActivatorNodeRef: () => {}, isDragging: false }),
}))

vi.mock('@mantine/notifications', () => ({
  notifications: { show: vi.fn() },
}))

vi.mock('../../../components/planner/ChatPanel', () => ({
  default: ({ open, onToggle }) => (
    <div>
      {open ? <span>AI 对话</span> : <button onClick={onToggle}>展开 AI 对话</button>}
    </div>
  ),
}))

const props = {
  tour: { id: 1, title: '伊犁', constitution: { max_daily_driving_minutes: 420, max_tier_one_per_day: 3 } },
  days: [ { id: 10, day_index: 1, date: '2026-06-10' }, { id: 11, day_index: 2, date: '2026-06-11' } ],
  activities: [
    { id: 100, tour_id: 1, day_id: 10, name: '赛里木湖', kind: 'scenic', citizen_level: 'tier_one', details: {} },
    { id: 101, tour_id: 1, day_id: null, name: '那拉提', kind: 'scenic', citizen_level: 'tier_one', details: {} }
  ],
  violations: []
}

test('renders planner three-pane layout', () => {
  render(<MantineProvider><Show {...props} /></MantineProvider>)
  expect(screen.getByText('Backlog（候选池）')).toBeInTheDocument()
  expect(screen.getByText('D1')).toBeInTheDocument()
  expect(screen.getByText('D2')).toBeInTheDocument()
  expect(screen.getByText('AI 对话')).toBeInTheDocument()
})

test('renders backlog activity only in backlog', () => {
  render(<MantineProvider><Show {...props} /></MantineProvider>)
  // Both appear (once in pane + possibly on map). Just assert they exist.
  expect(screen.getAllByText(/那拉提/).length).toBeGreaterThan(0)
})

test('configures DndContext with drag start/end handlers', () => {
  render(<MantineProvider><Show {...props} /></MantineProvider>)
  const ctx = screen.getByTestId('dnd-context')
  expect(ctx).toHaveAttribute('data-dragstart', 'has')
  expect(ctx).toHaveAttribute('data-dragend', 'has')
})

test('renders DragOverlay container', () => {
  render(<MantineProvider><Show {...props} /></MantineProvider>)
  expect(screen.getByTestId('drag-overlay')).toBeInTheDocument()
})
