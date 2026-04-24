import { useEffect, useRef } from 'react'
import { usePage } from '@inertiajs/react'
import { Paper, Text } from '@mantine/core'
import useAmap from '../../hooks/useAmap'

// Interactive mini-map for LocationPicker: draggable pin that calls onMove on
// dragend. Unlike ActivityMiniMap (read-only), this one enables pan/zoom/drag
// and listens for map 'click' to re-position the pin. Reuses useAmap for
// shared SDK loading.
//
// 两个 useEffect：
//   1) Init effect — SDK ready 时建一次 Map + Marker（不依赖 lat/lng）
//   2) Position effect — lat/lng 变化时仅 setPosition + setCenter
// 否则每次拖钉都会 destroy + 重建 AMap 实例，闪烁、丢 zoom/viewport。
export default function LocationPickerMap({ lat, lng, onMove, height = 180 }) {
  const { amap_js_api_key, amap_js_security_code } = usePage().props
  const sdkState = useAmap(amap_js_api_key, amap_js_security_code)
  const containerRef = useRef(null)
  const mapRef = useRef(null)
  const markerRef = useRef(null)
  // onMove 用 ref 持有，避免它的引用变化触发 init effect 重建
  const onMoveRef = useRef(onMove)
  useEffect(() => { onMoveRef.current = onMove }, [onMove])

  // 1) Init: 创建一次 Map + Marker。lat/lng 用初始值定位中心。
  useEffect(() => {
    if (sdkState !== 'ready') return
    if (!containerRef.current || lat == null || lng == null) return
    if (mapRef.current) return  // 已初始化过，跳过

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

    marker.on('dragend', (e) => {
      const pos = e.target.getPosition()
      onMoveRef.current?.({ lat: pos.getLat(), lng: pos.getLng() })
    })
    map.on('click', (e) => {
      const nextLat = e.lnglat.getLat()
      const nextLng = e.lnglat.getLng()
      marker.setPosition([ nextLng, nextLat ])
      onMoveRef.current?.({ lat: nextLat, lng: nextLng })
    })

    return () => {
      marker?.setMap(null)
      map?.destroy()
      mapRef.current = null
      markerRef.current = null
    }
  }, [sdkState])  // eslint-disable-line react-hooks/exhaustive-deps

  // 2) Update position: lat/lng 变化只 setPosition / setCenter，不重建实例。
  useEffect(() => {
    if (!mapRef.current || !markerRef.current) return
    if (lat == null || lng == null) return
    markerRef.current.setPosition([ lng, lat ])
    mapRef.current.setCenter([ lng, lat ])
  }, [lat, lng])

  if (sdkState === 'loading') {
    return <Paper withBorder p="sm" style={{ height }}><Text size="xs" c="dimmed">地图加载中…</Text></Paper>
  }
  if (sdkState === 'error') {
    return <Paper withBorder p="sm" style={{ height }}><Text size="xs" c="red">地图不可用</Text></Paper>
  }
  return <div ref={containerRef} style={{ height, borderRadius: 4, overflow: 'hidden' }} />
}
