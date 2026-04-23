import { renderHook, waitFor } from '@testing-library/react'
import { vi, beforeEach } from 'vitest'
import useAmapDirection from '../useAmapDirection'

global.fetch = vi.fn()

beforeEach(() => { global.fetch.mockReset() })

describe('useAmapDirection', () => {
  it('returns null state initially', () => {
    const { result } = renderHook(() => useAmapDirection(null))
    expect(result.current).toEqual({ status: 'idle', data: null, error: null })
  })

  it('fetches when all four coords present', async () => {
    global.fetch.mockResolvedValue({
      ok: true,
      json: async () => ({ distance_m: 120000, duration_s: 9000 })
    })
    const { result } = renderHook(() =>
      useAmapDirection({ from: { lat: 42.9, lng: 83.5 }, to: { lat: 44.0, lng: 84.7 } })
    )
    await waitFor(() => expect(result.current.status).toBe('ready'))
    expect(result.current.data).toEqual({ distance_m: 120000, duration_s: 9000 })
  })

  it('returns error on 502', async () => {
    global.fetch.mockResolvedValue({ ok: false, status: 502 })
    const { result } = renderHook(() =>
      useAmapDirection({ from: { lat: 1, lng: 1 }, to: { lat: 2, lng: 2 } })
    )
    await waitFor(() => expect(result.current.status).toBe('error'))
  })
})
