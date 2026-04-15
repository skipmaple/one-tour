import { describe, it, expect } from 'vitest'
import { reducer, INITIAL, shouldReloadPlanner, RELOAD_PROPS } from '../useChat'

describe('useChat reducer', () => {
  it('send_user appends user message + marks streaming', () => {
    const s = reducer(INITIAL, { type: 'send_user', content: 'Hi' })
    expect(s.messages).toEqual([ { role: 'user', content: 'Hi' } ])
    expect(s.streaming).toBe(true)
  })

  it('tool_call_start adds a pending tool call', () => {
    const s = reducer(INITIAL, { type: 'tool_call_start', id: 'tc1', name: 'search_poi', arguments: { q: 'x' } })
    expect(s.pendingToolCalls['tc1']).toEqual({ name: 'search_poi', arguments: { q: 'x' } })
  })

  it('tool_call_result attaches result to existing tool call', () => {
    let s = reducer(INITIAL, { type: 'tool_call_start', id: 'tc1', name: 'search_poi', arguments: {} })
    s = reducer(s, { type: 'tool_call_result', id: 'tc1', result: { ok: true } })
    expect(s.pendingToolCalls['tc1'].result).toEqual({ ok: true })
  })

  it('assistant_text appends to current assistant message', () => {
    let s = reducer(INITIAL, { type: 'assistant_text', delta: 'Hel' })
    s = reducer(s, { type: 'assistant_text', delta: 'lo' })
    expect(s.messages[s.messages.length - 1].content).toBe('Hello')
    expect(s.messages[s.messages.length - 1].role).toBe('assistant')
  })

  it('assistant_text does not merge into a user message', () => {
    let s = reducer(INITIAL, { type: 'send_user', content: 'Hi' })
    s = reducer(s, { type: 'assistant_text', delta: 'Resp' })
    expect(s.messages.length).toBe(2)
    expect(s.messages[1].role).toBe('assistant')
    expect(s.messages[1].content).toBe('Resp')
  })

  it('complete stops streaming', () => {
    const s = reducer({ ...INITIAL, streaming: true }, { type: 'complete' })
    expect(s.streaming).toBe(false)
  })

  it('error stops streaming + records message', () => {
    const s = reducer({ ...INITIAL, streaming: true }, { type: 'error', message: 'oops' })
    expect(s.streaming).toBe(false)
    expect(s.error).toBe('oops')
  })
})

describe('shouldReloadPlanner', () => {
  it('returns true for complete (end of a successful turn)', () => {
    expect(shouldReloadPlanner({ type: 'complete', content: 'ok' })).toBe(true)
  })

  it('returns true for error (partial work may have landed server-side)', () => {
    expect(shouldReloadPlanner({ type: 'error', message: 'oops' })).toBe(true)
  })

  it('returns false for mid-turn events that would thrash the server', () => {
    expect(shouldReloadPlanner({ type: 'tool_call_start' })).toBe(false)
    expect(shouldReloadPlanner({ type: 'tool_call_result' })).toBe(false)
    expect(shouldReloadPlanner({ type: 'assistant_text', delta: 'x' })).toBe(false)
  })

  it('returns false for unknown / malformed actions', () => {
    expect(shouldReloadPlanner(null)).toBe(false)
    expect(shouldReloadPlanner(undefined)).toBe(false)
    expect(shouldReloadPlanner({})).toBe(false)
    expect(shouldReloadPlanner({ type: 'bogus' })).toBe(false)
  })

  it('re-fetches exactly the planner-driven props (no more, no less)', () => {
    expect(RELOAD_PROPS).toEqual([ 'activities', 'days', 'violations' ])
  })
})
