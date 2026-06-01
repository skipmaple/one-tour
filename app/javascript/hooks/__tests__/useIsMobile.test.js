import { renderHook } from '@testing-library/react'
import { describe, it, expect, afterEach } from 'vitest'
import { useIsMobile, MOBILE_BREAKPOINT } from '../useIsMobile'

function setViewport(matches) {
  window.matchMedia = (query) => ({
    matches, media: query, onchange: null,
    addListener() {}, removeListener() {},
    addEventListener() {}, removeEventListener() {}, dispatchEvent() { return true },
  })
}

describe('useIsMobile', () => {
  afterEach(() => setViewport(false)) // restore the global setup.js default

  it('true when the mobile media query matches', () => {
    setViewport(true)
    const { result } = renderHook(() => useIsMobile())
    expect(result.current).toBe(true)
  })

  it('false on desktop', () => {
    setViewport(false)
    const { result } = renderHook(() => useIsMobile())
    expect(result.current).toBe(false)
  })

  it('breakpoint is 768', () => {
    expect(MOBILE_BREAKPOINT).toBe(768)
  })
})
