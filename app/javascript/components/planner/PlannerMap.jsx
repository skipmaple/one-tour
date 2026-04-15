import { Paper, Text } from '@mantine/core'

export default function PlannerMap({ activities }) {
  const withCoords = activities.filter(a => a.lat && a.lng)
  return (
    <Paper withBorder p="sm" style={{ height: 260, position: 'relative', background: '#fafafa' }}>
      <Text size="xs" c="dimmed" style={{ position: 'absolute', top: 4, left: 6 }}>
        地图占位 · {withCoords.length} 个 POI（接入 AMAP SDK 后替换）
      </Text>
      {withCoords.slice(0, 12).map(a => (
        <span
          key={a.id}
          style={{
            position: 'absolute',
            left: `${Math.min(90, Math.max(5, (a.lng - 75) * 10))}%`,
            top: `${Math.min(85, Math.max(10, (48 - a.lat) * 8))}%`,
            border: `1px ${a.day_id ? 'solid' : 'dashed'} ${a.day_id ? '#36c' : '#999'}`,
            background: '#fff',
            padding: '1px 5px',
            fontSize: 11
          }}
        >
          {a.name}{a.day_id ? ' D' : ''}
        </span>
      ))}
    </Paper>
  )
}
