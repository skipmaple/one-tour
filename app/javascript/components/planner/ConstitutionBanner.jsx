import { Stack, Paper, Group, Text, Button } from '@mantine/core'
import { useState } from 'react'

const noop = () => {}

export default function ConstitutionBanner({
  violations,
  onFix = noop,
  onAcknowledge = noop,
  onDismiss = noop,
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
              <Text size="sm">
                {v.level === 'hard' ? '⛔ ' : '⚠ '}{v.message}
              </Text>
              <Group gap="xs">
                {v.level === 'hard' && (
                  <Button size="compact-xs" color="red" onClick={() => onFix(v)}>
                    帮我修正 →
                  </Button>
                )}
                <Button
                  size="compact-xs"
                  variant="default"
                  onClick={() => {
                    if (v.level === 'hard') {
                      onAcknowledge(v)
                    } else {
                      handleDismiss(i, v)
                    }
                  }}
                >
                  {v.level === 'hard' ? '承认此违反' : '知道了'}
                </Button>
              </Group>
            </Group>
          </Paper>
        )
      })}
    </Stack>
  )
}
