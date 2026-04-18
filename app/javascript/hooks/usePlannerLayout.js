import { useCallback, useState } from 'react'

export const DEFAULT_LAYOUT = {
  candidates: { open: true, grow: 2 },
  days:       { open: true, grow: 5, autoFit: true },
  map:        { open: true, grow: 5 },
  ai:         { open: true, grow: 2 },
}

const STORAGE_PREFIX = 'planner-layout-v1-'
const MIN_GROW = 0.5  // Hard floor; below this a panel becomes invisibly thin

function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v))
}

const MIN_WIDTH = {
  candidates: 64,
  days: 200,
  map: 240,
  ai: 220,
}

const COLLAPSED_WIDTH = 40

function loadFromStorage(tourId) {
  try {
    const raw = window.localStorage.getItem(`${STORAGE_PREFIX}${tourId}`)
    if (!raw) return DEFAULT_LAYOUT
    const parsed = JSON.parse(raw)
    // Shallow validation — must have all 4 panel keys
    const expected = ['candidates', 'days', 'map', 'ai']
    if (!expected.every(k => parsed[k])) return DEFAULT_LAYOUT
    return parsed
  } catch {
    return DEFAULT_LAYOUT
  }
}

function saveToStorage(tourId, panels) {
  try {
    window.localStorage.setItem(`${STORAGE_PREFIX}${tourId}`, JSON.stringify(panels))
  } catch {
    // Ignore quota errors — layout will reset on next mount
  }
}

export default function usePlannerLayout(tourId) {
  const [panels, setPanelsRaw] = useState(() => loadFromStorage(tourId))

  const setPanels = useCallback((updater) => {
    setPanelsRaw(prev => {
      const next = typeof updater === 'function' ? updater(prev) : updater
      saveToStorage(tourId, next)
      return next
    })
  }, [tourId])

  const openCount = Object.values(panels).filter(p => p.open).length

  const togglePanel = useCallback((id) => {
    setPanels(prev => {
      const isOpen = prev[id].open
      // At-least-one-open: refuse to close if this is the last open
      if (isOpen) {
        const otherOpen = Object.entries(prev).filter(([k, p]) => k !== id && p.open).length
        if (otherOpen === 0) return prev
      }
      return { ...prev, [id]: { ...prev[id], open: !isOpen } }
    })
  }, [setPanels])

  const resizeBetween = useCallback((leftId, rightId, deltaPx, totalPx) => {
    setPanels(prev => {
      const left = prev[leftId], right = prev[rightId]
      const totalGrow = left.grow + right.grow
      // Compute the shared px-space these two panels occupy together
      const sumOfOpenGrows = Object.values(prev).reduce(
        (s, p) => s + (p.open ? p.grow : 0),
        0
      )
      const sharedSpace = totalPx * (totalGrow / sumOfOpenGrows)
      if (sharedSpace <= 0) return prev
      const deltaGrow = (deltaPx / sharedSpace) * totalGrow
      const newLeftGrow = clamp(left.grow + deltaGrow, MIN_GROW, totalGrow - MIN_GROW)
      const newRightGrow = totalGrow - newLeftGrow
      const next = {
        ...prev,
        [leftId]:  { ...left,  grow: newLeftGrow },
        [rightId]: { ...right, grow: newRightGrow },
      }
      // Dragging days↔map turns off auto-fit (user is taking manual control)
      if ((leftId === 'days' && rightId === 'map') || (leftId === 'map' && rightId === 'days')) {
        next.days = { ...next.days, autoFit: false }
      }
      return next
    })
  }, [setPanels])

  const toggleAutoFit = useCallback(() => {
    setPanels(prev => ({
      ...prev,
      days: { ...prev.days, autoFit: !prev.days.autoFit }
    }))
  }, [setPanels])

  const flexStyle = useCallback((id, opts = {}) => {
    const p = panels[id]
    if (!p.open) {
      return { flex: `0 0 ${COLLAPSED_WIDTH}px`, minWidth: COLLAPSED_WIDTH }
    }
    if (id === 'days' && p.autoFit && opts.autoFitWidth != null) {
      return { flex: `0 0 ${opts.autoFitWidth}px`, minWidth: MIN_WIDTH.days }
    }
    return { flex: `${p.grow} 1 0`, minWidth: MIN_WIDTH[id] }
  }, [panels])

  const handleVisible = useCallback((leftId, rightId) => {
    return panels[leftId].open && panels[rightId].open
  }, [panels])

  return { panels, openCount, togglePanel, resizeBetween, toggleAutoFit, flexStyle, handleVisible }
}
