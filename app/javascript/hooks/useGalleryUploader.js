import { useCallback, useEffect, useRef, useState } from 'react'
import { router } from '@inertiajs/react'
import { notifications } from '@mantine/notifications'
import { compressImage } from '../lib/image-compression'
import { xhrRequest, mkForm } from '../lib/xhr-request'

// Accepted MIME types match ActivityImage::ALLOWED_CONTENT_TYPES on the server.
const ACCEPT_TYPES = 'image/jpeg,image/jpg,image/png,image/webp,image/gif'
export const MAX_PER_ACTIVITY = 20
// Server-side max blob size after compression. Match ActivityImage::MAX_FILE_SIZE.
const MAX_FILE_MB = 10
// Max raw file size before compression. Anything bigger is rejected outright
// (compressing a 100 MB file in browser is slow and rarely useful).
const MAX_RAW_MB = 50

export default function useGalleryUploader(activityId, { existingCount }) {
  const fileInputRef = useRef(null)
  const abortRef = useRef(null)
  // unmountedRef guards the finally block: when the component unmounts mid-upload,
  // we abort the in-flight request — but the surrounding try/finally still runs.
  // Without this guard the finally fires `router.reload` against a torn-down page,
  // which Inertia logs as a partial-reload error and Sentry picks up as noise.
  const unmountedRef = useRef(false)
  const [ uploading, setUploading ] = useState(false)
  const [ batchProgress, setBatchProgress ] = useState(null)
  // batchProgress shape: { current, total, percentage } | null

  useEffect(() => {
    return () => {
      unmountedRef.current = true
      abortRef.current?.abort()
    }
  }, [])

  const openFilePicker = useCallback(() => fileInputRef.current?.click(), [])

  const uploadOne = useCallback((file, onProgress, signal) =>
    xhrRequest(`/activities/${activityId}/images`, mkForm('file', file), {
      method: 'POST',
      signal,
      onProgress,
      sentryExtra: { activity_id: activityId },
    }),
  [ activityId ])

  const handleFilesSelected = useCallback(async (e) => {
    const files = Array.from(e.target.files || [])
    e.target.value = ''
    if (files.length === 0) return
    if (existingCount + files.length > MAX_PER_ACTIVITY) {
      notifications.show({
        title: '一次最多 20 张',
        message: `本站点已有 ${existingCount} 张，还能再传 ${MAX_PER_ACTIVITY - existingCount} 张`,
        color: 'orange',
      })
      return
    }

    // Pre-process: validate + compress 同步整个 batch，失败的先剔
    const accepted = []
    for (const file of files) {
      if (file.size > MAX_RAW_MB * 1024 * 1024) {
        notifications.show({
          message: `${file.name} 超过 ${MAX_RAW_MB} MB，已跳过`,
          color: 'orange',
        })
        continue
      }
      const compressed = await compressImage(file)
      if (compressed.size > MAX_FILE_MB * 1024 * 1024) {
        notifications.show({
          message: `${file.name} 压缩后仍超 ${MAX_FILE_MB} MB，已跳过`,
          color: 'orange',
        })
        continue
      }
      accepted.push(compressed)
    }
    if (accepted.length === 0) return

    setUploading(true)
    abortRef.current = new AbortController()

    try {
      for (let i = 0; i < accepted.length; i++) {
        const file = accepted[i]
        try {
          await uploadOne(
            file,
            (p) => setBatchProgress({
              current: i + 1,
              total: accepted.length,
              percentage: ((i + p.percentage / 100) / accepted.length) * 100,
            }),
            abortRef.current.signal,
          )
        } catch (err) {
          if (err.name === 'AbortError') return
          notifications.show({
            title: file.name,
            message: err.body?.errors?.join('；') || err.message || '上传失败',
            color: 'red',
          })
        }
      }
    } finally {
      // Skip state setters + router.reload when the component already unmounted
      // mid-upload — see unmountedRef comment above.
      if (!unmountedRef.current) {
        setBatchProgress(null)
        setUploading(false)
        router.reload({ only: [ 'activity_images' ], preserveScroll: true })
      }
    }
  }, [ existingCount, uploadOne ])

  return {
    uploading,
    batchProgress,
    fileInputRef,
    openFilePicker,
    handleFilesSelected,
    accept: ACCEPT_TYPES,
  }
}
