import { useRef, useEffect, useState, useCallback } from 'react'
import { router } from '@inertiajs/react'

export function useAutoSave(guidebookId, content, delay = 5000) {
  const [saving, setSaving] = useState(false)
  const [lastSaved, setLastSaved] = useState(null)
  const [error, setError] = useState(null)
  const [dirty, setDirty] = useState(false)
  const timerRef = useRef(null)
  const contentRef = useRef(content)

  useEffect(() => {
    contentRef.current = content
    setDirty(true)

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

  const save = useCallback(() => {
    if (!guidebookId || !dirty) return

    setSaving(true)
    setError(null)

    router.put(`/guidebooks/${guidebookId}`, {
      guidebook: { content: contentRef.current }
    }, {
      preserveState: true,
      preserveScroll: true,
      onSuccess: () => {
        setSaving(false)
        setDirty(false)
        setLastSaved(new Date().toLocaleTimeString())
      },
      onError: () => {
        setSaving(false)
        setError('Save failed')
      },
    })
  }, [guidebookId, dirty])

  useEffect(() => {
    const handler = (e) => {
      if (dirty) {
        e.preventDefault()
        e.returnValue = ''
      }
    }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [dirty])

  return { saving, lastSaved, error, save, dirty }
}
