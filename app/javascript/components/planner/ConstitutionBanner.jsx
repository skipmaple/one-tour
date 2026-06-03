import { Stack, Paper, Group, Text, Button, Tooltip } from '@mantine/core'
import { useState } from 'react'
import { IconAlertOctagonFilled, IconAlertTriangleFilled } from '@tabler/icons-react'

const noop = () => {}

export default function ConstitutionBanner({
  violations,
  onFix = noop,
  onAcknowledge = noop,
  onDismiss = noop,
  readOnly = false,
}) {
  const [dismissed, setDismissed] = useState(new Set())

  if (!violations || violations.length === 0) return null

  const visible = violations.filter((_, i) => !dismissed.has(i))
  if (visible.length === 0) return null

  const handleDismiss = (idx, v) => {
    setDismissed((prev) => {
      const next = new Set(prev)
      next.add(idx)
      return next
    })
    onDismiss(v)
  }

  return (
    <Stack gap={4} mb="sm">
      {violations.map((v, i) => {
        if (dismissed.has(i)) return null
        return (
          <Paper
            key={i}
            p="xs"
            withBorder
            style={{
              borderColor: v.level === 'hard' ? '#c33' : '#c80',
              background: v.level === 'hard' ? '#fef0f0' : '#fef8e8',
              color: v.level === 'hard' ? '#c33' : '#c80'
            }}
          >
            <Group justify="space-between" wrap="nowrap">
              <Group gap={6} wrap="nowrap" align="center" style={{ flex: 1, minWidth: 0 }}>
                <Tooltip label="软提示=建议，可忽略；硬违反=超出硬约束，需修正或明确承认" multiline w={240} withArrow>
                  {v.level === 'hard'
                    ? <IconAlertOctagonFilled size={16} data-testid="violation-level-icon" style={{ flexShrink: 0, cursor: 'help' }} />
                    : <IconAlertTriangleFilled size={16} data-testid="violation-level-icon" style={{ flexShrink: 0, cursor: 'help' }} />}
                </Tooltip>
                <Text size="sm">{v.message}</Text>
              </Group>
              <Group gap="xs">
                {!readOnly && v.level === 'hard' && (
                  <Button size="compact-xs" color="red" onClick={() => onFix(v)}>
                    帮我修正 →
                  </Button>
                )}
                {(() => {
                  const isAck = v.level === 'hard' && !readOnly
                  const btn = (
                    <Button
                      size="compact-xs"
                      variant="default"
                      onClick={() => { isAck ? onAcknowledge(v) : handleDismiss(i, v) }}
                    >
                      {isAck ? '承认此违反' : '知道了'}
                    </Button>
                  )
                  return isAck
                    ? <Tooltip label="记录一条豁免：我知道这超了约束，但坚持当前安排" multiline w={240} withArrow>{btn}</Tooltip>
                    : btn
                })()}
              </Group>
            </Group>
          </Paper>
        )
      })}
    </Stack>
  )
}
