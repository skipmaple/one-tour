import { Paper, Text, Button, Textarea, Stack, Group, Badge, Code } from '@mantine/core'
import { useEffect, useRef, useState } from 'react'
import useChat from '../../hooks/useChat'
import { ONBOARDING_SENTINEL } from '../../lib/onboarding'
import PanelShell from './PanelLayout/PanelShell'

export default function ChatPanel({
  tour,
  open,
  onToggle,
  pendingPrompt,
  onPromptConsumed,
  canToggle = true,
  flexStyle,
}) {
  // Auto-expand and send when a pending prompt arrives (e.g. from ConstitutionBanner "帮我修正")
  const needsExpand = pendingPrompt && !open

  useEffect(() => {
    if (needsExpand && onToggle) onToggle()
  }, [needsExpand]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <PanelShell
      title="AI 对话"
      icon="💬"
      open={open}
      onToggle={onToggle}
      canToggle={canToggle}
      flexStyle={flexStyle}
    >
      <ChatBody tour={tour} pendingPrompt={pendingPrompt} onPromptConsumed={onPromptConsumed} />
    </PanelShell>
  )
}

function ChatBody({ tour, pendingPrompt, onPromptConsumed }) {
  const { messages, streaming, pendingToolCalls, error, send } = useChat({ tourId: tour.id })
  const [ text, setText ] = useState('')
  const scrollRef = useRef(null)

  useEffect(() => {
    const el = scrollRef.current
    if (el && typeof el.scrollTo === 'function') {
      el.scrollTo({ top: el.scrollHeight })
    }
  }, [ messages, pendingToolCalls, streaming ])

  // Auto-send pending prompt from ConstitutionBanner
  useEffect(() => {
    if (pendingPrompt && !streaming) {
      send(pendingPrompt)
      if (onPromptConsumed) onPromptConsumed()
    }
  }, [pendingPrompt]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleSend = () => {
    const trimmed = text.trim()
    if (!trimmed || streaming) return
    send(trimmed)
    setText('')
  }

  const toolEntries = Object.entries(pendingToolCalls)

  return (
    <>
      <Stack ref={scrollRef} gap="xs" p="xs" style={{ flex: 1, overflowY: 'auto', minHeight: 200 }}>
        {messages.length === 0 && !streaming && (
          <Text size="xs" c="dimmed" ta="center">（还没有对话。说点什么让 AI 帮忙 → ）</Text>
        )}
        {messages.map((m, i) => <MessageBubble key={i} message={m} />)}
        {toolEntries.length > 0 && (
          <Stack gap={4}>
            {toolEntries.map(([ id, call ]) => <ToolCallChip key={id} call={call} />)}
          </Stack>
        )}
        {streaming && <Text size="xs" c="dimmed">...</Text>}
        {error && (
          <Text size="xs" c="red" data-testid="chat-error">出错：{error}</Text>
        )}
      </Stack>
      <div style={{ borderTop: '1px solid #ccc', padding: 6 }}>
        <Stack gap={4}>
          <Textarea
            value={text}
            onChange={e => setText(e.target.value)}
            rows={3}
            placeholder="说点什么让 AI 帮忙..."
            disabled={streaming}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                e.preventDefault()
                handleSend()
              }
            }}
          />
          <Button size="xs" onClick={handleSend} disabled={streaming || !text.trim()}>
            {streaming ? '处理中…' : '发送'}
          </Button>
        </Stack>
      </div>
    </>
  )
}

function MessageBubble({ message }) {
  // Sentinel is an internal protocol token sent by Show.jsx to trigger AI
  // onboarding. It must be persisted (so we don't re-trigger on refresh) but
  // must not appear in the UI.
  if (message.role === 'user' && message.content === ONBOARDING_SENTINEL) {
    return null
  }

  const isUser = message.role === 'user'
  return (
    <Paper
      p="xs"
      radius="sm"
      style={{
        alignSelf: isUser ? 'flex-end' : 'flex-start',
        maxWidth: '85%',
        background: isUser ? '#e7f2ff' : '#f5f5f5',
        whiteSpace: 'pre-wrap',
        fontSize: 13
      }}
    >
      {message.content}
    </Paper>
  )
}

function ToolCallChip({ call }) {
  const status = call.result ? (call.result.ok === false ? 'err' : 'done') : 'run'
  const color = status === 'err' ? 'red' : status === 'done' ? 'green' : 'gray'
  return (
    <Group gap={4} wrap="nowrap" align="flex-start">
      <Badge color={color} size="xs">{status === 'run' ? '执行中' : status === 'done' ? '完成' : '失败'}</Badge>
      <Code style={{ fontSize: 11, flex: 1, whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
        {call.name}({JSON.stringify(call.arguments ?? {})})
        {call.result && (
          <>
            {' → '}
            {JSON.stringify(call.result)}
          </>
        )}
      </Code>
    </Group>
  )
}
