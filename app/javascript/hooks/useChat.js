import { useState, useEffect, useRef, useCallback } from 'react'
import consumer from '../channels/consumer'

export function useChat(guidebookId, { modeRef, onAutoApply } = {}) {
  const [messages, setMessages] = useState([])
  const [streaming, setStreaming] = useState(false)
  const [streamingContent, setStreamingContent] = useState('')
  const [error, setError] = useState(null)
  const [conversationId, setConversationId] = useState(null)
  const subscriptionRef = useRef(null)
  const streamingContentRef = useRef('')

  // Subscribe to ActionCable channel
  useEffect(() => {
    if (!guidebookId) return

    subscriptionRef.current = consumer.subscriptions.create(
      { channel: 'ChatChannel', guidebook_id: guidebookId },
      {
        received(data) {
          if (data.type === 'chunk') {
            streamingContentRef.current += data.content
            setStreamingContent(streamingContentRef.current)
          } else if (data.type === 'complete') {
            setStreaming(false)
            if (data.content) {
              setMessages(prev => [...prev, { role: 'assistant', content: data.content }])
            }
            if (data.has_guidebook_content && modeRef?.current === 'auto' && onAutoApply) {
              onAutoApply(data.content)
            }
            setStreamingContent('')
            streamingContentRef.current = ''
          } else if (data.type === 'error') {
            setStreaming(false)
            setError(data.content)
            setStreamingContent('')
            streamingContentRef.current = ''
          }
        }
      }
    )

    return () => {
      if (subscriptionRef.current) {
        subscriptionRef.current.unsubscribe()
      }
    }
  }, [guidebookId])

  // Create or load conversation
  const conversationIdRef = useRef(null)

  const ensureConversation = useCallback(async () => {
    if (conversationIdRef.current) return conversationIdRef.current

    const csrfToken = document.querySelector('meta[name="csrf-token"]')?.content
    const response = await fetch(`/guidebooks/${guidebookId}/conversations`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-CSRF-Token': csrfToken,
        'Accept': 'application/json'
      }
    })

    const data = await response.json()
    const id = data.conversation.id
    conversationIdRef.current = id
    setConversationId(id)

    // Load existing messages
    const historyResponse = await fetch(`/guidebooks/${guidebookId}/conversations/${id}`, {
      headers: { 'Accept': 'application/json' }
    })
    const historyData = await historyResponse.json()
    setMessages(historyData.messages || [])

    return id
  }, [guidebookId])

  // Load conversation history on mount
  useEffect(() => {
    if (guidebookId) {
      ensureConversation()
    }
  }, [guidebookId, ensureConversation])

  const sendMessage = useCallback(async (content) => {
    if (!content.trim() || streaming) return

    setError(null)
    setStreaming(true)
    streamingContentRef.current = ''
    setStreamingContent('')

    // Ensure conversation exists (loads history if first call)
    const convId = await ensureConversation()

    // Optimistically add user message AFTER history is loaded
    setMessages(prev => [...prev, { role: 'user', content }])

    const csrfToken = document.querySelector('meta[name="csrf-token"]')?.content

    const response = await fetch(
      `/guidebooks/${guidebookId}/conversations/${convId}/messages`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-CSRF-Token': csrfToken,
          'Accept': 'application/json'
        },
        body: JSON.stringify({ content, mode: modeRef?.current || 'ask' })
      }
    )

    if (!response.ok) {
      setStreaming(false)
      setError('Failed to send message')
    }
  }, [guidebookId, streaming, ensureConversation])

  return { messages, streaming, streamingContent, sendMessage, error }
}
