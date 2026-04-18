import { useEffect, useState } from 'react'
import { Modal, ActionIcon, Text } from '@mantine/core'

// Simple lightbox: fullscreen image with left/right nav + ESC to close.
// Uses Mantine Modal with a custom black background. Not using Carousel to
// keep the dependency surface small.
export default function ActivityGalleryLightbox({ images, initialIndex, onClose }) {
  const [index, setIndex] = useState(initialIndex ?? 0)

  useEffect(() => {
    if (initialIndex !== null && initialIndex !== undefined) {
      setIndex(initialIndex)
    }
  }, [initialIndex])

  useEffect(() => {
    if (initialIndex === null || initialIndex === undefined) return
    const onKey = (e) => {
      if (e.key === 'ArrowLeft') setIndex((i) => Math.max(0, i - 1))
      if (e.key === 'ArrowRight') setIndex((i) => Math.min(images.length - 1, i + 1))
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [initialIndex, images.length])

  const opened = initialIndex !== null && initialIndex !== undefined
  const current = opened ? images[index] : null

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      fullScreen
      withCloseButton={false}
      padding={0}
      overlayProps={{ backgroundOpacity: 0.92, color: '#000' }}
      styles={{ content: { background: '#000' } }}
    >
      {current && (
        <div style={{
          position: 'relative', width: '100%', height: '100vh',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: '#000',
        }}>
          <ActionIcon
            size="xl"
            variant="transparent"
            color="gray"
            style={{ position: 'absolute', top: 16, right: 16, color: '#fff', zIndex: 2 }}
            onClick={onClose}
            aria-label="关闭"
          >
            ✕
          </ActionIcon>

          {index > 0 && (
            <ActionIcon
              size="xl"
              variant="transparent"
              color="gray"
              style={{ position: 'absolute', left: 16, top: '50%', color: '#fff', zIndex: 2, fontSize: 24 }}
              onClick={() => setIndex(index - 1)}
              aria-label="上一张"
            >
              ‹
            </ActionIcon>
          )}

          <img
            src={current.url}
            alt={current.caption || ''}
            style={{ maxWidth: '90%', maxHeight: '85vh', objectFit: 'contain' }}
          />

          {index < images.length - 1 && (
            <ActionIcon
              size="xl"
              variant="transparent"
              color="gray"
              style={{ position: 'absolute', right: 16, top: '50%', color: '#fff', zIndex: 2, fontSize: 24 }}
              onClick={() => setIndex(index + 1)}
              aria-label="下一张"
            >
              ›
            </ActionIcon>
          )}

          <div style={{
            position: 'absolute', bottom: 24, left: 0, right: 0, textAlign: 'center',
            color: '#fff',
          }}>
            {current.caption && (
              <Text size="sm" mb="xs">{current.caption}</Text>
            )}
            <Text size="xs" c="dimmed">{index + 1} / {images.length}</Text>
          </div>
        </div>
      )}
    </Modal>
  )
}
