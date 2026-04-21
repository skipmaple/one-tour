import { Group, ActionIcon, Tooltip, Indicator } from '@mantine/core'
import {
  IconBook2,
  IconListDetails,
  IconCoin,
  IconUsers,
} from '@tabler/icons-react'

function severityColor(violations) {
  if (!violations || violations.length === 0) return null
  return violations.some(v => v.level === 'hard') ? 'red' : 'yellow'
}

export default function PlannerHeaderRight({
  violations = [],
  onOpenConst,
  onOpenTimeline,
  onOpenExpense,
  onOpenMembers,
}) {
  const color = severityColor(violations)

  return (
    <Group gap="xs" wrap="nowrap">
      <Indicator
        color={color || 'gray'}
        label={violations.length}
        size={16}
        offset={4}
        disabled={!color}
      >
        <Tooltip label="宪法" withArrow>
          <ActionIcon onClick={onOpenConst} variant="subtle" size="md" aria-label="宪法">
            <IconBook2 size={20} />
          </ActionIcon>
        </Tooltip>
      </Indicator>

      <Tooltip label="总览" withArrow>
        <ActionIcon onClick={onOpenTimeline} variant="subtle" size="md" aria-label="总览">
          <IconListDetails size={20} />
        </ActionIcon>
      </Tooltip>

      <Tooltip label="账单" withArrow>
        <ActionIcon onClick={onOpenExpense} variant="subtle" size="md" aria-label="账单">
          <IconCoin size={20} />
        </ActionIcon>
      </Tooltip>

      <Tooltip label="成员" withArrow>
        <ActionIcon onClick={onOpenMembers} variant="subtle" size="md" aria-label="成员">
          <IconUsers size={20} />
        </ActionIcon>
      </Tooltip>
    </Group>
  )
}
