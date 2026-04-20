import { useMemo } from 'react'
import { Paper, Text, Stack, Group, Button } from '@mantine/core'
import { useDroppable } from '@dnd-kit/core'
import { IconAlertTriangleFilled } from '@tabler/icons-react'
import ActivityCard from './ActivityCard'
import RoadConnector from './RoadConnector'
import DayMetricBar from '../DayMetricBar'

const INTENSITY_COLORS = {
  green:  '#4caf50',
  yellow: '#fbc02d',
  red:    '#e53935',
}

const WEEKDAY_LABELS = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']

export default function DayColumn({ day, activities, constitution, onAddActivity, onEditActivity, onEditDay, readOnly, dragWarning, routeLegs = [] }) {
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

  // Build a pair-indexed lookup of drive-mode route_legs for synthesis
  // between adjacent ActivityCards: routeLegByPair[fromId][toId] = leg
  const routeLegByPair = useMemo(() => {
    const out = {}
    for (const leg of routeLegs) {
      if (leg.mode !== 0 && leg.mode !== 'drive') continue
      const from = leg.from_activity_id
      const to = leg.to_activity_id
      if (from == null || to == null) continue
      out[from] = out[from] || {}
      out[from][to] = leg
    }
    return out
  }, [routeLegs])

  // Walk activities in order, emitting an ActivityCard or a RoadConnector
  // per activity, and inserting a synthesized RoadConnector between
  // adjacent ActivityCards when a matching route_leg exists.
  const renderedItems = []
  let prevCardActivity = null // last ActivityCard activity, for synthesis lookup
  for (const a of activities) {
    const isRoadConnectorActivity = a.kind === 'road' && a.citizen_level !== 'tier_one'

    if (isRoadConnectorActivity) {
      // Find the NEXT non-road-connector activity after this one (for fallback)
      const currentIdx = activities.indexOf(a)
      const next = activities.find((x, idx) => idx > currentIdx && !(x.kind === 'road' && x.citizen_level !== 'tier_one'))
      const fallback = (prevCardActivity && next) ? routeLegByPair[prevCardActivity.id]?.[next.id] : undefined
      renderedItems.push(
        <RoadConnector
          key={`conn-${a.id}`}
          activity={a}
          legFallback={fallback}
          onClick={onEditActivity}
          readOnly={readOnly}
        />
      )
      // A connector activity does not become prevCardActivity; the card before it stays
      continue
    }

    // This activity will render as an ActivityCard (scenic/food/stay/fuel/other,
    // or road+tier_one).
    // Before emitting, check if we should synthesize a connector between
    // prevCardActivity and this one (only when there was no connector-activity between them).
    const lastPushed = renderedItems[renderedItems.length - 1]
    const lastKey = lastPushed && lastPushed.key ? String(lastPushed.key) : ''
    const lastWasConnector = lastKey.startsWith('conn-') || lastKey.startsWith('synth-')
    if (prevCardActivity && !lastWasConnector) {
      const leg = routeLegByPair[prevCardActivity.id]?.[a.id]
      if (leg) {
        renderedItems.push(
          <RoadConnector
            key={`synth-${prevCardActivity.id}-${a.id}`}
            synthesized
            leg={leg}
            fromActivityId={prevCardActivity.id}
            toActivityId={a.id}
          />
        )
      }
    }

    renderedItems.push(
      <ActivityCard key={a.id} activity={a} onClick={onEditActivity} readOnly={readOnly} />
    )
    prevCardActivity = a
  }

  return (
    <Paper withBorder style={{ flex: '0 0 200px', display: 'flex', flexDirection: 'column' }}>
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
          fontSize: 11,
          display: 'flex',
          alignItems: 'center',
          gap: 4,
        }}>
          <IconAlertTriangleFilled size={12} />
          加入后驾驶 {Math.round(dragWarning.total)}/{dragWarning.limit} min
        </div>
      )}
      <Stack gap={4} p="xs" ref={setNodeRef} style={{
        flex: 1, minHeight: 0, overflowY: 'auto',
        background: isOver ? '#f0f7ff' : undefined,
        border: dragWarning ? '1px solid var(--mantine-color-red-6)' : undefined
      }}>
        {renderedItems}
        {activities.length === 0 && <Text size="xs" c="dimmed" ta="center" mt="md">空</Text>}
      </Stack>
      {!readOnly && onAddActivity && (
        <div style={{ padding: '4px 8px' }}>
          <Button size="compact-xs" variant="light" fullWidth onClick={() => onAddActivity(day.id)}>
            + 加一个
          </Button>
        </div>
      )}
      <Stack gap={2} style={{ borderTop: '1px dashed #ccc', padding: '4px 8px' }}>
        <DayMetricBar label="驾驶" value={driveH} max={maxH} unit="h" />
        <DayMetricBar label="核心" value={tierOneCount} max={maxTier1} />
        {day.buffer_day && <Text size="xs" c="dimmed">机动</Text>}
      </Stack>
    </Paper>
  )
}

