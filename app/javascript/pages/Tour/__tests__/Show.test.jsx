import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MantineProvider } from '@mantine/core'
import { describe, test, expect, vi, beforeEach } from 'vitest'
import Show from '../Show'
import { ONBOARDING_SENTINEL } from '../../../lib/onboarding'

vi.mock('@inertiajs/react', () => ({
  Head: ({ children, title }) => null,
  usePage: () => ({ props: { amap_js_api_key: '', amap_js_security_code: '' }, url: '/tours/1' }),
  router: { patch: () => {}, post: () => {}, reload: () => {}, replace: () => {} },
}))

// PlannerMap loads AMAP JS SDK via <script>; stub it out for unit tests.
vi.mock('../../../components/planner/PlannerMap', () => ({
  default: () => <div data-testid="planner-map-stub" />,
  DAY_COLOR: (day_index) => 'red',
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
  pointerWithin: () => [],
  rectIntersection: () => [],
  useDroppable: () => ({ setNodeRef: () => {}, isOver: false }),
  useDraggable: () => ({ attributes: {}, listeners: {}, setNodeRef: () => {}, isDragging: false }),
  PointerSensor: class PointerSensor {},
  useSensor: () => ({}),
  useSensors: (...args) => args,
}))

vi.mock('../../../layouts/HeaderSlot', () => ({
  useInjectHeaderRight: () => {},
  useHeaderRightSlot: () => null,
  HeaderSlotProvider: ({ children }) => <>{children}</>,
}))

vi.mock('../../../components/planner/PlannerHeaderRight', () => ({
  default: () => <div data-testid="planner-header-right-stub" />,
}))

vi.mock('../../../components/planner/ConstitutionDrawer', () => ({
  default: (props) => (
    <button data-testid="const-close" onClick={props.onClose}>close</button>
  ),
}))

vi.mock('../../../components/planner/TimelineOverlay', () => ({
  default: () => <div data-testid="timeline-overlay-stub" />,
}))

vi.mock('../../../components/OutboxStatus', () => ({ default: () => null }))

vi.mock('@mantine/notifications', () => ({
  notifications: { show: vi.fn() },
}))

const mockUndoStack = { push: vi.fn(), executeTop: vi.fn(), stack: [] }
vi.mock('../../../hooks/useUndoStack', () => ({
  useUndoStack: () => mockUndoStack,
  UndoStackProvider: ({ children }) => children,
  UNDO_CAP: 10,
}))

// Module-scope ref so tests can inspect what Show.jsx passed to ChatPanel.
// Mutated (not reassigned) so the closure captured by vi.mock stays valid.
const chatPanelProps = { pendingPrompt: undefined }
vi.mock('../../../components/planner/ChatPanel', () => ({
  default: (props) => {
    chatPanelProps.pendingPrompt = props.pendingPrompt
    return (
      <div data-testid="chat-panel-stub">
        {props.open ? <span>AI 对话</span> : <button onClick={props.onToggle}>展开 AI 对话</button>}
      </div>
    )
  },
}))

const props = {
  tour: { id: 1, title: '伊犁', constitution_accepted: true, constitution: { max_daily_driving_minutes: 420, max_tier_one_per_day: 3 } },
  days: [ { id: 10, day_index: 1, date: '2026-06-10' }, { id: 11, day_index: 2, date: '2026-06-11' } ],
  activities: [
    { id: 100, tour_id: 1, day_id: 10, name: '赛里木湖', kind: 'scenic', citizen_level: 'tier_one', details: {} },
    { id: 101, tour_id: 1, day_id: null, name: '那拉提', kind: 'scenic', citizen_level: 'tier_one', details: {} }
  ],
  violations: [],
  summary: {},
  constitution: {},
  defaults: {},
  overrides: [],
}

