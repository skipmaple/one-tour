import { useMemo, useCallback, useEffect, useRef, useState } from 'react'
import { router, usePage } from '@inertiajs/react'
import { KIND_OPTIONS, STATUS_OPTIONS, CITIZEN_LEVEL_OPTIONS } from '../components/activity-editor/detailsSchema'

const VALID_KINDS = new Set(KIND_OPTIONS.map(o => o.value))
const VALID_STATUSES = new Set(STATUS_OPTIONS.map(o => o.value))
const VALID_LEVELS = new Set(CITIZEN_LEVEL_OPTIONS.map(o => o.value))

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
 * @param {object} opts.filter — { q: string, kind: string[], uids: number[],
 *   status: string[], levels: string[], reserve: boolean }
 * @param {object} opts.tour — abstract shape, NOT the raw Tour prop:
 *   { authorId: number, memberIds: number[] }.
 *   Callers (e.g. Tour/Show.jsx) must map from
 *   tour.author_id + members[].user_id. Keep memberIds stable (useMemo)
 *   to avoid thrashing the memoized Set.
 */
export function useActivityFilterCore({ activities, filter, tour }) {
  const { q, kind, uids, status = [], levels = [], reserve = false } = filter

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

  const active = qTrimmed !== '' || kind.length > 0 || effectiveUids.length > 0 || status.length > 0 || levels.length > 0 || reserve

  const matches = useMemo(() => {
    return (activity) => {
      if (qTrimmed) {
        const text = searchableByActivityId.get(activity.id) || ''
        if (!text.includes(qTrimmed)) return false
      }
      if (kind.length > 0) {
        if (!kind.includes(activity.kind)) return false
      }
      if (status.length > 0) {
        if (!status.includes(activity.status)) return false
      }
      if (levels.length > 0) {
        if (!levels.includes(activity.citizen_level)) return false
      }
      if (reserve && !(activity.details && activity.details.need_reservation)) {
        return false
      }
      if (effectiveUids.length > 0) {
        const effSet = effectiveParticipantSet(activity, allMemberIdSet)
        if (!hasIntersection(effSet, effectiveUids)) return false
      }
      return true
    }
  }, [qTrimmed, kind, status, levels, reserve, effectiveUids, searchableByActivityId, allMemberIdSet])

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

function parseUrl(url) {
  const idx = url.indexOf('?')
  const path = idx === -1 ? url : url.slice(0, idx)
  const params = new URLSearchParams(idx === -1 ? '' : url.slice(idx + 1))
  return { path, params }
}

function filterFromParams(params) {
  const q = params.get('q') || ''
  const kindRaw = params.get('kind') || ''
  const uidsRaw = params.get('uids') || ''
  const statusRaw = params.get('status') || ''
  const levelsRaw = params.get('levels') || ''
  // Drop unknown enum values silently — a typo'd / stale URL param otherwise
  // activates the dimension with zero matches and hides every activity.
  const kind = kindRaw ? kindRaw.split(',').filter(v => VALID_KINDS.has(v)) : []
  const uids = uidsRaw ? uidsRaw.split(',').map(Number).filter(n => Number.isFinite(n)) : []
  const status = statusRaw ? statusRaw.split(',').filter(v => VALID_STATUSES.has(v)) : []
  const levels = levelsRaw ? levelsRaw.split(',').filter(v => VALID_LEVELS.has(v)) : []
  const reserve = params.get('reserve') === '1'
  return { q, kind, uids, status, levels, reserve }
}

function buildUrl(path, { q, kind, uids, status, levels, reserve }) {
  const parts = []
  // Trim q before persisting — core matcher treats whitespace-only as
  // inactive, so the URL should not carry "%20%20" noise.
  const qTrimmed = q.trim()
  if (qTrimmed) parts.push(`q=${encodeURIComponent(qTrimmed)}`)
  if (kind.length > 0) parts.push(`kind=${kind.join(',')}`)
  if (uids.length > 0) parts.push(`uids=${uids.join(',')}`)
  if (status.length > 0) parts.push(`status=${status.join(',')}`)
  if (levels.length > 0) parts.push(`levels=${levels.join(',')}`)
  if (reserve) parts.push('reserve=1')
  const qs = parts.join('&')
  return qs ? `${path}?${qs}` : path
}

const DEBOUNCE_MS = 200

/**
 * URL-backed wrapper around useActivityFilterCore.
 *
 * Local state mirrors the URL for snappy UI; URL is the source of truth via
 * router.replace (debounced 200ms on q, immediate on kind/uids). Back button,
 * page refresh, and sharing all restore filter state.
 *
 * @param {object} opts
 * @param {Array}  opts.activities
 * @param {object} opts.tour — { authorId, memberIds } (see useActivityFilterCore)
 */
export function useActivityFilter({ activities, tour }) {
  const { url } = usePage()
  const { path, params } = parseUrl(url)
  const urlFilter = filterFromParams(params)

  const [local, setLocal] = useState(urlFilter)

  // Path included so that navigating between tours (e.g. /tours/42 →
  // /tours/43) resets local state even when both URLs carry identical
  // (or empty) filter params. Without path in the key, stale filter
  // could persist across tour switches under preserveState navigation.
  const urlKey = `${path}|${urlFilter.q}|${urlFilter.kind.join(',')}|${urlFilter.uids.join(',')}|${urlFilter.status.join(',')}|${urlFilter.levels.join(',')}|${urlFilter.reserve}`
  useEffect(() => {
    setLocal(urlFilter)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [urlKey])

  const pushUrl = useCallback((nextFilter) => {
    const nextUrl = buildUrl(path, nextFilter)
    router.replace({ url: nextUrl, preserveState: true, preserveScroll: true })
  }, [path])

  const qDebounceRef = useRef(null)

  useEffect(() => {
    return () => {
      if (qDebounceRef.current) clearTimeout(qDebounceRef.current)
    }
  }, [])

  const setQ = useCallback((v) => {
    setLocal(prev => {
      const next = { ...prev, q: v }
      if (qDebounceRef.current) clearTimeout(qDebounceRef.current)
      qDebounceRef.current = setTimeout(() => pushUrl(next), DEBOUNCE_MS)
      return next
    })
  }, [pushUrl])

  const setKind = useCallback((v) => {
    if (qDebounceRef.current) clearTimeout(qDebounceRef.current)
    setLocal(prev => {
      const next = { ...prev, kind: v }
      pushUrl(next)
      return next
    })
  }, [pushUrl])

  const setUids = useCallback((v) => {
    if (qDebounceRef.current) clearTimeout(qDebounceRef.current)
    setLocal(prev => {
      const next = { ...prev, uids: v }
      pushUrl(next)
      return next
    })
  }, [pushUrl])

  const setStatus = useCallback((v) => {
    if (qDebounceRef.current) clearTimeout(qDebounceRef.current)
    setLocal(prev => {
      const next = { ...prev, status: v }
      pushUrl(next)
      return next
    })
  }, [pushUrl])

  const setLevels = useCallback((v) => {
    if (qDebounceRef.current) clearTimeout(qDebounceRef.current)
    setLocal(prev => {
      const next = { ...prev, levels: v }
      pushUrl(next)
      return next
    })
  }, [pushUrl])

  const setReserve = useCallback((v) => {
    if (qDebounceRef.current) clearTimeout(qDebounceRef.current)
    setLocal(prev => {
      const next = { ...prev, reserve: v }
      pushUrl(next)
      return next
    })
  }, [pushUrl])

  const reset = useCallback(() => {
    const empty = { q: '', kind: [], uids: [], status: [], levels: [], reserve: false }
    setLocal(empty)
    pushUrl(empty)
    if (qDebounceRef.current) clearTimeout(qDebounceRef.current)
  }, [pushUrl])

  const core = useActivityFilterCore({ activities, filter: local, tour })

  return {
    filter: local,
    setQ,
    setKind,
    setUids,
    setStatus,
    setLevels,
    setReserve,
    reset,
    ...core,
  }
}
