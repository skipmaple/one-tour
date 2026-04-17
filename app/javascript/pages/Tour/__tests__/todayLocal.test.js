import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest'
import { todayLocal } from '../Constitution'

// We intentionally construct timestamps via `new Date(year, month, day, ...)`,
// which is defined to interpret its arguments as LOCAL time. That lets these
// tests run the same way regardless of the host machine's timezone: they
// assert that todayLocal reads local calendar fields, not UTC ones.
describe('todayLocal', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  test('returns the local calendar date as YYYY-MM-DD', () => {
    vi.setSystemTime(new Date(2026, 3, 18, 8, 0, 0)) // local April 18, 2026, 08:00
    expect(todayLocal()).toBe('2026-04-18')
  })

  test('pads month and day to two digits', () => {
    vi.setSystemTime(new Date(2026, 0, 5, 12, 0, 0)) // local Jan 5, 2026, noon
    expect(todayLocal()).toBe('2026-01-05')
  })

  test('returns an ISO-shaped string', () => {
    vi.setSystemTime(new Date(2026, 11, 31, 23, 59, 59)) // local Dec 31 2026
    expect(todayLocal()).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })

  test('differs from toISOString() slice at 00:00 local in east-of-UTC zones', () => {
    // Asserts the core behavior the helper exists to fix, but only meaningful
    // on hosts with a positive UTC offset (e.g. Asia/Shanghai, UTC+8).
    // Locally construct 2026-04-18 00:00:00 (midnight local). In UTC+8 the UTC
    // timestamp is 2026-04-17T16:00:00Z. toISOString().slice(0,10) would give
    // "2026-04-17"; todayLocal must give "2026-04-18".
    vi.setSystemTime(new Date(2026, 3, 18, 0, 0, 0))
    const offsetMinutes = new Date().getTimezoneOffset()
    if (offsetMinutes >= 0) {
      // UTC or west-of-UTC host: the UTC date doesn't lag the local date at
      // 00:00 local, so the pitfall doesn't manifest. Assert only that the
      // helper returns today's local date.
      expect(todayLocal()).toBe('2026-04-18')
    } else {
      // East-of-UTC host: UTC date IS one day earlier at 00:00 local, so
      // todayLocal must differ from `.toISOString().slice(0,10)`.
      const isoUtc = new Date().toISOString().slice(0, 10)
      expect(todayLocal()).toBe('2026-04-18')
      expect(isoUtc).toBe('2026-04-17')
    }
  })
})
