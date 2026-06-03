import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useActivityFilterCore } from '../useActivityFilter'

vi.mock('@inertiajs/react', () => ({
  router: { replace: vi.fn() },
  usePage: vi.fn(() => ({ url: '/tours/42' })),
}))

import { router, usePage } from '@inertiajs/react'

// Dynamic import after mock is registered — needed because useActivityFilter
// (Task 3) reads from @inertiajs/react at import time.
const { useActivityFilter } = await import('../useActivityFilter')

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

  it('status filter — single + multi (OR)', () => {
    const acts = [
      { id: 1, name: 'a', kind: 'scenic', status: 'confirmed', details: {}, participant_user_ids: [] },
      { id: 2, name: 'b', kind: 'scenic', status: 'pending',   details: {}, participant_user_ids: [] },
      { id: 3, name: 'c', kind: 'scenic', status: 'closed',    details: {}, participant_user_ids: [] },
    ]
    const { result } = renderHook(() =>
      useActivityFilterCore({ activities: acts, filter: { q: '', kind: [], uids: [], status: ['pending', 'closed'] }, tour })
    )
    expect(result.current.matches(acts[0])).toBe(false)
    expect(result.current.matches(acts[1])).toBe(true)
    expect(result.current.matches(acts[2])).toBe(true)
    expect(result.current.active).toBe(true)
  })

  it('levels filter — citizen_level OR', () => {
    const acts = [
      { id: 1, name: 'a', kind: 'scenic', citizen_level: 'tier_one',   details: {}, participant_user_ids: [] },
      { id: 2, name: 'b', kind: 'scenic', citizen_level: 'tier_three', details: {}, participant_user_ids: [] },
    ]
    const { result } = renderHook(() =>
      useActivityFilterCore({ activities: acts, filter: { q: '', kind: [], uids: [], levels: ['tier_one'] }, tour })
    )
    expect(result.current.matches(acts[0])).toBe(true)
    expect(result.current.matches(acts[1])).toBe(false)
    expect(result.current.active).toBe(true)
  })

  it('reserve filter — only need_reservation; missing/false details excluded', () => {
    const acts = [
      { id: 1, name: 'a', kind: 'scenic', details: { need_reservation: true },  participant_user_ids: [] },
      { id: 2, name: 'b', kind: 'scenic', details: { need_reservation: false }, participant_user_ids: [] },
      { id: 3, name: 'c', kind: 'scenic', details: null,                         participant_user_ids: [] },
    ]
    const { result } = renderHook(() =>
      useActivityFilterCore({ activities: acts, filter: { q: '', kind: [], uids: [], reserve: true }, tour })
    )
    expect(result.current.matches(acts[0])).toBe(true)
    expect(result.current.matches(acts[1])).toBe(false)
    expect(result.current.matches(acts[2])).toBe(false)
    expect(result.current.active).toBe(true)
  })

  it('AND across new + existing dimensions', () => {
    const acts = [
      { id: 1, name: '湖', kind: 'scenic', status: 'pending',   citizen_level: 'tier_one', details: { need_reservation: true }, participant_user_ids: [] },
      { id: 2, name: '湖', kind: 'scenic', status: 'confirmed', citizen_level: 'tier_one', details: { need_reservation: true }, participant_user_ids: [] },
    ]
    const { result } = renderHook(() =>
      useActivityFilterCore({ activities: acts, filter: { q: '', kind: ['scenic'], uids: [], status: ['pending'], levels: ['tier_one'], reserve: true }, tour })
    )
    expect(result.current.matches(acts[0])).toBe(true)
    expect(result.current.matches(acts[1])).toBe(false)
  })
})

