import { MapContainer, TileLayer, Polyline, Marker, Popup, useMap } from 'react-leaflet'
import { Text } from '@mantine/core'
import { useMemo, useEffect } from 'react'
import L from 'leaflet'
import '../styles/popup.css'

const TAG_EMOJI = {
  scenic: '📍',
  food: '🍜',
  fuel: '⛽',
  hike: '🥾',
  stay: '🏨',
  city: '🏙️',
}

const INTENSITY_COLORS = {
  green: '#16a34a',
  yellow: '#ca8a04',
  red: '#ef4444',
}

// Fix A: Use same colors for routes as markers (per HTML constitution)
// ROUTE_COLORS removed — use INTENSITY_COLORS for everything

function createMarkerIcon(label, emoji, color, size = 'main', dayId = null) {
  const isMain = size === 'main'
  const px = isMain ? 34 : 28
  const fontSize = isMain ? 13 : 11
  const emojiSize = isMain ? 14 : 12
  const dataAttr = dayId != null ? `data-day-id="${dayId}"` : ''

  const html = `
    <div ${dataAttr} style="display:flex; align-items:center; gap:2px; transition: opacity 0.3s ease;">
      <div style="
        width:${px}px; height:${px}px; border-radius:50%;
        background:${color}; border:2.5px solid rgba(255,255,255,0.9);
        display:flex; align-items:center; justify-content:center;
        font-size:${fontSize}px; font-weight:700; color:#0f172a;
        box-shadow: 0 0 8px ${color}60, 0 2px 6px rgba(0,0,0,0.2);
        flex-shrink:0;
      "><span style="font-size:${fontSize}px;">${label}</span></div>
      <span role="img" style="font-size:${emojiSize}px; filter:drop-shadow(0 1px 2px rgba(0,0,0,0.3));">${emoji}</span>
    </div>
  `

  return L.divIcon({
    html,
    className: '',
    iconSize: [px + 16, px + 10],
    iconAnchor: [(px + 16) / 2, (px + 10) / 2],
    popupAnchor: [0, -(px + 10) / 2 - 4],
  })
}

function getIntensityColor(days, dayId, colorMap) {
  const day = days[dayId - 1]
  if (!day) return colorMap.green
  return colorMap[day.intensity] || colorMap.green
}

function SpotPopup({ spot, pointDetail, photos, onGalleryToggle }) {
  const tags = spot.tags || []
  const photoCount = photos ? photos.length : 0

  return (
    <div className="popup-info">
      <h3>{spot.name}</h3>
      {tags.length > 0 && (
        <div className="tags">
          {tags.map((tag, i) => (
            <span key={i} className="tag">
              {TAG_EMOJI[tag] || ''} {tag}
            </span>
          ))}
        </div>
      )}
      {pointDetail?.desc && <p className="popup-desc">{pointDetail.desc}</p>}
      {pointDetail?.tip && (
        <div className="popup-tip">
          <span className="popup-tip-label">提示</span> {pointDetail.tip}
        </div>
      )}
      {photoCount > 0 ? (
        <button
          className="popup-gallery-toggle"
          onClick={() => onGalleryToggle?.(spot.name)}
        >
          📷 查看推荐机位 ({photoCount})
        </button>
      ) : (
        <span className="popup-no-photos">📷 暂无推荐机位</span>
      )}
    </div>
  )
}

function RoutePopupContent({ segment }) {
  return (
    <div>
      <div className="route-title">{segment.from} → {segment.to}</div>
      <div className="route-stats">
        <div className="route-stat">
          <div className="route-stat-value">{segment.km}</div>
          <div className="route-stat-label">里程</div>
        </div>
        <div className="route-stat">
          <div className="route-stat-value">{segment.drive}</div>
          <div className="route-stat-label">驾驶</div>
        </div>
      </div>
      <div className="route-road">🛣️ {segment.road}</div>
      <p>{segment.desc}</p>
      {segment.tip && <div className="route-tip">{segment.tip}</div>}
    </div>
  )
}

function MapController({ activeDayId, days }) {
  const map = useMap()

  useEffect(() => {
    if (activeDayId != null) {
      const day = days.find((d) => d.day === activeDayId)
      if (day) {
        const coords = []
        if (day.coordinates && Array.isArray(day.coordinates)) {
          coords.push(day.coordinates)
        }
        const points = day.points || day.highlights || []
        points.forEach((p) => {
          if (p.coordinates && Array.isArray(p.coordinates)) {
            coords.push(p.coordinates)
          } else if (p.lat && p.lng) {
            coords.push([p.lat, p.lng])
          }
        })
        if (coords.length > 0) {
          const bounds = L.latLngBounds(coords)
          map.flyToBounds(bounds, { padding: [60, 400] })
        }
      }
    }

    // Update marker opacity
    const container = map.getContainer()
    const markerEls = container.querySelectorAll('[data-day-id]')
    markerEls.forEach((el) => {
      const elDayId = parseInt(el.getAttribute('data-day-id'), 10)
      if (activeDayId == null) {
        el.style.opacity = '1'
      } else {
        el.style.opacity = elDayId === activeDayId ? '1' : '0.3'
      }
    })
  }, [activeDayId, days, map])

  return null
}

