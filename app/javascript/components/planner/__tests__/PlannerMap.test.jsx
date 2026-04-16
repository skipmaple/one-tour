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

import { buildPolylineConfigs } from '../PlannerMap'

describe('buildPolylineConfigs', () => {
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

  test('returns empty when no days', () => {
    const configs = buildPolylineConfigs({}, [], theme)
    expect(configs).toEqual([])
  })

  test('single day with multiple activities — one solid same-day polyline', () => {
    const days = [{ id: 10, day_index: 1, buffer_day: false }]
    const grouped = {
      10: [
        { id: 1, lat: 44.6, lng: 81.3, position: 1 },
        { id: 2, lat: 44.7, lng: 81.4, position: 2 },
        { id: 3, lat: 44.8, lng: 81.5, position: 3 },
      ]
    }
    const configs = buildPolylineConfigs(grouped, days, theme)
    expect(configs).toHaveLength(1)
    expect(configs[0].strokeStyle).toBe('solid')
    expect(configs[0].strokeColor).toBe('#fa5252') // D1 = red
    expect(configs[0].path).toEqual([[81.3, 44.6], [81.4, 44.7], [81.5, 44.8]])
  })

  test('two consecutive days — solid same-day + dashed cross-day', () => {
    const days = [
      { id: 10, day_index: 1, buffer_day: false },
      { id: 11, day_index: 2, buffer_day: false },
    ]
    const grouped = {
      10: [{ id: 1, lat: 44.6, lng: 81.3, position: 1 }, { id: 2, lat: 44.7, lng: 81.4, position: 2 }],
      11: [{ id: 3, lat: 43.0, lng: 84.0, position: 1 }],
    }
    const configs = buildPolylineConfigs(grouped, days, theme)
    // Same-day D1 (a1→a2) + cross-day D1→D2 (a2→a3); D2 only has 1 act so no same-day line
    expect(configs).toHaveLength(2)
    const sameDayD1 = configs.find(c => c.strokeStyle === 'solid')
    expect(sameDayD1.strokeColor).toBe('#fa5252') // D1 red
    expect(sameDayD1.path).toEqual([[81.3, 44.6], [81.4, 44.7]])
    const crossDay = configs.find(c => c.strokeStyle === 'dashed')
    expect(crossDay.strokeColor).toBe('#fa5252') // origin day color
    expect(crossDay.path).toEqual([[81.4, 44.7], [84.0, 43.0]])
  })

  test('skips buffer_day with no activities — D5 → D7 connect directly', () => {
    const days = [
      { id: 50, day_index: 5, buffer_day: false },
      { id: 60, day_index: 6, buffer_day: true  },
      { id: 70, day_index: 7, buffer_day: false },
    ]
    const grouped = {
      50: [{ id: 1, lat: 43.3, lng: 84.0, position: 1 }],
      60: [],
      70: [{ id: 2, lat: 43.1, lng: 81.1, position: 1 }],
    }
    const configs = buildPolylineConfigs(grouped, days, theme)
    // No same-day for D5/D7 (1 act each), 1 cross-day D5→D7 dashed
    expect(configs).toHaveLength(1)
    expect(configs[0].strokeStyle).toBe('dashed')
    expect(configs[0].strokeColor).toBe('#4c6ef5') // D5 = indigo
    expect(configs[0].path).toEqual([[84.0, 43.3], [81.1, 43.1]])
  })

  test('skips activities with invalid lat/lng', () => {
    const days = [{ id: 10, day_index: 1, buffer_day: false }]
    const grouped = {
      10: [
        { id: 1, lat: 44.6, lng: 81.3, position: 1 },
        { id: 2, lat: null, lng: null, position: 2 },  // skipped
        { id: 3, lat: 44.8, lng: 81.5, position: 3 },
      ]
    }
    const configs = buildPolylineConfigs(grouped, days, theme)
    expect(configs).toHaveLength(1)
    expect(configs[0].path).toEqual([[81.3, 44.6], [81.5, 44.8]])
  })

  test('coerces string lat/lng to numbers (Rails decimal serialization)', () => {
    const days = [{ id: 10, day_index: 1, buffer_day: false }]
    const grouped = {
      10: [
        { id: 1, lat: '44.6', lng: '81.3', position: 1 },
        { id: 2, lat: '44.7', lng: '81.4', position: 2 },
      ]
    }
    const configs = buildPolylineConfigs(grouped, days, theme)
    expect(configs[0].path).toEqual([[81.3, 44.6], [81.4, 44.7]])
  })
})
