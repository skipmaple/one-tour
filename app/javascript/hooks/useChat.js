import { useEffect, useReducer, useRef } from 'react'
import consumer from '../channels/consumer'

export const INITIAL = {
  messages: [],
  streaming: false,
  pendingToolCalls: {}
}

export function reducer(state, action) {
  switch (action.type) {
    case 'send_user':
      return {
        ...state,
        messages: [ ...state.messages, { role: 'user', content: action.content } ],
        streaming: true
      }

    case 'tool_call_start':
      return {
        ...state,
        pendingToolCalls: {
          ...state.pendingToolCalls,
          [action.id]: { name: action.name, arguments: action.arguments }
        }
      }

    case 'tool_call_result':
      return {
        ...state,
        pendingToolCalls: {
          ...state.pendingToolCalls,
          [action.id]: { ...(state.pendingToolCalls[action.id] || {}), result: action.result }
        }
      }

    case 'assistant_text': {
      const msgs = [ ...state.messages ]
      const last = msgs[msgs.length - 1]
      if (last && last.role === 'assistant') {
        msgs[msgs.length - 1] = { ...last, content: (last.content || '') + action.delta }
      } else {
        msgs.push({ role: 'assistant', content: action.delta })
      }
      return { ...state, messages: msgs }
    }

    case 'complete':
      return { ...state, streaming: false }

    case 'error':
      return { ...state, streaming: false, error: action.message }

    default:
      return state
  }
}

export default function useChat({ tourId }) {
  const [ state, dispatch ] = useReducer(reducer, INITIAL)
  const subRef = useRef(null)

  useEffect(() => {
    if (!tourId) return
    subRef.current = consumer.subscriptions.create(
      { channel: 'ChatChannel', tour_id: tourId },
      { received: (data) => dispatch(data) }
    )
    return () => subRef.current?.unsubscribe()
  }, [ tourId ])

  function send(content) {
    dispatch({ type: 'send_user', content })
    fetch(`/tours/${tourId}/conversation/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-CSRF-Token': csrfToken()
      },
      body: JSON.stringify({ content })
    })
  }

  return {
    messages: state.messages,
    streaming: state.streaming,
    pendingToolCalls: state.pendingToolCalls,
    error: state.error,
    send
  }
}

function csrfToken() {
  return document.querySelector('meta[name=csrf-token]')?.getAttribute('content') || ''
}
