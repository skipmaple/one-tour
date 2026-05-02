import { UnstyledButton, Group, Text } from '@mantine/core'
import { IconCloudUpload, IconAlertCircle } from '@tabler/icons-react'

// 三态徽标(failed 优先于 pending,但同时存在时合显):
//   0 + 0           → 不渲染
//   pending > 0     → 黄底,「X 条待同步」
//   failed > 0      → 红底,「X 条没传上去」(优先,因为需要用户处理)
//   两者都 > 0      → 红底,「X 条没传上去 · Y 条待同步」(避免清掉失败后 pending 突现)
//
// Layout 关键约束:
//   whiteSpace: nowrap + flexShrink: 0 防止徽标在窄屏 header(被 sibling
//   按钮挤压时)逐字竖排炸开。早期实现没设这两个,实测窄屏徽标 wrap 成
//   36×97px,把 header 撞得变形。
//
//   minHeight: 36 是 tap target 的下限(原生 27px 在 iOS 大屏拇指误触多)。
//   不上 44 (iOS HIG strict) 是因为 28px sibling 按钮的视觉节奏,36 是兼顾。
//
// 颜色对比度:
//   yellow.7 (#f59f00) 在 #fff9db 仅 2.01:1 失 WCAG AA。改用 #744210(深琥珀)
//   ≈ 7.84:1。red 路径 #c92a2a 在 #fff5f5 = 5.10:1 通过 AA。
//
// extraStyle 用于父级 Mantine Transition 注入 opacity / transform 做 fade
// 入场出场。点击触发 onClick(父级负责打开 OutboxDrawer + triggerNow)。
export default function OutboxBadge({ pending, failed, onClick, style: extraStyle }) {
  if (pending === 0 && failed === 0) return null

  const showFailed = failed > 0
  const Icon = showFailed ? IconAlertCircle : IconCloudUpload

  // 合显:failed 在前(优先级高、用户更关心)
  const fragments = []
  if (failed > 0) fragments.push(`${failed} 条没传上去`)
  if (pending > 0) fragments.push(`${pending} 条待同步`)
  const label = fragments.join(' · ')

  // fg / bg / border:failed 红 / pending 黄。同显时整体走红(警示优先)。
  const fg = showFailed ? '#c92a2a' : '#744210'
  const bg = showFailed ? '#fff5f5' : '#fff9db'
  const borderColor = showFailed ? '#ffa8a8' : '#ffe066'

  return (
    <UnstyledButton
      onClick={onClick}
      aria-label={`同步状态:${label},点击查看`}
      style={{
        padding: '6px 12px',
        minHeight: 36,
        display: 'inline-flex',
        alignItems: 'center',
        borderRadius: 18,
        whiteSpace: 'nowrap',
        flexShrink: 0,
        backgroundColor: bg,
        border: `1px solid ${borderColor}`,
        ...extraStyle,
      }}
    >
      <Group gap={6} wrap="nowrap">
        <Icon size={14} color={fg} />
        <Text size="xs" fw={500} style={{ color: fg, whiteSpace: 'nowrap' }}>
          {label}
        </Text>
      </Group>
    </UnstyledButton>
  )
}
