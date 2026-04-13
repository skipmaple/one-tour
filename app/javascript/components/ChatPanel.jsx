import { useState, useRef, useEffect } from 'react'
import { Stack, Textarea, ActionIcon, ScrollArea, Text, Group, Button, Alert, SegmentedControl } from '@mantine/core'
import ChatMessage from './ChatMessage'

export default function ChatPanel({ messages, streaming, streamingContent, sendMessage, error, onApplyContent, mode, onModeChange }) {
  const [input, setInput] = useState('')
  const scrollRef = useRef(null)

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    requestAnimationFrame(() => {
      if (scrollRef.current) {
        scrollRef.current.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
      }
    })
  }, [messages, streamingContent])

  const handleSend = () => {
    if (input.trim() && !streaming) {
      sendMessage(input.trim())
      setInput('')
    }
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  // Check if the last assistant message contains frontmatter (guidebook content)
  const lastAssistantMessage = [...messages].reverse().find(m => m.role === 'assistant')
  const hasFrontmatter = lastAssistantMessage?.content?.trimStart().startsWith('---')

  return (
    <Stack h="100%" gap={0}>
      {/* Messages */}
      <ScrollArea flex={1} type="auto" offsetScrollbars viewportRef={scrollRef} px="sm" pt="sm">
        <Stack gap="xs" style={{ display: 'flex', flexDirection: 'column' }}>
          {messages.length === 0 && !streaming && (
            <Text c="dimmed" ta="center" size="sm" py="xl">
              输入消息开始对话，AI 将帮你规划旅行路书
            </Text>
          )}

          {messages.map((msg, i) => (
            <ChatMessage key={i} role={msg.role} content={msg.content} />
          ))}

          {/* Streaming indicator */}
          {streaming && streamingContent && (
            <ChatMessage role="assistant" content={streamingContent} />
          )}
          {streaming && !streamingContent && (
            <div className="thinking-indicator" role="status" aria-label="AI 正在思考">
              <div className="wave-bars">
                <div className="wave-bar" />
                <div className="wave-bar" />
                <div className="wave-bar" />
                <div className="wave-bar" />
                <div className="wave-bar" />
              </div>
              <span style={{ fontSize: '0.75rem', color: 'var(--mantine-color-gray-6)' }}>思考中...</span>
            </div>
          )}
        </Stack>
      </ScrollArea>

      {/* Apply to editor button (ask mode only — auto mode applies automatically) */}
      {hasFrontmatter && !streaming && mode === 'ask' && (
        <Group px="sm" py="xs" style={{ borderTop: '1px solid var(--mantine-color-gray-3)' }}>
          <Button
            size="xs"
            variant="light"
            color="green"
            fullWidth
            onClick={() => onApplyContent(lastAssistantMessage.content)}
          >
            应用到编辑器
          </Button>
        </Group>
      )}

      {/* Error */}
      {error && (
        <Alert color="red" variant="light" mx="sm" mb="xs">
          {error}
        </Alert>
      )}

      {/* Mode selector */}
      <Group px="xs" py={4} justify="center" style={{ borderTop: '1px solid var(--mantine-color-gray-3)' }}>
        <SegmentedControl
          size="xs"
          value={mode}
          onChange={onModeChange}
          data={[
            { label: '自动', value: 'auto' },
            { label: '询问', value: 'ask' },
            { label: '计划', value: 'plan' },
          ]}
        />
      </Group>

      {/* Input */}
      <Group gap="xs" style={{ padding: 8 }}>
        <Textarea
          flex={1}
          placeholder="描述你的旅行计划..."
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          autosize
          minRows={1}
          maxRows={4}
          disabled={streaming}
        />
        <ActionIcon
          size="lg"
          variant="filled"
          onClick={handleSend}
          disabled={!input.trim() || streaming}
          loading={streaming}
          title="发送"
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M8 14V2M8 2L3 7M8 2L13 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </ActionIcon>
      </Group>
    </Stack>
  )
}
