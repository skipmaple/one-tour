import { useEffect, useRef, useMemo, useState } from 'react'
import { router, usePage } from '@inertiajs/react'
import { Paper, Text, SegmentedControl, Button, useMantineTheme } from '@mantine/core'
import { notifications } from '@mantine/notifications'
import { IconRoute, IconMap2 } from '@tabler/icons-react'
import useAmap from '../../hooks/useAmap'
import PanelShell from './PanelLayout/PanelShell'
import { DAY_PALETTE, DAY_COLOR } from '../../lib/dayColors'
export { DAY_PALETTE, DAY_COLOR }

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
export function buildMarkerHTML(activity, dayIndexById, theme, highlighted = false) {
  const scale = highlighted ? 'scale(1.3)' : 'scale(1)'
  const transition = 'transition: transform 150ms ease, box-shadow 150ms ease;'

  if (activity.day_id == null) {
    // Backlog marker — grey dashed circle, no label.
    const shadow = highlighted ? 'box-shadow: 0 4px 10px rgba(0,0,0,0.25);' : ''
    return `<div style="
      width: 22px; height: 22px;
      background: white;
      border: 2px dashed #999;
      border-radius: 50%;
      opacity: 0.85;
      box-sizing: border-box;
      transform: ${scale};
      ${shadow}
      ${transition}
    "></div>`
  }

  const day_index = dayIndexById[activity.day_id]
  const colorName = DAY_COLOR(day_index)
  const hex = theme.colors[colorName][6]
  const shadow = highlighted ? '0 4px 12px rgba(0,0,0,0.4)' : '0 2px 4px rgba(0,0,0,0.3)'

  return `<div style="
    width: 28px; height: 28px;
    background: ${hex};
    border: 2px solid white;
    border-radius: 50%;
    box-shadow: ${shadow};
    display: flex; align-items: center; justify-content: center;
    color: white; font-size: 11px; font-weight: bold;
    box-sizing: border-box;
    transform: ${scale};
    ${transition}
  ">D${day_index}</div>`
}

