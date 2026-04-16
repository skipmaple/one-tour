import { useEffect, useRef, useMemo, useState } from 'react'
import { usePage } from '@inertiajs/react'
import { Paper, Text, SegmentedControl, useMantineTheme } from '@mantine/core'
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

// Filter activities by current view mode.
// 'all'     — every activity
// 'colored' — only day-assigned (day_id != null)
// 'backlog' — only backlog (day_id == null)
export function filterActivitiesByViewMode(activities, viewMode) {
  if (viewMode === 'colored') return activities.filter(a => a.day_id != null)
  if (viewMode === 'backlog') return activities.filter(a => a.day_id == null)
  return activities
}

// Build the HTML content string for an AMap.Marker.
//
// Day-assigned: 28px solid circle with day color background and "Dn" label embedded.
// Backlog (day_id=null): 22px white circle with 2px grey dashed border, no label.
//
// `theme` is the Mantine theme object (use useMantineTheme() in component).
// We pull colors[name][6] (the 600-shade) for solid markers — high contrast on
// AMap's white tile background.
export function buildMarkerHTML(activity, dayIndexById, theme) {
  if (activity.day_id == null) {
    // Backlog marker — grey dashed circle, no label
    return `<div style="
      width: 22px; height: 22px;
      background: white;
      border: 2px dashed #999;
      border-radius: 50%;
      opacity: 0.85;
      box-sizing: border-box;
    "></div>`
  }

  const day_index = dayIndexById[activity.day_id]
  const colorName = DAY_COLOR(day_index)
  const hex = theme.colors[colorName][6]

  return `<div style="
    width: 28px; height: 28px;
    background: ${hex};
    border: 2px solid white;
    border-radius: 50%;
    box-shadow: 0 2px 4px rgba(0,0,0,0.3);
    display: flex; align-items: center; justify-content: center;
    color: white; font-size: 11px; font-weight: bold;
    box-sizing: border-box;
  ">D${day_index}</div>`
}

