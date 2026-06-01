import { useDraggable, useDroppable } from '@dnd-kit/core'
import {
  IconCategory,
  IconHourglass,
  IconMapPin,
  IconClock,
} from '@tabler/icons-react'
import { Avatar, Tooltip } from '@mantine/core'
import { isFullRoster } from '../../lib/effectiveParticipants'
import { KIND_ICONS } from '../activity-editor/detailsSchema'
import useLongPress from '../../hooks/useLongPress'
import '../../styles/activity-card.css'

const KIND_CLASS = {
  scenic: 'ac-kind-scenic',
  food: 'ac-kind-food',
  road: 'ac-kind-road',
  stay: 'ac-kind-stay',
  fuel: 'ac-kind-fuel',
  other: 'ac-kind-other',
}

const SIGNAL_OPACITIES = {
  tier_one: [1, 1, 1, 1],
  tier_two: [1, 1, 1, 0.22],
  tier_three: [1, 1, 0.22, 0.22],
  infrastructure: [1, 0.22, 0.22, 0.22],
}

// planned_duration_min → short string.
//   60  → '1h'      (≥60 and divisible by 30)
//   90  → '1.5h'
//   150 → '2.5h'
//   45  → '45分'
//   null/undef/0 → ''
function formatDuration(min) {
  if (!min) return ''
  if (min >= 60 && min % 30 === 0) return `${min / 60}h`
  return `${min}分`
}

// activity.address often stores a long multi-segment string. Take the last
// whitespace/punctuation-delimited chunk and cap at 6 chars so the meta cell
// stays one line.
function formatAddress(addr) {
  if (!addr) return ''
  const segments = String(addr).split(/[\s、，,]+/).filter(Boolean)
  const last = segments[segments.length - 1] || ''
  return last.length > 6 ? last.slice(-6) : last
}

function KindIcon({ kind }) {
  const Icon = KIND_ICONS[kind] || IconCategory
  return (
    <span className="ac-kind-icon">
      <Icon size={13} stroke={2.2} />
    </span>
  )
}

// iPhone-signal-style 4-bar indicator for citizen_level. Bars are bottom-aligned
// ascending (heights 3,5,7,9) in a 14×10 viewBox. Bright bars at opacity 1,
// dim bars at 0.22. Lower tiers dim more bars.
function CitizenSignal({ level }) {
  const ops = SIGNAL_OPACITIES[level] || SIGNAL_OPACITIES.infrastructure
  return (
    <span className="ac-ci" data-testid="citizen-signal" data-level={level}>
      <svg viewBox="0 0 14 10" aria-hidden="true">
        {[0, 1, 2, 3].map((i) => {
          const h = 3 + i * 2
          return (
            <rect
              key={i}
              x={i * 3.5}
              y={10 - h}
              width="2.2"
              height={h}
              rx="0.4"
              fill="currentColor"
              opacity={ops[i]}
            />
          )
        })}
      </svg>
    </span>
  )
}

function MetaGrid({ activity }) {
  const duration = formatDuration(activity.planned_duration_min)
  const address = formatAddress(activity.address)
  const time = activity.planned_start_at || ''
  const cellClass = (v) => `ac-meta-cell${v ? '' : ' ac-meta-cell--empty'}`
  return (
    <div className="ac-meta">
      <div className="ac-meta-cell">
        <CitizenSignal level={activity.citizen_level} />
      </div>
      <div className={cellClass(duration)}>
        <IconHourglass size={9} stroke={2} aria-hidden="true" />
        <span>{duration || '-'}</span>
      </div>
      <div className={cellClass(address)}>
        <IconMapPin size={9} stroke={2} aria-hidden="true" />
        <span>{address || '-'}</span>
      </div>
      <div className={cellClass(time)}>
        <IconClock size={9} stroke={2} aria-hidden="true" />
        <span>{time || '-'}</span>
      </div>
    </div>
  )
}

function cardClasses(activity, extra = '') {
  const kindClass = KIND_CLASS[activity.kind] || KIND_CLASS.other
  const tierClass = activity.citizen_level === 'tier_one' ? 'ac-tier1' : ''
  const thumbClass = activity._coverUrl ? 'ac-has-thumb' : ''
  return `ac-card ${kindClass} ${tierClass} ${thumbClass} ${extra}`
    .trim()
    .replace(/\s+/g, ' ')
}

// 合并两组事件 handler：同名 key 时先调 a 再调 b（dnd-kit 的 onPointerDown 先
// 注册拖拽意图，再启动长按计时器；二者互不吞事件）。
function mergeListeners(a, b) {
  const out = { ...a }
  for (const key of Object.keys(b)) {
    const fa = a[key]
    const fb = b[key]
    out[key] = fa ? (e) => { fa(e); fb(e) } : fb
  }
  return out
}

function ThumbAndBadge({ activity }) {
  return (
    <>
      {activity._coverUrl && (
        <div
          className="ac-thumb-gradient"
          data-testid="thumb-gradient"
          style={{ backgroundImage: `url(${activity._coverUrl})` }}
        />
      )}
      {activity.citizen_level === 'tier_one' && (
        <span className="ac-tier-badge" data-testid="tier-badge" aria-label="一等公民">
          ★
        </span>
      )}
    </>
  )
}

