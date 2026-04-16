import { useState, useRef } from 'react'
import { Head } from '@inertiajs/react'
import { Stack, Text } from '@mantine/core'
import TourTabs from '../../components/tour/TourTabs'
import TourSummaryBar from '../../components/timeline/TourSummaryBar'
import RhythmBar from '../../components/timeline/RhythmBar'

export default function Timeline({ tour, days, activities, violations, summary }) {
  const [selectedDayId, setSelectedDayId] = useState(null)
  const dayColumnRefs = useRef({})

  const handleSlotClick = (dayId) => {
    setSelectedDayId(dayId)
    const el = dayColumnRefs.current[dayId]
    if (el && typeof el.scrollIntoView === 'function') {
      el.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' })
    }
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
        {/* Days timeline inserted in Task 5.6 */}
        {/* DayDetailPanel inserted in Task 5.7 */}
        <Text size="xs" c="dimmed">年表主体内容开发中…</Text>
      </Stack>
    </div>
  )
}
