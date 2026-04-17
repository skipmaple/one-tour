import { useEffect, useReducer, useRef } from 'react'
import { router } from '@inertiajs/react'
import * as Sentry from '@sentry/react'
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

    case 'load_history':
      return { ...state, messages: action.messages }

    case 'complete':
      return { ...state, streaming: false }

    case 'error':
      return { ...state, streaming: false, error: action.message }

    default:
      return state
  }
}

// Pure predicate — extracted so it's unit-testable without mocking Inertia.
// A turn ends on `complete` (success) or `error`; both are moments the
// server-side tour state may have changed and the planner's props
// (activities, days, violations) need to be re-fetched. We don't reload on
// every `tool_call_result` because a turn can run 5+ tools and we'd thrash.
export function shouldReloadPlanner(action) {
  return action?.type === 'complete' || action?.type === 'error'
}

export const RELOAD_PROPS = [ 'activities', 'days', 'violations' ]

export default function useChat({ tourId }) {
  const [ state, dispatch ] = useReducer(reducer, INITIAL)
  const subRef = useRef(null)

  useEffect(() => {
    if (!tourId) return
    fetch(`/tours/${tourId}/conversation`, {
      headers: { Accept: 'application/json' }
    })
      .then(res => res.ok ? res.json() : null)
      .then(data => {
        if (data?.messages) {
          dispatch({ type: 'load_history', messages: data.messages })
        }
      })
      .catch((err) => {
        Sentry.captureException(err, { tags: { area: 'chat', op: 'load_history' } })
      })
  }, [ tourId ])

  useEffect(() => {
    if (!tourId) return
    subRef.current = consumer.subscriptions.create(
      { channel: 'ChatChannel', tour_id: tourId },
      {
        received: (data) => {
          dispatch(data)
          if (shouldReloadPlanner(data)) {
            // Partial reload with preserveState so the chat transcript,
            // pendingToolCalls chips, and input text survive the re-fetch.
            router.reload({
              only: RELOAD_PROPS,
              preserveState: true,
              preserveScroll: true
            })
          }
        }
      }
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
    }).catch((err) => {
      Sentry.captureException(err, { tags: { area: 'chat', op: 'send_message' } })
      dispatch({ type: 'error', message: err.message })
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
