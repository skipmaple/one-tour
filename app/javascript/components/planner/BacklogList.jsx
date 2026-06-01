import { Text, Button, Stack, Alert } from '@mantine/core'
import { useDroppable } from '@dnd-kit/core'
import { IconInbox, IconFilterFilled } from '@tabler/icons-react'
import ActivityCard from './ActivityCard'
import PanelShell from './PanelLayout/PanelShell'

// Container-query styles for the 2-button footer. At narrow widths the
// buttons stack vertically (Chinese labels stay readable). When the panel
// is resized wider (≥ 200px inside content area), they flip to side-by-side
// for a more compact footer. Container queries are used over media queries
// because this panel can be dragged to any width independent of viewport.
const footerStyleRules = `
  .backlog-footer-container { container-type: inline-size; width: 100%; }
  .backlog-footer-buttons   { display: flex; flex-direction: column; gap: 4px; }
  @container (min-width: 200px) {
    .backlog-footer-buttons   { flex-direction: row; }
    .backlog-footer-buttons > button { flex: 1 1 0; min-width: 0; }
  }
`

export default function BacklogList({
  activities,
  onAddActivity,
  onEditActivity,
  onCardContextMenu,
  onAskAI,
  readOnly,
  open = true,
  onToggle,
  canToggle = true,
  mobile = false,
  flexStyle,
  hoveredActivityIds = null,
  onHoverActivity,
  onClearHover,
  author,
  members,
  filterActive = false,
}) {
  const { setNodeRef, isOver, active } = useDroppable({
    id: 'backlog',
    data: { dayId: null, position: activities.length + 1 }
  })

  const dragState = active ? (isOver ? 'over' : 'active') : 'idle'

  const isEmpty = activities.length === 0

  return (
    <PanelShell
      title="候选池"
      icon={<IconInbox size={14} stroke={1.5} />}
      open={open}
      onToggle={onToggle}
      canToggle={canToggle}
      hideToggle={mobile}
      flexStyle={flexStyle}
    >
      <style>{footerStyleRules}</style>
      <div
        ref={setNodeRef}
        style={{
          padding: 12,
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          border: dragState === 'idle' ? 'none' : '2px dashed var(--mantine-color-gray-5)',
          borderRadius: 4,
          background:
            dragState === 'over' ? '#e7f5ff' :
            dragState === 'active' ? 'var(--mantine-color-gray-0)' :
            undefined,
          transition: 'border-color 120ms ease, background-color 120ms ease',
        }}
      >
        {filterActive && (
          <Alert
            color="blue"
            variant="light"
            icon={<IconFilterFilled size={14} />}
            mb="xs"
            p="xs"
            styles={{ message: { fontSize: 11 } }}
          >
            筛选中，清除后恢复拖拽
          </Alert>
        )}

        {isEmpty && filterActive && (
          <Text size="xs" c="dimmed" ta="center" py="md">无匹配的活动</Text>
        )}

        {isEmpty && !filterActive && readOnly && (
          <Text size="xs" c="gray.7">尚无候选</Text>
        )}

        {isEmpty && !filterActive && !readOnly && (
          <>
            <Stack
              gap="xs"
              p="md"
              justify="center"
              style={{
                flex: 1,
                border: '2px dashed ' + (dragState === 'idle' ? 'var(--mantine-color-gray-5)' : 'transparent'),
                borderRadius: 4,
                background: dragState === 'idle' ? '#fafafa' : 'transparent',
                transition: 'border-color 120ms ease, background-color 120ms ease',
              }}
            >
              <Text size="xs" c="gray.7" ta="center">先把想去的点塞进这里，再拖到右侧日。</Text>
            </Stack>
            <div className="backlog-footer-container" style={{ marginTop: 8 }}>
              <div className="backlog-footer-buttons">
                {onAddActivity && (
                  <Button size="sm" variant="default" fw={500} onClick={() => onAddActivity(null)}>
                    加候选
                  </Button>
                )}
                {onAskAI && (
                  <Button size="sm" variant="default" fw={700} onClick={onAskAI}>
                    AI 帮选
                  </Button>
                )}
              </div>
            </div>
          </>
        )}

        {!isEmpty && (
          <>
            <Stack gap={4}>
              {activities.map(a => (
                <ActivityCard
                  key={a.id}
                  activity={a}
                  onClick={onEditActivity}
                  onCardContextMenu={onCardContextMenu}
                  readOnly={readOnly}
                  draggable={!filterActive}
                  isHighlighted={hoveredActivityIds != null && hoveredActivityIds.includes(a.id)}
                  onHoverActivity={onHoverActivity}
                  onClearHover={onClearHover}
                  author={author}
                  members={members}
                />
              ))}
            </Stack>

            {!readOnly && (onAddActivity || onAskAI) && (
              <div className="backlog-footer-container" style={{ marginTop: 'auto' }}>
                <div className="backlog-footer-buttons">
                  {onAddActivity && (
                    <Button size="compact-xs" variant="default" fw={500} onClick={() => onAddActivity(null)}>
                      加候选
                    </Button>
                  )}
                  {onAskAI && (
                    <Button size="compact-xs" variant="default" fw={700} onClick={onAskAI}>
                      AI 帮选
                    </Button>
                  )}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </PanelShell>
  )
}
