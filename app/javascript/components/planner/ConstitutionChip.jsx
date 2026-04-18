import { useState } from 'react'
import { Badge, Popover, Stack, Paper, Group, Text, Button } from '@mantine/core'

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
  const icon = hasHard ? '⛔' : '⚠'

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
    const next = new Set(dismissed)
    next.add(i)
    setDismissed(next)
    onDismiss(v)
    // If this was the last visible one, close popover (chip will unmount on
    // the next render because visible.length will be 0).
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
          onClick={() => setOpened(o => !o)}
        >
          {icon} {visible.length}
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
                  <Text size="sm">
                    {isHard ? '⛔ ' : '⚠ '}{v.message}
                  </Text>
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
