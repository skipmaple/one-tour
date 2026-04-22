import { describe, it, expect } from 'vitest'
import { renderHook } from '@testing-library/react'
import { useActivityFilterCore } from '../useActivityFilter'

const tour = { authorId: 1, memberIds: [2, 3] } // tour members = [1, 2, 3]

const activities = [
  { id: 10, name: '赛里木湖', kind: 'scenic', details: { ticket_info: 80, note: '日出很美' }, participant_user_ids: [] },
  { id: 11, name: '早餐',     kind: 'food',   details: { price_pp: 30 },                       participant_user_ids: [2] },
  { id: 12, name: '独库公路', kind: 'road',   details: { km: 200 },                            participant_user_ids: [1, 2] },
  { id: 13, name: 'Hotel A',  kind: 'stay',   details: { note: 'good view' },                  participant_user_ids: [3] },
]

describe('useActivityFilterCore', () => {
  it('empty filter — all activities match', () => {
    const { result } = renderHook(() =>
      useActivityFilterCore({ activities, filter: { q: '', kind: [], uids: [] }, tour })
    )
    expect(activities.every(a => result.current.matches(a))).toBe(true)
    expect(result.current.active).toBe(false)
    expect(result.current.activeCount).toBe(4)
    expect(result.current.totalCount).toBe(4)
  })

  it('q matches name (substring, case-insensitive)', () => {
    const { result } = renderHook(() =>
      useActivityFilterCore({ activities, filter: { q: '赛里木', kind: [], uids: [] }, tour })
    )
    expect(result.current.matches(activities[0])).toBe(true)
    expect(result.current.matches(activities[1])).toBe(false)
  })

  it('q matches details string values (recursive)', () => {
    const { result } = renderHook(() =>
      useActivityFilterCore({ activities, filter: { q: '日出', kind: [], uids: [] }, tour })
    )
    expect(result.current.matches(activities[0])).toBe(true)
    expect(result.current.matches(activities[1])).toBe(false)
  })

  it('q ignores non-string details values (numbers, null)', () => {
    const { result } = renderHook(() =>
      useActivityFilterCore({ activities, filter: { q: '200', kind: [], uids: [] }, tour })
    )
    // details.km = 200 (number) — should NOT match
    expect(result.current.matches(activities[2])).toBe(false)
  })

  it('q case-insensitive on English', () => {
    const { result } = renderHook(() =>
      useActivityFilterCore({ activities, filter: { q: 'HOTEL', kind: [], uids: [] }, tour })
    )
    expect(result.current.matches(activities[3])).toBe(true)
  })

  it('q is trimmed; empty after trim = no filter', () => {
    const { result } = renderHook(() =>
      useActivityFilterCore({ activities, filter: { q: '   ', kind: [], uids: [] }, tour })
    )
    expect(activities.every(a => result.current.matches(a))).toBe(true)
    expect(result.current.active).toBe(false)
  })

  it('kind filter — single value', () => {
    const { result } = renderHook(() =>
      useActivityFilterCore({ activities, filter: { q: '', kind: ['food'], uids: [] }, tour })
    )
    expect(result.current.matches(activities[1])).toBe(true)
    expect(result.current.matches(activities[0])).toBe(false)
  })

  it('kind filter — multi value OR', () => {
    const { result } = renderHook(() =>
      useActivityFilterCore({ activities, filter: { q: '', kind: ['food', 'stay'], uids: [] }, tour })
    )
    expect(result.current.matches(activities[1])).toBe(true) // food
    expect(result.current.matches(activities[3])).toBe(true) // stay
    expect(result.current.matches(activities[0])).toBe(false) // scenic
  })

  it('uids — explicit participants intersection', () => {
    const { result } = renderHook(() =>
      useActivityFilterCore({ activities, filter: { q: '', kind: [], uids: [3] }, tour })
    )
    expect(result.current.matches(activities[3])).toBe(true)  // [3] ∩ {3} ≠ ∅
    expect(result.current.matches(activities[1])).toBe(false) // [3] ∩ {2} = ∅
  })

  it('uids — empty participants means all members (matches if any selected uid is a member)', () => {
    const { result } = renderHook(() =>
      useActivityFilterCore({ activities, filter: { q: '', kind: [], uids: [2] }, tour })
    )
    // activities[0].participant_user_ids = [] → treat as {1,2,3}; [2] ∩ {1,2,3} ≠ ∅ → match
    expect(result.current.matches(activities[0])).toBe(true)
  })

  it('uids — non-existent user_id is ignored', () => {
    const { result } = renderHook(() =>
      useActivityFilterCore({ activities, filter: { q: '', kind: [], uids: [999] }, tour })
    )
    // 999 is not a member; effective uids = [] → dimension inactive → all match
    expect(activities.every(a => result.current.matches(a))).toBe(true)
    expect(result.current.active).toBe(false)
  })

  it('uids — mixed valid + invalid', () => {
    const { result } = renderHook(() =>
      useActivityFilterCore({ activities, filter: { q: '', kind: [], uids: [2, 999] }, tour })
    )
    // effective uids = [2]
    expect(result.current.matches(activities[1])).toBe(true)  // [2] ∩ {2}
    expect(result.current.matches(activities[3])).toBe(false) // [2] ∩ {3} = ∅
  })

  it('AND across dimensions', () => {
    const { result } = renderHook(() =>
      useActivityFilterCore({ activities, filter: { q: '早', kind: ['food'], uids: [2] }, tour })
    )
    expect(result.current.matches(activities[1])).toBe(true) // '早餐' ∧ food ∧ uid=2
    expect(result.current.matches(activities[0])).toBe(false) // kind mismatch
    expect(result.current.matches(activities[2])).toBe(false) // q mismatch
  })

  it('activeCount reflects filtered total', () => {
    const { result } = renderHook(() =>
      useActivityFilterCore({ activities, filter: { q: '', kind: ['food'], uids: [] }, tour })
    )
    expect(result.current.activeCount).toBe(1)
    expect(result.current.totalCount).toBe(4)
    expect(result.current.active).toBe(true)
  })

  it('handles activity with null details without crashing', () => {
    const activitiesWithNull = [
      { id: 20, name: 'Blank', kind: 'other', details: null, participant_user_ids: [] },
    ]
    const { result } = renderHook(() =>
      useActivityFilterCore({ activities: activitiesWithNull, filter: { q: 'Blank', kind: [], uids: [] }, tour })
    )
    expect(result.current.matches(activitiesWithNull[0])).toBe(true)
  })

  it('q can match activity.name alone even with no details match', () => {
    const { result } = renderHook(() =>
      useActivityFilterCore({ activities, filter: { q: 'Hotel', kind: [], uids: [] }, tour })
    )
    // activities[3] name='Hotel A', details.note='good view' — 'Hotel' is in name only
    expect(result.current.matches(activities[3])).toBe(true)
    expect(result.current.matches(activities[0])).toBe(false) // other activities don't have 'Hotel' anywhere
  })
})
