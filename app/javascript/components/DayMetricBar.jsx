import { Group, Text, Progress } from '@mantine/core'

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

  return (
    <Group gap={6} wrap="nowrap">
      <Text size="xs" c="dimmed" w={28}>{label}</Text>
      <Progress
        size="sm"
        value={fillPct}
        color={color}
        style={{ flex: 1, minWidth: 40 }}
      />
      <Text size="xs" c="dimmed">{value}/{max}{unit}</Text>
    </Group>
  )
}
