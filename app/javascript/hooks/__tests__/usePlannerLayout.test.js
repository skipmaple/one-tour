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

describe('usePlannerLayout · togglePanel + at-least-one-open', () => {
  test('togglePanel flips open state', () => {
    const { result } = renderHook(() => usePlannerLayout(42))
    expect(result.current.panels.candidates.open).toBe(true)
    act(() => result.current.togglePanel('candidates'))
    expect(result.current.panels.candidates.open).toBe(false)
    act(() => result.current.togglePanel('candidates'))
    expect(result.current.panels.candidates.open).toBe(true)
  })

  test('openCount derived correctly', () => {
    const { result } = renderHook(() => usePlannerLayout(42))
    expect(result.current.openCount).toBe(4)
    act(() => result.current.togglePanel('candidates'))
    expect(result.current.openCount).toBe(3)
  })

  test('cannot close last open panel (at-least-one-open)', () => {
    const { result } = renderHook(() => usePlannerLayout(42))
    act(() => result.current.togglePanel('candidates'))
    act(() => result.current.togglePanel('days'))
    act(() => result.current.togglePanel('ai'))
    expect(result.current.openCount).toBe(1)
    expect(result.current.panels.map.open).toBe(true)
    // Try to close the last one — should be no-op
    act(() => result.current.togglePanel('map'))
    expect(result.current.panels.map.open).toBe(true)
    expect(result.current.openCount).toBe(1)
  })
})

describe('usePlannerLayout · resizeBetween + autoFit', () => {
  test('resizeBetween conserves grow sum between two panels', () => {
    const { result } = renderHook(() => usePlannerLayout(42))
    const before = result.current.panels.days.grow + result.current.panels.map.grow
    act(() => result.current.resizeBetween('days', 'map', 50, 1000))
    const after = result.current.panels.days.grow + result.current.panels.map.grow
    expect(after).toBeCloseTo(before, 5)
    expect(result.current.panels.days.grow).toBeGreaterThan(5) // shifted right
    expect(result.current.panels.map.grow).toBeLessThan(5)
  })

  test('resizeBetween days↔map auto-disables autoFit', () => {
    const { result } = renderHook(() => usePlannerLayout(42))
    expect(result.current.panels.days.autoFit).toBe(true)
    act(() => result.current.resizeBetween('days', 'map', 30, 1000))
    expect(result.current.panels.days.autoFit).toBe(false)
  })

  test('resizeBetween candidates↔days does NOT touch autoFit', () => {
    const { result } = renderHook(() => usePlannerLayout(42))
    act(() => result.current.resizeBetween('candidates', 'days', 30, 1000))
    expect(result.current.panels.days.autoFit).toBe(true)
  })

  test('toggleAutoFit flips days.autoFit', () => {
    const { result } = renderHook(() => usePlannerLayout(42))
    expect(result.current.panels.days.autoFit).toBe(true)
    act(() => result.current.toggleAutoFit())
    expect(result.current.panels.days.autoFit).toBe(false)
    act(() => result.current.toggleAutoFit())
    expect(result.current.panels.days.autoFit).toBe(true)
  })

  test('resizeBetween clamps so neither side goes below MIN_GROW', () => {
    const { result } = renderHook(() => usePlannerLayout(42))
    // Push hard right — map grow should not go below 0.5 (MIN_GROW guard)
    act(() => result.current.resizeBetween('days', 'map', 9999, 1000))
    expect(result.current.panels.map.grow).toBeGreaterThanOrEqual(0.5)
    // And total still conserved
    const total = result.current.panels.days.grow + result.current.panels.map.grow
    expect(total).toBeCloseTo(10, 5)
  })
})
