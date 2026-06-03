import { useDraggable, useDroppable } from '@dnd-kit/core'
import {
  IconCategory,
  IconMapPin,
  IconClock,
  IconStarFilled,
} from '@tabler/icons-react'
import { Avatar, Tooltip } from '@mantine/core'
import { isFullRoster } from '../../lib/effectiveParticipants'
import { KIND_ICONS } from '../activity-editor/detailsSchema'
import { formatDuration, pickMeta } from './activityCardMeta'
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

// chip.icon key → Tabler component (locator pin, rating star).
const CHIP_ICONS = { pin: IconMapPin, star: IconStarFilled }

function KindIcon({ kind }) {
  const Icon = KIND_ICONS[kind] || IconCategory
  return (
    <span className="ac-kind-icon">
      <Icon size={16} stroke={1.75} />
    </span>
  )
}

// "14:30到 · 停留2h" — labeled so clock-time and duration never read as two
// bare confusable numbers. Either half may be absent; both absent → ''.
function timeLine(activity) {
  const time = activity.planned_start_at || ''
  const dur = formatDuration(activity.planned_duration_min)
  return [ time && `${time}到`, dur && `停留${dur}` ].filter(Boolean).join(' · ')
}

// Shared inner content for ActivityCard + ActivityCardOverlay. Pure text:
// identity / time / meta rows. Photos live in the detail drawer, not on the
// card face — keeps the column's right edge uniform (no ragged thumbnails).
function CardInner({ activity, author, members, isOver = false }) {
  const text = timeLine(activity)
  const meta = pickMeta(activity)
  return (
    <>
      {isOver && <div data-testid="drop-indicator" className="ac-drop-indicator" />}
      <div className="ac-body">
        <div className="ac-name-row">
          <KindIcon kind={activity.kind} />
          <span className="ac-name">{activity.name}</span>
          {activity.citizen_level === 'tier_one' && (
            <span className="ac-star" data-testid="tier-star" aria-label="必去">
              <IconStarFilled size={14} />
            </span>
          )}
        </div>
        {text && (
          <div className="ac-time">
            <IconClock size={13} stroke={1.75} aria-hidden="true" />
            <span>{text}</span>
          </div>
        )}
        {(meta.alerts.length > 0 || meta.notes.length > 0) && (
          <div className="ac-meta-extra">
            {meta.alerts.map((a, i) => (
              <span key={`a${i}`} className={`ac-alert ac-alert-${a.tone}`}>{a.text}</span>
            ))}
            {meta.notes.length > 0 && (
              <span className="ac-notes">
                {meta.notes.map((n, i) => {
                  const NoteIcon = n.icon ? CHIP_ICONS[n.icon] : null
                  return (
                    <span key={`n${i}`} className="ac-note">
                      {i > 0 && <span className="ac-note-sep" aria-hidden="true">·</span>}
                      {NoteIcon && <NoteIcon size={11} stroke={1.75} aria-hidden="true" />}
                      {n.text}
                    </span>
                  )
                })}
              </span>
            )}
          </div>
        )}
      </div>
      <ParticipantAvatarGroup activity={activity} author={author} members={members} />
    </>
  )
}

function statusClass(status) {
  if (status === 'closed') return 'ac-status-closed'
  if (status === 'pending') return 'ac-status-pending'
  return ''
}

function cardClasses(activity, extra = '') {
  const kindClass = KIND_CLASS[activity.kind] || KIND_CLASS.other
  const tierClass = activity.citizen_level === 'tier_one' ? 'ac-tier1' : ''
  return `ac-card ${kindClass} ${tierClass} ${statusClass(activity.status)} ${extra}`
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
  compact = false,
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
    compact ? 'ac-compact' : '',
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
      data-status={activity.status || 'confirmed'}
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
      <CardInner activity={activity} author={author} members={members} isOver={isOver} />
    </div>
  )
}

export function ActivityCardOverlay({ activity, author, members }) {
  return (
    <div className={cardClasses(activity, 'ac-overlay')} data-status={activity.status || 'confirmed'}>
      <CardInner activity={activity} author={author} members={members} />
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
