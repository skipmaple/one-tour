import { describe, it, expect, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useSidebarCollapsed } from '../useSidebarCollapsed'

describe('useSidebarCollapsed', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('defaults to false when no localStorage value', () => {
    const { result } = renderHook(() => useSidebarCollapsed())
    expect(result.current.collapsed).toBe(false)
  })

  it('reads "1" from localStorage as collapsed=true', () => {
    localStorage.setItem('sidebar:collapsed', '1')
    const { result } = renderHook(() => useSidebarCollapsed())
    expect(result.current.collapsed).toBe(true)
  })

  it('toggle flips state and writes to localStorage', () => {
    const { result } = renderHook(() => useSidebarCollapsed())
    act(() => result.current.toggle())
    expect(result.current.collapsed).toBe(true)
    expect(localStorage.getItem('sidebar:collapsed')).toBe('1')
    act(() => result.current.toggle())
    expect(result.current.collapsed).toBe(false)
    expect(localStorage.getItem('sidebar:collapsed')).toBe('0')
  })
})
