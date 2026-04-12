import { Title, Stack, Paper } from '@mantine/core'
import MemberManager from '../../components/MemberManager'

export default function Settings({ guidebook, memberships }) {
  return (
    <Stack maw={800} mx="auto">
      <Title order={2}>{guidebook.title} — Settings</Title>

      <Paper shadow="sm" p="lg" radius="md" withBorder>
        <Title order={4} mb="md">Members</Title>
        <MemberManager guidebookId={guidebook.id} memberships={memberships} />
      </Paper>
    </Stack>
  )
}