// Build polyline configs for AMap.Polyline construction.
//
// Returns an array of { path, strokeColor, strokeWeight, strokeOpacity, strokeStyle, showDir }.
// `path` is [[lng, lat], [lng, lat], ...] (AMap's coord order).
//
// Rules:
// - Same-day lines: solid, day color, weight 3, opacity 0.7. Connects activities
//   within a day in `position` order (NOT planned_start_at — matches Timeline).
// - Cross-day lines: dashed, origin-day color, weight 2, opacity 0.5. Connects
//   the last activity of D{n} to the first of D{n+visible}, skipping any day
//   with zero activities (e.g., buffer_day with no activity).
// - Activities with invalid lat/lng are skipped.
// - Single-activity days produce no same-day line (1 point can't form a line).
export function buildPolylineConfigs(activitiesGroupedByDay, days, theme) {
  const configs = []

  // Sort days by day_index ascending; build a list of "day with valid coords"
  const orderedDays = [ ...days ].sort((a, b) => a.day_index - b.day_index)

  // For each day, extract the list of [lng, lat] pairs in position order
  const dayPaths = orderedDays.map(day => {
    const acts = (activitiesGroupedByDay[day.id] || [])
      .slice()
      .sort((a, b) => a.position - b.position)
      .map(a => [ parseFloat(a.lng), parseFloat(a.lat) ])
      .filter(([ lng, lat ]) => Number.isFinite(lng) && Number.isFinite(lat))
    return { day, path: acts }
  })

  // Same-day lines (solid)
  dayPaths.forEach(({ day, path }) => {
    if (path.length < 2) return
    configs.push({
      path,
      strokeColor: theme.colors[DAY_COLOR(day.day_index)][6],
      strokeWeight: 3,
      strokeOpacity: 0.7,
      strokeStyle: 'solid',
      showDir: false
    })
  })

  // Cross-day lines (dashed): pair adjacent days with non-empty paths
  const daysWithCoords = dayPaths.filter(d => d.path.length > 0)
  for (let i = 0; i < daysWithCoords.length - 1; i++) {
    const from = daysWithCoords[i]
    const to   = daysWithCoords[i + 1]
    const lastOfFrom  = from.path[from.path.length - 1]
    const firstOfTo   = to.path[0]
    configs.push({
      path: [ lastOfFrom, firstOfTo ],
      strokeColor: theme.colors[DAY_COLOR(from.day.day_index)][6],
      strokeWeight: 2,
      strokeOpacity: 0.5,
      strokeStyle: 'dashed',
      showDir: false
    })
  }

  return configs
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

  // View mode controls which activities show + whether polylines render.
  // Not persisted (resets on refresh, like Backlog filter).
  const [ viewMode, setViewMode ] = useState('all')
  const theme = useMantineTheme()

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

  // Sync markers with activities + viewMode + theme. Clear + re-draw on every change.
  // Cheap enough for typical 0-50 POI scale.
  useEffect(() => {
    const map = mapRef.current
    if (!map || !window.AMap) return

    markersRef.current.forEach(m => m.setMap(null))
    markersRef.current = []

    // Coerce Rails-serialized lat/lng strings to numbers, drop invalid
    const visible = filterActivitiesByViewMode(activities, viewMode)
      .map(a => ({ ...a, lat: parseFloat(a.lat), lng: parseFloat(a.lng) }))
      .filter(a => Number.isFinite(a.lat) && Number.isFinite(a.lng))

    visible.forEach(a => {
      const inDay = a.day_id && dayIndexById[a.day_id]
      const marker = new window.AMap.Marker({
        position: [ a.lng, a.lat ],
        title: a.name,
        content: buildMarkerHTML(a, dayIndexById, theme),
        anchor: 'center'
      })
      const info = new window.AMap.InfoWindow({
        content: `<div style="padding:6px 10px;font-size:12px;line-height:1.5">
          <strong>${escapeHtml(a.name)}</strong><br/>
          <span style="color:#888">${inDay ? `已排入 D${inDay}` : '尚未排入（backlog）'}</span>
        </div>`,
        offset: new window.AMap.Pixel(0, -20)
      })
      marker.on('click', () => info.open(map, marker.getPosition()))
      marker.setMap(map)
      markersRef.current.push(marker)
    })

    // Frame view to fit visible markers; fallbacks for 0/1 markers
    if (visible.length > 1) {
      map.setFitView(markersRef.current, false, [ 40, 40, 40, 40 ], 12)
    } else if (visible.length === 1) {
      map.setZoomAndCenter(10, [ visible[0].lng, visible[0].lat ])
    }
    // visible.length === 0: don't move map (user keeps current view)
  }, [ activities, dayIndexById, viewMode, theme, sdkState ])

  return (
    <Paper
      withBorder
      style={{ height: 260, position: 'relative', overflow: 'hidden', background: '#fafafa' }}
    >
      <div ref={containerRef} style={{ position: 'absolute', inset: 0 }} />
      {sdkState === 'ready' && !authFailed && (
        <ViewModeRadio value={viewMode} onChange={setViewMode} />
      )}
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

// Floating SegmentedControl in the top-right corner of the map.
// Three modes:
//   all     — every marker + polylines
//   colored — only day-assigned markers + polylines
//   backlog — only backlog markers, no polylines
function ViewModeRadio({ value, onChange }) {
  return (
    <div style={{
      position: 'absolute',
      top: 8,
      right: 8,
      zIndex: 2,
      background: 'white',
      borderRadius: 4,
      padding: 2,
      boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
    }}>
      <SegmentedControl
        value={value}
        onChange={onChange}
        data={[
          { value: 'all',     label: '全部' },
          { value: 'colored', label: '按天着色' },
          { value: 'backlog', label: '仅 backlog' },
        ]}
        size="xs"
      />
    </div>
  )
}
