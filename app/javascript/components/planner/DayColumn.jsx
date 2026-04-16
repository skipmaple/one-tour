import { Paper, Text, Stack, Group, Button } from '@mantine/core'
import { useDroppable } from '@dnd-kit/core'
import ActivityCard from './ActivityCard'

export default function DayColumn({ day, activities, constitution, onAddActivity, onEditActivity, readOnly }) {
  const maxH = Math.round((constitution?.max_daily_driving_minutes || 420) / 60)
  const maxTier1 = constitution?.max_tier_one_per_day || 3

  const driveMin = activities
    .filter(a => a.kind === 'road')
    .reduce((sum, a) => sum + (parseInt(a.details?.drive_min || 0, 10) || 0), 0)
  const driveH = Math.round(driveMin / 60 * 10) / 10
  const tierOneCount = activities.filter(a => a.citizen_level === 'tier_one').length

  const { setNodeRef, isOver } = useDroppable({
    id: `day-${day.id}`,
    data: { dayId: day.id, position: activities.length + 1 }
  })

  return (
    <Paper withBorder style={{ minWidth: 170, display: 'flex', flexDirection: 'column' }}>
      <Group justify="space-between" p="xs" bg="gray.1">
        <Text fw={600}>D{day.day_index}</Text>
        <Text size="xs" c="dimmed">{day.date || '—'}</Text>
      </Group>
      {!readOnly && onAddActivity && (
        <div style={{ padding: '4px 8px' }}>
          <Button size="compact-xs" variant="light" fullWidth onClick={() => onAddActivity(day.id)}>
            + 加一个
          </Button>
        </div>
      )}
      <Stack gap={4} p="xs" ref={setNodeRef} style={{ flex: 1, minHeight: 140, background: isOver ? '#e8f0fb' : undefined }}>
        {activities.map(a => (
          <ActivityCard key={a.id} activity={a} onClick={onEditActivity} readOnly={readOnly} />
        ))}
        {activities.length === 0 && <Text size="xs" c="dimmed" ta="center" mt="md">空</Text>}
      </Stack>
      <div style={{ borderTop: '1px dashed #ccc', padding: '4px 8px', fontSize: 10, color: '#666' }}>
        驾驶 {progressBar(driveH, maxH)} {driveH}/{maxH}h<br />
        核心 {progressBar(tierOneCount, maxTier1, 3)} {tierOneCount}/{maxTier1}
        {day.buffer_day && <> · buffer</>}
      </div>
    </Paper>
  )
}

function progressBar(value, max, width = 5) {
  const filled = Math.min(Math.round((value / max) * width), width)
  return '█'.repeat(filled) + '░'.repeat(width - filled)
}
