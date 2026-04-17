import { renderHook, act } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import useUndoToast from '../useUndoToast'

describe('useUndoToast', () => {
  it('starts with no toast', () => {
    const { result } = renderHook(() => useUndoToast())
    expect(result.current.toast).toBeNull()
  })

  it('show() sets toast', () => {
    const { result } = renderHook(() => useUndoToast())
    act(() => result.current.show({ message: 'Saved', undo: () => {} }))
    expect(result.current.toast.message).toBe('Saved')
  })

  it('dismiss() clears toast', () => {
    const { result } = renderHook(() => useUndoToast())
    act(() => result.current.show({ message: 'x' }))
    act(() => result.current.dismiss())
    expect(result.current.toast).toBeNull()
  })

  it('handleUndo invokes undo + clears', () => {
    const { result } = renderHook(() => useUndoToast())
    const undoFn = vi.fn()
    act(() => result.current.show({ message: 'x', undo: undoFn }))
    act(() => result.current.handleUndo())
    expect(undoFn).toHaveBeenCalledTimes(1)
    expect(result.current.toast).toBeNull()
  })
})
