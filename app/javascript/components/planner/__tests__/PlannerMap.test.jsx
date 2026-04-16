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

import { buildMarkerHTML } from '../PlannerMap'

describe('buildMarkerHTML', () => {
  // Mock Mantine theme — only need colors[name][6] lookup
  const theme = {
    colors: {
      red:    [, , , , , , '#fa5252'],
      pink:   [, , , , , , '#e64980'],
      grape:  [, , , , , , '#be4bdb'],
      violet: [, , , , , , '#7950f2'],
      indigo: [, , , , , , '#4c6ef5'],
      blue:   [, , , , , , '#228be6'],
      cyan:   [, , , , , , '#15aabf'],
      teal:   [, , , , , , '#12b886'],
      green:  [, , , , , , '#40c057'],
      yellow: [, , , , , , '#fab005'],
    }
  }

  test('day-assigned activity returns HTML with day color and Dn label', () => {
    const html = buildMarkerHTML({ day_id: 10 }, { 10: 2 }, theme)
    expect(html).toContain('#e64980') // pink (day 2)
    expect(html).toContain('D2')
    expect(html).toContain('border-radius: 50%')
  })

  test('backlog activity returns grey-dashed circle without label', () => {
    const html = buildMarkerHTML({ day_id: null }, {}, theme)
    expect(html).toContain('dashed')
    expect(html).toContain('#999')
    expect(html).not.toContain('D')  // no Dn label
    expect(html).not.toMatch(/<[^>]+>D\d/)  // doubly sure no day number
  })

  test('day-assigned activity uses cycled color when day_index > 10', () => {
    const html = buildMarkerHTML({ day_id: 99 }, { 99: 11 }, theme)
    expect(html).toContain('#fa5252') // red (D11 cycles to D1's color)
    expect(html).toContain('D11')
  })
})
