import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { Head, router, usePage } from '@inertiajs/react'
import { Text } from '@mantine/core'
import { useDisclosure } from '@mantine/hooks'
import { DndContext, DragOverlay, pointerWithin, rectIntersection, PointerSensor, useSensor, useSensors } from '@dnd-kit/core'
import { notifications } from '@mantine/notifications'
import { modals } from '@mantine/modals'
import { ActivityCardOverlay } from '../../components/planner/ActivityCard'
import BacklogList from '../../components/planner/BacklogList'
import PlannerMap from '../../components/planner/PlannerMap'
import ChatPanel from '../../components/planner/ChatPanel'
import DayPanel from '../../components/planner/DayPanel'
import ResizeHandle from '../../components/planner/PanelLayout/ResizeHandle'
import ActivityDrawer from '../../components/activity-editor/ActivityDrawer'
import AcknowledgeModal from '../../components/planner/AcknowledgeModal'
import MembershipDrawer from '../../components/planner/MembershipDrawer'
import DayEditModal from '../../components/planner/DayEditModal'
import TourSettingsModal from '../../components/planner/TourSettingsModal'
import ExpenseDrawer from '../../components/planner/ExpenseDrawer'
import AddExpenseDialog from '../../components/planner/AddExpenseDialog'
import ActivityDetailDrawer from '../../components/planner/ActivityDetailDrawer'
import PlannerHeaderRight from '../../components/planner/PlannerHeaderRight'
import ConstitutionDrawer from '../../components/planner/ConstitutionDrawer'
import TimelineOverlay from '../../components/planner/TimelineOverlay'
import { useInjectHeaderRight } from '../../layouts/HeaderSlot'
import { ONBOARDING_SENTINEL } from '../../lib/onboarding'
import { useUndoStack } from '../../hooks/useUndoStack'
import usePlannerLayout from '../../hooks/usePlannerLayout'

// Hybrid collision: prefer the droppable the cursor is literally inside
// (pointerWithin). Only when the pointer is outside every droppable — e.g.
// dropping below a day column's last item in free scroll space — fall back
// to rectIntersection so the drop still lands somewhere plausible.
// closestCenter / closestCorners both misfire here: the former misses the
// empty tail of a column, the latter misfires horizontally (same-y-band
// origin card wins a drag-to-backlog).
function hybridCollisionDetection(args) {
  const pointerCollisions = pointerWithin(args)
  if (pointerCollisions.length > 0) return pointerCollisions
  return rectIntersection(args)
}

