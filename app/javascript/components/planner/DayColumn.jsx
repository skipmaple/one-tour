import { useMemo, useCallback, useState } from 'react'
import { DAY_COLOR } from '../../lib/dayColors'
import { Alert, Paper, Text, Stack, Group, Button } from '@mantine/core'
import { useDroppable } from '@dnd-kit/core'
import { IconAlertTriangleFilled, IconFilterFilled } from '@tabler/icons-react'
import ActivityCard from './ActivityCard'
import RoadConnector from './RoadConnector'
import DayMetricBar from '../DayMetricBar'
import RouteLegEditModal from './RouteLegEditModal'

const INTENSITY_COLORS = {
  green:  '#4caf50',
  yellow: '#fbc02d',
  red:    '#e53935',
}

const WEEKDAY_LABELS = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']

export default function DayColumn({
  day,
  activities,
  constitution,
  onAddActivity,
  onEditActivity,
  onEditDay,
  readOnly,
  dragWarning,
  routeLegs = [],
  hoveredActivityIds = null,
  onHoverActivity,
  onHoverConnector,
  onClearHover,
  author,
  members,
  filterActive = false,
}) {
  const maxH = Math.round((constitution?.max_daily_driving_minutes || 420) / 60)
  const maxTier1 = constitution?.max_tier_one_per_day || 3

  const [editingLeg, setEditingLeg] = useState(null)
  const handleLegClick = useCallback((leg) => {
    const from = activities.find(a => a.id === leg.from_activity_id)
    const to   = activities.find(a => a.id === leg.to_activity_id)
    setEditingLeg({ ...leg, from_activity_name: from?.name, to_activity_name: to?.name })
  }, [activities])

  // driveMin 来自后端 Day#driving_minutes_total (hybrid sum: route_legs effective
  // duration + 景观公路 drive_min)。fallback 到老逻辑（纯 activity.drive_min）以防
  // 老数据 / route_legs 还没加载。
  const driveMin = day.driving_minutes_total ?? activities
    .filter(a => a.kind === 'road')
    .reduce((sum, a) => sum + (parseInt(a.details?.drive_min || 0, 10) || 0), 0)
  const driveH = Math.round(driveMin / 60 * 10) / 10
  const tierOneCount = activities.filter(a => a.citizen_level === 'tier_one').length

  const dayColorName = DAY_COLOR(day.day_index)
  const isHighlightedById = useCallback(
    (id) => hoveredActivityIds != null && hoveredActivityIds.includes(id),
    [hoveredActivityIds]
  )
  // Connector bar lights up only when hoveredActivityIds represents a
  // connector hover (array of exactly 2 endpoint ids) and those two endpoints
  // match this connector's pair. Single-id hovers (from cards or map markers)
  // highlight only the matching card, not the connectors adjacent to it.
  const isPairHovered = useCallback(
    (fromId, toId) =>
      hoveredActivityIds != null &&
      hoveredActivityIds.length === 2 &&
      fromId != null && toId != null &&
      hoveredActivityIds.includes(fromId) &&
      hoveredActivityIds.includes(toId),
    [hoveredActivityIds]
  )

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
      if (leg.mode !== 'driving' && leg.mode !== 0 && leg.mode !== 'drive') continue
      const from = leg.from_activity_id
      const to = leg.to_activity_id
      if (from == null || to == null) continue
      out[from] = out[from] || {}
      out[from][to] = leg
    }
    return out
  }, [routeLegs])

  // Precompute the next non-connector activity for each index in O(n) via a
  // backward pass. Lets the main loop use O(1) lookup instead of repeatedly
  // calling activities.indexOf(a) + .find(...), which was O(n²) overall.
  const isConnectorActivity = (x) => x.kind === 'road' && x.citizen_level !== 'tier_one'
  const nextNonConnectorByIndex = new Array(activities.length)
  {
    let nextNonConnector = null
    for (let i = activities.length - 1; i >= 0; i--) {
      nextNonConnectorByIndex[i] = nextNonConnector
      if (!isConnectorActivity(activities[i])) nextNonConnector = activities[i]
    }
  }

  // Walk activities in order, emitting an ActivityCard or a RoadConnector
  // per activity, and inserting a synthesized RoadConnector between
  // adjacent ActivityCards when a matching route_leg exists.
  const renderedItems = []
  let prevCardActivity = null // last ActivityCard activity, for synthesis lookup
  // Track the last emitted item's type explicitly — don't rely on React key
  // string conventions (keys are for reconciliation, not control flow).
  let lastEmittedWasConnector = false
  for (let i = 0; i < activities.length; i++) {
    const a = activities[i]
    const isRoadConnectorActivity = isConnectorActivity(a)

    if (isRoadConnectorActivity) {
      const next = nextNonConnectorByIndex[i]
      const fallback = (prevCardActivity && next) ? routeLegByPair[prevCardActivity.id]?.[next.id] : undefined
      renderedItems.push(
        <RoadConnector
          key={`conn-${a.id}`}
          activity={a}
          legFallback={fallback}
          onClick={onEditActivity}
          readOnly={readOnly}
          isHighlighted={isPairHovered(prevCardActivity?.id ?? null, next?.id ?? null)}
          onHoverConnector={onHoverConnector}
          onClearHover={onClearHover}
          fromActivityId={prevCardActivity?.id ?? null}
          toActivityId={next?.id ?? null}
          dayColorName={dayColorName}
        />
      )
      lastEmittedWasConnector = true
      // A connector activity does not become prevCardActivity; the card before it stays
      continue
    }

    // This activity will render as an ActivityCard (scenic/food/stay/fuel/other,
    // or road+tier_one).
    // Before emitting, check if we should synthesize a connector between
    // prevCardActivity and this one (only when there was no connector-activity between them).
    if (prevCardActivity && !lastEmittedWasConnector) {
      const leg = routeLegByPair[prevCardActivity.id]?.[a.id]
      if (leg) {
        renderedItems.push(
          <RoadConnector
            key={`synth-${prevCardActivity.id}-${a.id}`}
            synthesized
            leg={leg}
            isHighlighted={isPairHovered(prevCardActivity.id, a.id)}
            fromActivityId={prevCardActivity.id}
            toActivityId={a.id}
            onHoverConnector={onHoverConnector}
            onClearHover={onClearHover}
            dayColorName={dayColorName}
            onClick={handleLegClick}
          />
        )
        lastEmittedWasConnector = true
      }
    }

    renderedItems.push(
      <ActivityCard
        key={a.id}
        activity={a}
        onClick={onEditActivity}
        readOnly={readOnly}
        isHighlighted={isHighlightedById(a.id)}
        onHoverActivity={onHoverActivity}
        onClearHover={onClearHover}
        dayColorName={dayColorName}
        author={author}
        members={members}
        draggable={!filterActive}
      />
    )
    prevCardActivity = a
    lastEmittedWasConnector = false
  }

  return (
    <>
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
        {filterActive && (
          <Alert
            color="blue"
            variant="light"
            icon={<IconFilterFilled size={14} />}
            mb="xs"
            p="xs"
            styles={{ message: { fontSize: 11 } }}
          >
            筛选中，清除后恢复拖拽
          </Alert>
        )}
        {renderedItems}
        {activities.length === 0 && filterActive && (
          <Text size="xs" c="dimmed" ta="center" py="sm">该天无匹配</Text>
        )}
        {activities.length === 0 && !filterActive && (
          <Text size="xs" c="dimmed" ta="center" mt="md">空</Text>
        )}
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
    <RouteLegEditModal opened={!!editingLeg} leg={editingLeg} onClose={() => setEditingLeg(null)} />
    </>
  )
}

