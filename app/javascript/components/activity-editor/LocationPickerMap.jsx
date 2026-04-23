import { useEffect, useRef } from 'react'
import { usePage } from '@inertiajs/react'
import { Paper, Text } from '@mantine/core'
import useAmap from '../../hooks/useAmap'

// Interactive mini-map for LocationPicker: draggable pin that calls onMove on
// dragend. Unlike ActivityMiniMap (read-only), this one enables pan/zoom/drag
// and listens for map 'click' to re-position the pin. Reuses useAmap for
// shared SDK loading.
export default function LocationPickerMap({ lat, lng, onMove, height = 180 }) {
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
      dragEnable: true,
      zoomEnable: true,
      doubleClickZoom: true,
      scrollWheel: true,
      keyboardEnable: false,
    })
    mapRef.current = map

    const marker = new window.AMap.Marker({
      position: [ lng, lat ],
      map,
      draggable: true,
      anchor: 'bottom-center',
    })
    markerRef.current = marker

    const handleDragend = (e) => {
      const pos = e.target.getPosition()
      onMove?.({ lat: pos.getLat(), lng: pos.getLng() })
    }
    marker.on('dragend', handleDragend)

    const handleClick = (e) => {
      const nextLat = e.lnglat.getLat()
      const nextLng = e.lnglat.getLng()
      marker.setPosition([ nextLng, nextLat ])
      onMove?.({ lat: nextLat, lng: nextLng })
    }
    map.on('click', handleClick)

    return () => {
      marker?.setMap(null)
      map?.destroy()
      mapRef.current = null
      markerRef.current = null
    }
  }, [sdkState, lat, lng])  // eslint-disable-line react-hooks/exhaustive-deps

  if (sdkState === 'loading') {
    return <Paper withBorder p="sm" style={{ height }}><Text size="xs" c="dimmed">地图加载中…</Text></Paper>
  }
  if (sdkState === 'error') {
    return <Paper withBorder p="sm" style={{ height }}><Text size="xs" c="red">地图不可用</Text></Paper>
  }
  return <div ref={containerRef} style={{ height, borderRadius: 4, overflow: 'hidden' }} />
}
