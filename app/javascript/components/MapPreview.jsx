import { MapContainer, TileLayer, Polyline, Marker, Popup } from 'react-leaflet'
import { Text } from '@mantine/core'
import { useMemo } from 'react'

export default function MapPreview({ frontmatter }) {
  const hasData = frontmatter && Array.isArray(frontmatter.days) && frontmatter.days.length > 0

  const center = useMemo(() => {
    if (!hasData) return [43.83, 87.62]
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
  const days = frontmatter.days || []

  return (
    <MapContainer center={center} zoom={7} style={{ height: '100%', width: '100%' }}>
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      {routeCoords.length > 1 && (
        <Polyline positions={routeCoords} color="#0ea5e9" weight={3} opacity={0.8} />
      )}
      {days.map((day) => {
        if (!day.coordinates || !Array.isArray(day.coordinates)) return null
        return (
          <Marker key={`day-${day.day}`} position={day.coordinates}>
            <Popup>
              <strong>D{day.day}: {day.title}</strong>
              {day.km > 0 && <br />}
              {day.km > 0 && `${day.km} km`}
            </Popup>
          </Marker>
        )
      })}
      {days.flatMap((day) =>
        (day.highlights || []).map((hl, i) => {
          if (!hl.coordinates || !Array.isArray(hl.coordinates)) return null
          return (
            <Marker key={`hl-${day.day}-${i}`} position={hl.coordinates}>
              <Popup>{hl.name}</Popup>
            </Marker>
          )
        })
      )}
    </MapContainer>
  )
}
