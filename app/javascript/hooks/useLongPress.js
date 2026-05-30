import { useRef } from 'react'

// 触屏长按检测，与 dnd-kit 拖拽共存。拖拽在移动 ≥5px 时激活（Show.jsx 的
// PointerSensor distance 约束），长按要求"静止"——二者天然互斥。只有 touch
// 指针武装计时器；鼠标走右键（onContextMenu），不走长按。
export default function useLongPress(onLongPress, { delay = 500, moveTolerance = 8 } = {}) {
  const timer = useRef(null)
  const startPos = useRef(null)
  const firedRef = useRef(false)
  // latest-ref：计时器在 delay 后才触发，期间父组件若重渲染并传入新的
  // onLongPress，运行中的计时器要调到最新版本，而非启动时的旧闭包。
  const onLongPressRef = useRef(onLongPress)
  onLongPressRef.current = onLongPress

  const clear = () => {
    if (timer.current) {
      clearTimeout(timer.current)
      timer.current = null
    }
    startPos.current = null
  }

  const onPointerDown = (e) => {
    if (e.pointerType !== 'touch') return
    clear() // 取消任何在途计时器，避免重复 pointerdown 泄漏 + 双触发
    firedRef.current = false
    const x = e.clientX
    const y = e.clientY
    startPos.current = { x, y }
    timer.current = setTimeout(() => {
      firedRef.current = true
      timer.current = null
      onLongPressRef.current(x, y)
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
