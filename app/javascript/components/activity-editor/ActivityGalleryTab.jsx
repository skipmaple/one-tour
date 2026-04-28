import { useState } from 'react'
import { Button, Group, Progress, Stack, Text, TextInput, ActionIcon } from '@mantine/core'
import { router } from '@inertiajs/react'
import { notifications } from '@mantine/notifications'
import { IconPhoto, IconStar, IconStarFilled, IconPencil, IconX, IconUpload } from '@tabler/icons-react'
import ActivityGalleryLightbox from './ActivityGalleryLightbox'
import useGalleryUploader, { MAX_PER_ACTIVITY } from '../../hooks/useGalleryUploader'

export default function ActivityGalleryTab({ activityId, images, hasCoordinates }) {
  const ordered = [ ...images ].sort((a, b) => a.position - b.position)
  const atLimit = ordered.length >= MAX_PER_ACTIVITY

  const {
    uploading,
    batchProgress,
    fileInputRef,
    openFilePicker,
    handleFilesSelected,
    accept,
  } = useGalleryUploader(activityId, { existingCount: ordered.length })

  const [editingCaptionFor, setEditingCaptionFor] = useState(null)
  const [captionDraft, setCaptionDraft] = useState('')
  const [lightboxIndex, setLightboxIndex] = useState(null)

  const handleSetCover = async (image) => {
    const res = await fetch(`/activity_images/${image.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json', 'X-CSRF-Token': csrfToken() },
      body: JSON.stringify({ is_cover: true }),
    })
    if (!res.ok) {
      notifications.show({ message: '设为封面失败', color: 'red' })
      return
    }
    router.reload({ only: [ 'activity_images' ], preserveScroll: true })
  }

  const startCaptionEdit = (image) => {
    setEditingCaptionFor(image.id)
    setCaptionDraft(image.caption || '')
  }

  const commitCaption = async (image) => {
    const trimmed = captionDraft.trim()
    if (trimmed === (image.caption || '')) {
      setEditingCaptionFor(null)
      return
    }
    const res = await fetch(`/activity_images/${image.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json', 'X-CSRF-Token': csrfToken() },
      body: JSON.stringify({ caption: trimmed }),
    })
    if (!res.ok) {
      notifications.show({ message: '保存说明失败', color: 'red' })
      return
    }
    setEditingCaptionFor(null)
    router.reload({ only: [ 'activity_images' ], preserveScroll: true })
  }

  const handleDelete = async (image) => {
    const res = await fetch(`/activity_images/${image.id}`, {
      method: 'DELETE',
      headers: { 'Accept': 'application/json', 'X-CSRF-Token': csrfToken() },
    })
    if (!res.ok) {
      notifications.show({ message: '删除失败', color: 'red' })
      return
    }
    router.reload({ only: [ 'activity_images' ], preserveScroll: true })
  }

  if (ordered.length === 0) {
    return (
      <Stack gap="xs" align="center" style={{ padding: '32px 16px', textAlign: 'center' }}>
        <IconPhoto size={48} stroke={1.2} color="#adb5bd" />
        <Text fw={600}>还没有景色照片</Text>
        <Text size="xs" c="dimmed">最多 20 张，每张 ≤ 10 MB</Text>
        <Button onClick={openFilePicker} loading={uploading} leftSection={<IconUpload size={14} />} mt="sm">
          上传第一张
        </Button>
        <input
          ref={fileInputRef}
          type="file"
          accept={accept}
          multiple
          hidden
          onChange={handleFilesSelected}
        />
      </Stack>
    )
  }

  return (
    <Stack gap="xs">
      <Group justify="space-between" align="center">
        <Text size="xs" c="dimmed">
          {ordered.length} / {MAX_PER_ACTIVITY} 张
          {hasCoordinates && ' · 本行已有坐标，不自动覆盖照片 GPS'}
        </Text>
        <Button
          size="xs"
          onClick={openFilePicker}
          loading={uploading}
          disabled={atLimit}
          leftSection={<IconUpload size={14} />}
        >
          上传
        </Button>
      </Group>

      {batchProgress && <Progress value={batchProgress.percentage} size="xs" />}

      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(3, 1fr)',
        gap: 6,
      }}>
        {ordered.map((image, index) => (
          <div
            key={image.id}
            style={{
              aspectRatio: '1',
              borderRadius: 4,
              backgroundImage: image.url ? `url(${image.url})` : 'none',
              backgroundColor: '#e9ecef',
              backgroundSize: 'cover',
              backgroundPosition: 'center',
              position: 'relative',
              overflow: 'hidden',
              cursor: 'pointer',
            }}
            onClick={() => editingCaptionFor !== image.id && setLightboxIndex(index)}
          >
            {image.is_cover && (
              <div style={{
                position: 'absolute', top: 4, left: 4,
                background: '#fab005', color: '#fff',
                padding: '2px 8px 2px 6px', borderRadius: 10,
                fontSize: 10, fontWeight: 600,
                display: 'inline-flex', alignItems: 'center', gap: 3,
              }}>
                <IconStarFilled size={10} />
                封面
              </div>
            )}
            <div
              style={{
                position: 'absolute', top: 4, right: 4, display: 'flex', gap: 4,
              }}
              onClick={(e) => e.stopPropagation()}
            >
              {!image.is_cover && (
                <ActionIcon
                  size="sm"
                  variant="filled"
                  color="dark"
                  onClick={() => handleSetCover(image)}
                  aria-label="设为封面"
                >
                  <IconStar size={14} stroke={1.8} />
                </ActionIcon>
              )}
              <ActionIcon
                size="sm"
                variant="filled"
                color="dark"
                onClick={() => startCaptionEdit(image)}
                aria-label="编辑说明"
              >
                <IconPencil size={14} stroke={1.8} />
              </ActionIcon>
              <ActionIcon
                size="sm"
                variant="filled"
                color="red"
                onClick={() => handleDelete(image)}
                aria-label="删除"
              >
                <IconX size={14} stroke={1.8} />
              </ActionIcon>
            </div>

            {editingCaptionFor === image.id ? (
              <div
                style={{
                  position: 'absolute', bottom: 0, left: 0, right: 0,
                  background: 'rgba(22,119,255,0.9)', padding: '4px 6px',
                }}
                onClick={(e) => e.stopPropagation()}
              >
                <TextInput
                  size="xs"
                  value={captionDraft}
                  onChange={(e) => setCaptionDraft(e.currentTarget.value)}
                  onBlur={() => commitCaption(image)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') commitCaption(image)
                    if (e.key === 'Escape') setEditingCaptionFor(null)
                  }}
                  placeholder="给这张照片加个说明"
                  styles={{ input: { background: 'transparent', color: '#fff', border: 'none' } }}
                  autoFocus
                />
              </div>
            ) : image.caption ? (
              <div style={{
                position: 'absolute', bottom: 0, left: 0, right: 0,
                background: 'rgba(0,0,0,0.6)', color: '#fff',
                padding: '3px 6px', fontSize: 10, lineHeight: 1.3,
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}>
                {image.caption}
              </div>
            ) : null}
          </div>
        ))}
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept={accept}
        multiple
        hidden
        onChange={handleFilesSelected}
      />

      <ActivityGalleryLightbox
        images={ordered}
        initialIndex={lightboxIndex}
        onClose={() => setLightboxIndex(null)}
      />
    </Stack>
  )
}

function csrfToken() {
  return document.querySelector('meta[name=csrf-token]')?.getAttribute('content') || ''
}
