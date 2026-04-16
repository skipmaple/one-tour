import { useEffect, useRef, useMemo, useState } from 'react'
import { usePage } from '@inertiajs/react'
import { Paper, Text } from '@mantine/core'
import useAmap from '../../hooks/useAmap'

// 10-color palette using Mantine theme color names. Cycles when day_index > 10.
// Used by buildMarkerHTML and buildPolylineConfigs to color markers/lines per day.
export const DAY_PALETTE = [
  'red', 'pink', 'grape', 'violet', 'indigo',
  'blue', 'cyan', 'teal', 'green', 'yellow'
]

export function DAY_COLOR(day_index) {
  // Handle negative / zero gracefully via positive modulo
  const idx = ((day_index - 1) % DAY_PALETTE.length + DAY_PALETTE.length) % DAY_PALETTE.length
  return DAY_PALETTE[idx]
}

// AMAP-backed planner map. Plots every activity that has lat/lng as a marker.
// Backlog activities get a grey default-style marker; day-assigned activities
// get a blue numbered label marker so you can tell at a glance which day they
// belong to.
export default function PlannerMap({ activities, days = [] }) {
  const { amap_js_api_key, amap_js_security_code } = usePage().props
  const sdkState = useAmap(amap_js_api_key, amap_js_security_code)

  const containerRef = useRef(null)
  const mapRef = useRef(null)
  const markersRef = useRef([])

  // Stable lookup: day.id → day_index (for marker labels like "D2")
  const dayIndexById = useMemo(
    () => Object.fromEntries(days.map(d => [ d.id, d.day_index ])),
    [ days ]
  )

  // Tracks AMap's runtime auth failure (e.g. USERKEY_PLAT_NOMATCH when the key
  // is registered as Web服务/REST but not Web端JS). The SDK <script> itself
  // still loads fine in that case, so the hook can't detect it; we hook the
  // AMap.Event bus after SDK ready.
  const authFailedRef = useRef(false)
  const [ authFailed, setAuthFailed ] = useState(false)

  // Create the map once the SDK is ready and the container is mounted.
  // AMAP 2.0 has no reliable JS event for auth failures — the error fires
  // as a console.error string. Patch console.error once to watch for the
  // specific key-mismatch token so we can surface it in the UI.
  useEffect(() => {
    if (sdkState !== 'ready' || !containerRef.current || mapRef.current) return

    const origConsoleError = console.error
    console.error = function (...args) {
      const msg = args.map(a => typeof a === 'string' ? a : (a?.message ?? '')).join(' ')
      if (msg.includes('USERKEY_PLAT_NOMATCH') || msg.includes('INVALID_USER_KEY')) {
        authFailedRef.current = true
        setAuthFailed(true)
      }
      origConsoleError.apply(console, args)
    }

    mapRef.current = new window.AMap.Map(containerRef.current, {
      zoom: 5,
      center: [ 87.5, 43.5 ], // 新疆大致中心 — 默认视图
      viewMode: '2D',
      resizeEnable: true
    })
    return () => {
      mapRef.current?.destroy?.()
      mapRef.current = null
      console.error = origConsoleError
    }
  }, [ sdkState ])

  // Sync markers with activities. Clear + re-draw on every activities change.
  // Cheap enough for the typical 0-50 POI / tour scale; if we ever hit 500+
  // we can diff by id instead.
  //
  // `sdkState` is in deps so this re-runs once the map is actually created
  // (initial render has sdkState=idle and mapRef.current=null; the markers
  // must be added AFTER the map-creation effect runs — they don't share deps,
  // so we force-re-run when SDK becomes ready).
  useEffect(() => {
    const map = mapRef.current
    if (!map || !window.AMap) return

    markersRef.current.forEach(m => m.setMap(null))
    markersRef.current = []

    // Rails serializes decimal columns as strings to preserve precision; coerce
    // once here and drop anything that doesn't parse.
    const withCoords = activities
      .map(a => ({ ...a, lat: parseFloat(a.lat), lng: parseFloat(a.lng) }))
      .filter(a => Number.isFinite(a.lat) && Number.isFinite(a.lng))
    withCoords.forEach(a => {
      const inDay = a.day_id && dayIndexById[a.day_id]
      const marker = new window.AMap.Marker({
        position: [ a.lng, a.lat ],
        title: a.name,
        label: inDay ? { content: `D${inDay}`, direction: 'top' } : undefined,
        anchor: 'bottom-center'
      })
      const info = new window.AMap.InfoWindow({
        content: `<div style="padding:6px 10px;font-size:12px;line-height:1.5">
          <strong>${escapeHtml(a.name)}</strong><br/>
          <span style="color:#888">${inDay ? `已排入 D${inDay}` : '尚未排入（backlog）'}</span>
        </div>`,
        offset: new window.AMap.Pixel(0, -30)
      })
      marker.on('click', () => info.open(map, marker.getPosition()))
      marker.setMap(map)
      markersRef.current.push(marker)
    })

    // Frame the view to fit all markers, but don't zoom in tighter than z=12
    // for a single point (too claustrophobic).
    if (withCoords.length > 1) {
      map.setFitView(markersRef.current, false, [ 40, 40, 40, 40 ], 12)
    } else if (withCoords.length === 1) {
      map.setZoomAndCenter(10, [ withCoords[0].lng, withCoords[0].lat ])
    }
  }, [ activities, dayIndexById, sdkState ])

  return (
    <Paper
      withBorder
      style={{ height: 260, position: 'relative', overflow: 'hidden', background: '#fafafa' }}
    >
      <div ref={containerRef} style={{ position: 'absolute', inset: 0 }} />
      {sdkState === 'loading' && (
        <Overlay>地图加载中…</Overlay>
      )}
      {sdkState === 'idle' && (
        <Overlay>未配置 AMAP_API_KEY，地图禁用</Overlay>
      )}
      {sdkState === 'error' && (
        <Overlay>地图 SDK 无法加载，检查网络或 CDN</Overlay>
      )}
      {sdkState === 'ready' && authFailed && (
        <Overlay>
          AMAP Key 平台不匹配（USERKEY_PLAT_NOMATCH）。<br />
          需要在 <strong>lbs.amap.com 控制台</strong> → 编辑此 Key → 启用「<strong>Web端（JS API）</strong>」平台；若是生产环境记得加上域名白名单。
        </Overlay>
      )}
    </Paper>
  )
}

function Overlay({ children }) {
  return (
    <div style={{
      position: 'absolute', inset: 0, display: 'flex', alignItems: 'center',
      justifyContent: 'center', zIndex: 1, pointerEvents: 'none'
    }}>
      <Text size="xs" c="dimmed" style={{
        background: 'rgba(255,255,255,0.92)',
        padding: '6px 12px',
        border: '1px dashed #ccc'
      }}>
        {children}
      </Text>
    </div>
  )
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}
