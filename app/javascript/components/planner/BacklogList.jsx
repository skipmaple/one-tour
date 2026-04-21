import { useState, useMemo } from 'react'
import { Text, Button, Group, Select, Stack } from '@mantine/core'
import { useDroppable } from '@dnd-kit/core'
import { IconInbox } from '@tabler/icons-react'
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

const KIND_FILTER_OPTIONS = [
  { value: '',       label: '所有类型' },
  { value: 'scenic', label: '景' },
  { value: 'road',   label: '路' },
  { value: 'food',   label: '食' },
  { value: 'stay',   label: '住' },
  { value: 'fuel',   label: '油' },
  { value: 'other',  label: '其他' },
]

const LEVEL_FILTER_OPTIONS = [
  { value: '',               label: '所有等级' },
  { value: 'tier_one',       label: '一等' },
  { value: 'tier_two',       label: '二等' },
  { value: 'tier_three',     label: '三等' },
  { value: 'infrastructure', label: '基础' },
]

export default function BacklogList({
  activities,
  onAddActivity,
  onEditActivity,
  onAskAI,
  readOnly,
  open = true,
  onToggle,
  canToggle = true,
  flexStyle,
  hoveredActivityIds = null,
  onHoverActivity,
  onClearHover,
  author,
  members,
}) {
  const [kindFilter, setKindFilter] = useState('')
  const [levelFilter, setLevelFilter] = useState('')

  const filtered = useMemo(() => {
    return activities.filter(a => {
      if (kindFilter && a.kind !== kindFilter) return false
      if (levelFilter && a.citizen_level !== levelFilter) return false
      return true
    })
  }, [activities, kindFilter, levelFilter])

  // Droppable uses full activities.length so dropped items are appended to
  // the true end (not after the filtered subset).
  const { setNodeRef, isOver, active } = useDroppable({
    id: 'backlog',
    data: { dayId: null, position: activities.length + 1 }
  })

  // Three-state drop zone visual: idle (no drag) → active (drag in progress
  // but not hovering this droppable) → over (hovering this droppable).
  const dragState = active ? (isOver ? 'over' : 'active') : 'idle'

  const isEmpty = activities.length === 0
  const hasFilter = kindFilter || levelFilter

  return (
    <PanelShell
      title="候选池"
      icon={<IconInbox size={14} stroke={1.5} />}
      open={open}
      onToggle={onToggle}
      canToggle={canToggle}
      flexStyle={flexStyle}
      headerExtra={hasFilter && !isEmpty && (
        <Text size="xs" c="dimmed">
          {filtered.length}/{activities.length}
        </Text>
      )}
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
        {isEmpty && readOnly && (
          <Text size="xs" c="gray.7">尚无候选</Text>
        )}

        {isEmpty && !readOnly && (
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
            {/* Responsive footer: stacks vertically when narrow, flips to
                side-by-side at ≥ 200px via CSS container query. Container
                queries beat media queries here because the backlog panel
                can be resized to any width independent of viewport. */}
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
            <Group gap={4} mb="xs">
              <Select
                data={KIND_FILTER_OPTIONS}
                value={kindFilter}
                onChange={v => setKindFilter(v || '')}
                size="xs"
                w={100}
                allowDeselect={false}
                aria-label="按类型筛选"
              />
              <Select
                data={LEVEL_FILTER_OPTIONS}
                value={levelFilter}
                onChange={v => setLevelFilter(v || '')}
                size="xs"
                w={100}
                allowDeselect={false}
                aria-label="按等级筛选"
              />
            </Group>

            <Stack gap={4}>
              {filtered.map(a => (
                <ActivityCard
                  key={a.id}
                  activity={a}
                  onClick={onEditActivity}
                  readOnly={readOnly}
                  isHighlighted={hoveredActivityIds != null && hoveredActivityIds.includes(a.id)}
                  onHoverActivity={onHoverActivity}
                  onClearHover={onClearHover}
                  author={author}
                  members={members}
                />
              ))}
              {filtered.length === 0 && (
                <Text size="xs" c="dimmed">无匹配的候选。调整筛选或清空条件。</Text>
              )}
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
