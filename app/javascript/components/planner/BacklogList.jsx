import { Paper, Title, Stack, Text, Button } from '@mantine/core'
import { useDroppable } from '@dnd-kit/core'
import ActivityCard from './ActivityCard'

export default function BacklogList({ activities, onAddActivity, onEditActivity, readOnly }) {
  const { setNodeRef, isOver } = useDroppable({
    id: 'backlog',
    data: { dayId: null, position: activities.length + 1 }
  })
  return (
    <Paper withBorder p="sm" ref={setNodeRef} style={{ background: isOver ? '#e8f0fb' : undefined }}>
      <Title order={5} mb="xs">Backlog（候选池）</Title>
      {!readOnly && onAddActivity && (
        <Button size="compact-xs" variant="light" fullWidth mb="xs" onClick={() => onAddActivity(null)}>
          + 加一个
        </Button>
      )}
      <Stack gap={4}>
        {activities.map(a => (
          <ActivityCard key={a.id} activity={a} onClick={onEditActivity} readOnly={readOnly} />
        ))}
        {activities.length === 0 && <Text size="xs" c="dimmed">尚无候选。可手动添加或让 AI 帮忙。</Text>}
      </Stack>
    </Paper>
  )
}
