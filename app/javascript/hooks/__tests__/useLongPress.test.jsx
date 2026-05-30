import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook } from '@testing-library/react'
import useLongPress from '../useLongPress'

const touch = (x = 10, y = 10) => ({ pointerType: 'touch', clientX: x, clientY: y })

describe('useLongPress', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  test('fires onLongPress with start coords after the delay on a still touch hold', () => {
    const cb = vi.fn()
    const { result } = renderHook(() => useLongPress(cb, { delay: 500 }))
    result.current.onPointerDown(touch(10, 20))
    expect(cb).not.toHaveBeenCalled()
    vi.advanceTimersByTime(500)
    expect(cb).toHaveBeenCalledWith(10, 20)
    expect(result.current.firedRef.current).toBe(true)
  })

  test('cancels when the finger moves beyond tolerance (becomes a drag/scroll)', () => {
    const cb = vi.fn()
    const { result } = renderHook(() => useLongPress(cb, { delay: 500, moveTolerance: 8 }))
    result.current.onPointerDown(touch(10, 10))
    result.current.onPointerMove(touch(30, 10)) // 20px > 8px tolerance
    vi.advanceTimersByTime(500)
    expect(cb).not.toHaveBeenCalled()
  })

  test('cancels on early pointer up', () => {
    const cb = vi.fn()
    const { result } = renderHook(() => useLongPress(cb, { delay: 500 }))
    result.current.onPointerDown(touch())
    result.current.onPointerUp()
    vi.advanceTimersByTime(500)
    expect(cb).not.toHaveBeenCalled()
  })

  test('ignores mouse pointers (mouse uses right-click instead)', () => {
    const cb = vi.fn()
    const { result } = renderHook(() => useLongPress(cb, { delay: 500 }))
    result.current.onPointerDown({ pointerType: 'mouse', clientX: 5, clientY: 5 })
    vi.advanceTimersByTime(500)
    expect(cb).not.toHaveBeenCalled()
  })

  test('a second pointer down cancels the first in-flight timer (no double fire)', () => {
    const cb = vi.fn()
    const { result } = renderHook(() => useLongPress(cb, { delay: 500 }))
    result.current.onPointerDown(touch(10, 10))
    vi.advanceTimersByTime(200) // first timer mid-flight
    result.current.onPointerDown(touch(50, 60)) // restarts; first must be cleared
    vi.advanceTimersByTime(300) // 200+300=500 total — first would fire here if it leaked
    expect(cb).not.toHaveBeenCalled()
    vi.advanceTimersByTime(200) // second reaches its own 500ms
    expect(cb).toHaveBeenCalledTimes(1)
    expect(cb).toHaveBeenCalledWith(50, 60)
  })
})
