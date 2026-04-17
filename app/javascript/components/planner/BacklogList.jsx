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
  const { setNodeRef, isOver } = useDroppable({
    id: 'backlog',
    data: { dayId: null, position: activities.length + 1 }
  })

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
    <Paper withBorder ref={setNodeRef} style={{ background: isOver ? '#f0f7ff' : undefined }}>
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

      <div style={{ padding: 12 }}>
        {isEmpty && readOnly && (
          <Text size="xs" c="dimmed">尚无候选</Text>
        )}

        {isEmpty && !readOnly && (
          <Stack
            gap="xs"
            p="md"
            align="stretch"
            style={{ border: '2px dashed var(--mantine-color-gray-5)', borderRadius: 4, background: '#fafafa' }}
          >
            <Text size="xs" c="gray.7" ta="center">
              先把想去的点塞进这里，再拖到右侧日。
            </Text>
            {onAddActivity && (
              <Button size="sm" variant="default" fullWidth onClick={() => onAddActivity(null)}>
                加一个
              </Button>
            )}
            {onAskAI && (
              <Button size="sm" variant="default" fullWidth onClick={onAskAI}>
                AI 帮选
              </Button>
            )}
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

            {!readOnly && (onAddActivity || onAskAI) && (
              <Group gap={4} mb="xs" grow>
                {onAddActivity && (
                  <Button size="compact-xs" variant="default" onClick={() => onAddActivity(null)}>
                    加一个
                  </Button>
                )}
                {onAskAI && (
                  <Button size="compact-xs" variant="default" onClick={onAskAI}>
                    AI 帮选
                  </Button>
                )}
              </Group>
            )}

            <Stack gap={4}>
              {filtered.map(a => (
                <ActivityCard key={a.id} activity={a} onClick={onEditActivity} readOnly={readOnly} />
              ))}
              {filtered.length === 0 && (
                <Text size="xs" c="dimmed">无匹配的候选。调整筛选或清空条件。</Text>
              )}
            </Stack>
          </>
        )}
      </div>
    </Paper>
  )
}
