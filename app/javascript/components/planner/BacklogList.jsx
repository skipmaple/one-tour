import { Paper, Title, Stack, Text } from '@mantine/core'
import ActivityCard from './ActivityCard'

export default function BacklogList({ activities }) {
  return (
    <Paper withBorder p="sm">
      <Title order={5} mb="xs">Backlog（候选池）</Title>
      <Stack gap={4}>
        {activities.map(a => <ActivityCard key={a.id} activity={a} />)}
        {activities.length === 0 && <Text size="xs" c="dimmed">尚无候选。可手动添加或让 AI 帮忙。</Text>}
      </Stack>
    </Paper>
  )
}
