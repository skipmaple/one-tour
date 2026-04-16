import { Head } from '@inertiajs/react'
import { Stack, Text } from '@mantine/core'
import TourTabs from '../../components/tour/TourTabs'
import TourSummaryBar from '../../components/timeline/TourSummaryBar'

export default function Timeline({ tour, days, activities, violations, summary }) {
  return (
    <div>
      <Head title={`${tour.title} · 年表`} />
      <Stack gap="md" p="md">
        <TourTabs tour={tour} active="timeline" />
        <TourSummaryBar summary={summary} />
        {/* RhythmBar inserted in Task 5.5 */}
        {/* Days timeline inserted in Task 5.6 */}
        {/* DayDetailPanel inserted in Task 5.7 */}
        <Text size="xs" c="dimmed">年表主体内容开发中…</Text>
      </Stack>
    </div>
  )
}
