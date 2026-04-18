import { useState, useEffect, useRef, useCallback } from 'react'
import { Head, router, usePage } from '@inertiajs/react'
import { Button, Group, Text } from '@mantine/core'
import { DndContext, DragOverlay, closestCenter } from '@dnd-kit/core'
import { notifications } from '@mantine/notifications'
import { modals } from '@mantine/modals'
import { ActivityCardOverlay } from '../../components/planner/ActivityCard'
import BacklogList from '../../components/planner/BacklogList'
import PlannerMap from '../../components/planner/PlannerMap'
import ChatPanel from '../../components/planner/ChatPanel'
import DayPanel from '../../components/planner/DayPanel'
import ResizeHandle from '../../components/planner/PanelLayout/ResizeHandle'
import ConstitutionChip from '../../components/planner/ConstitutionChip'
import TourTabs from '../../components/tour/TourTabs'
import ActivityDrawer from '../../components/activity-editor/ActivityDrawer'
import AcknowledgeModal from '../../components/planner/AcknowledgeModal'
import MembershipDrawer from '../../components/planner/MembershipDrawer'
import DayEditModal from '../../components/planner/DayEditModal'
import TourSettingsModal from '../../components/planner/TourSettingsModal'
import { ONBOARDING_SENTINEL } from '../../lib/onboarding'
import { useUndoStack } from '../../hooks/useUndoStack'
import usePlannerLayout from '../../hooks/usePlannerLayout'

export default function Show({ tour, days, activities, violations, members, author, conversation_empty }) {
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

  // Optimistic drag state — overrides server activities until server confirms.
  // Shape: { [activityId]: { day_id, position } }
  const [localOverrides, setLocalOverrides] = useState({})

  // Merge server activities with local overrides
  const displayActivities = activities.map(a =>
    localOverrides[a.id]
      ? { ...a, ...localOverrides[a.id] }
      : a
  )

  const activeActivity = activeId
    ? displayActivities.find(a => `activity-${a.id}` === activeId)
    : null

  const backlog = displayActivities.filter(a => !a.day_id)
  const byDay = Object.fromEntries(days.map(d => [ d.id, displayActivities.filter(a => a.day_id === d.id) ]))
  const nextDayIndex = days.length === 0 ? 1 : Math.max(...days.map(d => d.day_index)) + 1

  // Violation acknowledge state
  const [acknowledgingViolation, setAcknowledgingViolation] = useState(null)
  const [pendingChatPrompt, setPendingChatPrompt] = useState(null)

  // Membership drawer state
  const [membersDrawerOpen, setMembersDrawerOpen] = useState(false)

  // Activity editor state
  const [editor, setEditor] = useState({ open: false, mode: 'create', activityId: null, targetDayId: null })

  // Day edit state
  const [editingDayId, setEditingDayId] = useState(null)

  // Tour settings modal state
  const [settingsOpen, setSettingsOpen] = useState(false)
  const editingDay = editingDayId ? days.find(d => d.id === editingDayId) : null

  const openCreate = (dayId) => setEditor({ open: true, mode: 'create', activityId: null, targetDayId: dayId })
  const openEdit = (activityId) => setEditor({ open: true, mode: 'edit', activityId, targetDayId: null })
  const closeEditor = () => setEditor({ open: false, mode: 'create', activityId: null, targetDayId: null })

  const editingActivity = editor.activityId ? activities.find(a => a.id === editor.activityId) : null

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


  return (
    <div>
      <Head title={tour.title} />
      <DndContext
        collisionDetection={closestCenter}
        onDragStart={({ active }) => setActiveId(active.id)}
        onDragOver={({ active, over }) => updateDragWarning(active, over)}
        onDragEnd={(e) => { setActiveId(null); setDragWarning(null); handleDragEnd(e) }}
        onDragCancel={() => { setActiveId(null); setDragWarning(null) }}
        autoScroll={{ acceleration: 10, threshold: { x: 0.15, y: 0.15 } }}
      >
        <div style={{ padding: 10 }}>
          <TourTabs tour={tour} active="planner" />
          <Group justify="space-between" mb="xs" mt="sm">
            <Group gap="xs" wrap="nowrap">
              <div
                onClick={() => canEdit && setSettingsOpen(true)}
                style={{ cursor: canEdit ? 'pointer' : 'default' }}
                className={canEdit ? 'tour-title-editable' : undefined}
              >
                <Text fw={700} size="lg" className="tour-title-text">{tour.title}</Text>
                {canEdit && <Text fw={700} size="lg" c="gray.5" className="tour-title-edit-hint" style={{ display: 'none' }}>✎ 编辑</Text>}
                {canEdit && (
                  <style>{`
                    .tour-title-editable:hover .tour-title-text { display: none; }
                    .tour-title-editable:hover .tour-title-edit-hint { display: inline !important; }
                  `}</style>
                )}
              </div>
              <ConstitutionChip
                violations={violations}
                onFix={(v) => setPendingChatPrompt(fixPromptFor(v))}
                onAcknowledge={(v) => setAcknowledgingViolation(v)}
                onDismiss={() => {}}
                readOnly={!canEdit}
              />
            </Group>
            <Button
              size="compact-xs"
              variant="default"
              onClick={() => setMembersDrawerOpen(true)}
            >
              成员
            </Button>
          </Group>
        </div>
        <div ref={containerRef} style={{
          display: 'flex',
          alignItems: 'stretch',
          gap: 0,
          padding: 10,
          height: 'calc(100vh - 200px)',
        }}>
          <BacklogList
            activities={backlog}
            onAddActivity={canEdit ? openCreate : undefined}
            onEditActivity={canEdit ? openEdit : undefined}
            onAskAI={canEdit ? () => setPendingChatPrompt(ASK_AI_BACKLOG_PROMPT) : undefined}
            readOnly={!canEdit}
            open={layout.panels.candidates.open}
            onToggle={() => layout.togglePanel('candidates')}
            canToggle={layout.openCount > 1 || !layout.panels.candidates.open}
            flexStyle={layout.flexStyle('candidates')}
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
            onEditActivity={canEdit ? openEdit : undefined}
            onEditDay={canEdit ? setEditingDayId : undefined}
            readOnly={!canEdit}
            dragWarning={dragWarning}
            open={layout.panels.days.open}
            onToggle={() => layout.togglePanel('days')}
            canToggle={layout.openCount > 1 || !layout.panels.days.open}
            autoFit={layout.panels.days.autoFit}
            onToggleAutoFit={layout.toggleAutoFit}
            flexStyle={layout.flexStyle('days', { autoFitWidth: days.length * 200 + 32 })}
          />
          <ResizeHandle
            disabled={!layout.handleVisible('days', 'map')}
            onResize={handleResize('days', 'map')}
          />

          <PlannerMap
            activities={activities}
            days={days}
            open={layout.panels.map.open}
            onToggle={() => layout.togglePanel('map')}
            canToggle={layout.openCount > 1 || !layout.panels.map.open}
            flexStyle={layout.flexStyle('map')}
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
          {activeActivity && <ActivityCardOverlay activity={activeActivity} />}
        </DragOverlay>
      </DndContext>

      <ActivityDrawer
        tourId={tour.id}
        opened={editor.open}
        onClose={closeEditor}
        mode={editor.mode}
        activity={editingActivity}
        targetDayId={editor.targetDayId}
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

