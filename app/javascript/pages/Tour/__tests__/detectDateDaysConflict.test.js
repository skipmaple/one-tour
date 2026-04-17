import { describe, test, expect } from 'vitest'
import { detectDateDaysConflict } from '../Constitution'

describe('detectDateDaysConflict', () => {
  test('returns null when range is empty', () => {
    expect(detectDateDaysConflict([null, null], 5)).toBeNull()
    expect(detectDateDaysConflict(null, 5)).toBeNull()
    expect(detectDateDaysConflict(undefined, 5)).toBeNull()
  })

  test('returns null when range is half-selected', () => {
    expect(detectDateDaysConflict(['2026-04-20', null], 5)).toBeNull()
    expect(detectDateDaysConflict([null, '2026-04-24'], 5)).toBeNull()
  })

  test('returns null when days is missing or zero', () => {
    expect(detectDateDaysConflict(['2026-04-20', '2026-04-24'], null)).toBeNull()
    expect(detectDateDaysConflict(['2026-04-20', '2026-04-24'], 0)).toBeNull()
    expect(detectDateDaysConflict(['2026-04-20', '2026-04-24'], undefined)).toBeNull()
  })

  test('returns null when days matches the implied range length', () => {
    // Apr 20 -> Apr 24 inclusive = 5 days
    expect(detectDateDaysConflict(['2026-04-20', '2026-04-24'], 5)).toBeNull()
    // Single day
    expect(detectDateDaysConflict(['2026-04-20', '2026-04-20'], 1)).toBeNull()
  })

  test('returns implied/current when they differ', () => {
    // Apr 20 -> May 3 inclusive = 14 days, user has days = 5
    expect(
      detectDateDaysConflict(['2026-04-20', '2026-05-03'], 5)
    ).toEqual({ implied: 14, current: 5 })
  })

  test('accepts Date objects as well as ISO strings', () => {
    const start = new Date(2026, 3, 20) // April = month 3 (0-indexed)
    const end = new Date(2026, 4, 3)    // May = month 4
    expect(
      detectDateDaysConflict([start, end], 5)
    ).toEqual({ implied: 14, current: 5 })
  })

  test('returns null for invalid date strings', () => {
    expect(detectDateDaysConflict(['not-a-date', '2026-04-24'], 5)).toBeNull()
    expect(detectDateDaysConflict(['2026-04-20', 'nonsense'], 5)).toBeNull()
  })
})