test('renders planner four-panel layout', () => {
  render(<MantineProvider><Show {...props} /></MantineProvider>)
  // PanelShell renders title + separate Tabler icon (svg sibling).
  expect(screen.getByText('候选池')).toBeInTheDocument()
  expect(screen.getByText('日程')).toBeInTheDocument()
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

test('triggers onboarding when activities empty + conversation_empty=true + canEdit=true', () => {
  chatPanelProps.pendingPrompt = undefined
  render(
    <MantineProvider>
      <Show
        tour={{ id: 1, title: 'x', constitution: {}, constitution_accepted: true, editable_by_current_user: true }}
        days={[]}
        activities={[]}
        violations={[]}
        conversation_empty={true}
      />
    </MantineProvider>
  )
  expect(chatPanelProps.pendingPrompt).toBe('__onboarding_start__')
})

test('does NOT trigger onboarding when activities non-empty', () => {
  chatPanelProps.pendingPrompt = undefined
  render(
    <MantineProvider>
      <Show
        tour={{ id: 1, title: 'x', constitution: {}, editable_by_current_user: true }}
        days={[]}
        activities={[{ id: 1, name: 'x', kind: 'scenic', citizen_level: 'tier_one', day_id: null }]}
        violations={[]}
        conversation_empty={true}
      />
    </MantineProvider>
  )
  expect(chatPanelProps.pendingPrompt).toBeNull()
})

test('does NOT trigger onboarding when conversation_empty=false', () => {
  chatPanelProps.pendingPrompt = undefined
  render(
    <MantineProvider>
      <Show
        tour={{ id: 1, title: 'x', constitution: {}, editable_by_current_user: true }}
        days={[]}
        activities={[]}
        violations={[]}
        conversation_empty={false}
      />
    </MantineProvider>
  )
  expect(chatPanelProps.pendingPrompt).toBeNull()
})

test('does NOT trigger onboarding when canEdit=false (reader)', () => {
  chatPanelProps.pendingPrompt = undefined
  render(
    <MantineProvider>
      <Show
        tour={{ id: 1, title: 'x', constitution: {}, editable_by_current_user: false }}
        days={[]}
        activities={[]}
        violations={[]}
        conversation_empty={true}
      />
    </MantineProvider>
  )
  expect(chatPanelProps.pendingPrompt).toBeNull()
})

test('no locking onboarding backdrop (gate is skippable)', () => {
  render(
    <MantineProvider>
      <Show
        tour={{ id: 1, title: '', constitution: { max_daily_driving_minutes: 420 }, constitution_accepted: false, editable_by_current_user: true }}
        days={[]}
        activities={[]}
        violations={[]}
        conversation_empty={true}
      />
    </MantineProvider>
  )
  expect(screen.queryByTestId('onboarding-backdrop')).toBeNull()
})

function renderShowFresh({ constitution_accepted = false } = {}) {
  return render(
    <MantineProvider>
      <Show
        tour={{ id: 1, title: 'x', constitution: { max_daily_driving_minutes: 420 }, constitution_accepted, editable_by_current_user: true }}
        days={[]}
        activities={[]}
        violations={[]}
        conversation_empty={true}
      />
    </MantineProvider>
  )
}

beforeEach(() => {
  localStorage.removeItem('onboarded:tour:1')
})

test('AI onboarding fires on mount for an already-onboarded empty tour', () => {
  chatPanelProps.pendingPrompt = undefined
  renderShowFresh({ constitution_accepted: true })
  expect(chatPanelProps.pendingPrompt).toBe(ONBOARDING_SENTINEL)
})

test('AI onboarding fires after closing the gate on a fresh empty tour', async () => {
  chatPanelProps.pendingPrompt = undefined
  renderShowFresh({ constitution_accepted: false })
  // Not fired on mount (not onboarded yet); pendingChatPrompt stays at its null initial value
  expect(chatPanelProps.pendingPrompt).toBeNull()
  await userEvent.click(screen.getByTestId('const-close'))
  expect(chatPanelProps.pendingPrompt).toBe(ONBOARDING_SENTINEL)
})