// Build polyline configs for AMap.Polyline construction.
//
// Returns an array of { path, strokeColor, strokeWeight, strokeOpacity, strokeStyle, showDir }.
// `path` is [[lng, lat], [lng, lat], ...] (AMap's coord order).
//
// Rules:
// - Same-day adjacent activities: one polyline per pair. If a cached
//   driving-mode RouteLeg exists, use its real road path (solid, day color,
//   weight 3, opacity 0.8). Otherwise fall back to a straight line between
//   the two points (solid, opacity 0.7 — still clearly "we don't have a real
//   route yet").
// - Cross-day adjacent activities (last of day N → first of day N+1): same
//   logic, but the fallback is dashed + weight 2 + opacity 0.5 to make the
//   "jump" visually distinct from same-day travel.
// - Activities with invalid lat/lng are skipped.
// - `routeLegsByPair` shape: { [fromActivityId]: { [toActivityId]: { [mode]: leg } } }
//   where leg has `polyline.coords` as [[lng, lat], ...]. When omitted or
//   empty, behaviour matches the pre-Phase-C straight-line rendering.
export function buildPolylineConfigs(activitiesGroupedByDay, days, theme, routeLegsByPair = {}) {
  const configs = []
  const orderedDays = [ ...days ].sort((a, b) => a.day_index - b.day_index)

  // For each day, keep full activity objects (not just coords) so we can
  // look up route_legs by activity id.
  const dayActs = orderedDays.map(day => {
    const acts = (activitiesGroupedByDay[day.id] || [])
      .slice()
      .sort((a, b) => a.position - b.position)
      .filter(a => Number.isFinite(parseFloat(a.lng)) && Number.isFinite(parseFloat(a.lat)))
    return { day, acts }
  })

  const lookupLeg = (fromId, toId, mode = 'driving') =>
    routeLegsByPair[fromId]?.[toId]?.[mode]

  const coordsOf = (act) => [ parseFloat(act.lng), parseFloat(act.lat) ]

  // Same-day segments: one polyline per adjacent pair.
  // extData is used downstream by mouseover/click handlers to recognize
  // uncached (straight) segments and POST a single-leg compute.
  dayActs.forEach(({ day, acts }) => {
    const color = theme.colors[DAY_COLOR(day.day_index)][6]
    for (let i = 0; i < acts.length - 1; i++) {
      const a = acts[i]
      const b = acts[i + 1]
      const leg = lookupLeg(a.id, b.id)
      const extData = { fromId: a.id, toId: b.id, isStraight: !leg?.polyline?.coords?.length }
      if (leg?.polyline?.coords?.length) {
        configs.push({
          path: leg.polyline.coords, strokeColor: color,
          strokeWeight: 3, strokeOpacity: 0.85, strokeStyle: 'solid', showDir: false, extData,
        })
      } else {
        configs.push({
          path: [ coordsOf(a), coordsOf(b) ], strokeColor: color,
          strokeWeight: 3, strokeOpacity: 0.7, strokeStyle: 'solid', showDir: false, extData,
        })
      }
    }
  })

  // Cross-day segments: last of day N → first of the next non-empty day.
  const daysWithActs = dayActs.filter(d => d.acts.length > 0)
  for (let i = 0; i < daysWithActs.length - 1; i++) {
    const from = daysWithActs[i]
    const to   = daysWithActs[i + 1]
    const lastAct  = from.acts[from.acts.length - 1]
    const firstAct = to.acts[0]
    const color = theme.colors[DAY_COLOR(from.day.day_index)][6]
    const leg = lookupLeg(lastAct.id, firstAct.id)
    const extData = { fromId: lastAct.id, toId: firstAct.id, isStraight: !leg?.polyline?.coords?.length }
    if (leg?.polyline?.coords?.length) {
      configs.push({
        path: leg.polyline.coords, strokeColor: color,
        strokeWeight: 3, strokeOpacity: 0.85, strokeStyle: 'solid', showDir: false, extData,
      })
    } else {
      configs.push({
        path: [ coordsOf(lastAct), coordsOf(firstAct) ], strokeColor: color,
        strokeWeight: 2, strokeOpacity: 0.5, strokeStyle: 'dashed', showDir: false, extData,
      })
    }
  }

  return configs
}

// Count adjacent pairs whose RouteLeg is missing/uncached. Used by the
// "算全部路线" button to show a hint like "算全部路线 (5)" when there's
// work to do, and hide itself when everything is cached.
export function countMissingLegs(activitiesGroupedByDay, days, theme, routeLegsByPair) {
  const configs = buildPolylineConfigs(activitiesGroupedByDay, days, theme, routeLegsByPair)
  return configs.filter(c => c.extData?.isStraight).length
}

