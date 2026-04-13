import { useEffect, useRef, useCallback } from 'react'
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
          src={photo.img?.thumb}
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

  // Calculate position relative to popup
  const position = useCallback(() => {
    if (!popupElement) return { top: 100, left: 100, flip: false }

    const popupRect = popupElement.getBoundingClientRect()
    const panelWidth = 320
    const gap = 12
    const viewportWidth = window.innerWidth
    const sidebarRight = sidebarWidth || 370

    // Try right side first
    const rightEdge = popupRect.right + gap + panelWidth
    const wouldOverlapSidebar = rightEdge > viewportWidth - sidebarRight

    let left, flip
    if (wouldOverlapSidebar) {
      // Flip to left
      left = popupRect.left - gap - panelWidth
      flip = true
    } else {
      left = popupRect.right + gap
      flip = false
    }

    // Vertical: align top with popup, clamp to viewport
    const maxTop = window.innerHeight - 500 // rough max-height guard
    let top = Math.max(16, Math.min(popupRect.top, maxTop))

    return { top, left: Math.max(8, left), flip }
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

  const pos = position()

  return (
    <div
      ref={panelRef}
      className={`gallery-panel${pos.flip ? ' gallery-panel--flip' : ''}`}
      style={{ top: pos.top, left: pos.left }}
      role="dialog"
      aria-label={`${spotName} 推荐机位`}
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
