import { useState } from 'react'
import { Head, router } from '@inertiajs/react'
import { DndContext, closestCenter } from '@dnd-kit/core'
import BacklogList from '../../components/planner/BacklogList'
import DayColumn from '../../components/planner/DayColumn'
import PlannerMap from '../../components/planner/PlannerMap'
import ChatPanel from '../../components/planner/ChatPanel'
import ConstitutionBanner from '../../components/planner/ConstitutionBanner'
import { csrfToken } from '../../utils/csrf'

export default function Show({ tour, days, activities, violations }) {
  const [chatOpen, setChatOpen] = useState(true)
  const backlog = activities.filter(a => !a.day_id)
  const byDay = Object.fromEntries(days.map(d => [ d.id, activities.filter(a => a.day_id === d.id) ]))

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
            <PlannerMap activities={activities} />
            <div style={{ display: 'flex', gap: 8, overflowX: 'auto' }}>
              {days.map(d => <DayColumn key={d.id} day={d} activities={byDay[d.id] || []} constitution={tour.constitution} />)}
            </div>
          </div>
          <ChatPanel tour={tour} open={chatOpen} onToggle={() => setChatOpen(!chatOpen)} />
        </div>
      </DndContext>
    </div>
  )

  async function handleDragEnd({ active, over }) {
    if (!over) return
    const activityId = String(active.id).replace(/^activity-/, '')
    const data = over.data.current || {}
    const toDayId = data.dayId ?? null
    const toPosition = data.position ?? 1

    try {
      const res = await fetch(`/activities/${activityId}/position`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'X-CSRF-Token': csrfToken()
        },
        body: JSON.stringify({ to_day_id: toDayId, to_position: toPosition })
      })
      if (!res.ok) throw new Error(`PATCH failed: ${res.status}`)
      router.reload({ only: ['activities', 'violations'] })
    } catch (err) {
      // Basic error display; Task 4.10 wires proper toast
      console.error('[drag] failed', err)
      alert('拖拽未保存，请重试')
    }
  }
}