export default function ActivityCard({
  activity,
  onClick,
  readOnly,
  isHighlighted = false,
  onHoverActivity,
  onClearHover,
  dayColorName = 'none',
  author,
  members,
  draggable = true,
  onCardContextMenu,
}) {
  const { attributes, listeners, setNodeRef: setDragRef, isDragging } =
    useDraggable({ id: `activity-${activity.id}`, disabled: !draggable })
  const { setNodeRef: setDropRef, isOver } = useDroppable({
    id: `activity-drop-${activity.id}`,
    data: { dayId: activity.day_id, position: activity.position },
  })
  const setRef = (el) => {
    setDragRef(el)
    setDropRef(el)
  }
  const dragAttributes = readOnly ? {} : attributes
  const dragListeners = readOnly ? {} : listeners

  const longPress = useLongPress((x, y) => {
    if (onCardContextMenu) onCardContextMenu(activity, x, y)
  })

  const handleContextMenu = (e) => {
    if (!onCardContextMenu) return
    e.preventDefault()
    onCardContextMenu(activity, e.clientX, e.clientY)
  }

  const pointerMenuListeners = onCardContextMenu
    ? {
        onPointerDown: longPress.onPointerDown,
        onPointerMove: longPress.onPointerMove,
        onPointerUp: longPress.onPointerUp,
        onPointerLeave: longPress.onPointerLeave,
        onPointerCancel: longPress.onPointerCancel,
      }
    : {}

  const finalListeners = mergeListeners(draggable ? dragListeners : {}, pointerMenuListeners)

  const handleBodyClick = () => {
    if (longPress.firedRef.current) {
      longPress.firedRef.current = false
      return
    }
    if (onClick) onClick(activity.id)
  }

  const handleKeyDown = (e) => {
    if (onClick && (e.key === 'Enter' || e.key === ' ')) {
      e.preventDefault()
      // 键盘激活是显式意图：清掉可能残留的长按标记，避免它卡住后吞掉后续 click
      longPress.firedRef.current = false
      onClick(activity.id)
    }
  }

  const extra = [
    isDragging ? 'ac-dragging' : '',
    readOnly && onClick ? 'ac-readonly' : '',
    isHighlighted ? 'ac-highlighted' : '',
  ].filter(Boolean).join(' ')

  const handleMouseEnter = () => {
    if (onHoverActivity) onHoverActivity(activity.id)
  }
  const handleMouseLeave = () => {
    if (onClearHover) onClearHover()
  }

  return (
    <div
      ref={setRef}
      className={cardClasses(activity, extra)}
      data-day-color={dayColorName}
      data-draggable={draggable ? 'true' : 'false'}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onClick={onClick ? handleBodyClick : undefined}
      onKeyDown={onClick ? handleKeyDown : undefined}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      aria-label={onClick ? activity.name : undefined}
      {...(draggable ? dragAttributes : {})}
      {...finalListeners}
      onContextMenu={handleContextMenu}
    >
      {isOver && <div data-testid="drop-indicator" className="ac-drop-indicator" />}
      <ThumbAndBadge activity={activity} />
      <div className="ac-body">
        <div className="ac-name-row">
          <KindIcon kind={activity.kind} />
          <span className="ac-name">{activity.name}</span>
        </div>
        <MetaGrid activity={activity} />
      </div>
      <ParticipantAvatarGroup activity={activity} author={author} members={members} />
    </div>
  )
}

export function ActivityCardOverlay({ activity, author, members }) {
  return (
    <div className={cardClasses(activity, 'ac-overlay')}>
      <ThumbAndBadge activity={activity} />
      <div className="ac-body">
        <div className="ac-name-row">
          <KindIcon kind={activity.kind} />
          <span className="ac-name">{activity.name}</span>
        </div>
        <MetaGrid activity={activity} />
      </div>
      <ParticipantAvatarGroup activity={activity} author={author} members={members} />
    </div>
  )
}

// Shared across ActivityCard + ActivityCardOverlay. Null-safe: when `author`
// or `members` is missing (e.g. older call sites, tests), renders nothing
// rather than crashing. When `participant_user_ids` is empty (= 默认全员 per
// the feature's single-source semantics, see effectiveParticipants.js),
// also renders nothing — cards stay visually calm in the default case.
function ParticipantAvatarGroup({ activity, author, members }) {
  if (!author || !Array.isArray(members)) return null
  if (isFullRoster(activity)) return null

  const roster = [
    { user_id: author.user_id, name: author.name, avatar_url: author.avatar_url },
    ...members.map((m) => ({ user_id: m.user_id, name: m.name, avatar_url: m.avatar_url })),
  ]
  const users = activity.participant_user_ids
    .map((id) => roster.find((u) => u.user_id === id))
    .filter(Boolean)
  if (users.length === 0) return null

  return (
    <Avatar.Group className="ac-participants" spacing="xs" data-testid="activity-participants">
      {users.slice(0, 3).map((u) => (
        <Tooltip key={u.user_id} label={u.name}>
          <Avatar src={u.avatar_url} size={16} radius="xl">{(u.name || '?').slice(0, 1)}</Avatar>
        </Tooltip>
      ))}
      {users.length > 3 && (
        <Avatar size={16} radius="xl">+{users.length - 3}</Avatar>
      )}
    </Avatar.Group>
  )
}
