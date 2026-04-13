import { useState, useMemo, useCallback, useRef } from 'react'
import { MantineProvider, createTheme, ScrollArea } from '@mantine/core'
import { Link } from '@inertiajs/react'
import { useMediaQuery } from '@mantine/hooks'
import '@mantine/core/styles.css'
import '../../styles/responsive.css'
import '../../styles/accessibility.css'
import MapPreview from '../../components/MapPreview'
import MarkdownPreview from '../../components/MarkdownPreview'
import DayCard from '../../components/DayCard'
import GalleryPanel from '../../components/GalleryPanel'
import Lightbox from '../../components/Lightbox'

const theme = createTheme({
  primaryColor: 'blue',
  fontFamily: '-apple-system, "PingFang SC", "Microsoft YaHei", sans-serif',
})

const topBarStyle = (sidebarCollapsed) => ({
  position: 'fixed', top: 16, right: sidebarCollapsed ? 16 : 386, zIndex: 1001,
  transition: 'right 0.3s ease',
  display: 'flex', alignItems: 'center',
  background: 'rgba(255,255,255,0.95)',
  backdropFilter: 'blur(12px)',
  border: '1px solid #e2e8f0',
  borderRadius: 10,
  boxShadow: '0 2px 12px rgba(0,0,0,0.08)',
  padding: '3px 4px',
})

const topBarItem = (active) => ({
  background: active ? '#e0f2fe' : 'transparent',
  border: 'none',
  borderRadius: 6,
  padding: '5px 10px',
  fontSize: 13,
  color: active ? '#0369a1' : '#1e293b',
  fontWeight: active ? 600 : 400,
  textDecoration: 'none',
  cursor: 'pointer',
  display: 'inline-flex',
  alignItems: 'center',
})

const topBarDivider = {
  width: 1, height: 20, background: '#e2e8f0', margin: '0 2px', flexShrink: 0,
}

