import { useEffect, useState } from 'react'

// Loads AMAP JS v2 from CDN exactly once per page. The script tag stays on
// document.head between Inertia partial reloads, so subsequent mounts skip
// straight to 'ready' via the window.AMap check.
//
// AMAP 2.0 is picky about the `securityJsCode` initializer. For basic map +
// Markers the plain key is enough; the security code is only required for
// `AMap.Geocoder`, `AMap.DistrictSearch`, etc. that we don't use here.
//
// States: 'idle' (no key) | 'loading' | 'ready' | 'error'
export default function useAmap(apiKey) {
  const [state, setState] = useState('idle')

  useEffect(() => {
    if (!apiKey) { setState('idle'); return }
    if (typeof window === 'undefined') return
    if (window.AMap) { setState('ready'); return }

    // Another component on the same page may have kicked off the load already.
    const existing = document.querySelector('script[data-amap-sdk]')
    if (existing) {
      existing.addEventListener('load', () => setState('ready'))
      existing.addEventListener('error', () => setState('error'))
      return
    }

    setState('loading')
    const s = document.createElement('script')
    s.src = `https://webapi.amap.com/maps?v=2.0&key=${encodeURIComponent(apiKey)}`
    s.async = true
    s.dataset.amapSdk = '1'
    s.onload  = () => setState('ready')
    s.onerror = () => setState('error')
    document.head.appendChild(s)
  }, [apiKey])

  return state
}
