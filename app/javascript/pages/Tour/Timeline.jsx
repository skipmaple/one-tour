import { useState, useRef } from 'react'
import { Head } from '@inertiajs/react'
import { Stack } from '@mantine/core'
import TourTabs from '../../components/tour/TourTabs'
import TourSummaryBar from '../../components/timeline/TourSummaryBar'
import RhythmBar from '../../components/timeline/RhythmBar'
import TimelineDayColumn from '../../components/timeline/TimelineDayColumn'
import DayDetailPanel from '../../components/timeline/DayDetailPanel'

export default function Timeline({ tour, days, activities, violations, summary }) {
  const [selectedDayId, setSelectedDayId] = useState(null)
  const dayColumnRefs = useRef({})

  const byDay = Object.fromEntries(
    days.map(d => [d.id, activities.filter(a => a.day_id === d.id).sort((a, b) => a.position - b.position)])
  )

  const selectedDay = selectedDayId ? days.find(d => d.id === selectedDayId) : null
  const selectedDayActivities = selectedDay ? (byDay[selectedDay.id] || []) : []

  const handleSlotClick = (dayId) => {
    setSelectedDayId(dayId)
    const el = dayColumnRefs.current[dayId]
    if (el && typeof el.scrollIntoView === 'function') {
      el.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' })
    }
  }

  const handleColumnSelect = (dayId) => {
    setSelectedDayId(dayId)
  }

  return (
    <div>
      <Head title={`${tour.title} · 年表`} />
      <Stack gap="md" p="md">
        <TourTabs tour={tour} active="timeline" />
        <TourSummaryBar summary={summary} />
        <RhythmBar
          days={days}
          violations={violations}
          selectedDayId={selectedDayId}
          onSlotClick={handleSlotClick}
        />
        <div style={{ display: 'flex', gap: 8, overflowX: 'auto', alignItems: 'stretch', paddingBottom: 6 }}>
          {days.map(d => (
            <TimelineDayColumn
              key={d.id}
              day={d}
              activities={byDay[d.id] || []}
              constitution={tour.constitution}
              tourId={tour.id}
              selected={selectedDayId === d.id}
              onSelect={handleColumnSelect}
              columnRef={(el) => { dayColumnRefs.current[d.id] = el }}
            />
          ))}
        </div>
        <DayDetailPanel
          day={selectedDay}
          activities={selectedDayActivities}
          constitution={tour.constitution}
        />
      </Stack>
    </div>
  )
}
