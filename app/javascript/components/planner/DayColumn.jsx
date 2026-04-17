import { Paper, Text, Stack, Group, Button } from '@mantine/core'
import { useDroppable } from '@dnd-kit/core'
import ActivityCard from './ActivityCard'

const INTENSITY_COLORS = {
  green:  '#4caf50',
  yellow: '#fbc02d',
  red:    '#e53935',
}

const WEEKDAY_LABELS = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']

export default function DayColumn({ day, activities, constitution, onAddActivity, onEditActivity, onEditDay, readOnly, dragWarning }) {
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

  const dotColor = INTENSITY_COLORS[day.intensity_derived] || '#bbb'
  const weekday = day.date ? WEEKDAY_LABELS[new Date(day.date).getDay()] : ''
  const shortDate = day.date ? day.date.slice(5) : '—' // MM-DD

  const handleHeaderClick = () => {
    if (!readOnly && onEditDay) onEditDay(day.id)
  }

  return (
    <Paper withBorder style={{ minWidth: 170, display: 'flex', flexDirection: 'column' }}>
      <div
        data-testid="day-header"
        onClick={handleHeaderClick}
        style={{
          padding: 8,
          background: 'var(--mantine-color-gray-1)',
          cursor: readOnly ? 'default' : 'pointer'
        }}
      >
        <Group gap={6} wrap="nowrap">
          <span
            data-testid="intensity-dot"
            style={{
              width: 10,
              height: 10,
              borderRadius: '50%',
              background: dotColor,
              flexShrink: 0
            }}
          />
          <Text fw={600} size="sm">D{day.day_index}</Text>
          <Text size="xs" c="dimmed">
            {shortDate}{weekday && ` ${weekday}`}
          </Text>
        </Group>
        {day.theme && (
          <Text size="xs" c="dimmed" mt={2} lineClamp={2}>
            {day.theme}
          </Text>
        )}
      </div>

      {dragWarning && (
        <div style={{
          padding: '4px 8px',
          background: '#fef0f0',
          border: '1px solid #c33',
          color: '#c33',
          fontSize: 11
        }}>
          ⚠ 加入后驾驶 {Math.round(dragWarning.total)}/{dragWarning.limit} min
        </div>
      )}
      {!readOnly && onAddActivity && (
        <div style={{ padding: '4px 8px' }}>
          <Button size="compact-xs" variant="light" fullWidth onClick={() => onAddActivity(day.id)}>
            + 加一个
          </Button>
        </div>
      )}
      <Stack gap={4} p="xs" ref={setNodeRef} style={{
        flex: 1, minHeight: 140,
        background: isOver ? '#f0f7ff' : undefined,
        border: dragWarning ? '1px solid var(--mantine-color-red-6)' : undefined
      }}>
        {activities.map(a => (
          <ActivityCard key={a.id} activity={a} onClick={onEditActivity} readOnly={readOnly} />
        ))}
        {activities.length === 0 && <Text size="xs" c="dimmed" ta="center" mt="md">空</Text>}
      </Stack>
      <div style={{ borderTop: '1px dashed #ccc', padding: '4px 8px', fontSize: 10, color: '#666' }}>
        驾驶 {progressBar(driveH, maxH)} {driveH}/{maxH}h<br />
        核心 {progressBar(tierOneCount, maxTier1, 3)} {tierOneCount}/{maxTier1}
        {day.buffer_day && <> · 机动</>}
      </div>
    </Paper>
  )
}

function progressBar(value, max, width = 5) {
  const filled = Math.min(Math.round((value / max) * width), width)
  return '█'.repeat(filled) + '░'.repeat(width - filled)
}