describe('useActivityFilter · URL sync', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
    usePage.mockReturnValue({ url: '/tours/42' })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('reads initial filter from URL params', () => {
    usePage.mockReturnValue({ url: '/tours/42?q=%E9%A4%90&kind=food,stay&uids=2,3' })
    const { result } = renderHook(() => useActivityFilter({ activities, tour }))
    expect(result.current.filter.q).toBe('餐')
    expect(result.current.filter.kind).toEqual(['food', 'stay'])
    expect(result.current.filter.uids).toEqual([2, 3])
  })

  it('defaults to empty filter when URL has no params', () => {
    const { result } = renderHook(() => useActivityFilter({ activities, tour }))
    expect(result.current.filter.q).toBe('')
    expect(result.current.filter.kind).toEqual([])
    expect(result.current.filter.uids).toEqual([])
  })

  it('setQ debounces 200ms then router.replace', () => {
    const { result } = renderHook(() => useActivityFilter({ activities, tour }))
    act(() => { result.current.setQ('餐') })
    expect(router.replace).not.toHaveBeenCalled()
    act(() => { vi.advanceTimersByTime(200) })
    expect(router.replace).toHaveBeenCalledWith(
      expect.objectContaining({ url: '/tours/42?q=%E9%A4%90', preserveState: true, preserveScroll: true })
    )
  })

  it('setKind is immediate (no debounce)', () => {
    const { result } = renderHook(() => useActivityFilter({ activities, tour }))
    act(() => { result.current.setKind(['food']) })
    expect(router.replace).toHaveBeenCalledWith(
      expect.objectContaining({ url: '/tours/42?kind=food', preserveState: true, preserveScroll: true })
    )
  })

  it('setUids is immediate', () => {
    const { result } = renderHook(() => useActivityFilter({ activities, tour }))
    act(() => { result.current.setUids([2, 3]) })
    expect(router.replace).toHaveBeenCalledWith(
      expect.objectContaining({ url: '/tours/42?uids=2,3', preserveState: true, preserveScroll: true })
    )
  })

  it('reset clears all three params in one call', () => {
    usePage.mockReturnValue({ url: '/tours/42?q=a&kind=food&uids=2' })
    const { result } = renderHook(() => useActivityFilter({ activities, tour }))
    act(() => { result.current.reset() })
    expect(router.replace).toHaveBeenCalledWith(
      expect.objectContaining({ url: '/tours/42', preserveState: true, preserveScroll: true })
    )
  })

  it('empty string values drop the param from URL', () => {
    usePage.mockReturnValue({ url: '/tours/42?q=abc&kind=food' })
    const { result } = renderHook(() => useActivityFilter({ activities, tour }))
    act(() => { result.current.setQ('') })
    act(() => { vi.advanceTimersByTime(200) })
    expect(router.replace).toHaveBeenCalledWith(
      expect.objectContaining({ url: '/tours/42?kind=food' })
    )
  })

  it('setKind cancels pending q debounce (no stale overwrite)', () => {
    const { result } = renderHook(() => useActivityFilter({ activities, tour }))
    act(() => { result.current.setQ('餐') })
    // debounce pending — don't advance timer yet
    act(() => { result.current.setKind(['food']) })
    expect(router.replace).toHaveBeenLastCalledWith(
      expect.objectContaining({ url: '/tours/42?q=%E9%A4%90&kind=food' })
    )
    const callsBefore = router.replace.mock.calls.length
    // Advance past the debounce window — the stale timer should NOT fire a push
    act(() => { vi.advanceTimersByTime(300) })
    expect(router.replace.mock.calls.length).toBe(callsBefore)
  })

  it('setStatus cancels pending q debounce', () => {
    const { result } = renderHook(() => useActivityFilter({ activities, tour }))
    act(() => { result.current.setQ('餐') })
    act(() => { result.current.setStatus(['pending']) })
    expect(router.replace).toHaveBeenLastCalledWith(
      expect.objectContaining({ url: '/tours/42?q=%E9%A4%90&status=pending' })
    )
    const callsBefore = router.replace.mock.calls.length
    act(() => { vi.advanceTimersByTime(300) })
    expect(router.replace.mock.calls.length).toBe(callsBefore)
  })

  it('setLevels cancels pending q debounce', () => {
    const { result } = renderHook(() => useActivityFilter({ activities, tour }))
    act(() => { result.current.setQ('餐') })
    act(() => { result.current.setLevels(['tier_one']) })
    expect(router.replace).toHaveBeenLastCalledWith(
      expect.objectContaining({ url: '/tours/42?q=%E9%A4%90&levels=tier_one' })
    )
    const callsBefore = router.replace.mock.calls.length
    act(() => { vi.advanceTimersByTime(300) })
    expect(router.replace.mock.calls.length).toBe(callsBefore)
  })

  it('setReserve cancels pending q debounce', () => {
    const { result } = renderHook(() => useActivityFilter({ activities, tour }))
    act(() => { result.current.setQ('餐') })
    act(() => { result.current.setReserve(true) })
    expect(router.replace).toHaveBeenLastCalledWith(
      expect.objectContaining({ url: '/tours/42?q=%E9%A4%90&reserve=1' })
    )
    const callsBefore = router.replace.mock.calls.length
    act(() => { vi.advanceTimersByTime(300) })
    expect(router.replace.mock.calls.length).toBe(callsBefore)
  })

  it('setUids cancels pending q debounce', () => {
    const { result } = renderHook(() => useActivityFilter({ activities, tour }))
    act(() => { result.current.setQ('餐') })
    act(() => { result.current.setUids([2]) })
    expect(router.replace).toHaveBeenLastCalledWith(
      expect.objectContaining({ url: '/tours/42?q=%E9%A4%90&uids=2' })
    )
    const callsBefore = router.replace.mock.calls.length
    act(() => { vi.advanceTimersByTime(300) })
    expect(router.replace.mock.calls.length).toBe(callsBefore)
  })

  it('unmount clears pending q debounce (no stale push)', () => {
    const { result, unmount } = renderHook(() => useActivityFilter({ activities, tour }))
    act(() => { result.current.setQ('餐') })
    // Debounce pending
    unmount()
    const callsBefore = router.replace.mock.calls.length
    act(() => { vi.advanceTimersByTime(300) })
    expect(router.replace.mock.calls.length).toBe(callsBefore)
  })

  it('ignores unknown kind values from URL', () => {
    usePage.mockReturnValue({ url: '/tours/42?kind=typo,food' })
    const { result } = renderHook(() => useActivityFilter({ activities, tour }))
    // Only 'food' survives the filter; 'typo' is dropped silently.
    expect(result.current.filter.kind).toEqual(['food'])
  })

  it('whitespace-only q is stripped from URL on push', () => {
    const { result } = renderHook(() => useActivityFilter({ activities, tour }))
    act(() => { result.current.setQ('   ') })
    act(() => { vi.advanceTimersByTime(200) })
    // URL should NOT carry a q param — core treats trimmed empty as inactive.
    expect(router.replace).toHaveBeenCalledWith(
      expect.objectContaining({ url: '/tours/42' })
    )
  })

  it('re-syncs local state from URL when tour path changes', () => {
    usePage.mockReturnValue({ url: '/tours/42?q=food' })
    const { result, rerender } = renderHook(() => useActivityFilter({ activities, tour }))
    expect(result.current.filter.q).toBe('food')
    // Simulate navigation to a different tour with no filter params
    usePage.mockReturnValue({ url: '/tours/43' })
    rerender()
    expect(result.current.filter.q).toBe('')
    expect(result.current.filter.kind).toEqual([])
  })

  it('reads status/levels/reserve from URL', () => {
    usePage.mockReturnValue({ url: '/tours/42?status=pending,closed&levels=tier_one&reserve=1' })
    const { result } = renderHook(() => useActivityFilter({ activities, tour }))
    expect(result.current.filter.status).toEqual(['pending', 'closed'])
    expect(result.current.filter.levels).toEqual(['tier_one'])
    expect(result.current.filter.reserve).toBe(true)
  })

  it('defaults new dims to empty/false when URL has no params', () => {
    const { result } = renderHook(() => useActivityFilter({ activities, tour }))
    expect(result.current.filter.status).toEqual([])
    expect(result.current.filter.levels).toEqual([])
    expect(result.current.filter.reserve).toBe(false)
  })

  it('setStatus is immediate', () => {
    const { result } = renderHook(() => useActivityFilter({ activities, tour }))
    act(() => { result.current.setStatus(['pending']) })
    expect(router.replace).toHaveBeenCalledWith(
      expect.objectContaining({ url: '/tours/42?status=pending', preserveState: true, preserveScroll: true })
    )
  })

  it('setLevels is immediate', () => {
    const { result } = renderHook(() => useActivityFilter({ activities, tour }))
    act(() => { result.current.setLevels(['tier_one', 'tier_three']) })
    expect(router.replace).toHaveBeenCalledWith(
      expect.objectContaining({ url: '/tours/42?levels=tier_one,tier_three' })
    )
  })

  it('setReserve false→true adds reserve=1', () => {
    const { result } = renderHook(() => useActivityFilter({ activities, tour }))
    act(() => { result.current.setReserve(true) })
    expect(router.replace).toHaveBeenCalledWith(
      expect.objectContaining({ url: '/tours/42?reserve=1' })
    )
  })

  it('setReserve true adds reserve=1; false drops it', () => {
    usePage.mockReturnValue({ url: '/tours/42?reserve=1' })
    const { result } = renderHook(() => useActivityFilter({ activities, tour }))
    act(() => { result.current.setReserve(false) })
    expect(router.replace).toHaveBeenCalledWith(
      expect.objectContaining({ url: '/tours/42' })
    )
  })

  it('ignores unknown status/levels values from URL', () => {
    usePage.mockReturnValue({ url: '/tours/42?status=typo,pending&levels=bogus,tier_two' })
    const { result } = renderHook(() => useActivityFilter({ activities, tour }))
    expect(result.current.filter.status).toEqual(['pending'])
    expect(result.current.filter.levels).toEqual(['tier_two'])
  })

  it('reset clears new dims too', () => {
    usePage.mockReturnValue({ url: '/tours/42?status=pending&levels=tier_one&reserve=1' })
    const { result } = renderHook(() => useActivityFilter({ activities, tour }))
    act(() => { result.current.reset() })
    expect(router.replace).toHaveBeenCalledWith(
      expect.objectContaining({ url: '/tours/42' })
    )
  })
})
