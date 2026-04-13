import { useState, useRef, useCallback } from 'react'
import { Text, Group, Stack, CopyButton, ActionIcon, Tooltip } from '@mantine/core'

export default function ImageUploader({ guidebookId }) {
  const [uploads, setUploads] = useState([])
  const [dragging, setDragging] = useState(false)
  const fileInputRef = useRef(null)

  const uploadFile = useCallback(async (file) => {
    if (!guidebookId) return

    const entry = { name: file.name, status: 'uploading', thumb: null, hd: null, error: null }
    setUploads(prev => [entry, ...prev])

    const formData = new FormData()
    formData.append('image', file)

    const csrfToken = document.querySelector('meta[name="csrf-token"]')?.content

    try {
      const res = await fetch(`/guidebooks/${guidebookId}/images`, {
        method: 'POST',
        headers: { 'X-CSRF-Token': csrfToken },
        body: formData,
      })

      if (res.ok) {
        const data = await res.json()
        setUploads(prev => prev.map(u =>
          u.name === file.name && u.status === 'uploading'
            ? { ...u, status: 'done', thumb: data.thumb, hd: data.hd }
            : u
        ))
      } else {
        setUploads(prev => prev.map(u =>
          u.name === file.name && u.status === 'uploading'
            ? { ...u, status: 'error', error: `Upload failed (${res.status})` }
            : u
        ))
      }
    } catch (e) {
      setUploads(prev => prev.map(u =>
        u.name === file.name && u.status === 'uploading'
          ? { ...u, status: 'error', error: e.message }
          : u
      ))
    }
  }, [guidebookId])

  const handleFiles = useCallback((files) => {
    Array.from(files).forEach(f => {
      if (f.type.startsWith('image/')) uploadFile(f)
    })
  }, [uploadFile])

  const handleDrop = useCallback((e) => {
    e.preventDefault()
    setDragging(false)
    handleFiles(e.dataTransfer.files)
  }, [handleFiles])

  const yamlSnippet = (upload) => {
    if (!upload.thumb || !upload.hd) return ''
    return `- img: { thumb: "${upload.thumb}", hd: "${upload.hd}" }\n  title: "${upload.name.replace(/\.[^.]+$/, '')}"\n  reason: ""`
  }

  if (!guidebookId) return null

  return (
    <div style={{ borderTop: '1px solid var(--mantine-color-gray-3)', padding: 8, maxHeight: 200, overflowY: 'auto' }}>
      {/* Drop zone */}
      <div
        onClick={() => fileInputRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
        style={{
          border: `2px dashed ${dragging ? '#0ea5e9' : '#cbd5e1'}`,
          borderRadius: 8,
          padding: '8px 12px',
          textAlign: 'center',
          cursor: 'pointer',
          background: dragging ? '#f0f9ff' : 'transparent',
          transition: 'all 150ms',
          marginBottom: uploads.length > 0 ? 8 : 0,
        }}
      >
        <Text size="xs" c="dimmed">拖拽图片到此处上传，或点击选择文件</Text>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          multiple
          style={{ display: 'none' }}
          onChange={(e) => handleFiles(e.target.files)}
        />
      </div>

      {/* Upload results */}
      <Stack gap={4}>
        {uploads.map((upload, i) => (
          <div key={`${upload.name}-${i}`} style={{ fontSize: 11, padding: '4px 0', borderBottom: '1px solid #f1f5f9' }}>
            <Group gap={6} wrap="nowrap">
              <Text size="xs" fw={500} lineClamp={1} style={{ flex: 1 }}>{upload.name}</Text>
              {upload.status === 'uploading' && <Text size="xs" c="blue">上传中...</Text>}
              {upload.status === 'error' && <Text size="xs" c="red">{upload.error}</Text>}
              {upload.status === 'done' && (
                <CopyButton value={yamlSnippet(upload)}>
                  {({ copied, copy }) => (
                    <Tooltip label={copied ? '已复制' : '复制 YAML'}>
                      <ActionIcon size="xs" variant="subtle" color={copied ? 'green' : 'gray'} onClick={copy}>
                        {copied ? '✓' : '📋'}
                      </ActionIcon>
                    </Tooltip>
                  )}
                </CopyButton>
              )}
            </Group>
          </div>
        ))}
      </Stack>
    </div>
  )
}
