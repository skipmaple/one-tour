import { useRef, useState } from 'react'
import { Modal, Stack, Text, Paper } from '@mantine/core'
import { IconListDetails } from '@tabler/icons-react'
import TourSummaryBar from '../timeline/TourSummaryBar'
import RhythmBar from '../timeline/RhythmBar'
import TimelineDayColumn from '../timeline/TimelineDayColumn'
import DayDetailPanel from '../timeline/DayDetailPanel'

export default function TimelineOverlay({
  opened, onClose, tour, days, activities, violations, summary,
}) {
  const [selectedDayId, setSelectedDayId] = useState(null)
  const dayColumnRefs = useRef({})

  const byDay = Object.fromEntries(
    days.map(d => [d.id, activities.filter(a => a.day_id === d.id).sort((a, b) => a.position - b.position)]),
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

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      fullScreen
      withCloseButton
      padding={0}
      title="总览"
      styles={{
        content: { marginTop: 56 },
        body: { padding: 16 },
      }}
    >
      <Stack gap="md">
        <TourSummaryBar summary={summary} />
        <RhythmBar
          days={days}
          violations={violations}
          selectedDayId={selectedDayId}
          onSlotClick={handleSlotClick}
        />
        {activities.length === 0 ? (
          <Paper withBorder p="xl" style={{ textAlign: 'center' }}>
            <IconListDetails size={32} stroke={1.2} color="#bbb" />
            <Text size="sm" c="dimmed" mt="sm">
              还没有任何行程。回到规划页，从"候选池"把景点拖到右侧日即可。
            </Text>
          </Paper>
        ) : (
          <div style={{ display: 'flex', gap: 8, overflowX: 'auto', alignItems: 'stretch', paddingBottom: 6 }}>
            {days.map(d => (
              <TimelineDayColumn
                key={d.id}
                day={d}
                activities={byDay[d.id] || []}
                constitution={tour.constitution}
                tourId={tour.id}
                selected={selectedDayId === d.id}
                onSelect={setSelectedDayId}
                columnRef={(el) => { dayColumnRefs.current[d.id] = el }}
              />
            ))}
          </div>
        )}
        <DayDetailPanel
          day={selectedDay}
          activities={selectedDayActivities}
          constitution={tour.constitution}
        />
      </Stack>
    </Modal>
  )
}
