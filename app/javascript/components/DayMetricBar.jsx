import { Group, Stack, Text, Progress } from '@mantine/core'

export function barColor(value, max) {
  if (!max || max <= 0) return 'gray.4'
  const pct = value / max
  if (pct > 1.0) return 'red.6'
  if (pct >= 0.9) return 'yellow.6'
  return 'gray.5'
}

export default function DayMetricBar({ label, value, max, unit = '' }) {
  const hasCap = !!max && max > 0
  const fillPct = hasCap ? Math.min((value / max) * 100, 100) : 0
  const color = barColor(value, max)
  const over = hasCap && value > max
  // One-decimal overflow for hour budgets, integer for unit-less counts.
  const overBy = over ? Math.round((value - max) * 10) / 10 : 0

  return (
    <Stack gap={1}>
      <Group gap={6} wrap="nowrap">
        <Text size="xs" c="dimmed" w={48} style={{ flexShrink: 0 }}>{label}</Text>
        <Progress
          size="sm"
          value={fillPct}
          color={color}
          style={{ flex: 1, minWidth: 40 }}
        />
        <Text size="xs" c={over ? 'red.7' : 'dimmed'} style={{ whiteSpace: 'nowrap' }}>{value}/{max}{unit}</Text>
      </Group>
      {over && (
        <Text size="xs" c="red.7" fw={600} ta="right">超出 {overBy}{unit}</Text>
      )}
    </Stack>
  )
}
