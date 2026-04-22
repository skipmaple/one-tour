import { useMemo } from 'react'

function collectStrings(value, acc) {
  if (value == null) return
  if (typeof value === 'string') { acc.push(value); return }
  if (Array.isArray(value)) { value.forEach(v => collectStrings(v, acc)); return }
  if (typeof value === 'object') {
    for (const k in value) collectStrings(value[k], acc)
  }
}

function buildSearchableText(activity) {
  const parts = [activity.name || '']
  collectStrings(activity.details, parts)
  return parts.join('\n').toLowerCase()
}

function effectiveParticipantSet(activity, allMemberIdSet) {
  const explicit = activity.participant_user_ids
  if (explicit && explicit.length > 0) return new Set(explicit)
  return allMemberIdSet
}

function hasIntersection(setA, listB) {
  for (const v of listB) if (setA.has(v)) return true
  return false
}

/**
 * Core matching logic for activity search/filter.
 *
 * @param {object} opts
 * @param {Array}  opts.activities — the activities to filter
 * @param {object} opts.filter — { q: string, kind: string[], uids: number[] }
 * @param {object} opts.tour — abstract shape, NOT the raw Tour prop:
 *   { authorId: number, memberIds: number[] }.
 *   Callers (e.g. Tour/Show.jsx) must map from
 *   tour.author_id + members[].user_id. Keep memberIds stable (useMemo)
 *   to avoid thrashing the memoized Set.
 */
export function useActivityFilterCore({ activities, filter, tour }) {
  const { q, kind, uids } = filter

  const allMemberIdSet = useMemo(
    () => new Set([tour.authorId, ...tour.memberIds]),
    [tour.authorId, tour.memberIds]
  )

  const effectiveUids = useMemo(
    () => uids.filter(u => allMemberIdSet.has(u)),
    [uids, allMemberIdSet]
  )

  const searchableByActivityId = useMemo(() => {
    const map = new Map()
    for (const a of activities) map.set(a.id, buildSearchableText(a))
    return map
  }, [activities])

  const qTrimmed = q.trim().toLowerCase()

  const active = qTrimmed !== '' || kind.length > 0 || effectiveUids.length > 0

  const matches = useMemo(() => {
    return (activity) => {
      if (qTrimmed) {
        const text = searchableByActivityId.get(activity.id) || ''
        if (!text.includes(qTrimmed)) return false
      }
      if (kind.length > 0) {
        if (!kind.includes(activity.kind)) return false
      }
      if (effectiveUids.length > 0) {
        const effSet = effectiveParticipantSet(activity, allMemberIdSet)
        if (!hasIntersection(effSet, effectiveUids)) return false
      }
      return true
    }
  }, [qTrimmed, kind, effectiveUids, searchableByActivityId, allMemberIdSet])

  const activeCount = useMemo(
    () => activities.filter(matches).length,
    [activities, matches]
  )

  return {
    matches,
    active,
    activeCount,
    totalCount: activities.length,
  }
}
