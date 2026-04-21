import { useEffect, useRef } from 'react'
import { usePage } from '@inertiajs/react'
import { Paper, Text } from '@mantine/core'
import useAmap from '../../hooks/useAmap'

// Small, read-only map showing one activity's location. Read-only means:
// no zoom/drag interaction (disables user manipulation), no map type switcher,
// no popup on marker click. Mounts once per (lat, lng), destroys on unmount.
//
// SDK loading is shared with PlannerMap via `useAmap` — if the main map has
// already kicked off the SDK load, this component waits on the same ready
// event instead of re-loading.
//
// Returns a "地图不可用" placeholder if SDK credentials are absent
// (dev/local without AMAP keys). The parent section handles coords-missing
// layout separately (doesn't render this component at all when lat/lng null).
export default function ActivityMiniMap({ lat, lng, height = 160 }) {
  const { amap_js_api_key, amap_js_security_code } = usePage().props
  const sdkState = useAmap(amap_js_api_key, amap_js_security_code)
  const containerRef = useRef(null)
  const mapRef = useRef(null)
  const markerRef = useRef(null)

  useEffect(() => {
    if (sdkState !== 'ready') return
    if (!containerRef.current || lat == null || lng == null) return

    const map = new window.AMap.Map(containerRef.current, {
      zoom: 14,
      center: [ lng, lat ],
      dragEnable: false,
      zoomEnable: false,
      doubleClickZoom: false,
      scrollWheel: false,
      keyboardEnable: false,
    })
    mapRef.current = map

    const marker = new window.AMap.Marker({
      position: [ lng, lat ],
      map,
      anchor: 'bottom-center',
    })
    markerRef.current = marker

    return () => {
      marker?.setMap(null)
      map?.destroy()
      mapRef.current = null
      markerRef.current = null
    }
  }, [ sdkState, lat, lng ])

  if (sdkState === 'idle' || sdkState === 'error') {
    return (
      <Paper withBorder p="xs" style={{ height, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Text size="xs" c="dimmed">地图不可用</Text>
      </Paper>
    )
  }

  return (
    <div
      ref={containerRef}
      data-testid="activity-mini-map"
      style={{ width: '100%', height, borderRadius: 4, overflow: 'hidden' }}
    />
  )
}
