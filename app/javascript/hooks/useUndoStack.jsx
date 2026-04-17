import { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react'
import { notifications } from '@mantine/notifications'
import { Group, Text, Button } from '@mantine/core'

// In-memory undo stack capped at 10. Refresh clears it.
// Each entry: { label: string, undoFn: () => Promise<void>, ts: number }
export const UNDO_CAP = 10

const UndoStackContext = createContext(null)

export function UndoStackProvider({ children }) {
  const [ stack, setStack ] = useState([])
  const stackRef = useRef(stack)
  stackRef.current = stack

  // Executes a specific entry's undoFn and removes it from stack.
  const executeEntry = useCallback(async (entry) => {
    setStack(prev => prev.filter(e => e.ts !== entry.ts))
    await entry.undoFn()
  }, [])

  const push = useCallback(({ label, undoFn }) => {
    const entry = { label, undoFn, ts: Date.now() + Math.random() }
    setStack(prev => {
      const next = [ ...prev, entry ]
      if (next.length > UNDO_CAP) next.shift()
      return next
    })
    showUndoToast({ entry, executeUndo: () => executeEntry(entry) })
  }, [ executeEntry ])

  const executeTop = useCallback(async () => {
    const top = stackRef.current[stackRef.current.length - 1]
    if (!top) return undefined
    await executeEntry(top)
  }, [ executeEntry ])

  // Global Cmd+Z / Ctrl+Z keybinding. Skip when focus is in editable element.
  useEffect(() => {
    function handleKeydown(e) {
      if (!(e.metaKey || e.ctrlKey)) return
      if (e.key !== 'z' || e.shiftKey) return
      const tag = e.target.tagName?.toLowerCase()
      if (tag === 'input' || tag === 'textarea' || e.target.isContentEditable) return
      e.preventDefault()
      executeTop()
    }
    window.addEventListener('keydown', handleKeydown)
    return () => window.removeEventListener('keydown', handleKeydown)
  }, [ executeTop ])

  const value = { push, executeTop, stack }
  return <UndoStackContext.Provider value={value}>{children}</UndoStackContext.Provider>
}

export function useUndoStack() {
  const ctx = useContext(UndoStackContext)
  if (!ctx) throw new Error('useUndoStack must be used within UndoStackProvider')
  return ctx
}

// Show a Mantine toast with embedded "撤销" button.
// Uses notifications.update to transition to in-progress / done / error states.
function showUndoToast({ entry, executeUndo }) {
  const id = `undo-${entry.ts}`
  notifications.show({
    id,
    autoClose: 5000,
    withCloseButton: true,
    message: (
      <Group gap="xs" justify="space-between" wrap="nowrap">
        <Text size="sm">{entry.label}</Text>
        <Button
          variant="subtle"
          size="compact-xs"
          onClick={() => {
            notifications.update({
              id, loading: true, autoClose: false,
              message: <Text size="sm">撤销中…</Text>,
            })
            executeUndo()
              .then(() => notifications.update({
                id, loading: false, color: 'green', autoClose: 1500,
                message: <Text size="sm">{entry.label} · 已撤销</Text>,
              }))
              .catch(err => notifications.update({
                id, loading: false, color: 'red', autoClose: 3000,
                message: <Text size="sm">撤销失败：{err.message || '服务器拒绝'}</Text>,
              }))
          }}
        >
          撤销
        </Button>
      </Group>
    ),
  })
  return id
}
