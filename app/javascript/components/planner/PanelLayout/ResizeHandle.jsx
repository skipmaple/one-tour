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
 */
export default function ResizeHandle({ onResize, disabled = false }) {
  const [dragging, setDragging] = useState(false)
  const startXRef = useRef(0)

  useEffect(() => {
    if (!dragging) return

    function onMove(e) {
      onResize(e.clientX - startXRef.current)
    }
    function onUp() {
      setDragging(false)
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

  return (
    <>
      <div
        role="separator"
        aria-orientation="vertical"
        onMouseDown={onMouseDown}
        style={{
          width: 6,
          flex: '0 0 6px',
          cursor: 'col-resize',
          background: dragging ? '#0071e3' : '#cfcfd3',
          margin: '0 3px',
          borderRadius: 2,
          alignSelf: 'stretch',
          transition: 'background 0.1s',
        }}
      />
      {dragging && (
        // Fullscreen capture overlay — prevents AMAP / iframes from stealing events
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
