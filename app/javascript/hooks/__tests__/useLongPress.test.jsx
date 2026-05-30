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
})
