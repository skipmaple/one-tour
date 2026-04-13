import { useState, useMemo, useCallback, useRef } from 'react'
import { MantineProvider, createTheme, ScrollArea } from '@mantine/core'
import '@mantine/core/styles.css'
import MapPreview from '../../components/MapPreview'
import DayCard from '../../components/DayCard'
import GalleryPanel from '../../components/GalleryPanel'
import Lightbox from '../../components/Lightbox'

const theme = createTheme({
  primaryColor: 'blue',
  fontFamily: '-apple-system, "PingFang SC", "Microsoft YaHei", sans-serif',
})

const sidebarStyles = {
  container: (collapsed) => ({
    width: 370,
    height: '100%',
    position: 'relative',
    flexShrink: 0,
    background: 'linear-gradient(180deg, rgba(255,255,255,0.97) 0%, rgba(248,250,252,0.97) 100%)',
    backdropFilter: 'blur(12px)',
    borderLeft: '1px solid #e2e8f0',
    boxShadow: '-4px 0 20px rgba(0,0,0,0.08)',
    transform: collapsed ? 'translateX(370px)' : 'translateX(0)',
    transition: 'transform 300ms ease',
    overflow: 'hidden',
  }),
  toggleBtn: (collapsed) => ({
    position: 'fixed',
    top: 16,
    right: collapsed ? 16 : 380,
    zIndex: 1001,
    background: '#fff',
    border: '1px solid #e2e8f0',
    color: '#1e293b',
    padding: '8px 14px',
    borderRadius: 8,
    cursor: 'pointer',
    fontSize: 14,
    boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
    transition: 'right 0.3s ease',
  }),
  title: {
    fontSize: 20,
    fontWeight: 700,
    color: '#0f172a',
    margin: 0,
  },
  subtitle: {
    fontSize: 13,
    color: '#64748b',
    marginTop: 4,
  },
  tripStyle: {
    fontSize: 13,
    color: '#475569',
    lineHeight: 1.5,
    padding: '10px 14px',
    marginBottom: 16,
    background: '#f0fdf4',
    borderRadius: 8,
    border: '1px solid #bbf7d0',
  },
  legend: {
    display: 'flex',
    gap: 14,
    marginBottom: 16,
    padding: '10px 0',
    borderBottom: '1px solid #e2e8f0',
  },
  legendItem: {
    display: 'flex',
    alignItems: 'center',
    gap: 5,
    fontSize: 12,
    color: '#64748b',
  },
  legendDot: (color) => ({
    width: 10,
    height: 10,
    borderRadius: '50%',
    background: color,
    display: 'inline-block',
  }),
  statsBar: {
    display: 'flex',
    gap: 12,
    padding: '14px 16px',
    background: '#f1f5f9',
    borderRadius: 10,
    marginTop: 16,
  },
  statItem: {
    textAlign: 'center',
    flex: 1,
  },
  statValue: {
    fontSize: 18,
    fontWeight: 700,
    color: '#0369a1',
  },
  statLabel: {
    fontSize: 11,
    color: '#475569',
    marginTop: 2,
  },
}

