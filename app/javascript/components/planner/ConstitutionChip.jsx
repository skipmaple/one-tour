import { useState } from 'react'
import { Badge, Popover, Stack, Paper, Group, Text, Button } from '@mantine/core'
import { IconAlertOctagonFilled, IconAlertTriangleFilled } from '@tabler/icons-react'

const noop = () => {}

export default function ConstitutionChip({
  violations,
  onFix = noop,
  onAcknowledge = noop,
  onDismiss = noop,
  readOnly = false,
}) {
  const [opened, setOpened] = useState(false)
  const [dismissed, setDismissed] = useState(new Set())

  if (!violations || violations.length === 0) return null
  const visible = violations
    .map((v, i) => ({ v, i }))
    .filter(({ i }) => !dismissed.has(i))
  if (visible.length === 0) return null

  const hasHard = visible.some(({ v }) => v.level === 'hard')
  const color = hasHard ? 'red' : 'yellow'
  const BadgeIcon = hasHard ? IconAlertOctagonFilled : IconAlertTriangleFilled

  const closePopover = () => setOpened(false)

  const handleFix = (v) => {
    onFix(v)
    closePopover()
  }
  const handleAcknowledge = (v) => {
    onAcknowledge(v)
    closePopover()
  }
  const handleDismissOne = (i, v) => {
    setDismissed(prev => {
      const next = new Set(prev)
      next.add(i)
      return next
    })
    onDismiss(v)
    // visible was computed from this render's dismissed set, so its length is
    // the pre-dismiss count — if it was 1, this dismiss makes it 0 and the
    // chip will unmount on the next render. Close popover proactively.
    if (visible.length === 1) closePopover()
  }

  return (
    <Popover opened={opened} onChange={setOpened} position="bottom-start" shadow="md" withinPortal>
      <Popover.Target>
        <Badge
          color={color}
          size="sm"
          data-testid="constitution-chip"
          style={{ cursor: 'pointer', userSelect: 'none' }}
          leftSection={<BadgeIcon size={12} />}
          onClick={() => setOpened(o => !o)}
        >
          {visible.length}
        </Badge>
      </Popover.Target>

      <Popover.Dropdown p="xs" style={{ maxWidth: 420 }}>
        <Stack gap={4}>
          {visible.map(({ v, i }) => {
            const isHard = v.level === 'hard'
            const showHardActions = isHard && !readOnly
            return (
              <Paper
                key={i}
                p="xs"
                withBorder
                style={{
                  borderColor: isHard ? '#c33' : '#c80',
                  background:  isHard ? '#fef0f0' : '#fef8e8',
                  color:       isHard ? '#c33' : '#c80',
                }}
              >
                <Group justify="space-between" wrap="nowrap" gap="xs">
                  <Group gap={6} wrap="nowrap" align="center" style={{ flex: 1, minWidth: 0 }}>
                    {isHard
                      ? <IconAlertOctagonFilled size={14} style={{ flexShrink: 0 }} />
                      : <IconAlertTriangleFilled size={14} style={{ flexShrink: 0 }} />}
                    <Text size="sm">{v.message}</Text>
                  </Group>
                  <Group gap="xs" wrap="nowrap">
                    {showHardActions && (
                      <Button size="compact-xs" color="red" onClick={() => handleFix(v)}>
                        帮我修正 →
                      </Button>
                    )}
                    <Button
                      size="compact-xs"
                      variant="default"
                      onClick={() => {
                        if (showHardActions) handleAcknowledge(v)
                        else handleDismissOne(i, v)
                      }}
                    >
                      {showHardActions ? '承认此违反' : '知道了'}
                    </Button>
                  </Group>
                </Group>
              </Paper>
            )
          })}
        </Stack>
      </Popover.Dropdown>
    </Popover>
  )
}
