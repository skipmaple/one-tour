import { useDraggable, useDroppable } from '@dnd-kit/core'

export default function ActivityCard({ activity, onClick, readOnly }) {
  const isRoadInfra = activity.kind === 'road' && activity.citizen_level === 'infrastructure'
  const isTierOne = activity.citizen_level === 'tier_one'

  const { attributes, listeners, setNodeRef: setDragRef, setActivatorNodeRef, isDragging } = useDraggable({
    id: `activity-${activity.id}`
  })
  const { setNodeRef: setDropRef, isOver } = useDroppable({
    id: `activity-drop-${activity.id}`,
    data: { dayId: activity.day_id, position: activity.position }
  })

  const setRef = (el) => { setDragRef(el); setDropRef(el) }

  const handleClick = () => {
    if (!readOnly && onClick) onClick(activity.id)
  }

  const style = {
    display: 'flex',
    alignItems: 'stretch',
    border: isTierOne ? '1px solid #c80' : (isRoadInfra ? '1px dashed #bbb' : '1px solid #bbb'),
    background: isTierOne ? '#fffaf0' : (isRoadInfra ? '#f5f5f5' : '#fafafa'),
    fontStyle: isRoadInfra ? 'italic' : 'normal',
    marginBottom: 4,
    fontSize: 12,
    opacity: isDragging ? 0.4 : 1,
    position: 'relative'
  }

  // When readOnly, suppress the drag affordances entirely:
  //   - skip the {...attributes} spread (drops `aria-roledescription="draggable"` and tabindex)
  //   - don't render the grab handle, so listeners are never attached to the DOM
  // Server-side ActivityPositionsController gates the actual mutation, but
  // showing a grab handle that always fails is bad UX.
  const dragAttributes = readOnly ? {} : attributes

  return (
    <div ref={setRef} style={style} {...dragAttributes}>
      {isOver && (
        <div
          data-testid="drop-indicator"
          style={{
            position: 'absolute',
            top: -3,
            left: 0,
            right: 0,
            height: 3,
            background: '#1677ff',
            borderRadius: 2,
            boxShadow: '0 0 6px rgba(22, 119, 255, 0.4)',
            pointerEvents: 'none',
            zIndex: 1
          }}
        />
      )}
      {!readOnly && (
        <div
          ref={setActivatorNodeRef}
          {...listeners}
          data-testid="grab-handle"
          style={{
            display: 'flex',
            alignItems: 'center',
            padding: '4px 2px',
            cursor: 'grab',
            color: '#999',
            fontSize: 10,
            userSelect: 'none'
          }}
        >
          ⋮⋮
        </div>
      )}
      <div
        onClick={handleClick}
        style={{ flex: 1, padding: '4px 6px', cursor: readOnly ? 'default' : 'pointer' }}
      >
        <strong>{levelLabel(activity.citizen_level)} · {kindLabel(activity.kind)}</strong> {activity.name}
        {activity.planned_start_at && (
          <div style={{ fontSize: 10, color: '#888' }}>
            {activity.planned_start_at}
            {activity.planned_duration_min ? ` · ${activity.planned_duration_min} 分` : ''}
          </div>
        )}
      </div>
    </div>
  )
}

function levelLabel(l) { return { tier_one: '一等', tier_two: '二等', tier_three: '三等', infrastructure: '基础' }[l] || l }
function kindLabel(k) { return { scenic: '景', road: '路', food: '食', stay: '住', fuel: '油', other: '其他' }[k] || k }

// Ghost card rendered by DndContext's <DragOverlay> while dragging.
// No dnd-kit hooks (not interactive), no click handlers.
export function ActivityCardOverlay({ activity }) {
  const isRoadInfra = activity.kind === 'road' && activity.citizen_level === 'infrastructure'
  const isTierOne = activity.citizen_level === 'tier_one'

  const style = {
    display: 'flex',
    alignItems: 'stretch',
    border: isTierOne ? '1px solid #c80' : (isRoadInfra ? '1px dashed #bbb' : '1px solid #bbb'),
    background: isTierOne ? '#fffaf0' : (isRoadInfra ? '#f5f5f5' : '#fafafa'),
    fontStyle: isRoadInfra ? 'italic' : 'normal',
    fontSize: 12,
    boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
    transform: 'rotate(2deg)',
    cursor: 'grabbing'
  }

  return (
    <div style={style}>
      <div style={{ padding: '4px 2px', color: '#999', fontSize: 10, userSelect: 'none' }}>⋮⋮</div>
      <div style={{ flex: 1, padding: '4px 6px' }}>
        <strong>{levelLabel(activity.citizen_level)} · {kindLabel(activity.kind)}</strong> {activity.name}
        {activity.planned_start_at && (
          <div style={{ fontSize: 10, color: '#888' }}>
            {activity.planned_start_at}
            {activity.planned_duration_min ? ` · ${activity.planned_duration_min} 分` : ''}
          </div>
        )}
      </div>
    </div>
  )
}
