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
    background: isOver ? '#dbeafe' : (isTierOne ? '#fffaf0' : (isRoadInfra ? '#f5f5f5' : '#fafafa')),
    fontStyle: isRoadInfra ? 'italic' : 'normal',
    marginBottom: 4,
    fontSize: 12,
    opacity: isDragging ? 0.4 : 1
  }

  return (
    <div ref={setRef} style={style} {...attributes}>
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