// AMAP-backed planner map. Plots every activity that has lat/lng as a marker.
// Backlog activities get a grey default-style marker; day-assigned activities
// get a blue numbered label marker so you can tell at a glance which day they
// belong to.
function PlannerMapInner({
  activities,
  days = [],
  routeLegs = [],
  tourId,
  canEdit = false,
  hoveredActivityIds = null,
  onMarkerHover,
  onMarkerLeave,
}) {
  const { amap_js_api_key, amap_js_security_code } = usePage().props
  const sdkState = useAmap(amap_js_api_key, amap_js_security_code)

  const containerRef = useRef(null)
  const mapRef = useRef(null)
  const markersRef = useRef([])
  // Parallel lookup: activity.id → AMap.Marker. Lets the highlight effect
  // update just the affected markers via setContent, without scanning the
  // whole markers array.
  const markerByIdRef = useRef({})
  const polylinesRef = useRef([])
  // One-at-a-time tooltip for straight-polyline hover — keep a ref so we can
  // close the previous one when the cursor moves between segments.
  const tooltipRef = useRef(null)

  // Mirror hover callbacks in refs so AMap marker listeners (registered ONCE
  // per marker creation) always call the current callback reference. Without
  // this, a prop-ref change on hoveredActivityIds-unrelated renders would
  // leave markers calling a stale version of the callback.
  const onMarkerHoverRef = useRef(onMarkerHover)
  const onMarkerLeaveRef = useRef(onMarkerLeave)
  useEffect(() => { onMarkerHoverRef.current = onMarkerHover }, [onMarkerHover])
  useEffect(() => { onMarkerLeaveRef.current = onMarkerLeave }, [onMarkerLeave])

  // Previous hoveredActivityIds — used by the highlight effect to diff and
  // only setContent on markers whose state actually changed.
  const prevHoveredIdsRef = useRef([])

  const [ batchSaving, setBatchSaving ] = useState(false)

  // Stable lookup: day.id → day_index (for marker labels like "D2")
  const dayIndexById = useMemo(
    () => Object.fromEntries(days.map(d => [ d.id, d.day_index ])),
    [ days ]
  )

  // Group activities by day_id (skip backlog) for polyline construction.
  const activitiesByDay = useMemo(() => {
    const grouped = {}
    for (const a of activities) {
      if (a.day_id == null) continue
      if (!grouped[a.day_id]) grouped[a.day_id] = []
      grouped[a.day_id].push(a)
    }
    return grouped
  }, [ activities ])

  // Nested lookup: route_legs[fromActivityId][toActivityId][mode] = leg
  // Used by buildPolylineConfigs to draw real road geometry when cached.
  const routeLegsByPair = useMemo(() => {
    const map = {}
    for (const leg of routeLegs) {
      if (!leg.polyline?.coords?.length) continue
      map[leg.from_activity_id] ??= {}
      map[leg.from_activity_id][leg.to_activity_id] ??= {}
      map[leg.from_activity_id][leg.to_activity_id][leg.mode] = leg
    }
    return map
  }, [ routeLegs ])

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

  // How many adjacent-pair polylines are fallback straight lines (i.e. their
  // RouteLeg hasn't been cached yet). Drives both the batch button label and
  // its visibility — zero = hide entirely.
  const missingLegCount = useMemo(
    () => countMissingLegs(activitiesByDay, days, theme, routeLegsByPair),
    [ activitiesByDay, days, theme, routeLegsByPair ]
  )

  // Batch compute — fans out to MAX_PAIRS Amap calls on the server, cached
  // pairs short-circuit. Uses Inertia partial reload so route_legs prop
  // refreshes and buildPolylineConfigs re-renders real polylines.
  const handleBatchCompute = () => {
    if (!tourId) return
    setBatchSaving(true)
    router.post(`/tours/${tourId}/route_legs_batch`, {}, {
      preserveScroll: true,
      only: [ 'route_legs', 'flash' ],
      onFinish: () => setBatchSaving(false),
      onError: () => notifications.show({ message: '批量计算失败', color: 'red' }),
    })
  }

  // Click-to-compute a single uncached segment. Uses a notification id so
  // mid-request state can update in place rather than stacking toasts.
  const handleSingleLegCompute = (fromId, toId) => {
    if (!tourId) return
    const nid = `leg-${fromId}-${toId}`
    notifications.show({
      id: nid, message: '正在计算路线…', loading: true, autoClose: false, withCloseButton: false,
    })
    router.post(`/tours/${tourId}/route_legs`,
      { from_activity_id: fromId, to_activity_id: toId, mode: 'driving' },
      {
        preserveScroll: true,
        only: [ 'route_legs', 'flash' ],
        onSuccess: (page) => {
          const alert = page?.props?.flash?.alert
          if (alert) {
            notifications.update({ id: nid, message: alert, color: 'red', loading: false, autoClose: 3000 })
          } else {
            notifications.update({ id: nid, message: '路线已算好', color: 'green', loading: false, autoClose: 2000 })
          }
        },
        onError: () => notifications.update({
          id: nid, message: '计算失败', color: 'red', loading: false, autoClose: 3000,
        }),
      }
    )
  }

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
      zoom: 4,
      center: [ 104, 35 ], // 中国大致中心 — 空态默认视图
      viewMode: '2D',
      resizeEnable: true
    })
    return () => {
      polylinesRef.current.forEach(p => p.setMap(null))
      polylinesRef.current = []
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
    markerByIdRef.current = {}

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
        anchor: 'center',
        extData: { activity: a },
      })
      const info = new window.AMap.InfoWindow({
        content: `<div style="padding:6px 10px;font-size:12px;line-height:1.5">
          <strong>${escapeHtml(a.name)}</strong><br/>
          <span style="color:#888">${inDay ? `已排入 D${inDay}` : '尚未排入（backlog）'}</span>
        </div>`,
        offset: new window.AMap.Pixel(0, -20)
      })
      marker.on('click', () => info.open(map, marker.getPosition()))
      marker.on('mouseover', () => onMarkerHoverRef.current?.(a.id))
      marker.on('mouseout',  () => onMarkerLeaveRef.current?.())
      marker.setMap(map)
      markersRef.current.push(marker)
      markerByIdRef.current[a.id] = marker
    })

    // Frame view to fit visible markers; fallbacks for 0/1 markers
    if (visible.length > 1) {
      map.setFitView(markersRef.current, false, [ 40, 40, 40, 40 ], 12)
    } else if (visible.length === 1) {
      map.setZoomAndCenter(10, [ visible[0].lng, visible[0].lat ])
    }
    // visible.length === 0: don't move map (user keeps current view)
  }, [ activities, dayIndexById, viewMode, theme, sdkState ])

  // Sync marker highlight state with hoveredActivityIds. Only touches markers
  // whose highlighted state actually changed (union of previous and next ids).
  // Typical hover affects 1-2 ids out of 50+ markers, so this is O(1) vs the
  // naive "rebuild all markers" approach which was O(n) per hover event.
  // Note: when dayIndexById or theme changes, the separate markers-sync effect
  // rebuilds all markers from scratch, so this effect doesn't need to worry
  // about repainting unchanged markers on theme change.
  useEffect(() => {
    if (!window.AMap) return
    const next = hoveredActivityIds || []
    const prev = prevHoveredIdsRef.current
    const touchedIds = new Set([ ...prev, ...next ])
    touchedIds.forEach(id => {
      const marker = markerByIdRef.current[id]
      if (!marker) return
      const a = marker.getExtData?.().activity
      if (!a) return
      const isHot = next.includes(a.id)
      marker.setContent(buildMarkerHTML(a, dayIndexById, theme, isHot))
    })
    prevHoveredIdsRef.current = next
  }, [ hoveredActivityIds, dayIndexById, theme ])

  // Sync polylines with activities + days + viewMode + theme.
  // 'backlog' mode hides polylines entirely.
  // Straight (uncached) polylines get hover + click handlers so editors can
  // compute a single leg without leaving the map. Real-route polylines are
  // non-interactive — nothing to do there.
  useEffect(() => {
    const map = mapRef.current
    if (!map || !window.AMap) return

    // Close any stray hover tooltip before ripping old polylines out.
    tooltipRef.current?.close?.()
    tooltipRef.current = null
    polylinesRef.current.forEach(p => p.setMap(null))
    polylinesRef.current = []

    if (viewMode === 'backlog') return  // no polylines in backlog mode

    const configs = buildPolylineConfigs(activitiesByDay, days, theme, routeLegsByPair)
    configs.forEach(cfg => {
      const interactive = canEdit && cfg.extData?.isStraight
      const polyline = new window.AMap.Polyline({
        ...cfg,
        cursor: interactive ? 'pointer' : 'default',
        extData: cfg.extData,
      })

      if (interactive) {
        polyline.on('mouseover', (e) => {
          tooltipRef.current?.close?.()
          tooltipRef.current = new window.AMap.InfoWindow({
            content: `<div style="font-size:12px;padding:4px 10px;background:rgba(0,0,0,0.78);color:#fff;border-radius:3px;white-space:nowrap">未计算真实路线 · 点此计算</div>`,
            isCustom: true,
            offset: new window.AMap.Pixel(0, -12),
          })
          tooltipRef.current.open(map, e.lnglat)
        })
        polyline.on('mouseout', () => {
          tooltipRef.current?.close?.()
          tooltipRef.current = null
        })
        polyline.on('click', () => {
          tooltipRef.current?.close?.()
          tooltipRef.current = null
          const { fromId, toId } = cfg.extData
          handleSingleLegCompute(fromId, toId)
        })
      }

      polyline.setMap(map)
      polylinesRef.current.push(polyline)
    })
  }, [ activitiesByDay, days, viewMode, theme, sdkState, routeLegsByPair, canEdit ])  // eslint-disable-line react-hooks/exhaustive-deps

  // Defensive: AMAP claims resizeEnable: true auto-detects container size changes,
  // but in flex layouts this is unreliable. Explicitly call map.resize() via
  // ResizeObserver so drag-resize of parent flex panels redraws the map correctly.
  useEffect(() => {
    const map = mapRef.current
    const container = containerRef.current
    if (!map || !container || typeof window.ResizeObserver === 'undefined') return

    const observer = new window.ResizeObserver(() => {
      map.resize?.()
    })
    observer.observe(container)
    return () => observer.disconnect()
  }, [sdkState])

  return (
    <Paper
      withBorder
      style={{ height: '100%', position: 'relative', overflow: 'hidden', background: '#fafafa' }}
    >
      <div ref={containerRef} style={{ position: 'absolute', inset: 0 }} />
      {sdkState === 'ready' && !authFailed && (
        <MapToolbar>
          <ViewModeRadio value={viewMode} onChange={setViewMode} />
          {canEdit && missingLegCount > 0 && (
            <Button
              size="compact-xs"
              variant="light"
              leftSection={<IconRoute size={14} />}
              loading={batchSaving}
              onClick={handleBatchCompute}
            >
              算全部路线 ({missingLegCount})
            </Button>
          )}
        </MapToolbar>
      )}
      {sdkState === 'loading' && (
        <Overlay>地图加载中…</Overlay>
      )}
      {sdkState === 'idle' && (
        <Overlay>地图未启用</Overlay>
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

// Floating container in the top-right corner of the map. Stacks any number
// of children (ViewModeRadio, batch button, etc.) with small gaps. White
// card look matches AMAP's own built-in UI panels.
function MapToolbar({ children }) {
  return (
    <div style={{
      position: 'absolute', top: 8, right: 8, zIndex: 2,
      display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6,
    }}>
      {children}
    </div>
  )
}

// SegmentedControl for view mode. Three modes:
//   all     — every marker + polylines
//   colored — only day-assigned markers + polylines
//   backlog — only backlog markers, no polylines
function ViewModeRadio({ value, onChange }) {
  return (
    <div style={{
      background: 'white', borderRadius: 4, padding: 2,
      boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
    }}>
      <SegmentedControl
        value={value}
        onChange={onChange}
        data={[
          { value: 'all',     label: '全部' },
          { value: 'colored', label: '按天着色' },
          { value: 'backlog', label: '仅候选' },
        ]}
        size="xs"
      />
    </div>
  )
}

export default function PlannerMap({
  activities,
  days = [],
  routeLegs = [],
  tourId,
  canEdit = false,
  open = true,
  onToggle,
  canToggle = true,
  flexStyle,
  hoveredActivityIds,
  onMarkerHover,
  onMarkerLeave,
}) {
  return (
    <PanelShell
      title="地图"
      icon={<IconMap2 size={14} stroke={1.5} />}
      open={open}
      onToggle={onToggle}
      canToggle={canToggle}
      flexStyle={flexStyle}
    >
      <PlannerMapInner
        activities={activities}
        days={days}
        routeLegs={routeLegs}
        tourId={tourId}
        canEdit={canEdit}
        hoveredActivityIds={hoveredActivityIds}
        onMarkerHover={onMarkerHover}
        onMarkerLeave={onMarkerLeave}
      />
    </PanelShell>
  )
}