function FitBounds({ coords }) {
  const map = useMap()
  useEffect(() => {
    if (coords && coords.length > 1) {
      const bounds = L.latLngBounds(coords)
      setTimeout(() => map.fitBounds(bounds.pad(0.08)), 300)
    }
  }, [])
  return null
}

function PopupCloseWatcher({ onPopupClose }) {
  const map = useMap()

  useEffect(() => {
    if (!onPopupClose) return
    map.on('popupclose', onPopupClose)
    return () => map.off('popupclose', onPopupClose)
  }, [map, onPopupClose])

  return null
}

export default function MapPreview({ frontmatter, activeDayId, onGalleryToggle, onGalleryClose }) {
  const hasData = frontmatter && Array.isArray(frontmatter.days) && frontmatter.days.length > 0

  const center = useMemo(() => {
    if (!hasData) return [43.83, 87.62]
    const coords = frontmatter.route_coordinates
    if (Array.isArray(coords) && coords.length > 0) {
      const midIdx = Math.floor(coords.length / 2)
      return coords[midIdx]
    }
    const firstDay = frontmatter.days.find(d => d.coordinates)
    if (firstDay && Array.isArray(firstDay.coordinates)) {
      return firstDay.coordinates
    }
    return [43.83, 87.62]
  }, [frontmatter, hasData])

  if (!hasData) {
    return <Text c="dimmed" ta="center" py="xl">No map data available</Text>
  }

  const routeCoords = frontmatter.route_coordinates || []
  const routeSegments = frontmatter.route_segments || []
  const pointDetails = frontmatter.point_details || {}
  const pointPhotos = frontmatter.point_photos || {}
  const days = frontmatter.days || []

  return (
    <MapContainer center={center} zoom={7} style={{ height: '100%', width: '100%' }}>
      <MapController activeDayId={activeDayId ?? null} days={days} />
      <PopupCloseWatcher onPopupClose={onGalleryClose} />
      <FitBounds coords={routeCoords} />
      <TileLayer
        url="https://webrd0{s}.is.autonavi.com/appmaptile?lang=zh_cn&size=1&scale=1&style=8&x={x}&y={y}&z={z}"
        subdomains="1234"
        maxZoom={18}
        attribution="&copy; 高德地图"
      />

      {/* Route segments as individual colored polylines */}
      {routeSegments.map((segment, idx) => {
        const segCoords = routeCoords.slice(segment.startIdx, segment.endIdx + 1)
        if (segCoords.length < 2) return null
        const color = getIntensityColor(days, segment.dayId, INTENSITY_COLORS)

        return [
          <Polyline
            key={`route-glow-${idx}`}
            positions={segCoords}
            color={color}
            weight={10}
            opacity={0.12}
            interactive={false}
          />,
          <Polyline
            key={`route-${idx}`}
            positions={segCoords}
            color={color}
            weight={4}
            opacity={0.8}
            dashArray="10 5"
            lineCap="round"
            lineJoin="round"
          >
            <Popup className="route-popup">
              <RoutePopupContent segment={segment} />
            </Popup>
          </Polyline>
        ]
      })}

      {/* Day markers and highlight markers */}
      {days.map((day) => {
        const dayColor = INTENSITY_COLORS[day.intensity] || INTENSITY_COLORS.green
        const markers = []

        // Main day marker
        if (day.coordinates && Array.isArray(day.coordinates)) {
          const mainType = day.points?.[0]?.tags?.[0] || 'city'
          const icon = createMarkerIcon(`D${day.day}`, TAG_EMOJI[mainType] || '🏙️', dayColor, 'main', day.day)
          const detailKey = day.title
          const detail = pointDetails[detailKey]
          const photos = pointPhotos[detailKey]

          markers.push(
            <Marker key={`day-${day.day}`} position={day.coordinates} icon={icon}>
              <Popup className="popup-custom" maxWidth={380}>
                <SpotPopup
                  spot={{ name: `D${day.day}: ${day.title}`, tags: day.points?.[0]?.tags || [] }}
                  pointDetail={detail}
                  photos={photos}
                  onGalleryToggle={onGalleryToggle}
                />
              </Popup>
            </Marker>
          )
        }

        // Secondary point markers for each highlight/point in the day
        const points = day.points || day.highlights || []
        points.forEach((point, i) => {
          const pointCoords = point.coordinates || (point.lat && point.lng ? [point.lat, point.lng] : null)
          if (!pointCoords) return
          const pointType = point.type || point.tags?.[0] || 'scenic'
          const icon = createMarkerIcon(`D${day.day}`, TAG_EMOJI[pointType] || '📍', dayColor, 'secondary', day.day)
          const detailKey = point.name
          const detail = pointDetails[detailKey]
          const photos = pointPhotos[detailKey]

          markers.push(
            <Marker key={`pt-${day.day}-${i}`} position={pointCoords} icon={icon}>
              <Popup className="popup-custom" maxWidth={380}>
                <SpotPopup
                  spot={point}
                  pointDetail={detail}
                  photos={photos}
                  onGalleryToggle={onGalleryToggle}
                />
              </Popup>
            </Marker>
          )
        })

        return markers
      })}
    </MapContainer>
  )
}
