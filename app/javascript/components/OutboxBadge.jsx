import { UnstyledButton, Group, Text } from '@mantine/core'
import { IconCloudUpload, IconAlertCircle } from '@tabler/icons-react'

// 三态徽标:
//   0 + 0 → 不渲染
//   pending > 0(failed=0)→ 黄色,X 条待同步
//   failed > 0(优先级高于 pending)→ 红色,X 条失败
//
// 点击触发 onClick(父级负责打开 OutboxDrawer + triggerNow)。
export default function OutboxBadge({ pending, failed, onClick }) {
  if (pending === 0 && failed === 0) return null

  const showFailed = failed > 0
  const Icon = showFailed ? IconAlertCircle : IconCloudUpload
  const label = showFailed ? `${failed} 条失败` : `${pending} 条待同步`
  const color = showFailed ? 'red.7' : 'yellow.7'

  return (
    <UnstyledButton
      onClick={onClick}
      aria-label={`同步状态:${label},点击查看`}
      style={{
        padding: '4px 10px',
        borderRadius: 16,
        backgroundColor: showFailed ? '#fff5f5' : '#fff9db',
        border: `1px solid ${showFailed ? '#ffa8a8' : '#ffe066'}`,
      }}
    >
      <Group gap={6}>
        <Icon size={14} color={showFailed ? '#c92a2a' : '#e67700'} />
        <Text size="xs" fw={500} c={color}>{label}</Text>
      </Group>
    </UnstyledButton>
  )
}
