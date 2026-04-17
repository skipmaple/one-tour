import { Paper, Text, Stack, Group, Badge } from '@mantine/core'
import { router } from '@inertiajs/react'
import DayMetricBar from '../DayMetricBar'

const INTENSITY_COLORS = {
  green:  '#4caf50',
  yellow: '#fbc02d',
  red:    '#e53935',
}

const WEEKDAY_LABELS = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']

export default function TimelineDayColumn({ day, activities, constitution, tourId, selected, onSelect, columnRef }) {
  const maxH = Math.round((constitution?.max_daily_driving_minutes || 420) / 60)
  const maxTier1 = constitution?.max_tier_one_per_day || 3

  const driveMin = activities
    .filter(a => a.kind === 'road')
    .reduce((sum, a) => sum + (parseInt(a.details?.drive_min || 0, 10) || 0), 0)
  const driveH = Math.round(driveMin / 60 * 10) / 10
  const tierOneCount = activities.filter(a => a.citizen_level === 'tier_one').length

  const dotColor = INTENSITY_COLORS[day.intensity_derived] || '#bbb'
  const weekday = day.date ? WEEKDAY_LABELS[new Date(day.date).getDay()] : ''
  const shortDate = day.date ? day.date.slice(5) : '—'

  const handleActivityClick = (activityId) => {
    router.visit(`/tours/${tourId}#activity-${activityId}`)
  }

  return (
    <Paper
      withBorder
      ref={columnRef}
      style={{
        minWidth: 180,
        display: 'flex',
        flexDirection: 'column',
        outline: selected ? '2px solid #1677ff' : 'none'
      }}
    >
      <div
        data-testid={`timeline-header-${day.day_index}`}
        onClick={() => onSelect?.(day.id)}
        style={{ padding: 8, background: 'var(--mantine-color-gray-1)', cursor: 'pointer' }}
      >
        <Group gap={6} wrap="nowrap">
          <span style={{ width: 10, height: 10, borderRadius: '50%', background: dotColor, flexShrink: 0 }} />
          <Text fw={600} size="sm">D{day.day_index}</Text>
          <Text size="xs" c="dimmed">{shortDate}{weekday && ` ${weekday}`}</Text>
          {day.buffer_day && <Badge size="xs" color="gray" variant="light">机动</Badge>}
        </Group>
        {day.theme && (
          <Text size="xs" c="dimmed" mt={2} lineClamp={2}>{day.theme}</Text>
        )}
      </div>

      <Stack gap={4} p="xs" style={{ flex: 1, minHeight: 120 }}>
        {activities.length === 0 && (
          <Text size="xs" c="dimmed" ta="center" mt="md">
            {day.buffer_day ? '未排入行，作为天气/疲劳缓冲' : '空'}
          </Text>
        )}
        {activities.map(a => (
          <TimelineActivityCard key={a.id} activity={a} onClick={() => handleActivityClick(a.id)} />
        ))}
      </Stack>

      <Stack gap={2} style={{ borderTop: '1px dashed #ccc', padding: '4px 8px' }}>
        <DayMetricBar label="驾驶" value={driveH} max={maxH} unit="h" />
        <DayMetricBar label="核心" value={tierOneCount} max={maxTier1} />
      </Stack>
    </Paper>
  )
}

function TimelineActivityCard({ activity, onClick }) {
  const isTierOne = activity.citizen_level === 'tier_one'
  const isRoadInfra = activity.kind === 'road' && activity.citizen_level === 'infrastructure'

  const style = {
    border: isTierOne ? '1px solid #c80' : '1px solid #ddd',
    background: isTierOne ? '#fffaf0' : (isRoadInfra ? '#f5f5f5' : '#fff'),
    fontStyle: isRoadInfra ? 'italic' : 'normal',
    padding: '4px 6px',
    fontSize: 11,
    cursor: 'pointer',
    lineHeight: 1.3
  }

  return (
    <div onClick={onClick} style={style}>
      {activity.planned_start_at && (
        <div style={{ color: '#888' }}>
          {activity.planned_start_at}
          {activity.planned_duration_min ? ` · ${activity.planned_duration_min} min` : ''}
        </div>
      )}
      <div>
        <strong>{levelLabel(activity.citizen_level)}·{kindLabel(activity.kind)}</strong> {activity.name}
      </div>
    </div>
  )
}

function levelLabel(l) { return { tier_one: '一等', tier_two: '二等', tier_three: '三等', infrastructure: '基础' }[l] || l }
function kindLabel(k) { return { scenic: '景', road: '路', food: '食', stay: '住', fuel: '油', other: '其他' }[k] || k }
