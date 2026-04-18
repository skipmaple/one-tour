import { useEffect, useRef, useState } from 'react'

/**
 * Draggable vertical divider between two flex panels.
 *
 * onResize(deltaPx) fires on every mousemove during a drag, with the cumulative
 * delta from the mousedown point (not the per-frame delta). The parent decides
 * how to translate that into grow-ratio changes.
 *
 * During a drag, a transparent fullscreen overlay captures mousemove/mouseup so
 * AMAP / iframes / canvases can't steal the events.
 *
 * Visual states:
 *   idle:    6px grey (#cfcfd3)
 *   hover:   10px blue (#0071e3)
 *   drag:    10px blue + tooltip showing "↔ ${currentDeltaPx}px"
 */
export default function ResizeHandle({ onResize, disabled = false }) {
  const [dragging, setDragging] = useState(false)
  const [hovering, setHovering] = useState(false)
  const [currentDelta, setCurrentDelta] = useState(0)
  const startXRef = useRef(0)

  useEffect(() => {
    if (!dragging) return

    function onMove(e) {
      const delta = e.clientX - startXRef.current
      setCurrentDelta(delta)
      onResize(delta)
    }
    function onUp() {
      setDragging(false)
      setCurrentDelta(0)
    }

    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
  }, [dragging, onResize])

  if (disabled) return null

  function onMouseDown(e) {
    startXRef.current = e.clientX
    setDragging(true)
  }

  const active = hovering || dragging
  const width = active ? 10 : 6

  return (
    <>
      <div
        role="separator"
        aria-orientation="vertical"
        onMouseDown={onMouseDown}
        onMouseEnter={() => setHovering(true)}
        onMouseLeave={() => setHovering(false)}
        style={{
          width,
          flex: `0 0 ${width}px`,
          cursor: 'col-resize',
          background: active ? '#0071e3' : '#cfcfd3',
          margin: '0 3px',
          borderRadius: 2,
          alignSelf: 'stretch',
          transition: 'background 0.1s, width 0.1s',
          position: 'relative',
        }}
      >
        {dragging && (
          <div style={{
            position: 'absolute',
            top: '50%',
            left: 18,
            transform: 'translateY(-50%)',
            background: '#0071e3',
            color: '#fff',
            fontSize: 11,
            padding: '4px 10px',
            borderRadius: 4,
            whiteSpace: 'nowrap',
            boxShadow: '0 2px 6px rgba(0,0,0,0.2)',
            pointerEvents: 'none',
            zIndex: 10000,
          }}>
            ↔ {currentDelta > 0 ? '+' : ''}{Math.round(currentDelta)}px
          </div>
        )}
      </div>
      {dragging && (
        <div style={{
          position: 'fixed',
          inset: 0,
          cursor: 'col-resize',
          zIndex: 9999,
        }} />
      )}
    </>
  )
}
