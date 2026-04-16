import { useState } from 'react'
import { Head, router, usePage } from '@inertiajs/react'
import { Button, Group, Paper, Text, Stack } from '@mantine/core'
import { DndContext, DragOverlay, closestCenter } from '@dnd-kit/core'
import { notifications } from '@mantine/notifications'
import { ActivityCardOverlay } from '../../components/planner/ActivityCard'
import BacklogList from '../../components/planner/BacklogList'
import DayColumn from '../../components/planner/DayColumn'
import PlannerMap from '../../components/planner/PlannerMap'
import ChatPanel from '../../components/planner/ChatPanel'
import ConstitutionBanner from '../../components/planner/ConstitutionBanner'
import ActivityDrawer from '../../components/activity-editor/ActivityDrawer'
import AcknowledgeModal from '../../components/planner/AcknowledgeModal'
import MembershipDrawer from '../../components/planner/MembershipDrawer'
import DayEditModal from '../../components/planner/DayEditModal'

export default function Show({ tour, days, activities, violations, members, author }) {
  const { current_user } = usePage().props
  const canEdit = tour.editable_by_current_user
  const [chatOpen, setChatOpen] = useState(true)

  // Drag overlay state
  const [activeId, setActiveId] = useState(null)

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
  const editingDay = editingDayId ? days.find(d => d.id === editingDayId) : null

  const openCreate = (dayId) => setEditor({ open: true, mode: 'create', activityId: null, targetDayId: dayId })
  const openEdit = (activityId) => setEditor({ open: true, mode: 'edit', activityId, targetDayId: null })
  const closeEditor = () => setEditor({ open: false, mode: 'create', activityId: null, targetDayId: null })

  const editingActivity = editor.activityId ? activities.find(a => a.id === editor.activityId) : null

  return (
    <div>
      <Head title={tour.title} />
      <DndContext
        collisionDetection={closestCenter}
        onDragStart={({ active }) => setActiveId(active.id)}
        onDragEnd={(e) => { setActiveId(null); handleDragEnd(e) }}
        onDragCancel={() => setActiveId(null)}
        autoScroll={{ acceleration: 10, threshold: { x: 0.15, y: 0.15 } }}
      >
        <div style={{ padding: 10 }}>
          <Group justify="space-between" mb="xs">
            <Text fw={700} size="lg">{tour.title}</Text>
            {canEdit && (
              <Button
                size="compact-xs"
                variant="default"
                onClick={() => setMembersDrawerOpen(true)}
              >
                成员
              </Button>
            )}
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
    </div>
  )

  function handleDragEnd({ active, over }) {
    if (!over) return
    if (active.id === over.id) return
    const activityId = Number(String(active.id).replace(/^activity-/, ''))
    const data = over.data.current || {}
    const toDayId = data.dayId ?? null
    const toPosition = data.position ?? 1

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
          <Text fw={600} size="sm">还没有 Day</Text>
          <Text size="xs" c="dimmed" ta="center">
            从第 1 天开始，或让 AI 帮你一次排完
          </Text>
          <Button size="xs" onClick={handleAdd} data-testid="add-day-empty">
            + 新建 Day 1
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
      <Text size="sm" fw={500}>+ Day {nextDayIndex}</Text>
    </Paper>
  )
}
