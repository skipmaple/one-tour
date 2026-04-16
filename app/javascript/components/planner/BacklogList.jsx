import { useState, useMemo } from 'react'
import { Paper, Title, Stack, Text, Button, Group, Select } from '@mantine/core'
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

export default function BacklogList({ activities, onAddActivity, onEditActivity, readOnly }) {
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

  const hasFilter = kindFilter || levelFilter

  return (
    <Paper withBorder p="sm" ref={setNodeRef} style={{ background: isOver ? '#f0f7ff' : undefined }}>
      <Title order={5} mb="xs">
        Backlog（候选池）
        {hasFilter && (
          <Text component="span" size="xs" c="dimmed" ml={6}>
            {filtered.length}/{activities.length}
          </Text>
        )}
      </Title>

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

      {!readOnly && onAddActivity && (
        <Button size="compact-xs" variant="light" fullWidth mb="xs" onClick={() => onAddActivity(null)}>
          + 加一个
        </Button>
      )}

      <Stack gap={4}>
        {filtered.map(a => (
          <ActivityCard key={a.id} activity={a} onClick={onEditActivity} readOnly={readOnly} />
        ))}
        {filtered.length === 0 && activities.length > 0 && (
          <Text size="xs" c="dimmed">无匹配的候选。调整筛选或清空条件。</Text>
        )}
        {activities.length === 0 && (
          <Text size="xs" c="dimmed">尚无候选。可手动添加或让 AI 帮忙。</Text>
        )}
      </Stack>
    </Paper>
  )
}
