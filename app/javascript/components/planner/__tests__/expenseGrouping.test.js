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
const usersById = { 1: 'smoke@test.com', 2: 'skipmaple@gmail.com', 3: 'admin@example.com' }
const categoryLabels = { food: '吃饭', fuel: '加油', lodging: '住宿', ticket: '门票', refund: '退款', misc: '其他' }
const lookups = { activityById, dayById, usersById, categoryLabels }

const mk = (attrs) => ({
  id: Math.random(),
  amount_cents: 1000,
  category: 'food',
  split_strategy: 'equal',
  paid_by_id: 1,
  ...attrs,
})

describe('groupExpenses', () => {
  it('returns null for flat mode', () => {
    expect(groupExpenses([ mk({}) ], 'flat', lookups)).toBeNull()
  })

  describe('by_day', () => {
    it('groups activity-scope expenses under their activity\'s day', () => {
      const expenses = [
        mk({ activity_id: 101, amount_cents: 500 }),
        mk({ activity_id: 102, amount_cents: 300 }),
        mk({ activity_id: 201, amount_cents: 700 }),
      ]
      const groups = groupExpenses(expenses, 'by_day', lookups)
      expect(groups.map((g) => g.key)).toEqual([ 'day-10', 'day-20' ])
      expect(groups[0].expenses).toHaveLength(2)
      expect(groups[0].label).toBe('D1 · 海岸线')
      expect(groups[1].expenses).toHaveLength(1)
      expect(groups[1].label).toBe('D2')
    })

    it('puts day-scope expense in its own day bucket', () => {
      const expenses = [ mk({ day_id: 10, amount_cents: 400 }) ]
      const groups = groupExpenses(expenses, 'by_day', lookups)
      expect(groups).toHaveLength(1)
      expect(groups[0].key).toBe('day-10')
    })

    it('puts tour-scope expenses into 整程 bucket last', () => {
      const expenses = [
        mk({ activity_id: 101 }),
        mk({}), // tour-scope
      ]
      const groups = groupExpenses(expenses, 'by_day', lookups)
      expect(groups.map((g) => g.key)).toEqual([ 'day-10', 'tour' ])
      expect(groups[1].label).toBe('整程 / 出发前')
    })

    it('sorts days by day_index ascending', () => {
      const expenses = [
        mk({ day_id: 30 }),
        mk({ day_id: 10 }),
        mk({ day_id: 20 }),
      ]
      const groups = groupExpenses(expenses, 'by_day', lookups)
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
      const groups = groupExpenses(expenses, 'by_activity', lookups)
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
      const groups = groupExpenses(expenses, 'by_activity', lookups)
      expect(groups.map((g) => g.key)).toEqual([ 'act-101', 'day-10-all', 'act-201' ])
      expect(groups[1].label).toBe('D1 · 全天')
    })

    it('labels deleted activities gracefully', () => {
      const expenses = [ mk({ activity_id: 999 /* not in lookup */ }) ]
      const groups = groupExpenses(expenses, 'by_activity', { dayById })
      expect(groups[0].label).toBe('（已删除行）')
    })
  })

  describe('by_payer', () => {
    it('groups by paid_by_id and sorts by subtotal DESC', () => {
      const expenses = [
        mk({ paid_by_id: 1, amount_cents: 500 }),
        mk({ paid_by_id: 2, amount_cents: 2000 }),
        mk({ paid_by_id: 1, amount_cents: 300 }),
        mk({ paid_by_id: 3, amount_cents: 100 }),
      ]
      const groups = groupExpenses(expenses, 'by_payer', lookups)
      // user 2 subtotal=2000, user 1 subtotal=800, user 3 subtotal=100
      expect(groups.map((g) => g.key)).toEqual([ 'payer-2', 'payer-1', 'payer-3' ])
      expect(groups[0].label).toBe('skipmaple@gmail.com')
      expect(groups[0].expenses.reduce((s, e) => s + e.amount_cents, 0)).toBe(2000)
    })

    it('falls back to id label when user not in lookup', () => {
      const groups = groupExpenses([ mk({ paid_by_id: 999 }) ], 'by_payer', {})
      expect(groups[0].label).toBe('用户 999')
    })
  })

  describe('by_category', () => {
    it('groups by category and sorts by subtotal DESC', () => {
      const expenses = [
        mk({ category: 'food',    amount_cents: 5000 }),
        mk({ category: 'lodging', amount_cents: 20000 }),
        mk({ category: 'food',    amount_cents: 1000 }),
        mk({ category: 'fuel',    amount_cents: 500 }),
      ]
      const groups = groupExpenses(expenses, 'by_category', lookups)
      expect(groups.map((g) => g.key)).toEqual([ 'cat-lodging', 'cat-food', 'cat-fuel' ])
      expect(groups[0].label).toBe('住宿')
      expect(groups[1].label).toBe('吃饭')
    })

    it('falls back to raw category when label missing', () => {
      const groups = groupExpenses([ mk({ category: 'weird' }) ], 'by_category', {})
      expect(groups[0].label).toBe('weird')
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
