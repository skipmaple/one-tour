import { useCallback, useState } from 'react'

export const DEFAULT_LAYOUT = {
  candidates: { open: true, grow: 2 },
  days:       { open: true, grow: 5, autoFit: true },
  map:        { open: true, grow: 5 },
  ai:         { open: true, grow: 2 },
}

const STORAGE_PREFIX = 'planner-layout-v1-'

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

  return { panels, openCount, togglePanel }
}
