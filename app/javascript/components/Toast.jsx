import { useEffect, useState } from 'react'
import { Paper, Text, Button, Group } from '@mantine/core'

export default function Toast({ message, onUndo, onDismiss, duration = 5000 }) {
  const [ remaining, setRemaining ] = useState(Math.ceil(duration / 1000))

  useEffect(() => {
    if (!message) return
    setRemaining(Math.ceil(duration / 1000))
    const tick = setInterval(() => setRemaining(r => Math.max(0, r - 1)), 1000)
    const timer = setTimeout(() => onDismiss?.(), duration)
    return () => { clearInterval(tick); clearTimeout(timer) }
  }, [ message, duration, onDismiss ])

  if (!message) return null

  return (
    <Paper
      withBorder
      shadow="md"
      p="xs"
      style={{
        position: 'fixed',
        bottom: 16,
        left: '50%',
        transform: 'translateX(-50%)',
        background: '#333',
        color: '#fff',
        zIndex: 9999,
        minWidth: 280
      }}
    >
      <Group gap="md" wrap="nowrap">
        <Text size="sm" style={{ color: '#fff' }}>{message}</Text>
        {onUndo && (
          <Button size="compact-xs" variant="subtle" onClick={onUndo} style={{ color: '#6af' }}>
            撤销
          </Button>
        )}
        <Text size="xs" style={{ color: '#aaa' }}>{remaining}s</Text>
      </Group>
    </Paper>
  )
}
