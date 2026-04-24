import { IconCar, IconPencil } from '@tabler/icons-react'
import { Tooltip } from '@mantine/core'
import '../../styles/activity-card.css'

// km is already converted to whole-number km (route_leg.distance_m / 1000).
function formatDistance(km) {
  if (!km && km !== 0) return ''
  if (km <= 0) return ''
  return `${km} 公里`
}

// min is already converted to whole-number minutes (route_leg.duration_s / 60).
function formatDurationCN(min) {
  if (!min && min !== 0) return ''
  if (min <= 0) return ''
  if (min >= 60 && min % 30 === 0) {
    const h = min / 60
    return `${h} 小时`
  }
  return `${min} 分钟`
}

function ConnectorText({ km, min }) {
  const distText = formatDistance(km)
  const durText = formatDurationCN(min)
  const parts = [distText, durText].filter(Boolean)
  if (parts.length === 0) return null
  return <span>{parts.join(' · ')}</span>
}

// Synthesized variant — from a route_leg only. Clickable when onClick is
// provided (i.e., user is not in readOnly mode); otherwise renders as a
// passive line. Backend authorize_editor would 403 unauthorized PATCH/DELETE
// anyway, but disabling the click prevents readOnly viewers from seeing
// a Modal that they can never successfully save.
function SynthesizedConnector({
  leg,
  isHighlighted = false,
  onHoverConnector,
  onClearHover,
  fromActivityId,
  toActivityId,
  dayColorName = 'none',
  onClick,
}) {
  const km = leg.distance_m_override != null
    ? Math.round(leg.distance_m_override / 1000)
    : (leg.distance_m != null ? Math.round(leg.distance_m / 1000) : undefined)
  const min = leg.duration_s_override != null
    ? Math.round(leg.duration_s_override / 60)
    : (leg.duration_s != null ? Math.round(leg.duration_s / 60) : undefined)
  const overridden = leg.overridden_at != null
  const amapKm = leg.distance_m != null ? Math.round(leg.distance_m / 1000) : null
  const amapMin = leg.duration_s != null ? Math.round(leg.duration_s / 60) : null
  const clickable = typeof onClick === 'function'
  const classes = [
    'rc-line',
    'rc-synthesized',
    isHighlighted ? 'rc-highlighted' : '',
    clickable ? '' : 'rc-readonly',
  ].filter(Boolean).join(' ')

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
      onClick={clickable ? (() => onClick(leg)) : undefined}
    >
      <IconCar size={12} stroke={2} aria-hidden="true" />
      <ConnectorText km={km} min={min} />
      {overridden && (
        <Tooltip
          label={`已调整 · 高德原: ${amapKm ?? '—'} km / ${amapMin ?? '—'} 分钟`}
          withArrow position="top" openDelay={300}
        >
          <IconPencil
            size={11} stroke={2}
            className="rc-overridden-mark"
            aria-label="此驾驶段已手动调整"
          />
        </Tooltip>
      )}
    </div>
  )
}

export default SynthesizedConnector
