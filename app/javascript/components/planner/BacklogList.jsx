import { useState, useMemo } from 'react'
import { Paper, Title, Stack, Text, Button, Group, Select, UnstyledButton } from '@mantine/core'
import { useDroppable } from '@dnd-kit/core'
import ActivityCard from './ActivityCard'

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
}) {
  // Hooks must run unconditionally every render (Rules of Hooks). The folded
  // branch below is an early return AFTER all hooks have been called.
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

  // Folded rendering: mirror ChatPanel's collapsed vertical strip.
  if (!open) {
    return (
      <UnstyledButton
        onClick={onToggle}
        aria-label="展开候选池"
        style={{
          cursor: 'pointer',
          background: '#f3f3f3',
          border: '1px solid var(--mantine-color-default-border)',
          borderRadius: 4,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: '100%',
          height: '100%',
        }}
      >
        <Text size="xs" c="gray.7" style={{ writingMode: 'vertical-rl' }}>
          展开候选池 ▸
        </Text>
      </UnstyledButton>
    )
  }

  const isEmpty = activities.length === 0
  const hasFilter = kindFilter || levelFilter

  // Three exclusive modes:
  //  - isEmpty + !readOnly → dashed three-CTA frame (onboarding path)
  //  - isEmpty + readOnly → plain "尚无候选" text
  //  - !isEmpty → normal behavior (filters + top "+ 加一个" + cards)

  return (
    <Paper withBorder style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <Group justify="space-between" p="xs" bg="gray.1">
        <Title order={5} m={0}>
          候选池
          {hasFilter && !isEmpty && (
            <Text component="span" size="xs" c="dimmed" ml={6}>
              {filtered.length}/{activities.length}
            </Text>
          )}
        </Title>
        {onToggle && (
          <Button size="compact-xs" variant="subtle" onClick={onToggle}>收起 ◂</Button>
        )}
      </Group>

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
            <Group gap={4} grow>
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
            </Group>
          </Stack>
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
                <ActivityCard key={a.id} activity={a} onClick={onEditActivity} readOnly={readOnly} />
              ))}
              {filtered.length === 0 && (
                <Text size="xs" c="dimmed">无匹配的候选。调整筛选或清空条件。</Text>
              )}
            </Stack>

            {!readOnly && (onAddActivity || onAskAI) && (
              <Group gap={4} mt="auto" grow>
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
              </Group>
            )}
          </>
        )}
      </div>
    </Paper>
  )
}