export default function Show({ guidebook }) {
  const fm = guidebook.frontmatter || {}
  const days = fm.days || []
  const [activeDayIndex, setActiveDayIndex] = useState(null)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [gallerySpot, setGallerySpot] = useState(null)
  const [lightboxState, setLightboxState] = useState(null)
  const galleryTriggerRef = useRef(null)

  const pointPhotos = fm.point_photos || {}

  const handleGalleryToggle = useCallback((spotName) => {
    setGallerySpot(spotName)
    // Capture the trigger button for focus return
    const btn = document.querySelector('.popup-gallery-toggle')
    galleryTriggerRef.current = btn
  }, [])

  const handleGalleryClose = useCallback(() => {
    setGallerySpot(null)
  }, [])

  const handleOpenLightbox = useCallback((index) => {
    if (gallerySpot) {
      setLightboxState({ spot: gallerySpot, index })
    }
  }, [gallerySpot])

  const handleCloseLightbox = useCallback(() => {
    setLightboxState(null)
  }, [])

  const totalSpots = useMemo(() => {
    return days.reduce((sum, d) => sum + (d.highlights?.length || 0), 0)
  }, [days])

  const toggleSidebar = () => setSidebarCollapsed((prev) => !prev)

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden' }}>
      {/* Map */}
      <div style={{ flex: 1 }}>
        <MapPreview
          frontmatter={fm}
          activeDayId={activeDayIndex != null ? days[activeDayIndex]?.day : null}
          onGalleryToggle={handleGalleryToggle}
          onGalleryClose={handleGalleryClose}
        />
      </div>

      {/* Toggle button */}
      <button onClick={toggleSidebar} style={sidebarStyles.toggleBtn(sidebarCollapsed)}>
        {sidebarCollapsed ? '☰' : '✕'}
      </button>

      {/* Sidebar */}
      <div style={sidebarStyles.container(sidebarCollapsed)}>
        <ScrollArea h="100%" type="auto" offsetScrollbars>
          <div style={{ padding: 20 }}>
            {/* Title */}
            <h1 style={sidebarStyles.title}>{guidebook.title}</h1>

            {/* Subtitle - date range */}
            {fm.date_range && (
              <div style={sidebarStyles.subtitle}>{fm.date_range}</div>
            )}

            {/* Trip style card */}
            {(fm.vehicle || fm.team_size) && (
              <div style={{ ...sidebarStyles.tripStyle, marginTop: 12 }}>
                🚗 {fm.vehicle || '自驾'} · 👥 {fm.team_size || '?'}人 · 每日驾驶≤5h
              </div>
            )}

            {/* Legend */}
            <div style={sidebarStyles.legend}>
              <div style={sidebarStyles.legendItem}>
                <span style={sidebarStyles.legendDot('#16a34a')} /> 轻松
              </div>
              <div style={sidebarStyles.legendItem}>
                <span style={sidebarStyles.legendDot('#ca8a04')} /> 中等
              </div>
              <div style={sidebarStyles.legendItem}>
                <span style={sidebarStyles.legendDot('#ef4444')} /> 高强度
              </div>
            </div>

            {/* Day list */}
            <div role="list" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {days.map((day, idx) => (
                <DayCard
                  key={day.day}
                  day={day}
                  active={activeDayIndex === idx}
                  onClick={() => setActiveDayIndex(activeDayIndex === idx ? null : idx)}
                />
              ))}
            </div>

            {/* Stats bar */}
            <div style={sidebarStyles.statsBar}>
              <div style={sidebarStyles.statItem}>
                <div style={sidebarStyles.statValue}>{days.length}</div>
                <div style={sidebarStyles.statLabel}>天</div>
              </div>
              <div style={sidebarStyles.statItem}>
                <div style={sidebarStyles.statValue}>{fm.total_km?.toLocaleString() || 0}</div>
                <div style={sidebarStyles.statLabel}>公里</div>
              </div>
              <div style={sidebarStyles.statItem}>
                <div style={sidebarStyles.statValue}>{totalSpots}</div>
                <div style={sidebarStyles.statLabel}>景点</div>
              </div>
            </div>
          </div>
        </ScrollArea>
      </div>

      {/* Gallery Panel */}
      {gallerySpot && pointPhotos[gallerySpot] && (
        <GalleryPanel
          spotName={gallerySpot}
          photos={pointPhotos[gallerySpot]}
          popupElement={document.querySelector('.popup-custom .leaflet-popup-content-wrapper')}
          sidebarWidth={sidebarCollapsed ? 0 : 370}
          onClose={handleGalleryClose}
          onOpenLightbox={handleOpenLightbox}
          triggerRef={galleryTriggerRef}
        />
      )}

      {/* Lightbox */}
      {lightboxState && pointPhotos[lightboxState.spot] && (
        <Lightbox
          photos={pointPhotos[lightboxState.spot]}
          spotName={lightboxState.spot}
          initialIndex={lightboxState.index}
          onClose={handleCloseLightbox}
          triggerIndex={lightboxState.index}
        />
      )}
    </div>
  )
}

// Full-screen layout — no AppLayout wrapper
Show.layout = (page) => (
  <MantineProvider theme={theme}>
    {page}
  </MantineProvider>
)