export default function Show({
  tour, days, activities, activity_images, expenses, expenses_summary,
  tour_budgets, settlements, route_legs, violations, members, author,
  conversation_empty,
  summary, constitution, defaults, overrides,
}) {
  const { current_user } = usePage().props
  const canEdit = tour.editable_by_current_user
  const layout = usePlannerLayout(tour.id)
  const containerRef = useRef(null)
  const handleResize = useCallback((leftId, rightId) => (deltaPx) => {
    const total = containerRef.current?.getBoundingClientRect().width
    if (!total) return
    layout.resizeBetween(leftId, rightId, deltaPx, total)
  }, [layout.resizeBetween])

  const undoStack = useUndoStack()

  // Drag overlay state
  const [activeId, setActiveId] = useState(null)
  const [ dragWarning, setDragWarning ] = useState(null)

  // Card ↔ Map hover highlight. Single state piece; array shape lets a
  // connector emit BOTH endpoint ids so both markers light up. null = nothing.
  const [hoveredActivityIds, setHoveredActivityIds] = useState(null)
  const onHoverActivity = useCallback((id) => setHoveredActivityIds([id]), [])
  const onHoverConnector = useCallback((fromId, toId) => setHoveredActivityIds([fromId, toId]), [])
  const onMarkerHover = useCallback((id) => setHoveredActivityIds([id]), [])
  const onClearHover = useCallback(() => setHoveredActivityIds(null), [])
  const onMarkerLeave = useCallback(() => setHoveredActivityIds(null), [])

  // Activation constraint: 5px drag threshold lets the whole ActivityCard be
  // draggable without swallowing plain clicks (which still fire onClick to
  // open the drawer).
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  )

  // Optimistic drag state — overrides server activities until server confirms.
  // Shape: { [activityId]: { day_id, position } }
  const [localOverrides, setLocalOverrides] = useState({})

  // Group images by activity for O(1) lookup when enriching activities.
  const imagesByActivityId = (activity_images || []).reduce((acc, img) => {
    (acc[img.activity_id] ??= []).push(img)
    return acc
  }, {})

  // Merge server activities with local overrides and cover-thumb metadata.
  // ActivityCard reads _coverUrl to render the thumb gradient bleed.
  const displayActivities = activities.map(a => {
    const imgs = imagesByActivityId[a.id] || []
    const cover = imgs.find(i => i.is_cover) || imgs[0]
    const base = {
      ...a,
      _coverUrl: cover?.url,
    }
    return localOverrides[a.id] ? { ...base, ...localOverrides[a.id] } : base
  })

  const activeActivity = activeId
    ? displayActivities.find(a => `activity-${a.id}` === activeId)
    : null

  // Server returns activities in DB insertion order, not position order. After
  // any reorder, UPDATE pushes rows around the heap, so insertion order drifts
  // from position order — client must sort explicitly.
  const byPosition = (a, b) => a.position - b.position
  const backlog = displayActivities.filter(a => !a.day_id).sort(byPosition)
  const byDay = Object.fromEntries(days.map(d => [ d.id, displayActivities.filter(a => a.day_id === d.id).sort(byPosition) ]))
  const nextDayIndex = days.length === 0 ? 1 : Math.max(...days.map(d => d.day_index)) + 1

  // Violation acknowledge state
  const [acknowledgingViolation, setAcknowledgingViolation] = useState(null)
  const [pendingChatPrompt, setPendingChatPrompt] = useState(null)

  // Membership drawer state
  const [membersDrawerOpen, setMembersDrawerOpen] = useState(false)

  // Expense drawer state
  const [expenseDrawerOpen, setExpenseDrawerOpen] = useState(false)

  // Constitution drawer state
  const [constOpen, { open: openConst, close: closeConst }] = useDisclosure(false)
  const [constWidth, setConstWidth] = useState(400)

  // Timeline overlay state
  const [timelineOpen, { open: openTimeline, close: closeTimeline }] = useDisclosure(false)

  // Activity editor state
  const [editor, setEditor] = useState({ open: false, mode: 'create', activityId: null, targetDayId: null })

  // Activity detail drawer state
  const [detailViewer, setDetailViewer] = useState({ open: false, activityId: null })
  const [quickExpenseActivityId, setQuickExpenseActivityId] = useState(null)
  const [initialExpenseId, setInitialExpenseId] = useState(null)

  // Day edit state
  const [editingDayId, setEditingDayId] = useState(null)

  // Tour settings modal state
  const [settingsOpen, setSettingsOpen] = useState(false)
  const editingDay = editingDayId ? days.find(d => d.id === editingDayId) : null

  const openCreate = (dayId) => setEditor({ open: true, mode: 'create', activityId: null, targetDayId: dayId })
  const openEdit = (activityId) => setEditor({ open: true, mode: 'edit', activityId, targetDayId: null })
  const closeEditor = () => setEditor({ open: false, mode: 'create', activityId: null, targetDayId: null })

  // New: cards now route here instead of directly to the edit drawer.
  const openDetail = (activityId) => {
    // Mutex: ensure editor is closed before opening detail — cards are the
    // ingress; they should never end up stacked on an already-open editor.
    if (editor.open) {
      closeEditor()
    }
    setDetailViewer({ open: true, activityId })
  }

  const closeDetail = () => {
    setDetailViewer({ open: false, activityId: null })
  }

  // User clicked [编辑] inside the detail drawer → switch drawers.
  const openEditFromDetail = (activityId) => {
    setDetailViewer({ open: false, activityId: null })
    setEditor({ open: true, mode: 'edit', activityId, targetDayId: null })
  }

  // User clicked [+ 记一笔] inside the detail drawer → open AddExpenseDialog
  // directly (bypass ExpenseDrawer to avoid a 3-layer drawer stack).
  const openAddExpenseForActivity = (activityId) => {
    setQuickExpenseActivityId(activityId)
  }

  // User clicked a specific expense row in detail → jump into ExpenseDrawer
  // with that expense focused for editing.
  const openExpenseById = (expenseId) => {
    setDetailViewer({ open: false, activityId: null })
    setQuickExpenseActivityId(null)
    setInitialExpenseId(expenseId)
    setExpenseDrawerOpen(true)
  }

  const editingActivity = editor.activityId ? activities.find(a => a.id === editor.activityId) : null

  // Filter images for the currently-open activity drawer. Updates automatically
  // when router.reload({only: ['activity_images']}) refreshes the prop.
  const editingImages = editor.activityId
    ? (activity_images || []).filter(img => img.activity_id === editor.activityId)
    : []

  // On mount, check URL hash for activity anchor (#activity-{id})
  // This supports deep links from the Timeline page.
  useEffect(() => {
    if (typeof window === 'undefined') return
    const match = /^#activity-(\d+)$/.exec(window.location.hash)
    if (match) {
      const id = Number(match[1])
      if (activities.some(a => a.id === id)) {
        setEditor({ open: true, mode: 'edit', activityId: id, targetDayId: null })
        // Clear the hash so navigating back doesn't re-open
        history.replaceState(null, '', window.location.pathname)
      }
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // On mount, auto-start AI onboarding when this is a fresh tour.
  // Conditions: user can edit (reader can't — AI would try to mutate) +
  // backlog is empty (user hasn't started) +
  // conversation has no messages (avoid re-triggering on refresh).
  useEffect(() => {
    if (canEdit && activities.length === 0 && conversation_empty) {
      setPendingChatPrompt(ONBOARDING_SENTINEL)
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // First-visit auto-open constitution drawer.
  useEffect(() => {
    const key = `onboarded:tour:${tour.id}`
    const onboarded = localStorage.getItem(key) === '1' || !!tour.constitution_accepted
    if (!onboarded) openConst()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tour.id])

  // Inject memoized PlannerHeaderRight into AppShell header slot.
  // useMemo is mandatory — without it, a new JSX element every render
  // triggers setRight → re-render → new element → infinite loop.
  const headerRight = useMemo(() => (
    <PlannerHeaderRight
      violations={violations}
      onOpenConst={openConst}
      onOpenTimeline={openTimeline}
      onOpenExpense={() => setExpenseDrawerOpen(true)}
      onOpenMembers={() => setMembersDrawerOpen(true)}
      onOpenSettings={canEdit ? () => setSettingsOpen(true) : undefined}
    />
  ), [violations, openConst, openTimeline, canEdit])
  useInjectHeaderRight(headerRight)

  // True only during "first visit" onboarding — lets the planner dim itself
  // behind the drawer so the map / chat / backlog don't distract.
  const inOnboarding = constOpen && !tour.constitution_accepted
    && (typeof window !== 'undefined' && localStorage.getItem(`onboarded:tour:${tour.id}`) !== '1')

  return (
    <div>
      <Head title={tour.title} />
      <DndContext
        sensors={sensors}
        collisionDetection={hybridCollisionDetection}
        onDragStart={({ active }) => setActiveId(active.id)}
        onDragOver={({ active, over }) => updateDragWarning(active, over)}
        onDragEnd={(e) => { setActiveId(null); setDragWarning(null); handleDragEnd(e) }}
        onDragCancel={() => { setActiveId(null); setDragWarning(null) }}
        autoScroll={{ acceleration: 10, threshold: { x: 0.15, y: 0.15 } }}
      >
        <div ref={containerRef} style={{
          display: 'flex',
          alignItems: 'stretch',
          gap: 0,
          padding: 10,
          height: 'calc(100vh - 56px - 20px)',
          position: 'relative',
        }}>
          {constOpen && (
            <ConstitutionDrawer
              tour={tour}
              violations={violations}
              defaults={defaults}
              overrides={overrides}
              initialDaysCount={days.length || 1}
              width={constWidth}
              onWidthChange={setConstWidth}
              onClose={closeConst}
              onFix={(v) => setPendingChatPrompt(fixPromptFor(v))}
              onAcknowledge={(v) => setAcknowledgingViolation(v)}
            />
          )}
          {inOnboarding && (
            <div
              style={{
                position: 'absolute',
                top: 0,
                left: constWidth + 10,
                right: 0,
                bottom: 0,
                background: 'rgba(255, 255, 255, 0.5)',
                zIndex: 5,
                pointerEvents: 'auto',
                cursor: 'not-allowed',
              }}
              data-testid="onboarding-backdrop"
            />
          )}
          <BacklogList
            activities={backlog}
            onAddActivity={canEdit ? openCreate : undefined}
            onEditActivity={openDetail}
            onAskAI={canEdit ? () => setPendingChatPrompt(ASK_AI_BACKLOG_PROMPT) : undefined}
            readOnly={!canEdit}
            open={layout.panels.candidates.open}
            onToggle={() => layout.togglePanel('candidates')}
            canToggle={layout.openCount > 1 || !layout.panels.candidates.open}
            flexStyle={layout.flexStyle('candidates')}
            hoveredActivityIds={hoveredActivityIds}
            onHoverActivity={onHoverActivity}
            onClearHover={onClearHover}
            author={author}
            members={members}
          />
          <ResizeHandle
            disabled={!layout.handleVisible('candidates', 'days')}
            onResize={handleResize('candidates', 'days')}
          />

          <DayPanel
            days={days}
            byDay={byDay}
            tour={tour}
            nextDayIndex={nextDayIndex}
            onAddActivity={canEdit ? openCreate : undefined}
            onEditActivity={openDetail}
            onEditDay={canEdit ? setEditingDayId : undefined}
            readOnly={!canEdit}
            dragWarning={dragWarning}
            open={layout.panels.days.open}
            onToggle={() => layout.togglePanel('days')}
            canToggle={layout.openCount > 1 || !layout.panels.days.open}
            autoFit={layout.panels.days.autoFit}
            onToggleAutoFit={layout.toggleAutoFit}
            flexStyle={layout.flexStyle('days', { autoFitWidth: days.length * 200 + 32 })}
            routeLegs={route_legs || []}
            hoveredActivityIds={hoveredActivityIds}
            onHoverActivity={onHoverActivity}
            onHoverConnector={onHoverConnector}
            onClearHover={onClearHover}
            author={author}
            members={members}
          />
          <ResizeHandle
            disabled={!layout.handleVisible('days', 'map')}
            onResize={handleResize('days', 'map')}
          />

          <PlannerMap
            activities={activities}
            days={days}
            routeLegs={route_legs || []}
            tourId={tour.id}
            canEdit={canEdit}
            open={layout.panels.map.open}
            onToggle={() => layout.togglePanel('map')}
            canToggle={layout.openCount > 1 || !layout.panels.map.open}
            flexStyle={layout.flexStyle('map')}
            hoveredActivityIds={hoveredActivityIds}
            onMarkerHover={onMarkerHover}
            onMarkerLeave={onMarkerLeave}
          />
          <ResizeHandle
            disabled={!layout.handleVisible('map', 'ai')}
            onResize={handleResize('map', 'ai')}
          />

          <ChatPanel
            tour={tour}
            pendingPrompt={pendingChatPrompt}
            onPromptConsumed={() => setPendingChatPrompt(null)}
            open={layout.panels.ai.open}
            onToggle={() => layout.togglePanel('ai')}
            canToggle={layout.openCount > 1 || !layout.panels.ai.open}
            flexStyle={layout.flexStyle('ai')}
          />
        </div>
        <DragOverlay>
          {activeActivity && <ActivityCardOverlay activity={activeActivity} author={author} members={members} />}
        </DragOverlay>
      </DndContext>

      <ActivityDrawer
        tourId={tour.id}
        opened={editor.open}
        onClose={closeEditor}
        mode={editor.mode}
        activity={editingActivity}
        targetDayId={editor.targetDayId}
        images={editingImages}
        allActivities={activities}
        days={days}
        routeLegs={route_legs || []}
        canEdit={canEdit}
        author={author || { user_id: tour.author_id, email: '' }}
        members={members || []}
      />

      <AcknowledgeModal
        violation={acknowledgingViolation}
        tourId={tour.id}
        onClose={() => setAcknowledgingViolation(null)}
      />

      <MembershipDrawer
        opened={membersDrawerOpen}
        onClose={() => setMembersDrawerOpen(false)}
        tour={tour}
        members={members || []}
        author={author || { user_id: tour.author_id, email: '' }}
        days={days}
      />

      <ActivityDetailDrawer
        opened={detailViewer.open}
        onClose={closeDetail}
        tour={tour}
        days={days}
        activity={detailViewer.activityId ? displayActivities.find((a) => a.id === detailViewer.activityId) : null}
        activityImages={activity_images || []}
        author={author || { user_id: tour.author_id, name: '', email: '', avatar_url: null }}
        members={members || []}
        expenses={expenses || []}
        canEdit={canEdit}
        onEdit={openEditFromDetail}
        onAddExpense={openAddExpenseForActivity}
        onFocusExpense={openExpenseById}
      />

      <AddExpenseDialog
        opened={quickExpenseActivityId != null}
        onClose={() => setQuickExpenseActivityId(null)}
        tour={tour}
        days={days}
        activities={activities}
        members={members || []}
        author={author || { user_id: tour.author_id, name: '', email: '', avatar_url: null }}
        expense={null}
        initialActivityId={quickExpenseActivityId}
      />

      <ExpenseDrawer
        opened={expenseDrawerOpen}
        onClose={() => {
          setExpenseDrawerOpen(false)
          setInitialExpenseId(null)
        }}
        tour={tour}
        days={days}
        activities={activities}
        members={members || []}
        author={author || { user_id: tour.author_id, email: '' }}
        expenses={expenses || []}
        summary={expenses_summary}
        budgets={tour_budgets || []}
        settlements={settlements || []}
        canEdit={canEdit}
        initialExpenseId={initialExpenseId}
      />

      <DayEditModal
        day={editingDay}
        tourId={tour.id}
        onClose={() => setEditingDayId(null)}
      />

      <TourSettingsModal
        tour={tour}
        opened={settingsOpen}
        onClose={() => setSettingsOpen(false)}
      />

      <TimelineOverlay
        opened={timelineOpen}
        onClose={closeTimeline}
        tour={tour}
        days={days}
        activities={activities}
        violations={violations}
        summary={summary}
      />
    </div>
  )

  function updateDragWarning(active, over) {
    if (!over) { setDragWarning(null); return }
    const targetDayId = over.data.current?.dayId
    if (!targetDayId) { setDragWarning(null); return }

    const activityId = Number(String(active.id).replace(/^activity-/, ''))
    const draggedActivity = displayActivities.find(a => a.id === activityId)
    if (!draggedActivity) { setDragWarning(null); return }

    if (draggedActivity.day_id === targetDayId) { setDragWarning(null); return }

    const targetDayActs = displayActivities.filter(a => a.day_id === targetDayId)
    const currentDriveMin = targetDayActs.reduce((sum, a) =>
      sum + (parseInt(a.details?.drive_min || 0, 10) || 0), 0)
    const incomingDriveMin = parseInt(draggedActivity.details?.drive_min || 0, 10) || 0
    const total = currentDriveMin + incomingDriveMin
    const limit = tour.constitution?.max_daily_driving_minutes || 420

    if (total > limit) {
      setDragWarning({ dayId: targetDayId, current: currentDriveMin, incoming: incomingDriveMin, limit, total })
    } else {
      setDragWarning(null)
    }
  }

  function handleDragEnd({ active, over }) {
    if (!over) return
    if (active.id === over.id) return
    const activityId = Number(String(active.id).replace(/^activity-/, ''))
    const data = over.data.current || {}
    const toDayId = data.dayId ?? null
    const toPosition = data.position ?? 1

    const targetDay = toDayId ? days.find(d => d.id === toDayId) : null
    if (targetDay?.buffer_day) {
      modals.openConfirmModal({
        title: '把行放进机动日？',
        children: (
          <Text size="sm">
            D{targetDay.day_index} 是机动日（缓冲）。继续放入行会让 D{targetDay.day_index} 不再是机动日，确认吗？
          </Text>
        ),
        labels: { confirm: '继续放入', cancel: '取消' },
        confirmProps: { color: 'orange' },
        onConfirm: () => {
          router.patch(`/tours/${tour.id}/days/${toDayId}`, { day: { buffer_day: false } }, {
            preserveState: true,
            preserveScroll: true,
            only: ['days', 'violations'],
            onSuccess: () => performMove(activityId, toDayId, toPosition),
            onError: () => notifications.show({ message: '修改 buffer 失败，未拖动', color: 'red' })
          })
        }
      })
      return
    }

    performMove(activityId, toDayId, toPosition)
  }

  function performMove(activityId, toDayId, toPosition) {
    // Snapshot prev position for undo
    const draggedActivity = displayActivities.find(a => a.id === activityId)
    const prevDayId = draggedActivity?.day_id ?? null
    const prevPosition = draggedActivity?.position ?? 1
    const label = `移动 ${draggedActivity?.name || 'activity'}`

    // Optimistic: apply locally
    setLocalOverrides(prev => ({
      ...prev,
      [activityId]: { day_id: toDayId, position: toPosition }
    }))

    router.patch(
      `/activities/${activityId}/position`,
      { to_day_id: toDayId, to_position: toPosition },
      {
        preserveState: true,
        preserveScroll: true,
        only: [ 'activities', 'violations' ],
        onSuccess: () => {
          setLocalOverrides(prev => {
            const { [activityId]: _, ...rest } = prev
            return rest
          })
          undoStack.push({
            label,
            undoFn: () => new Promise((resolve, reject) =>
              router.patch(`/activities/${activityId}/position`,
                { to_day_id: prevDayId, to_position: prevPosition },
                {
                  preserveState: true,
                  only: [ 'activities', 'violations' ],
                  onSuccess: () => resolve(),
                  onError: () => reject(new Error('服务器拒绝'))
                }
              )
            )
          })
        },
        onError: () => {
          setLocalOverrides(prev => {
            const { [activityId]: _, ...rest } = prev
            return rest
          })
          notifications.show({ message: '拖拽未保存，请重试', color: 'red' })
        }
      }
    )
  }
}

const ASK_AI_BACKLOG_PROMPT = '请帮我再列一些候选 activity 到 backlog'

function fixPromptFor(v) {
  return `请分析 ${v.message} 的硬违反，给我 3 个修正方案，每个说明原因、对其他日的影响，以及整程天数/体验是否变化。`
}
