import { useEffect, useRef, useState } from 'react'
import '../styles/gallery.css'

function GalleryCard({ photo, index, onOpen }) {
  return (
    <div
      className="gallery-card"
      role="button"
      tabIndex={0}
      aria-label={`查看大图: ${photo.title}`}
      onClick={() => onOpen(index)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onOpen(index)
        }
      }}
      data-gallery-card-index={index}
    >
      <div className="gallery-card-thumb-wrap">
        <img
          className="gallery-card-thumb"
          src={`/${photo.img?.thumb}`}
          alt={photo.title}
          loading="lazy"
        />
        <div className="gallery-card-overlay" aria-hidden="true">
          🔍 点击查看大图
        </div>
      </div>
      <div className="gallery-card-info">
        <p className="gallery-card-title">{photo.title}</p>
        {photo.reason && <p className="gallery-card-reason">{photo.reason}</p>}
      </div>
    </div>
  )
}

export default function GalleryPanel({
  spotName,
  photos,
  popupElement,
  sidebarWidth,
  onClose,
  onOpenLightbox,
  triggerRef,
}) {
  const panelRef = useRef(null)
  const closeRef = useRef(null)

  // Track popup position with rAF so the panel follows map zoom/pan
  const [pos, setPos] = useState({ top: -9999, left: -9999, flip: false })

  useEffect(() => {
    if (!popupElement) return

    let rafId
    let prevTop = null
    let prevLeft = null

    function sync() {
      const popupRect = popupElement.getBoundingClientRect()
      const panelWidth = 320
      const gap = 12
      const viewportWidth = window.innerWidth
      const sidebarRight = sidebarWidth || 370

      const rightEdge = popupRect.right + gap + panelWidth
      const wouldOverlapSidebar = rightEdge > viewportWidth - sidebarRight

      let left, flip
      if (wouldOverlapSidebar) {
        left = popupRect.left - gap - panelWidth
        flip = true
      } else {
        left = popupRect.right + gap
        flip = false
      }

      const maxTop = window.innerHeight - 500
      let top = Math.max(16, Math.min(popupRect.top, maxTop))
      left = Math.max(8, left)

      // Only update state when position actually changed
      if (top !== prevTop || left !== prevLeft) {
        prevTop = top
        prevLeft = left
        setPos({ top, left, flip })
      }

      rafId = requestAnimationFrame(sync)
    }

    rafId = requestAnimationFrame(sync)
    return () => cancelAnimationFrame(rafId)
  }, [popupElement, sidebarWidth])

  // Focus trap
  useEffect(() => {
    const panel = panelRef.current
    if (!panel) return

    closeRef.current?.focus()

    function handleKeyDown(e) {
      if (e.key === 'Escape') {
        e.preventDefault()
        onClose()
        triggerRef?.current?.focus()
        return
      }

      if (e.key === 'Tab') {
        const focusable = panel.querySelectorAll(
          'button, [role="button"][tabindex="0"]'
        )
        if (focusable.length === 0) return

        const first = focusable[0]
        const last = focusable[focusable.length - 1]

        if (e.shiftKey) {
          if (document.activeElement === first) {
            e.preventDefault()
            last.focus()
          }
        } else {
          if (document.activeElement === last) {
            e.preventDefault()
            first.focus()
          }
        }
      }
    }

    panel.addEventListener('keydown', handleKeyDown)
    return () => panel.removeEventListener('keydown', handleKeyDown)
  }, [onClose, triggerRef])

  if (!photos || photos.length === 0) return null

  return (
    <div
      ref={panelRef}
      className={`gallery-panel${pos.flip ? ' gallery-panel--flip' : ''}`}
      style={{ top: pos.top, left: pos.left }}
      role="complementary"
      aria-label="推荐机位"
    >
      <div className="gallery-header">
        <div className="gallery-header-info">
          <span className="gallery-header-title">{spotName}</span>
          <span className="gallery-header-count">{photos.length} 张推荐机位</span>
        </div>
        <button
          ref={closeRef}
          className="gallery-close-btn"
          aria-label="关闭图库"
          onClick={() => {
            onClose()
            triggerRef?.current?.focus()
          }}
        >
          ✕
        </button>
      </div>
      <div className="gallery-body">
        {photos.map((photo, idx) => (
          <GalleryCard
            key={idx}
            photo={photo}
            index={idx}
            onOpen={onOpenLightbox}
          />
        ))}
      </div>
    </div>
  )
}
