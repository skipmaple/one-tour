import { useState, useCallback, useRef, useEffect } from 'react'
import { Button, Group, Stack, Alert, ActionIcon } from '@mantine/core'
import { router } from '@inertiajs/react'
import MarkdownEditor from '../../components/MarkdownEditor'
import MarkdownPreview from '../../components/MarkdownPreview'
import MapPreview from '../../components/MapPreview'
import PreviewToggle from '../../components/PreviewToggle'
import StatusBar from '../../components/StatusBar'
import ImageUploader from '../../components/ImageUploader'
import ChatPanel from '../../components/ChatPanel'
import DiffModal from '../../components/DiffModal'
import { useFrontmatter } from '../../hooks/useFrontmatter'
import { useAutoSave } from '../../hooks/useAutoSave'
import { useChat } from '../../hooks/useChat'
import { ensureMarkdownBody } from '../../utils/generateMarkdownBody'

export default function Edit({ guidebook }) {
  const isNew = !guidebook
  const initialContent = guidebook?.content || "---\ntitle: New Guidebook\ndays: []\n---\n\n# New Guidebook\n"

  const { rawContent, setRawContent, frontmatter, body, parseError } = useFrontmatter(initialContent)
  const [previewMode, setPreviewMode] = useState('markdown')
  const [chatOpen, setChatOpen] = useState(false)
  const [chatWidth, setChatWidth] = useState(360)
  const [chatMode, setChatMode] = useState('ask')
  const [diffModalOpen, setDiffModalOpen] = useState(false)
  const chatModeRef = useRef('ask')
  const editorRef = useRef(null)
  const dragRef = useRef(null)

  const handleDragStart = useCallback((e) => {
    e.preventDefault()
    const startX = e.clientX
    const startWidth = chatWidth

    const onMouseMove = (e) => {
      const delta = startX - e.clientX
      setChatWidth(Math.min(600, Math.max(280, startWidth + delta)))
    }

    const onMouseUp = () => {
      document.removeEventListener('mousemove', onMouseMove)
      document.removeEventListener('mouseup', onMouseUp)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }

    document.addEventListener('mousemove', onMouseMove)
    document.addEventListener('mouseup', onMouseUp)
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
  }, [chatWidth])

  const { saving, lastSaved, error: saveError, save, lastSavedContent, confirmBaseline } = useAutoSave(
    guidebook?.id,
    rawContent
  )

  const handleApplyContent = useCallback((content) => {
    editorRef.current?.replaceContent(ensureMarkdownBody(content.trim()))
  }, [])

  const handleChatModeChange = (newMode) => {
    setChatMode(newMode)
    chatModeRef.current = newMode
  }

  const { messages, streaming, streamingContent, sendMessage, error: chatError } = useChat(guidebook?.id, {
    modeRef: chatModeRef,
    onAutoApply: handleApplyContent,
  })

  // Auto-open chat after creation if user clicked AI button on the new page
  useEffect(() => {
    if (!isNew && sessionStorage.getItem('openChatAfterCreate') === 'true') {
      sessionStorage.removeItem('openChatAfterCreate')
      setChatOpen(true)
    }
  }, [isNew])

  const handleCreate = () => {
    router.post('/guidebooks', {
      guidebook: { content: rawContent }
    })
  }

  const hasChanges = rawContent !== lastSavedContent

  const handleManualSave = () => {
    if (isNew) {
      handleCreate()
    } else if (hasChanges) {
      setDiffModalOpen(true)
    } else {
      save()
    }
  }

  const handleConfirmSave = () => {
    setDiffModalOpen(false)
    confirmBaseline()
    save({ force: true })
  }

  return (
    <Stack h="calc(100vh - 56px - 32px)" gap={0}>
      {/* Toolbar */}
      <Group px="md" py="xs" justify="space-between" style={{ borderBottom: '1px solid var(--mantine-color-gray-3)' }}>
        <PreviewToggle value={previewMode} onChange={setPreviewMode} />
        <Group>
          <ActionIcon
            size="md"
            variant={chatOpen ? 'filled' : 'light'}
            onClick={() => {
              if (isNew) {
                sessionStorage.setItem('openChatAfterCreate', 'true')
                handleCreate()
              } else {
                setChatOpen(o => !o)
              }
            }}
            title="AI 助手"
          >
            💬
          </ActionIcon>
          {guidebook?.owned && guidebook?.publishable && !guidebook?.published && (
            <Button
              size="xs"
              variant="light"
              color="green"
              onClick={() => router.post(`/guidebooks/${guidebook.id}/publication`)}
            >
              发布
            </Button>
          )}
          <Button size="xs" onClick={handleManualSave} loading={saving}>
            {isNew ? '创建' : '保存'}
          </Button>
        </Group>
      </Group>

      {/* Parse error alert */}
      {parseError && (
        <Alert color="orange" variant="light" mx="md" mt="xs">
          Frontmatter parse error: {parseError}
        </Alert>
      )}

      {/* Editor + Preview + Chat split */}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        {/* Left: Preview */}
        <div style={{ flex: 1, overflow: 'hidden' }}>
          {previewMode === 'markdown' ? (
            <MarkdownPreview content={body} />
          ) : (
            <MapPreview frontmatter={frontmatter} />
          )}
        </div>

        {/* Middle: Editor + Upload */}
        <div style={{ flex: 1, borderLeft: '1px solid var(--mantine-color-gray-3)', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          <div style={{ flex: 1, overflow: 'hidden' }}>
            <MarkdownEditor ref={editorRef} value={initialContent} onChange={setRawContent} />
          </div>
          <ImageUploader guidebookId={guidebook?.id} />
        </div>

        {/* Right: Chat Panel */}
        {chatOpen && (
          <div style={{ width: chatWidth, display: 'flex', flexShrink: 0 }}>
            {/* Drag handle */}
            <div
              ref={dragRef}
              onMouseDown={handleDragStart}
              style={{
                width: 4,
                cursor: 'col-resize',
                backgroundColor: 'transparent',
                flexShrink: 0,
                borderLeft: '1px solid var(--mantine-color-gray-3)',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'var(--mantine-color-blue-2)' }}
              onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent' }}
            />
            <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
            <Group px="sm" py="xs" justify="space-between" style={{ borderBottom: '1px solid var(--mantine-color-gray-3)' }}>
              <span style={{ fontWeight: 600, fontSize: '0.875rem' }}>AI 旅行助手</span>
              <ActionIcon size="sm" variant="subtle" onClick={() => setChatOpen(false)}>
                ✕
              </ActionIcon>
            </Group>
            <div style={{ flex: 1, overflow: 'hidden' }}>
              <ChatPanel
                messages={messages}
                streaming={streaming}
                streamingContent={streamingContent}
                sendMessage={sendMessage}
                error={chatError}
                onApplyContent={handleApplyContent}
                mode={chatMode}
                onModeChange={handleChatModeChange}
              />
            </div>
            </div>
          </div>
        )}
      </div>

      {/* Status bar */}
      <StatusBar
        content={rawContent}
        lastSaved={lastSaved}
        saving={saving}
        error={saveError}
      />

      {/* Diff Modal */}
      <DiffModal
        opened={diffModalOpen}
        onClose={() => setDiffModalOpen(false)}
        oldContent={lastSavedContent}
        newContent={rawContent}
        onConfirm={handleConfirmSave}
      />
    </Stack>
  )
}
