import { useState, useCallback } from 'react'

export default function useUndoToast() {
  const [ toast, setToast ] = useState(null)

  const show = useCallback(({ message, undo, duration = 5000 }) => {
    setToast({ message, undo, duration, id: Date.now() })
  }, [])

  const dismiss = useCallback(() => setToast(null), [])

  const handleUndo = useCallback(() => {
    if (toast?.undo) toast.undo()
    setToast(null)
  }, [ toast ])

  return {
    toast,
    show,
    dismiss,
    handleUndo
  }
}