const sidebarStyles = {
  container: (collapsed, mobile) => mobile ? {
    position: 'fixed',
    bottom: 0,
    left: 0,
    right: 0,
    width: '100%',
    height: '50vh',
    zIndex: 1000,
    background: 'linear-gradient(180deg, rgba(255,255,255,0.97) 0%, rgba(248,250,252,0.97) 100%)',
    backdropFilter: 'blur(12px)',
    borderTop: '1px solid #e2e8f0',
    borderRadius: '16px 16px 0 0',
    boxShadow: '0 -4px 20px rgba(0,0,0,0.08)',
    transform: collapsed ? 'translateY(50vh)' : 'translateY(0)',
    transition: 'transform 300ms ease',
    overflow: 'hidden',
  } : {
    width: 370,
    height: '100vh',
    position: 'fixed',
    top: 0,
    right: 0,
    zIndex: 1000,
    background: 'linear-gradient(180deg, rgba(255,255,255,0.97) 0%, rgba(248,250,252,0.97) 100%)',
    backdropFilter: 'blur(12px)',
    borderLeft: '1px solid #e2e8f0',
    boxShadow: '-4px 0 20px rgba(0,0,0,0.08)',
    transform: collapsed ? 'translateX(370px)' : 'translateX(0)',
    transition: 'transform 300ms ease',
    overflow: 'hidden',
  },
  toggleBtn: (collapsed, mobile) => mobile ? {
    position: 'fixed',
    bottom: 16,
    right: 16,
    zIndex: 1001,
    background: '#fff',
    border: '1px solid #e2e8f0',
    color: '#1e293b',
    padding: '8px 14px',
    borderRadius: 8,
    cursor: 'pointer',
    fontSize: 14,
    boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
    transition: 'bottom 0.3s ease',
  } : {
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
  },
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
  const [viewMode, setViewMode] = useState('map')
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [gallerySpot, setGallerySpot] = useState(null)
  const [lightboxState, setLightboxState] = useState(null)
  const galleryTriggerRef = useRef(null)
  const isMobile = useMediaQuery('(max-width: 768px)')

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
    return days.reduce((sum, d) => sum + (d.points?.length || d.highlights?.length || 0), 0)
  }, [days])

  const toggleSidebar = () => setSidebarCollapsed((prev) => !prev)

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden' }}>
      {/* Skip link */}
      <a href="#day-list" className="skip-link">
        跳到行程列表
      </a>

      {/* Unified top bar */}
      <div style={topBarStyle(sidebarCollapsed)}>
        <Link href="/" style={topBarItem(false)}>主页</Link>
        <span style={topBarDivider} />
        {guidebook.editable && (
          <Link href={`/guidebooks/${guidebook.id}/edit`} style={topBarItem(false)}>编辑</Link>
        )}
        {guidebook.owned && (
          <Link href={`/guidebooks/${guidebook.id}/memberships`} style={topBarItem(false)}>协作</Link>
        )}
        {(guidebook.editable || guidebook.owned) && <span style={topBarDivider} />}
        <button onClick={() => setViewMode('map')} style={topBarItem(viewMode === 'map')}>地图</button>
        <button onClick={() => setViewMode('markdown')} style={topBarItem(viewMode === 'markdown')}>文档</button>
        <span style={topBarDivider} />
        <button onClick={toggleSidebar} style={topBarItem(false)} aria-label="展开或收起行程面板">☰ 行程</button>
      </div>

      {/* Main content: map or markdown */}
      <div style={{ flex: 1, marginRight: sidebarCollapsed ? 0 : (isMobile ? 0 : 370) }} role="application" aria-label="自驾路线交互式地图">
        {viewMode === 'map' ? (
          <MapPreview
            frontmatter={fm}
            activeDayId={activeDayIndex != null ? days[activeDayIndex]?.day : null}
            onGalleryToggle={handleGalleryToggle}
            onGalleryClose={handleGalleryClose}
          />
        ) : (
          <MarkdownPreview content={(guidebook.content || '').replace(/^---\s*\n[\s\S]*?\n---\s*\n?/, '')} />
        )}
      </div>

      {/* Sidebar */}
      <nav role="navigation" aria-label="行程导航" style={sidebarStyles.container(sidebarCollapsed, isMobile)}>
        <ScrollArea h="100%" type="auto" offsetScrollbars>
          <div style={{ padding: 20 }}>
            {/* Title */}
            <h1 style={sidebarStyles.title}>{guidebook.title}</h1>

            {/* Subtitle */}
            <div style={sidebarStyles.subtitle}>
              {[fm.date_range, fm.vehicle, fm.team_size ? `${fm.team_size}人` : null].filter(Boolean).join(' · ')}
            </div>

            {/* Trip style card */}
            {fm.trip_style && (
              <div style={{ ...sidebarStyles.tripStyle, marginTop: 12 }}>
                {fm.trip_style}
              </div>
            )}

            {/* Legend */}
            <div style={sidebarStyles.legend}>
              <div style={sidebarStyles.legendItem}>
                <span role="img" aria-label="绿色圆点" style={sidebarStyles.legendDot('#16a34a')} /> 轻松
              </div>
              <div style={sidebarStyles.legendItem}>
                <span role="img" aria-label="黄色圆点" style={{ ...sidebarStyles.legendDot('#ca8a04'), border: '1px solid #92400e' }} /> 中等
              </div>
              <div style={sidebarStyles.legendItem}>
                <span role="img" aria-label="红色圆点" style={sidebarStyles.legendDot('#ef4444')} /> 高强度
              </div>
              <div style={sidebarStyles.legendItem}>
                <span role="img" aria-label="蓝色圆点" style={sidebarStyles.legendDot('#0284c7')} /> 路线
              </div>
            </div>

            {/* Day list */}
            <div id="day-list" role="list" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
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
              {fm.budget_per_person && (
                <div style={sidebarStyles.statItem}>
                  <div style={sidebarStyles.statValue}>{fm.budget_per_person}</div>
                  <div style={sidebarStyles.statLabel}>人均 ¥</div>
                </div>
              )}
            </div>
          </div>
        </ScrollArea>
      </nav>

      {/* Gallery Panel */}
      {gallerySpot && pointPhotos[gallerySpot] && (
        <GalleryPanel
          spotName={gallerySpot}
          photos={pointPhotos[gallerySpot]}
          popupElement={document.querySelector('.popup-custom .leaflet-popup-content-wrapper')}
          sidebarWidth={isMobile ? 0 : (sidebarCollapsed ? 0 : 370)}
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
