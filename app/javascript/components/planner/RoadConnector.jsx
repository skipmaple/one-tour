import { useDraggable, useDroppable } from '@dnd-kit/core'
import { IconCar } from '@tabler/icons-react'
import '../../styles/activity-card.css'

// km is already in km (user-filled on activity.details), while route_leg.distance_m
// is in meters. Both paths converge here.
function formatDistance(km) {
  if (!km && km !== 0) return ''
  if (km <= 0) return ''
  return `${km} 公里`
}

// min is already in minutes (user-filled on activity.details), while route_leg.duration_s
// is in seconds. Both paths converge here.
function formatDurationCN(min) {
  if (!min && min !== 0) return ''
  if (min <= 0) return ''
  if (min >= 60 && min % 30 === 0) {
    const h = min / 60
    return `${h} 小时`
  }
  return `${min} 分钟`
}

function extractKmMin({ activity, leg }) {
  // Priority: activity.details > leg (converted from m/s to km/min). Either
  // field may be missing; missing → empty string.
  const detailsKm = activity?.details?.km
  const detailsMin = activity?.details?.drive_min
  const fromLegKm = leg?.distance_m != null ? Math.round(leg.distance_m / 1000) : undefined
  const fromLegMin = leg?.duration_s != null ? Math.round(leg.duration_s / 60) : undefined
  const km = (detailsKm != null && detailsKm !== '') ? detailsKm : fromLegKm
  const min = (detailsMin != null && detailsMin !== '') ? detailsMin : fromLegMin
  return { km, min }
}

function ConnectorText({ km, min }) {
  const distText = formatDistance(km)
  const durText = formatDurationCN(min)
  const parts = [distText, durText].filter(Boolean)
  if (parts.length === 0) return null
  return <span>{parts.join(' · ')}</span>
}

// Synthesized variant — read-only, from a route_leg only.
function SynthesizedConnector({
  leg,
  isHighlighted = false,
  onHoverConnector,
  onClearHover,
  fromActivityId,
  toActivityId,
  dayColorName = 'none',
}) {
  const { km, min } = extractKmMin({ activity: null, leg })
  const classes = [
    'rc-line',
    'rc-synthesized',
    isHighlighted ? 'rc-highlighted' : '',
  ].filter(Boolean).join(' ')

  // Synthesized has pointer-events: none in CSS, but onMouseEnter still needs
  // handlers in case that CSS rule is relaxed later. Safe no-op when hovered
  // is impossible.
  const handleMouseEnter = () => {
    if (onHoverConnector && fromActivityId != null && toActivityId != null) {
      onHoverConnector(fromActivityId, toActivityId)
    }
  }
  const handleMouseLeave = () => {
    if (onClearHover) onClearHover()
  }

  return (
    <div
      className={classes}
      data-day-color={dayColorName}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      <IconCar size={12} stroke={2} aria-hidden="true" />
      <ConnectorText km={km} min={min} />
    </div>
  )
}

// Activity-backed variant — interactive, draggable via dnd-kit.
function ActivityBackedConnector({
  activity,
  legFallback,
  onClick,
  readOnly,
  isHighlighted = false,
  onHoverConnector,
  onClearHover,
  fromActivityId,
  toActivityId,
  dayColorName = 'none',
}) {
  const { attributes, listeners, setNodeRef: setDragRef, isDragging } =
    useDraggable({ id: `activity-${activity.id}` })
  const { setNodeRef: setDropRef, isOver } = useDroppable({
    id: `activity-drop-${activity.id}`,
    data: { dayId: activity.day_id, position: activity.position },
  })
  const setRef = (el) => { setDragRef(el); setDropRef(el) }
  const dragAttributes = readOnly ? {} : attributes
  const dragListeners = readOnly ? {} : listeners

  const handleClick = () => {
    if (!readOnly && onClick) onClick(activity.id)
  }

  // Connector hover highlights BOTH endpoint markers. Skip the call if either
  // endpoint id is missing (day boundary, orphan connector) — connector's own
  // .rc-highlighted bar still lights up when parent sets isHighlighted.
  const handleMouseEnter = () => {
    if (onHoverConnector && fromActivityId != null && toActivityId != null) {
      onHoverConnector(fromActivityId, toActivityId)
    }
  }
  const handleMouseLeave = () => {
    if (onClearHover) onClearHover()
  }

  const { km, min } = extractKmMin({ activity, leg: legFallback })
  const classes = [
    'rc-line',
    isDragging ? 'rc-dragging' : '',
    isHighlighted ? 'rc-highlighted' : '',
  ].filter(Boolean).join(' ')

  return (
    <div
      ref={setRef}
      className={classes}
      data-day-color={dayColorName}
      onClick={handleClick}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      {...dragAttributes}
      {...dragListeners}
    >
      {isOver && <div className="rc-drop-indicator" data-testid="rc-drop-indicator" />}
      <IconCar size={12} stroke={2} aria-hidden="true" />
      <ConnectorText km={km} min={min} />
    </div>
  )
}

export default function RoadConnector(props) {
  // `synthesized` and `activity` are mutually exclusive; `synthesized` takes precedence.
  // A synthesized connector derives all data from `leg` — `activity` is ignored.
  if (props.synthesized) {
    return <SynthesizedConnector
      leg={props.leg}
      isHighlighted={props.isHighlighted}
      onHoverConnector={props.onHoverConnector}
      onClearHover={props.onClearHover}
      fromActivityId={props.fromActivityId}
      toActivityId={props.toActivityId}
      dayColorName={props.dayColorName}
    />
  }
  return <ActivityBackedConnector
    activity={props.activity}
    legFallback={props.legFallback}
    onClick={props.onClick}
    readOnly={props.readOnly}
    isHighlighted={props.isHighlighted}
    onHoverConnector={props.onHoverConnector}
    onClearHover={props.onClearHover}
    fromActivityId={props.fromActivityId}
    toActivityId={props.toActivityId}
    dayColorName={props.dayColorName}
  />
}
