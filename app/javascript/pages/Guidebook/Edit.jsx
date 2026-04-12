import { useState } from 'react'
import { Button, Group, Stack, Alert } from '@mantine/core'
import { router } from '@inertiajs/react'
import MarkdownEditor from '../../components/MarkdownEditor'
import MarkdownPreview from '../../components/MarkdownPreview'
import MapPreview from '../../components/MapPreview'
import PreviewToggle from '../../components/PreviewToggle'
import StatusBar from '../../components/StatusBar'
import { useFrontmatter } from '../../hooks/useFrontmatter'
import { useAutoSave } from '../../hooks/useAutoSave'

export default function Edit({ guidebook }) {
  const isNew = !guidebook
  const initialContent = guidebook?.content || "---\ntitle: New Guidebook\ndays: []\n---\n\n# New Guidebook\n"

  const { rawContent, setRawContent, frontmatter, body, parseError } = useFrontmatter(initialContent)
  const [previewMode, setPreviewMode] = useState('markdown')

  const { saving, lastSaved, error: saveError, save, dirty } = useAutoSave(
    guidebook?.id,
    rawContent
  )

  const handleCreate = () => {
    router.post('/guidebooks', {
      guidebook: { content: rawContent }
    })
  }

  const handleManualSave = () => {
    if (isNew) {
      handleCreate()
    } else {
      save()
    }
  }

  return (
    <Stack h="calc(100vh - 56px - 32px)" gap={0}>
      {/* Toolbar */}
      <Group px="md" py="xs" justify="space-between" style={{ borderBottom: '1px solid var(--mantine-color-gray-3)' }}>
        <PreviewToggle value={previewMode} onChange={setPreviewMode} />
        <Group>
          {guidebook?.owned && guidebook?.publishable && !guidebook?.published && (
            <Button
              size="xs"
              variant="light"
              color="green"
              onClick={() => router.post(`/guidebooks/${guidebook.id}/publication`)}
            >
              Publish
            </Button>
          )}
          <Button size="xs" onClick={handleManualSave} loading={saving}>
            {isNew ? 'Create' : 'Save'}
          </Button>
        </Group>
      </Group>

      {/* Parse error alert */}
      {parseError && (
        <Alert color="orange" variant="light" mx="md" mt="xs">
          Frontmatter parse error: {parseError}
        </Alert>
      )}

      {/* Editor + Preview split */}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        {/* Left: Preview */}
        <div style={{ flex: 1, overflow: 'hidden' }}>
          {previewMode === 'markdown' ? (
            <MarkdownPreview content={body} />
          ) : (
            <MapPreview frontmatter={frontmatter} />
          )}
        </div>

        {/* Right: Editor */}
        <div style={{ flex: 1, borderLeft: '1px solid var(--mantine-color-gray-3)', overflow: 'hidden' }}>
          <MarkdownEditor value={initialContent} onChange={setRawContent} />
        </div>
      </div>

      {/* Status bar */}
      <StatusBar
        content={rawContent}
        lastSaved={lastSaved}
        saving={saving}
        error={saveError}
      />
    </Stack>
  )
}
