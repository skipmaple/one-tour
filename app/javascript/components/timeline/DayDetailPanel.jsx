import { Paper, Text, Title, Group } from '@mantine/core'

export default function DayDetailPanel({ day, activities, constitution }) {
  if (!day) return null

  const maxDriveMin = constitution?.max_daily_driving_minutes || 420
  const maxTier1 = constitution?.max_tier_one_per_day || 3

  const driveMin = activities
    .filter(a => a.kind === 'road')
    .reduce((sum, a) => sum + (parseInt(a.details?.drive_min || 0, 10) || 0), 0)
  const tierOneCount = activities.filter(a => a.citizen_level === 'tier_one').length

  const driveOk = driveMin <= maxDriveMin
  const tierOneOk = tierOneCount <= maxTier1

  // Build hourly grid: earliest start - 1h to latest start + 2h
  const starts = activities
    .map(a => parseHour(a.planned_start_at))
    .filter(h => h !== null)

  const rows = buildHourRows(starts)

  // Bucket activities by their start hour
  const byHour = {}
  for (const a of activities) {
    const h = parseHour(a.planned_start_at)
    if (h === null) continue
    if (!byHour[h]) byHour[h] = []
    byHour[h].push(a)
  }

  return (
    <Paper withBorder p="md" data-testid="day-detail-panel">
      <Title order={4} mb="xs">D{day.day_index} 详情</Title>

      {rows.length === 0 && (
        <Text size="sm" c="dimmed" mb="md">
          本日无时间安排的 activity。到 Planner 编辑 activity 设置"开始时间"即可显示时间轴。
        </Text>
      )}

      {rows.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: '60px 1fr', gap: 0, fontSize: 12, marginBottom: 16 }}>
          {rows.map(hour => (
            <HourRow
              key={hour}
              hour={hour}
              activities={byHour[hour] || []}
            />
          ))}
        </div>
      )}

      <div style={{ borderTop: '1px solid #eee', paddingTop: 8, fontSize: 13 }}>
        <Group gap="xl">
          <Text>驾驶 {driveMin}/{maxDriveMin} min {driveOk ? '✓' : '⛔'}</Text>
          <Text>一等 {tierOneCount}/{maxTier1} {tierOneOk ? '✓' : '⛔'}</Text>
        </Group>
      </div>
    </Paper>
  )
}

function HourRow({ hour, activities }) {
  return (
    <>
      <div style={{ color: '#888', borderTop: '1px dashed #eee', padding: '6px 4px' }}>
        {formatHour(hour)}
      </div>
      <div style={{ borderTop: '1px dashed #eee', padding: '6px 4px' }}>
        {activities.length === 0 && <div style={{ minHeight: 18 }} />}
        {activities.map(a => (
          <div
            key={a.id}
            data-testid={`detail-activity-${a.id}`}
            style={{
              padding: '2px 6px',
              background: a.citizen_level === 'tier_one' ? '#fffaf0' : '#fafafa',
              border: a.citizen_level === 'tier_one' ? '1px solid #c80' : '1px solid #ddd',
              marginBottom: 2,
              borderRadius: 2,
              fontSize: 11
            }}
          >
            <strong>{levelLabel(a.citizen_level)}·{kindLabel(a.kind)}</strong> {a.name}
            <span style={{ color: '#888', marginLeft: 4 }}>
              {a.planned_start_at}
              {a.planned_duration_min ? ` · ${a.planned_duration_min} min` : ''}
            </span>
          </div>
        ))}
      </div>
    </>
  )
}

// Parse "14:00" → 14 (hour as integer). Returns null for malformed.
function parseHour(str) {
  if (!str) return null
  const m = /^(\d{1,2}):/.exec(str)
  return m ? parseInt(m[1], 10) : null
}

function formatHour(h) {
  return `${String(h).padStart(2, '0')}:00`
}

// Given list of hours, build inclusive range from (min-1) to (max+2).
// Returns empty [] if no hours.
function buildHourRows(hours) {
  if (hours.length === 0) return []
  const min = Math.max(0, Math.min(...hours) - 1)
  const max = Math.min(23, Math.max(...hours) + 2)
  const rows = []
  for (let h = min; h <= max; h++) rows.push(h)
  return rows
}

function levelLabel(l) { return { tier_one: '一等', tier_two: '二等', tier_three: '三等', infrastructure: '基础' }[l] || l }
function kindLabel(k) { return { scenic: '景', road: '路', food: '食', stay: '住', fuel: '油', other: '其他' }[k] || k }
