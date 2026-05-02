import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('../replay', () => ({
  replay: vi.fn(),
}))
vi.mock('../queue', () => ({
  openOutbox: vi.fn(() => Promise.resolve({ __fake: true })),
}))

import { replay } from '../replay'
import { bindTriggers, unbindTriggers } from '../triggers'

beforeEach(() => {
  replay.mockClear()
})
afterEach(() => {
  unbindTriggers()
})

describe('triggers', () => {
  it('bindTriggers fires replay on online event', async () => {
    bindTriggers()
    window.dispatchEvent(new Event('online'))
    // replay 异步,等 microtask
    await new Promise(r => setImmediate(r))
    await Promise.resolve()
    expect(replay).toHaveBeenCalledTimes(2) // 1 from initial bind + 1 from online event
  })

  it('fires replay on visibilitychange when visible', async () => {
    bindTriggers()
    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true })
    document.dispatchEvent(new Event('visibilitychange'))
    await new Promise(r => setImmediate(r))
    await Promise.resolve()
    expect(replay).toHaveBeenCalledTimes(2) // 1 initial + 1 visibility
  })

  it('does NOT fire replay when document hidden', async () => {
    bindTriggers()
    Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true })
    document.dispatchEvent(new Event('visibilitychange'))
    await new Promise(r => setImmediate(r))
    await Promise.resolve()
    expect(replay).toHaveBeenCalledTimes(1) // only initial bind, hidden visibility skipped
  })

  it('unbindTriggers stops further triggers', async () => {
    bindTriggers()
    // 等 initial fire 完成再 unbind
    await new Promise(r => setImmediate(r))
    await Promise.resolve()
    replay.mockClear()
    unbindTriggers()
    window.dispatchEvent(new Event('online'))
    await new Promise(r => setImmediate(r))
    await Promise.resolve()
    expect(replay).not.toHaveBeenCalled()
  })

  it('triggerNow exposes manual replay', async () => {
    const { triggerNow } = await import('../triggers')
    triggerNow()
    await new Promise(r => setImmediate(r))
    await Promise.resolve()
    expect(replay).toHaveBeenCalledTimes(1)
  })
})
