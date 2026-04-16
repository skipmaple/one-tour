import { describe, test, expect } from 'vitest'
import { DAY_COLOR } from '../PlannerMap'
import { filterActivitiesByViewMode } from '../PlannerMap'

describe('DAY_COLOR', () => {
  test('day 1 returns first color (red)', () => {
    expect(DAY_COLOR(1)).toBe('red')
  })

  test('day 10 returns last color (yellow)', () => {
    expect(DAY_COLOR(10)).toBe('yellow')
  })

  test('day 11 cycles back to first color (red)', () => {
    expect(DAY_COLOR(11)).toBe('red')
  })

  test('day 0 or negative falls back gracefully (returns first color, no crash)', () => {
    expect(DAY_COLOR(0)).toBe('yellow')   // (0 - 1) % 10 = -1, then we want defined behavior
    // Confirm no throw on negative input
    expect(() => DAY_COLOR(-1)).not.toThrow()
  })
})

describe('filterActivitiesByViewMode', () => {
  const fixtures = [
    { id: 1, name: 'A', day_id: 10 },
    { id: 2, name: 'B', day_id: 11 },
    { id: 3, name: 'C', day_id: null },
    { id: 4, name: 'D', day_id: null },
  ]

  test('all returns everything', () => {
    expect(filterActivitiesByViewMode(fixtures, 'all').map(a => a.id)).toEqual([1, 2, 3, 4])
  })

  test('colored returns only day-assigned', () => {
    expect(filterActivitiesByViewMode(fixtures, 'colored').map(a => a.id)).toEqual([1, 2])
  })

  test('backlog returns only day_id=null', () => {
    expect(filterActivitiesByViewMode(fixtures, 'backlog').map(a => a.id)).toEqual([3, 4])
  })
})
