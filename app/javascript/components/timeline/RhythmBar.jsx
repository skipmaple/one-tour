import { Paper, Text } from '@mantine/core'
import { IconAlertOctagonFilled } from '@tabler/icons-react'

const INTENSITY_BG = {
  green:  '#e8f5e9',
  yellow: '#fff8e1',
  red:    '#ffebee',
}

export default function RhythmBar({ days, violations, selectedDayId, onSlotClick }) {
  const hasHardViolation = (day) => violations.some(v => {
    const level = v.level || v['level']
    const scope = v.scope || v['scope'] || {}
    const idx = scope.day_index ?? scope['day_index']
    return level === 'hard' && Number(idx) === day.day_index
  })

  // Returns either a plain string ("适应日" / "机动") or a React node (hard-
  // violation icon). Consumer renders via conditional.
  const slotMeta = (day) => {
    if (day.buffer_day) return day.day_index === 1 ? '适应日' : '机动'
    if (hasHardViolation(day)) return <IconAlertOctagonFilled size={12} color="#e53935" aria-label="硬违反" />
    return null
  }

  return (
    <Paper withBorder p="xs" data-testid="rhythm-bar">
      <div style={{ display: 'flex', gap: 2 }}>
        {days.map(day => {
          const bg = INTENSITY_BG[day.intensity_derived] || '#f5f5f5'
          const hardRed = hasHardViolation(day)
          const selected = selectedDayId === day.id
          return (
            <div
              key={day.id}
              data-testid={`rhythm-slot-${day.day_index}`}
              onClick={() => onSlotClick?.(day.id)}
              style={{
                flex: 1,
                minWidth: 36,
                padding: '6px 4px',
                textAlign: 'center',
                background: bg,
                border: day.buffer_day ? '1px dashed #999' : '1px solid #ddd',
                outline: hardRed ? '2px solid #e53935' : (selected ? '2px solid #1677ff' : 'none'),
                cursor: 'pointer',
                borderRadius: 3,
                fontSize: 11,
                lineHeight: 1.3
              }}
            >
              <Text size="xs" fw={600}>D{day.day_index}</Text>
              {slotMeta(day) && (
                <Text size="xs" c="dimmed">{slotMeta(day)}</Text>
              )}
            </div>
          )
        })}
      </div>
    </Paper>
  )
}
