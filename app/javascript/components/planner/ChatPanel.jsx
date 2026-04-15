import { Paper, Text, Button, Textarea, Stack } from '@mantine/core'
import { useState } from 'react'

export default function ChatPanel({ tour, open, onToggle }) {
  if (!open) {
    return (
      <Paper
        withBorder
        onClick={onToggle}
        style={{ cursor: 'pointer', background: '#f3f3f3', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      >
        <Text size="xs" c="dimmed" style={{ writingMode: 'vertical-rl' }}>◂ 展开 AI 对话</Text>
      </Paper>
    )
  }

  return (
    <Paper withBorder style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 400 }}>
      <div style={{ padding: 6, background: '#f3f3f3', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Text fw={600} size="sm">AI 对话</Text>
        <Button size="compact-xs" variant="subtle" onClick={onToggle}>收起 ▸</Button>
      </div>
      <Stack gap="xs" p="xs" style={{ flex: 1, overflowY: 'auto', minHeight: 200 }}>
        <Text size="xs" c="dimmed" ta="center">（对话历史将显示在这里）</Text>
      </Stack>
      <div style={{ borderTop: '1px solid #ccc', padding: 6 }}>
        <ChatInput tour={tour} />
      </div>
    </Paper>
  )
}

function ChatInput({ tour }) {
  const [text, setText] = useState('')
  const send = () => {
    if (!text.trim()) return
    // Task 4.5 implements full useChat hook with ActionCable
    console.log('[ChatPanel stub] send', tour.id, text)
    setText('')
  }
  return (
    <Stack gap={4}>
      <Textarea value={text} onChange={e => setText(e.target.value)} autosize minRows={2} maxRows={4} placeholder="说点什么让 AI 帮忙..." />
      <Button size="xs" onClick={send}>发送</Button>
    </Stack>
  )
}
