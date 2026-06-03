import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { Head, router, usePage } from '@inertiajs/react'
import { Text, Group, Drawer } from '@mantine/core'
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
import MobilePlannerTabs from '../../components/planner/MobilePlannerTabs'
import ActivityDrawer from '../../components/activity-editor/ActivityDrawer'
import AcknowledgeModal from '../../components/planner/AcknowledgeModal'
import MembershipDrawer from '../../components/planner/MembershipDrawer'
import DayEditModal from '../../components/planner/DayEditModal'
import TourSettingsModal from '../../components/planner/TourSettingsModal'
import ExpenseDrawer from '../../components/planner/ExpenseDrawer'
import AddExpenseDialog from '../../components/planner/AddExpenseDialog'
import ActivityDetailDrawer from '../../components/planner/ActivityDetailDrawer'
import ActivityContextMenu from '../../components/planner/ActivityContextMenu'
import MoveToDayDialog from '../../components/planner/MoveToDayDialog'
import PlannerHeaderRight from '../../components/planner/PlannerHeaderRight'
import OutboxStatus from '../../components/OutboxStatus'
import ConstitutionDrawer from '../../components/planner/ConstitutionDrawer'
import TimelineOverlay from '../../components/planner/TimelineOverlay'
import ActivityFilterBar from '../../components/planner/ActivityFilterBar'
import { useInjectHeaderRight } from '../../layouts/HeaderSlot'
import { useIsMobile } from '../../hooks/useIsMobile'
import { useActivityFilter } from '../../hooks/useActivityFilter'
import { ONBOARDING_SENTINEL } from '../../lib/onboarding'
import { useUndoStack } from '../../hooks/useUndoStack'
import usePlannerLayout from '../../hooks/usePlannerLayout'
import { csrfToken } from '../../utils/csrf'

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
  const isMobile = useIsMobile()
  const [activePanel, setActivePanel] = useState('days')
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

  // Stable tourShape memo — keeps useActivityFilter's internal Set from
  // thrashing on every render (same reason headerRight is memoized below).
  const tourShape = useMemo(
    () => ({
      authorId: tour.author_id,
      memberIds: (members || []).map(m => m.user_id),
    }),
    [tour.author_id, members]
  )

  const {
    filter, setQ, setKind, setUids, setStatus, setLevels, setReserve, reset,
    active: filterActive, matches, activeCount, totalCount,
  } = useActivityFilter({ activities: displayActivities, tour: tourShape })

  // Server returns activities in DB insertion order, not position order. After
  // any reorder, UPDATE pushes rows around the heap, so insertion order drifts
  // from position order — client must sort explicitly.
  const byPosition = (a, b) => a.position - b.position
  const filteredActivities = displayActivities.filter(matches)
  const backlog = filteredActivities.filter(a => !a.day_id).sort(byPosition)
  const byDay = Object.fromEntries(days.map(d => [ d.id, filteredActivities.filter(a => a.day_id === d.id).sort(byPosition) ]))
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

  // AI onboarding: fires at most once per page load, either on mount (already
  // onboarded) or when the user closes the setup gate (accept / express / skip).
  const aiOnboardingStartedRef = useRef(false)
  const maybeStartOnboarding = useCallback(() => {
    if (!canEdit) return
    if (aiOnboardingStartedRef.current) return
    if (activities.length === 0 && conversation_empty) {
      aiOnboardingStartedRef.current = true
      setPendingChatPrompt(ONBOARDING_SENTINEL)
    }
  }, [canEdit, activities.length, conversation_empty])

  const handleConstClose = useCallback(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem(`onboarded:tour:${tour.id}`, '1')
    }
    closeConst()
    maybeStartOnboarding()
  }, [closeConst, maybeStartOnboarding, tour.id])

  // Timeline overlay state
  const [timelineOpen, { open: openTimeline, close: closeTimeline }] = useDisclosure(false)

  // Activity editor state
  const [editor, setEditor] = useState({ open: false, mode: 'create', activityId: null, targetDayId: null })

  // 卡片右键 / 长按快捷菜单：{ activity, x, y } | null
  const [cardMenu, setCardMenu] = useState(null)
  const openCardMenu = (activity, x, y) => setCardMenu({ activity, x, y })

  // 移到某天弹窗：存放目标 activityId，null = 关闭
  const [movingActivityId, setMovingActivityId] = useState(null)

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

  // Mirrors the CREATE path in ActivityDrawer: fetch (not router.post) because
  // the undo entry needs the new id from the response body. `cloningRef`
  // guards against double-tap — without it, rapid clicks fire multiple POSTs
  // and push duplicate undo entries with stale newIds.
  const cloningRef = useRef(false)
  const handleCloneActivity = async (activityId) => {
    if (cloningRef.current) return
    const src = activities.find((a) => a.id === activityId)
    if (!src) return
    cloningRef.current = true
    try {
      const res = await fetch(`/activities/${activityId}/clone`, {
        method: 'POST',
        headers: { 'Accept': 'application/json', 'X-CSRF-Token': csrfToken() },
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const { id: newId } = await res.json()
      router.reload({ only: [ 'activities', 'violations' ] })
      undoStack.push({
        label: `克隆 ${src.name}`,
        undoFn: () => fetch(`/activities/${newId}`, {
          method: 'DELETE',
          headers: { 'Accept': 'application/json', 'X-CSRF-Token': csrfToken() },
        }).then((r) => {
          if (!r.ok) throw new Error('删除失败')
          router.reload({ only: [ 'activities', 'violations' ] })
        }),
      })
    } catch (err) {
      console.error('clone failed', err)
      notifications.show({ message: '克隆失败', color: 'red' })
    } finally {
      cloningRef.current = false
    }
  }

  // 镜像 ActivityDrawer.handleDelete：确认弹窗 → DELETE → undo 用 recreate 还原。
  // 与抽屉内删除唯一差异：这里没有抽屉要关，故省去 onClose。
  const handleDeleteActivity = (activityId) => {
    // 用 activities（服务端权威态）而非 displayActivities：undo 要按服务端确认的
    // day/position 重建，不要被在途乐观拖拽覆盖（localOverrides）影响。
    const activity = activities.find((a) => a.id === activityId)
    if (!activity) return
    modals.openConfirmModal({
      title: '确认删除此行？',
      labels: { confirm: '删除', cancel: '取消' },
      confirmProps: { color: 'red' },
      onConfirm: () => {
        const savedAttrs = { ...activity }
        const wasInDay = activity.day_id
        router.delete(`/activities/${activity.id}`, {
          preserveScroll: true,
          only: ['activities', 'violations'],
          onSuccess: () => {
            undoStack.push({
              label: `删除 ${activity.name}`,
              undoFn: async () => {
                const url = wasInDay
                  ? `/tours/${tour.id}/days/${wasInDay}/activities`
                  : `/tours/${tour.id}/backlog_activities`
                const payload = {
                  activity: {
                    name: savedAttrs.name,
                    kind: savedAttrs.kind,
                    citizen_level: savedAttrs.citizen_level,
                    lat: savedAttrs.lat,
                    lng: savedAttrs.lng,
                    address: savedAttrs.address,
                    planned_start_at: savedAttrs.planned_start_at,
                    planned_duration_min: savedAttrs.planned_duration_min,
                    desc: savedAttrs.desc,
                    details: savedAttrs.details || {},
                  },
                }
                const res = await fetch(url, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json', 'Accept': 'application/json', 'X-CSRF-Token': csrfToken() },
                  body: JSON.stringify(payload),
                })
                if (!res.ok) throw new Error(`HTTP ${res.status}`)
                router.reload({ only: ['activities', 'violations'] })
              },
            })
          },
        })
      },
    })
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
  // Delegates to maybeStartOnboarding (ref-guarded, fires at most once).
  // Only runs when the constitution is already done (accepted server-side or
  // via localStorage). For the un-onboarded case, the greet fires in
  // handleConstClose instead (when the user leaves the setup gate).
  useEffect(() => {
    const alreadyOnboardedLocally = typeof window !== 'undefined'
      && localStorage.getItem(`onboarded:tour:${tour.id}`) === '1'
    const constitutionDone = tour.constitution_accepted || alreadyOnboardedLocally
    if (constitutionDone) maybeStartOnboarding()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // First-visit auto-open constitution drawer. Only for users who can edit;
  // a read-only viewer landing on an unaccepted tour shouldn't be forced
  // through onboarding they can't complete.
  useEffect(() => {
    if (!canEdit) return
    const key = `onboarded:tour:${tour.id}`
    const onboarded = localStorage.getItem(key) === '1' || !!tour.constitution_accepted
    if (!onboarded) openConst()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tour.id])

  // Inject memoized header-right contents. useMemo is mandatory — without
  // it, a new JSX element every render triggers setRight → re-render →
  // new element → infinite loop. Filter icon sits first (leftmost of the
  // right group) per UX: same visual weight as other drawer-openers.
  const headerRight = useMemo(() => (
    <Group gap="xs" wrap="nowrap">
      <ActivityFilterBar
        filter={filter}
        setQ={setQ}
        setKind={setKind}
        setUids={setUids}
        setStatus={setStatus}
        setLevels={setLevels}
        setReserve={setReserve}
        reset={reset}
        active={filterActive}
        activeCount={activeCount}
        totalCount={totalCount}
        members={members || []}
        author={author || { user_id: tour.author_id, name: '', email: '', avatar_url: null }}
      />
      <PlannerHeaderRight
        violations={violations}
        onOpenConst={openConst}
        onOpenTimeline={openTimeline}
        onOpenExpense={() => setExpenseDrawerOpen(true)}
        onOpenMembers={() => setMembersDrawerOpen(true)}
        onOpenSettings={canEdit ? () => setSettingsOpen(true) : undefined}
      />
      <OutboxStatus />
    </Group>
  ), [filter, setQ, setKind, setUids, setStatus, setLevels, setReserve, reset, filterActive, activeCount, totalCount, members, author, tour.author_id, violations, openConst, openTimeline, canEdit])
  useInjectHeaderRight(headerRight)

  // True only during "first visit" onboarding — lets the planner dim itself
  // behind the drawer so the map / chat / backlog don't distract.
  const inOnboarding = constOpen && !tour.constitution_accepted
    && (typeof window !== 'undefined' && localStorage.getItem(`onboarded:tour:${tour.id}`) !== '1')

  return (
    <div>
      <Head title={tour.title || '未命名旅程'} />
      <DndContext
        sensors={sensors}
        collisionDetection={hybridCollisionDetection}
        onDragStart={({ active }) => setActiveId(active.id)}
        onDragOver={({ active, over }) => updateDragWarning(active, over)}
        onDragEnd={(e) => { setActiveId(null); setDragWarning(null); handleDragEnd(e) }}
        onDragCancel={() => { setActiveId(null); setDragWarning(null) }}
        autoScroll={{ acceleration: 10, threshold: { x: 0.15, y: 0.15 } }}
      >
        {isMobile ? (
          <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100dvh - 56px - var(--mantine-spacing-md))' }}>
            <div style={{ flex: 1, minHeight: 0, display: 'flex', padding: activePanel === 'map' ? 0 : 8 }}>
              {activePanel === 'candidates' && (
                <BacklogList
                  activities={backlog}
                  onAddActivity={canEdit ? openCreate : undefined}
                  onEditActivity={openDetail}
                  onCardContextMenu={canEdit ? openCardMenu : undefined}
                  onAskAI={canEdit ? () => setPendingChatPrompt(ASK_AI_BACKLOG_PROMPT) : undefined}
                  readOnly={!canEdit}
                  open
                  canToggle={false}
                  mobile
                  flexStyle={MOBILE_PANEL}
                  hoveredActivityIds={hoveredActivityIds}
                  onHoverActivity={onHoverActivity}
                  onClearHover={onClearHover}
                  author={author}
                  members={members}
                  filterActive={filterActive}
                />
              )}
              {activePanel === 'days' && (
                <DayPanel
                  days={days}
                  byDay={byDay}
                  tour={tour}
                  nextDayIndex={nextDayIndex}
                  onAddActivity={canEdit ? openCreate : undefined}
                  onEditActivity={openDetail}
                  onCardContextMenu={canEdit ? openCardMenu : undefined}
                  onEditDay={canEdit ? setEditingDayId : undefined}
                  readOnly={!canEdit}
                  dragWarning={dragWarning}
                  open
                  canToggle={false}
                  mobile
                  vertical
                  autoFit={false}
                  flexStyle={MOBILE_PANEL}
                  routeLegs={route_legs || []}
                  hoveredActivityIds={hoveredActivityIds}
                  onHoverActivity={onHoverActivity}
                  onHoverConnector={onHoverConnector}
                  onClearHover={onClearHover}
                  author={author}
                  members={members}
                  filterActive={filterActive}
                />
              )}
              {activePanel === 'map' && (
                <PlannerMap
                  activities={displayActivities}
                  days={days}
                  routeLegs={route_legs || []}
                  tourId={tour.id}
                  canEdit={canEdit}
                  open
                  canToggle={false}
                  mobile
                  flexStyle={MOBILE_PANEL}
                  hoveredActivityIds={hoveredActivityIds}
                  onMarkerHover={onMarkerHover}
                  onMarkerLeave={onMarkerLeave}
                  matches={matches}
                />
              )}
              {activePanel === 'ai' && (
                <ChatPanel
                  tour={tour}
                  pendingPrompt={pendingChatPrompt}
                  onPromptConsumed={() => setPendingChatPrompt(null)}
                  open
                  canToggle={false}
                  mobile
                  flexStyle={MOBILE_PANEL}
                />
              )}
            </div>
            {constOpen && (
              <Drawer opened onClose={handleConstClose} size="100%" position="left" withCloseButton closeOnEscape closeOnClickOutside title={inOnboarding ? '设置这次旅程' : '出行宪法'} padding="md">
                <ConstitutionDrawer
                  mobile
                  tour={tour}
                  violations={violations}
                  defaults={defaults}
                  overrides={overrides}
                  initialDaysCount={days.length || 1}
                  days={days}
                  canEdit={canEdit}
                  width="100%"
                  onClose={handleConstClose}
                  onFix={(v) => setPendingChatPrompt(fixPromptFor(v))}
                  onAcknowledge={(v) => setAcknowledgingViolation(v)}
                />
              </Drawer>
            )}
            <MobilePlannerTabs active={activePanel} onChange={setActivePanel} />
          </div>
        ) : (
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
              days={days}
              canEdit={canEdit}
              width={constWidth}
              onWidthChange={setConstWidth}
              onClose={handleConstClose}
              onFix={(v) => setPendingChatPrompt(fixPromptFor(v))}
              onAcknowledge={(v) => setAcknowledgingViolation(v)}
            />
          )}
          <BacklogList
            activities={backlog}
            onAddActivity={canEdit ? openCreate : undefined}
            onEditActivity={openDetail}
            onCardContextMenu={canEdit ? openCardMenu : undefined}
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
            filterActive={filterActive}
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
            onCardContextMenu={canEdit ? openCardMenu : undefined}
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
            filterActive={filterActive}
          />
          <ResizeHandle
            disabled={!layout.handleVisible('days', 'map')}
            onResize={handleResize('days', 'map')}
          />

          <PlannerMap
            activities={displayActivities}
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
            matches={matches}
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
        )}
        <DragOverlay>
          {activeActivity && <ActivityCardOverlay activity={activeActivity} author={author} members={members} />}
        </DragOverlay>
      </DndContext>

      <MoveToDayDialog
        opened={movingActivityId != null}
        onClose={() => setMovingActivityId(null)}
        days={days}
        byDay={byDay}
        onPick={(dayId, position) => performMove(movingActivityId, dayId, position)}
      />

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
        onClone={handleCloneActivity}
        onFocusExpense={openExpenseById}
      />

      {/* onEdit 刻意直达编辑表单(openEdit),不走只读详情抽屉:右键菜单是熟手快捷
          入口。左键点卡片仍走 openDetail。见设计文档已评审决策。 */}
      <ActivityContextMenu
        state={cardMenu}
        onClose={() => setCardMenu(null)}
        onEdit={openEdit}
        onAddExpense={openAddExpenseForActivity}
        onClone={handleCloneActivity}
        onMoveToDay={isMobile ? (id) => setMovingActivityId(id) : undefined}
        onMoveToBacklog={(id) => performMove(id, null, 1)}
        onDelete={handleDeleteActivity}
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

const MOBILE_PANEL = { flex: 1, minWidth: 0, width: '100%', height: '100%' }

function fixPromptFor(v) {
  return `请分析 ${v.message} 的硬违反，给我 3 个修正方案，每个说明原因、对其他日的影响，以及整程天数/体验是否变化。`
}
