import { useEffect, useState } from 'react'

// Loads AMAP JS v2 from CDN exactly once per page. The <script> tag stays on
// document.head between Inertia partial reloads, so subsequent mounts skip
// straight to 'ready' via the window.AMap check.
//
// AMAP 2.0 requires TWO credentials: the key in the URL query string and a
// `securityJsCode` set on `window._AMapSecurityConfig` BEFORE the script is
// evaluated. Both are domain-allowlist protected in the AMAP console, so
// exposing them in page source is fine (same model as Google Maps).
//
// States: 'idle' (missing creds) | 'loading' | 'ready' | 'error'
export default function useAmap(apiKey, securityCode) {
  const [state, setState] = useState('idle')

  useEffect(() => {
    if (!apiKey || !securityCode) { setState('idle'); return }
    if (typeof window === 'undefined') return
    if (window.AMap) { setState('ready'); return }

    // Must be set before the SDK script runs.
    window._AMapSecurityConfig = { securityJsCode: securityCode }

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
  }, [apiKey, securityCode])

  return state
}
