import { useEffect, useRef, useState, useCallback } from 'react'
import '../styles/lightbox.css'

export default function Lightbox({
  photos,
  spotName,
  initialIndex,
  onClose,
  triggerIndex,
}) {
  const [currentIndex, setCurrentIndex] = useState(initialIndex || 0)
  const backdropRef = useRef(null)
  const closeRef = useRef(null)
  const liveRef = useRef(null)

  const photo = photos[currentIndex]
  const total = photos.length
  const showNav = total > 1

  const goNext = useCallback(() => {
    setCurrentIndex((i) => (i + 1) % total)
  }, [total])

  const goPrev = useCallback(() => {
    setCurrentIndex((i) => (i - 1 + total) % total)
  }, [total])

  // Announce photo change to screen readers
  useEffect(() => {
    if (liveRef.current && photo) {
      liveRef.current.textContent = `${photo.title}, 第 ${currentIndex + 1} 张, 共 ${total} 张`
    }
  }, [currentIndex, photo, total])

  // Keyboard handling
  useEffect(() => {
    function handleKeyDown(e) {
      if (e.key === 'Escape') {
        e.preventDefault()
        onClose()
        return
      }
      if (e.key === 'ArrowRight' && showNav) {
        e.preventDefault()
        goNext()
      }
      if (e.key === 'ArrowLeft' && showNav) {
        e.preventDefault()
        goPrev()
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [onClose, goNext, goPrev, showNav])

  // Focus close button on mount
  useEffect(() => {
    closeRef.current?.focus()
  }, [])

  // Focus return on unmount
  useEffect(() => {
    return () => {
      if (triggerIndex != null) {
        const card = document.querySelector(
          `[data-gallery-card-index="${triggerIndex}"]`
        )
        card?.focus()
      }
    }
  }, [triggerIndex])

  function handleBackdropClick(e) {
    if (e.target === backdropRef.current) {
      onClose()
    }
  }

  if (!photo) return null

  return (
    <div
      ref={backdropRef}
      className="lightbox-backdrop"
      role="dialog"
      aria-label="图片大图预览"
      aria-modal="true"
      onClick={handleBackdropClick}
    >
      {/* Close button */}
      <button
        ref={closeRef}
        className="lightbox-close-btn"
        aria-label="关闭大图"
        onClick={onClose}
      >
        ×
      </button>

      {/* Nav buttons */}
      {showNav && (
        <>
          <button
            className="lightbox-nav-btn lightbox-nav-prev"
            aria-label="上一张"
            onClick={goPrev}
          >
            ‹
          </button>
          <button
            className="lightbox-nav-btn lightbox-nav-next"
            aria-label="下一张"
            onClick={goNext}
          >
            ›
          </button>
        </>
      )}

      {/* Content */}
      <div className="lightbox-container">
        <div className="lightbox-image-wrap">
          <img
            className="lightbox-image"
            src={`/${photo.img?.hd}`}
            alt={photo.title}
          />
        </div>
        <div className="lightbox-info">
          <h2 className="lightbox-info-title">{photo.title}</h2>
          <p className="lightbox-info-spot">{spotName}</p>
          {photo.reason && (
            <p className="lightbox-info-reason">{photo.reason}</p>
          )}
        </div>
      </div>

      {/* Live region for screen readers */}
      <div
        ref={liveRef}
        className="lightbox-live-region"
        aria-live="polite"
        role="status"
      />
    </div>
  )
}
