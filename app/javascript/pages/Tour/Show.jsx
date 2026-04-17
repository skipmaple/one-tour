import { useState, useEffect } from 'react'
import { Head, router, usePage } from '@inertiajs/react'
import { Button, Group, Paper, Text, Stack } from '@mantine/core'
import { DndContext, DragOverlay, closestCenter } from '@dnd-kit/core'
import { notifications } from '@mantine/notifications'
import { modals } from '@mantine/modals'
import { ActivityCardOverlay } from '../../components/planner/ActivityCard'
import BacklogList from '../../components/planner/BacklogList'
import DayColumn from '../../components/planner/DayColumn'
import PlannerMap from '../../components/planner/PlannerMap'
import ChatPanel from '../../components/planner/ChatPanel'
import ConstitutionBanner from '../../components/planner/ConstitutionBanner'
import TourTabs from '../../components/tour/TourTabs'
import ActivityDrawer from '../../components/activity-editor/ActivityDrawer'
import AcknowledgeModal from '../../components/planner/AcknowledgeModal'
import MembershipDrawer from '../../components/planner/MembershipDrawer'
import DayEditModal from '../../components/planner/DayEditModal'
import TourSettingsModal from '../../components/planner/TourSettingsModal'
import { ONBOARDING_SENTINEL } from '../../lib/onboarding'
import { useUndoStack } from '../../hooks/useUndoStack'

export default function Show({ tour, days, activities, violations, members, author, conversation_empty }) {
  const { current_user } = usePage().props
  const canEdit = tour.editable_by_current_user
  const [chatOpen, setChatOpen] = useState(true)

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
            <Group gap={6} onClick={() => canEdit && setSettingsOpen(true)} style={{ cursor: canEdit ? 'pointer' : 'default' }} className={canEdit ? 'tour-title-editable' : undefined}>
              <Text fw={700} size="lg">{tour.title}</Text>
              {canEdit && <Text size="lg" c="gray.5">✎</Text>}
            </Group>
            <Button
              size="compact-xs"
              variant="default"
              onClick={() => setMembersDrawerOpen(true)}
            >
              成员
            </Button>
          </Group>
          <ConstitutionBanner
            violations={violations}
            onFix={(v) => setPendingChatPrompt(fixPromptFor(v))}
            onAcknowledge={(v) => setAcknowledgingViolation(v)}
            onDismiss={() => {}}
            readOnly={!canEdit}
          />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: `260px 1fr ${chatOpen ? 320 : 36}px`, gap: 10, padding: 10 }}>
          <BacklogList
            activities={backlog}
            onAddActivity={canEdit ? openCreate : undefined}
            onEditActivity={canEdit ? openEdit : undefined}
            onAskAI={canEdit ? () => setPendingChatPrompt(ASK_AI_BACKLOG_PROMPT) : undefined}
            onFocusChat={canEdit ? () => setChatOpen(true) : undefined}
            readOnly={!canEdit}
          />
          <div style={{ display: 'grid', gridTemplateRows: 'auto 1fr', gap: 10 }}>
            <PlannerMap activities={activities} days={days} />
            <div style={{ display: 'flex', gap: 8, overflowX: 'auto', alignItems: 'stretch' }}>
              {days.map(d => (
                <DayColumn
                  key={d.id}
                  day={d}
                  activities={byDay[d.id] || []}
                  constitution={tour.constitution}
                  onAddActivity={canEdit ? openCreate : undefined}
                  onEditActivity={canEdit ? openEdit : undefined}
                  onEditDay={canEdit ? setEditingDayId : undefined}
                  readOnly={!canEdit}
                  dragWarning={dragWarning?.dayId === d.id ? dragWarning : null}
                />
              ))}
              <AddDayButton tour={tour} nextDayIndex={nextDayIndex} empty={days.length === 0} />
            </div>
          </div>
          <ChatPanel
            tour={tour}
            open={chatOpen}
            onToggle={() => setChatOpen(!chatOpen)}
            pendingPrompt={pendingChatPrompt}
            onPromptConsumed={() => setPendingChatPrompt(null)}
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

function AddDayButton({ tour, nextDayIndex, empty }) {
  const handleAdd = () => {
    router.post(
      `/tours/${tour.id}/days`,
      { day: { day_index: nextDayIndex } },
      {
        only: [ 'days', 'activities', 'violations' ],
        preserveState: true,
        preserveScroll: true
      }
    )
  }

  if (empty) {
    return (
      <Paper
        withBorder
        style={{
          minWidth: 260,
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          alignItems: 'center',
          border: '2px dashed #ccc',
          background: '#fafafa',
          padding: 24,
          gap: 8
        }}
      >
        <Stack gap={6} align="center">
          <Text fw={600} size="sm">还没有日</Text>
          <Text size="xs" c="dimmed" ta="center">
            从第 1 天开始，或让 AI 帮你一次排完
          </Text>
          <Button size="xs" onClick={handleAdd} data-testid="add-day-empty">
            + 新建 D1
          </Button>
        </Stack>
      </Paper>
    )
  }

  return (
    <Paper
      withBorder
      onClick={handleAdd}
      style={{
        minWidth: 60,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        cursor: 'pointer',
        border: '2px dashed #ccc',
        background: '#fafafa',
        color: '#666'
      }}
      data-testid="add-day-slot"
    >
      <Text size="sm" fw={500}>+ D{nextDayIndex}</Text>
    </Paper>
  )
}
