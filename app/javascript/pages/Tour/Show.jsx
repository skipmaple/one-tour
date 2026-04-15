import { useState } from 'react'
import { Head } from '@inertiajs/react'
import { DndContext, closestCenter } from '@dnd-kit/core'
import BacklogList from '../../components/planner/BacklogList'
import DayColumn from '../../components/planner/DayColumn'
import PlannerMap from '../../components/planner/PlannerMap'
import ChatPanel from '../../components/planner/ChatPanel'

export default function Show({ tour, days, activities, violations }) {
  const [chatOpen, setChatOpen] = useState(true)
  const backlog = activities.filter(a => !a.day_id)
  const byDay = Object.fromEntries(days.map(d => [ d.id, activities.filter(a => a.day_id === d.id) ]))

  return (
    <div>
      <Head title={tour.title} />
      <DndContext collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
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

  function handleDragEnd() { /* implemented in Task 4.8 */ }
}
