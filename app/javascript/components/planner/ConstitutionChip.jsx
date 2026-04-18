import { useState } from 'react'
import { Badge, Popover, Stack, Paper, Group, Text } from '@mantine/core'

const noop = () => {}

export default function ConstitutionChip({
  violations,
  onFix = noop,           // eslint-disable-line no-unused-vars
  onAcknowledge = noop,   // eslint-disable-line no-unused-vars
  onDismiss = noop,       // eslint-disable-line no-unused-vars
  readOnly = false,       // eslint-disable-line no-unused-vars
}) {
  const [opened, setOpened] = useState(false)

  if (!violations || violations.length === 0) return null

  const hasHard = violations.some(v => v.level === 'hard')
  const color = hasHard ? 'red' : 'yellow'
  const icon = hasHard ? '⛔' : '⚠'

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
          {icon} {violations.length}
        </Badge>
      </Popover.Target>

      <Popover.Dropdown p="xs" style={{ maxWidth: 420 }}>
        <Stack gap={4}>
          {violations.map((v, i) => (
            <Paper
              key={i}
              p="xs"
              withBorder
              style={{
                borderColor: v.level === 'hard' ? '#c33' : '#c80',
                background:  v.level === 'hard' ? '#fef0f0' : '#fef8e8',
                color:       v.level === 'hard' ? '#c33' : '#c80',
              }}
            >
              <Text size="sm">
                {v.level === 'hard' ? '⛔ ' : '⚠ '}{v.message}
              </Text>
            </Paper>
          ))}
        </Stack>
      </Popover.Dropdown>
    </Popover>
  )
}
