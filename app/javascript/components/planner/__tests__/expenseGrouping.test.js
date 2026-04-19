import { describe, it, expect } from 'vitest'
import { groupExpenses, sumAmountCents } from '../expenseGrouping'

const day1 = { id: 10, day_index: 1, title: '海岸线' }
const day2 = { id: 20, day_index: 2, title: '' }
const day3 = { id: 30, day_index: 3, title: '返程' }

const act1a = { id: 101, day_id: 10, position: 1, name: '南麂岛' }
const act1b = { id: 102, day_id: 10, position: 2, name: '大沙岙' }
const act2a = { id: 201, day_id: 20, position: 1, name: '雁荡山' }

const dayById = Object.fromEntries([ day1, day2, day3 ].map((d) => [ d.id, d ]))
const activityById = Object.fromEntries([ act1a, act1b, act2a ].map((a) => [ a.id, a ]))

const mk = (attrs) => ({
  id: Math.random(),
  amount_cents: 1000,
  category: 'food',
  split_strategy: 'equal',
  ...attrs,
})

describe('groupExpenses', () => {
  it('returns null for flat mode', () => {
    expect(groupExpenses([ mk({}) ], 'flat', activityById, dayById)).toBeNull()
  })

  describe('by_day', () => {
    it('groups activity-scope expenses under their activity\'s day', () => {
      const expenses = [
        mk({ activity_id: 101, amount_cents: 500 }),
        mk({ activity_id: 102, amount_cents: 300 }),
        mk({ activity_id: 201, amount_cents: 700 }),
      ]
      const groups = groupExpenses(expenses, 'by_day', activityById, dayById)
      expect(groups.map((g) => g.key)).toEqual([ 'day-10', 'day-20' ])
      expect(groups[0].expenses).toHaveLength(2)
      expect(groups[0].label).toBe('D1 · 海岸线')
      expect(groups[1].expenses).toHaveLength(1)
      expect(groups[1].label).toBe('D2')
    })

    it('puts day-scope expense in its own day bucket', () => {
      const expenses = [ mk({ day_id: 10, amount_cents: 400 }) ]
      const groups = groupExpenses(expenses, 'by_day', activityById, dayById)
      expect(groups).toHaveLength(1)
      expect(groups[0].key).toBe('day-10')
    })

    it('puts tour-scope expenses into 整程 bucket last', () => {
      const expenses = [
        mk({ activity_id: 101 }),
        mk({}), // tour-scope
      ]
      const groups = groupExpenses(expenses, 'by_day', activityById, dayById)
      expect(groups.map((g) => g.key)).toEqual([ 'day-10', 'tour' ])
      expect(groups[1].label).toBe('整程 / 出发前')
    })

    it('sorts days by day_index ascending', () => {
      const expenses = [
        mk({ day_id: 30 }),
        mk({ day_id: 10 }),
        mk({ day_id: 20 }),
      ]
      const groups = groupExpenses(expenses, 'by_day', activityById, dayById)
      expect(groups.map((g) => g.key)).toEqual([ 'day-10', 'day-20', 'day-30' ])
    })
  })

  describe('by_activity', () => {
    it('groups activity-scope by activity, ordered by day/position', () => {
      const expenses = [
        mk({ activity_id: 201 }),
        mk({ activity_id: 102 }),
        mk({ activity_id: 101, amount_cents: 500 }),
        mk({ activity_id: 101, amount_cents: 300 }),
      ]
      const groups = groupExpenses(expenses, 'by_activity', activityById, dayById)
      expect(groups.map((g) => g.key)).toEqual([ 'act-101', 'act-102', 'act-201' ])
      expect(groups[0].expenses).toHaveLength(2)
      expect(groups[0].label).toBe('南麂岛')
    })

    it('puts day-scope expenses in per-day 全天 buckets after that day\'s activities', () => {
      const expenses = [
        mk({ activity_id: 101 }),       // act-101 (D1 position 1)
        mk({ day_id: 10 }),             // D1 全天
        mk({ activity_id: 201 }),       // act-201 (D2 position 1)
      ]
      const groups = groupExpenses(expenses, 'by_activity', activityById, dayById)
      expect(groups.map((g) => g.key)).toEqual([ 'act-101', 'day-10-all', 'act-201' ])
      expect(groups[1].label).toBe('D1 · 全天')
    })

    it('labels deleted activities gracefully', () => {
      const expenses = [ mk({ activity_id: 999 /* not in lookup */ }) ]
      const groups = groupExpenses(expenses, 'by_activity', {}, dayById)
      expect(groups[0].label).toBe('（已删除行）')
    })
  })
})

describe('sumAmountCents', () => {
  it('sums expenses including refunds', () => {
    expect(sumAmountCents([
      { amount_cents: 500 },
      { amount_cents: -200 },
      { amount_cents: 300 },
    ])).toBe(600)
  })

  it('returns 0 for empty input', () => {
    expect(sumAmountCents([])).toBe(0)
  })

  it('tolerates missing amount_cents', () => {
    expect(sumAmountCents([ {}, { amount_cents: 100 } ])).toBe(100)
  })
})
