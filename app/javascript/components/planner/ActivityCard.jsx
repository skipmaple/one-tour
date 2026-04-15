import { useDraggable } from '@dnd-kit/core'

export default function ActivityCard({ activity }) {
  const isRoadInfra = activity.kind === 'road' && activity.citizen_level === 'infrastructure'
  const isTierOne = activity.citizen_level === 'tier_one'

  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `activity-${activity.id}`
  })

  const style = {
    border: isTierOne ? '1px solid #c80' : (isRoadInfra ? '1px dashed #bbb' : '1px solid #bbb'),
    background: isTierOne ? '#fffaf0' : (isRoadInfra ? '#f5f5f5' : '#fafafa'),
    fontStyle: isRoadInfra ? 'italic' : 'normal',
    padding: '4px 6px',
    marginBottom: 4,
    fontSize: 12,
    cursor: 'grab',
    opacity: isDragging ? 0.4 : 1
  }

  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners}>
      <strong>{levelLabel(activity.citizen_level)} · {kindLabel(activity.kind)}</strong> {activity.name}
      {activity.planned_start_at && (
        <div style={{ fontSize: 10, color: '#888' }}>
          {activity.planned_start_at}
          {activity.planned_duration_min ? ` · ${activity.planned_duration_min} 分` : ''}
        </div>
      )}
    </div>
  )
}

function levelLabel(l) { return { tier_one: '一等', tier_two: '二等', tier_three: '三等', infrastructure: '基础' }[l] || l }
function kindLabel(k) { return { scenic: '景', road: '路', food: '食', stay: '住', fuel: '油', other: '其他' }[k] || k }
