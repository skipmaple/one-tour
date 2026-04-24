import { useEffect, useState } from 'react'

/**
 * Fetch AMAP driving distance/duration between two coords.
 * @param {null | { from: { lat, lng }, to: { lat, lng } }} coords
 * @returns {{ status: 'idle'|'loading'|'ready'|'error', data, error }}
 */
export default function useAmapDirection(coords) {
  const [state, setState] = useState({ status: 'idle', data: null, error: null })

  useEffect(() => {
    if (!coords || !coords.from || !coords.to) {
      setState({ status: 'idle', data: null, error: null })
      return
    }
    const { from, to } = coords
    if ([from.lat, from.lng, to.lat, to.lng].some(v => v == null)) {
      setState({ status: 'idle', data: null, error: null })
      return
    }

    let cancelled = false
    setState({ status: 'loading', data: null, error: null })

    const url = `/amap_direction?from_lat=${from.lat}&from_lng=${from.lng}` +
                `&to_lat=${to.lat}&to_lng=${to.lng}`
    fetch(url)
      .then(res => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        return res.json()
      })
      .then(data => {
        if (!cancelled) setState({ status: 'ready', data, error: null })
      })
      .catch(err => {
        if (!cancelled) setState({ status: 'error', data: null, error: err.message })
      })

    return () => { cancelled = true }
  }, [coords?.from?.lat, coords?.from?.lng, coords?.to?.lat, coords?.to?.lng])

  return state
}
