import { useRef, useEffect, useState, useCallback } from 'react'
import { router } from '@inertiajs/react'

export function useAutoSave(guidebookId, content, delay = 5000) {
  const [saving, setSaving] = useState(false)
  const [lastSaved, setLastSaved] = useState(null)
  const [error, setError] = useState(null)
  const dirtyRef = useRef(false)
  const timerRef = useRef(null)
  const contentRef = useRef(content)
  const [lastSavedContent, setLastSavedContent] = useState(content)

  useEffect(() => {
    contentRef.current = content
    dirtyRef.current = true

    if (timerRef.current) clearTimeout(timerRef.current)

    if (guidebookId) {
      timerRef.current = setTimeout(() => {
        save()
      }, delay)
    }

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [content])

  const save = useCallback(({ force = false } = {}) => {
    if (!guidebookId || (!force && !dirtyRef.current)) return

    setSaving(true)
    setError(null)

    router.put(`/guidebooks/${guidebookId}`, {
      guidebook: { content: contentRef.current }
    }, {
      preserveState: true,
      preserveScroll: true,
      onSuccess: () => {
        setSaving(false)
        dirtyRef.current = false
        setLastSaved(new Date().toLocaleTimeString())
      },
      onError: () => {
        setSaving(false)
        setError('Save failed')
      },
    })
  }, [guidebookId])

  useEffect(() => {
    const handler = (e) => {
      if (dirtyRef.current) {
        e.preventDefault()
        e.returnValue = ''
      }
    }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [])

  const confirmBaseline = useCallback(() => {
    setLastSavedContent(contentRef.current)
  }, [])

  return { saving, lastSaved, error, save, dirty: dirtyRef.current, lastSavedContent, confirmBaseline }
}
