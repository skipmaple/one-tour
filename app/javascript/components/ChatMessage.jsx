import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Box } from '@mantine/core'
import '../styles/chat.css'

export default function ChatMessage({ role, content }) {
  const isUser = role === 'user'

  return (
    <Box
      mb={6}
      style={{
        display: 'flex',
        justifyContent: isUser ? 'flex-end' : 'flex-start',
      }}
    >
      <Box
        px="sm"
        py="xs"
        style={{
          borderRadius: 'var(--mantine-radius-sm)',
          backgroundColor: isUser
            ? 'var(--mantine-color-blue-1)'
            : 'var(--mantine-color-gray-0)',
          maxWidth: isUser ? '85%' : '100%',
        }}
      >
        <div style={{ fontSize: '0.8125rem', lineHeight: 1.5 }} className="chat-markdown">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>
            {content}
          </ReactMarkdown>
        </div>
      </Box>
    </Box>
  )
}
