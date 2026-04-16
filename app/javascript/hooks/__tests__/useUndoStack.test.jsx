import { describe, test, expect, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { MantineProvider } from '@mantine/core'
import { Notifications } from '@mantine/notifications'
import { UndoStackProvider, useUndoStack, UNDO_CAP } from '../useUndoStack'

// Mantine notifications uses portals; need full provider tree
function wrapper({ children }) {
  return (
    <MantineProvider>
      <Notifications />
      <UndoStackProvider>{children}</UndoStackProvider>
    </MantineProvider>
  )
}

describe('useUndoStack', () => {
  test('push appends entry to stack', () => {
    const { result } = renderHook(() => useUndoStack(), { wrapper })
    act(() => {
      result.current.push({ label: 'A', undoFn: () => Promise.resolve() })
    })
    expect(result.current.stack).toHaveLength(1)
    expect(result.current.stack[0].label).toBe('A')
  })

  test('cap=10: pushing 11th shifts oldest out', () => {
    const { result } = renderHook(() => useUndoStack(), { wrapper })
    act(() => {
      for (let i = 0; i < 11; i++) {
        result.current.push({ label: `entry-${i}`, undoFn: () => Promise.resolve() })
      }
    })
    expect(result.current.stack).toHaveLength(UNDO_CAP)
    expect(result.current.stack[0].label).toBe('entry-1') // oldest dropped
    expect(result.current.stack[UNDO_CAP - 1].label).toBe('entry-10')
  })

  test('UNDO_CAP equals 10', () => {
    expect(UNDO_CAP).toBe(10)
  })

  test('executeTop pops top and calls undoFn', async () => {
    const undoFn = vi.fn(() => Promise.resolve())
    const { result } = renderHook(() => useUndoStack(), { wrapper })
    act(() => {
      result.current.push({ label: 'A', undoFn })
    })
    await act(async () => {
      await result.current.executeTop()
    })
    expect(undoFn).toHaveBeenCalledOnce()
    expect(result.current.stack).toHaveLength(0)
  })

  test('executeTop is no-op on empty stack', async () => {
    const { result } = renderHook(() => useUndoStack(), { wrapper })
    await act(async () => {
      const ret = await result.current.executeTop()
      expect(ret).toBeUndefined()
    })
    expect(result.current.stack).toHaveLength(0)
  })

  test('Cmd+Z keydown triggers executeTop on the top entry', async () => {
    const undoFn = vi.fn(() => Promise.resolve())
    const { result } = renderHook(() => useUndoStack(), { wrapper })
    act(() => {
      result.current.push({ label: 'A', undoFn })
    })
    await act(async () => {
      const event = new KeyboardEvent('keydown', { key: 'z', metaKey: true, bubbles: true, cancelable: true })
      window.dispatchEvent(event)
      await new Promise(r => setTimeout(r, 0))
    })
    expect(undoFn).toHaveBeenCalledOnce()
  })

  test('Cmd+Z is ignored when focus is in a textarea', async () => {
    const undoFn = vi.fn(() => Promise.resolve())
    const { result } = renderHook(() => useUndoStack(), { wrapper })
    act(() => {
      result.current.push({ label: 'A', undoFn })
    })
    const ta = document.createElement('textarea')
    document.body.appendChild(ta)
    ta.focus()
    await act(async () => {
      const event = new KeyboardEvent('keydown', { key: 'z', metaKey: true, bubbles: true, cancelable: true })
      ta.dispatchEvent(event)
      await new Promise(r => setTimeout(r, 0))
    })
    expect(undoFn).not.toHaveBeenCalled()
    document.body.removeChild(ta)
  })
})
