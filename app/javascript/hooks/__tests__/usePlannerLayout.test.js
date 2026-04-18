import { describe, test, expect, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import usePlannerLayout, { DEFAULT_LAYOUT } from '../usePlannerLayout'

beforeEach(() => {
  window.localStorage.clear()
})

describe('usePlannerLayout · defaults & persistence', () => {
  test('returns DEFAULT_LAYOUT when no localStorage entry exists', () => {
    const { result } = renderHook(() => usePlannerLayout(42))
    expect(result.current.panels).toEqual(DEFAULT_LAYOUT)
  })

  test('DEFAULT_LAYOUT matches spec (2:5:5:2, all open, autoFit on)', () => {
    expect(DEFAULT_LAYOUT).toEqual({
      candidates: { open: true, grow: 2 },
      days:       { open: true, grow: 5, autoFit: true },
      map:        { open: true, grow: 5 },
      ai:         { open: true, grow: 2 },
    })
  })

  test('reads saved state from localStorage on mount', () => {
    const saved = {
      candidates: { open: false, grow: 3 },
      days:       { open: true,  grow: 4, autoFit: false },
      map:        { open: true,  grow: 6 },
      ai:         { open: true,  grow: 1 },
    }
    window.localStorage.setItem('planner-layout-v1-42', JSON.stringify(saved))
    const { result } = renderHook(() => usePlannerLayout(42))
    expect(result.current.panels).toEqual(saved)
  })

  test('falls back to default on corrupted localStorage', () => {
    window.localStorage.setItem('planner-layout-v1-42', '{not-json')
    const { result } = renderHook(() => usePlannerLayout(42))
    expect(result.current.panels).toEqual(DEFAULT_LAYOUT)
  })

  test('uses tourId in localStorage key (per-tour isolation)', () => {
    const { result: r42 } = renderHook(() => usePlannerLayout(42))
    act(() => r42.current.togglePanel('candidates'))
    expect(window.localStorage.getItem('planner-layout-v1-42')).toContain('"open":false')
    expect(window.localStorage.getItem('planner-layout-v1-99')).toBeNull()
  })
})
