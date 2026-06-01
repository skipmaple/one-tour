import { Group, ActionIcon, Tooltip, Indicator, Menu } from '@mantine/core'
import {
  IconBook2,
  IconListDetails,
  IconCoin,
  IconUsers,
  IconSettings,
  IconDotsVertical,
} from '@tabler/icons-react'
import { useIsMobile } from '../../hooks/useIsMobile'

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
  onOpenSettings,
}) {
  const color = severityColor(violations)
  const isMobile = useIsMobile()

  if (isMobile) {
    return (
      <Menu position="bottom-end" withinPortal shadow="md" width={180}>
        <Menu.Target>
          <Indicator color={color || 'gray'} label={violations.length} size={16} offset={4} disabled={!color}>
            <ActionIcon variant="subtle" size="lg" aria-label="更多"><IconDotsVertical size={20} /></ActionIcon>
          </Indicator>
        </Menu.Target>
        <Menu.Dropdown>
          <Menu.Item leftSection={<IconBook2 size={16} />} onClick={onOpenConst}>宪法{color ? ` · ${violations.length}` : ''}</Menu.Item>
          <Menu.Item leftSection={<IconListDetails size={16} />} onClick={onOpenTimeline}>总览</Menu.Item>
          <Menu.Item leftSection={<IconCoin size={16} />} onClick={onOpenExpense}>账单</Menu.Item>
          <Menu.Item leftSection={<IconUsers size={16} />} onClick={onOpenMembers}>成员</Menu.Item>
          {onOpenSettings && <Menu.Item leftSection={<IconSettings size={16} />} onClick={onOpenSettings}>旅程设置</Menu.Item>}
        </Menu.Dropdown>
      </Menu>
    )
  }

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

      {onOpenSettings && (
        <Tooltip label="旅程设置" withArrow>
          <ActionIcon onClick={onOpenSettings} variant="subtle" size="md" aria-label="旅程设置">
            <IconSettings size={20} />
          </ActionIcon>
        </Tooltip>
      )}
    </Group>
  )
}
