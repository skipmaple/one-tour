import { useState } from 'react'
import { Head, router } from '@inertiajs/react'
import { Button, Paper, Text, Stack } from '@mantine/core'
import { DndContext, closestCenter } from '@dnd-kit/core'
import BacklogList from '../../components/planner/BacklogList'
import DayColumn from '../../components/planner/DayColumn'
import PlannerMap from '../../components/planner/PlannerMap'
import ChatPanel from '../../components/planner/ChatPanel'
import ConstitutionBanner from '../../components/planner/ConstitutionBanner'

export default function Show({ tour, days, activities, violations }) {
  const [chatOpen, setChatOpen] = useState(true)
  const backlog = activities.filter(a => !a.day_id)
  const byDay = Object.fromEntries(days.map(d => [ d.id, activities.filter(a => a.day_id === d.id) ]))
  // Brand-new tours land here with days=[] and no UI path to add one
  // (the AI can do it, but forcing the user through chat is hostile).
  const nextDayIndex = days.length === 0 ? 1 : Math.max(...days.map(d => d.day_index)) + 1

  return (
    <div>
      <Head title={tour.title} />
      <DndContext collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <div style={{ padding: 10 }}>
          <ConstitutionBanner violations={violations} />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: `260px 1fr ${chatOpen ? 320 : 36}px`, gap: 10, padding: 10 }}>
          <BacklogList activities={backlog} />
          <div style={{ display: 'grid', gridTemplateRows: 'auto 1fr', gap: 10 }}>
            <PlannerMap activities={activities} days={days} />
            <div style={{ display: 'flex', gap: 8, overflowX: 'auto', alignItems: 'stretch' }}>
              {days.map(d => <DayColumn key={d.id} day={d} activities={byDay[d.id] || []} constitution={tour.constitution} />)}
              <AddDayButton tour={tour} nextDayIndex={nextDayIndex} empty={days.length === 0} />
            </div>
          </div>
          <ChatPanel tour={tour} open={chatOpen} onToggle={() => setChatOpen(!chatOpen)} />
        </div>
      </DndContext>
    </div>
  )

  function handleDragEnd({ active, over }) {
    if (!over) return
    if (active.id === over.id) return
    const activityId = String(active.id).replace(/^activity-/, '')
    // over.data.current is populated by useDroppable({ data: { dayId, position } })
    // on BOTH the container (day column / backlog, position = length+1 → append)
    // and each ActivityCard (position = that card's position → insert-before).
    const data = over.data.current || {}
    const toDayId = data.dayId ?? null
    const toPosition = data.position ?? 1

    router.patch(
      `/activities/${activityId}/position`,
      { to_day_id: toDayId, to_position: toPosition },
      {
        preserveState: true,
        preserveScroll: true,
        only: [ 'activities', 'violations' ],
        onError: () => { alert('拖拽未保存，请重试') }
      }
    )
  }
}

// A dashed-outline drop-target-less column at the end of the Day row.
// When days=[] we render a wider "empty-state" variant with an explanation;
// otherwise it's a compact add-slot that matches the column width.
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
