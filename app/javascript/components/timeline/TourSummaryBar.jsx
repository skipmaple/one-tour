import { Group, Paper, Text } from '@mantine/core'
import { IconCircleCheckFilled } from '@tabler/icons-react'

export default function TourSummaryBar({ summary }) {
  const hasViolations = summary.hard_count > 0 || summary.soft_count > 0
  const bufferOk = summary.buffer_count >= summary.buffer_min

  return (
    <Paper withBorder p="sm">
      <Group gap="xl">
        <SummaryCell value={summary.day_count} label="天" />
        <SummaryCell value={summary.activity_count} label="个行" />
        <SummaryCell
          value={summary.tier_one_total}
          label={`个一等 · ≤ ${summary.tier_one_limit}/日`}
        />
        <SummaryCell
          value={summary.buffer_count}
          label={`个机动日 · ≥ ${summary.buffer_min}/程`}
          suffix={bufferOk ? <IconCircleCheckFilled size={12} color="var(--mantine-color-green-6)" aria-label="达标" /> : null}
        />
        <SummaryCell
          value={
            hasViolations
              ? `${summary.hard_count} 重 · ${summary.soft_count} 轻`
              : '0'
          }
          label="宪法违反"
          color={summary.hard_count > 0 ? 'red' : undefined}
        />
      </Group>
    </Paper>
  )
}

function SummaryCell({ value, label, suffix, color }) {
  return (
    <Group gap={4} wrap="nowrap">
      <Text fw={700} size="md" c={color}>{value}</Text>
      <Group gap={4} wrap="nowrap" align="center">
        <Text size="xs" c="dimmed">{label}</Text>
        {suffix}
      </Group>
    </Group>
  )
}
