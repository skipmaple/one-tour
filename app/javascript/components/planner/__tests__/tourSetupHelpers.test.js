import { describe, it, expect } from 'vitest'
import {
  formatDateISO,
  todayLocal,
  detectDateDaysConflict,
  parseTourDateRange,
} from '../tourSetupHelpers'

describe('formatDateISO', () => {
  it('returns YYYY-MM-DD for a Date', () => {
    // Use local-constructor so the timezone-independent assertion holds.
    expect(formatDateISO(new Date(2026, 4, 7))).toBe('2026-05-07')
  })

  it('passes an already-ISO string through unchanged', () => {
    expect(formatDateISO('2026-05-07')).toBe('2026-05-07')
  })

  it('returns null for null / invalid', () => {
    expect(formatDateISO(null)).toBeNull()
    expect(formatDateISO(new Date('invalid'))).toBeNull()
  })
})

describe('todayLocal', () => {
  it('returns a YYYY-MM-DD string matching the local calendar date', () => {
    const s = todayLocal()
    expect(s).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    const now = new Date()
    const expected = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
    expect(s).toBe(expected)
  })
})

describe('detectDateDaysConflict', () => {
  it('returns null when range or days are missing', () => {
    expect(detectDateDaysConflict(null, 5)).toBeNull()
    expect(detectDateDaysConflict([null, null], 5)).toBeNull()
    expect(detectDateDaysConflict([new Date(2026, 0, 1), null], 5)).toBeNull()
    expect(detectDateDaysConflict([new Date(2026, 0, 1), new Date(2026, 0, 5)], 0)).toBeNull()
  })

  it('returns null when range and days agree', () => {
    // 5 calendar days inclusive of both ends
    expect(detectDateDaysConflict([new Date(2026, 0, 1), new Date(2026, 0, 5)], 5)).toBeNull()
  })

  it('returns {implied, current} when they disagree', () => {
    expect(detectDateDaysConflict([new Date(2026, 0, 1), new Date(2026, 0, 5)], 3))
      .toEqual({ implied: 5, current: 3 })
  })
})

describe('parseTourDateRange', () => {
  it('returns [null, null] for null / empty', () => {
    expect(parseTourDateRange(null)).toEqual([null, null])
    expect(parseTourDateRange('')).toEqual([null, null])
  })

  it('parses the canonical "YYYY-MM-DD ~ YYYY-MM-DD" format', () => {
    const [a, b] = parseTourDateRange('2026-05-01 ~ 2026-05-07')
    expect(a).toBeInstanceOf(Date)
    expect(b).toBeInstanceOf(Date)
    expect(formatDateISO(a)).toBe('2026-05-01')
    expect(formatDateISO(b)).toBe('2026-05-07')
  })

  it('accepts em-dash / en-dash separators with surrounding spaces', () => {
    const [a, b] = parseTourDateRange('2026-05-01 — 2026-05-07')
    expect(formatDateISO(a)).toBe('2026-05-01')
    expect(formatDateISO(b)).toBe('2026-05-07')
  })

  it('does NOT split inside an ISO date on the bare dash (regression)', () => {
    // Previously the split regex `/[~\-–—]/` matched the dashes inside
    // `2026-05-01` and returned [null, null] for every well-formed range.
    const [a, b] = parseTourDateRange('2026-05-01 - 2026-05-07')
    expect(a).toBeInstanceOf(Date)
    expect(b).toBeInstanceOf(Date)
  })

  it('returns [null, null] for unparseable input', () => {
    expect(parseTourDateRange('garbage')).toEqual([null, null])
    expect(parseTourDateRange('2026-05-01')).toEqual([null, null])
  })
})
