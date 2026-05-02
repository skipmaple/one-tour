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

  // 颜色 contrast 必须过 WCAG AA(text 4.5:1, non-text UI 3.0:1)。
  // pending 黄底 #fff9db:Mantine yellow.7 (#f59f00) 仅 2.01:1,失败。
  // 用 #744210(深琥珀)≈ 7.84:1,视觉仍是 amber 警示。同 Week 3 a11y 教训。
  // failed 红底 #fff5f5:#c92a2a ≈ 5.10:1,通过 AA。
  const fg = showFailed ? '#c92a2a' : '#744210'

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
        <Icon size={14} color={fg} />
        <Text size="xs" fw={500} style={{ color: fg }}>{label}</Text>
      </Group>
    </UnstyledButton>
  )
}
