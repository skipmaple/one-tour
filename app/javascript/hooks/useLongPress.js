import { useRef } from 'react'

// 触屏长按检测，与 dnd-kit 拖拽共存。拖拽在移动 ≥5px 时激活（Show.jsx 的
// PointerSensor distance 约束），长按要求"静止"——二者天然互斥。只有 touch
// 指针武装计时器；鼠标走右键（onContextMenu），不走长按。
export default function useLongPress(onLongPress, { delay = 500, moveTolerance = 8 } = {}) {
  const timer = useRef(null)
  const startPos = useRef(null)
  const firedRef = useRef(false)

  const clear = () => {
    if (timer.current) {
      clearTimeout(timer.current)
      timer.current = null
    }
    startPos.current = null
  }

  const onPointerDown = (e) => {
    if (e.pointerType !== 'touch') return
    firedRef.current = false
    const x = e.clientX
    const y = e.clientY
    startPos.current = { x, y }
    timer.current = setTimeout(() => {
      firedRef.current = true
      timer.current = null
      onLongPress(x, y)
    }, delay)
  }

  const onPointerMove = (e) => {
    if (!startPos.current) return
    const dx = Math.abs(e.clientX - startPos.current.x)
    const dy = Math.abs(e.clientY - startPos.current.y)
    if (dx > moveTolerance || dy > moveTolerance) clear()
  }

  return {
    onPointerDown,
    onPointerMove,
    onPointerUp: clear,
    onPointerLeave: clear,
    onPointerCancel: clear,
    firedRef,
  }
}
