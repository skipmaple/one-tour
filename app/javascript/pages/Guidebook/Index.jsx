import { SimpleGrid, Card, Text, Badge, Group, Button, Title, Stack } from '@mantine/core'
import { Link } from '@inertiajs/react'

export default function Index({ guidebooks, current_user }) {
  return (
    <Stack gap="lg">
      <Group justify="space-between">
        <Title order={2}>路书</Title>
        {current_user && (
          <Button component={Link} href="/guidebooks/new">
            新建路书
          </Button>
        )}
      </Group>

      <SimpleGrid cols={{ base: 1, sm: 2, lg: 3 }} spacing="lg">
        {guidebooks.map((gb) => (
          <GuidebookCard key={gb.id} guidebook={gb} />
        ))}
      </SimpleGrid>

      {guidebooks.length === 0 && (
        <Text c="dimmed" ta="center" py="xl">暂无路书</Text>
      )}
    </Stack>
  )
}

function GuidebookCard({ guidebook }) {
  const fm = guidebook.frontmatter || {}

  return (
    <Card shadow="sm" padding="lg" radius="md" withBorder>
      <Group justify="space-between" mb="xs">
        <Text fw={600} lineClamp={1}>{guidebook.title}</Text>
        {guidebook.published ? (
          <Badge color="green" variant="light">已发布</Badge>
        ) : (
          <Badge color="gray" variant="light">草稿</Badge>
        )}
      </Group>

      <Stack gap="xs">
        {fm.date_range && <Text size="sm" c="dimmed">{fm.date_range}</Text>}
        {fm.total_km && <Text size="sm" c="dimmed">{fm.total_km} km</Text>}
        <Text size="xs" c="dimmed">{guidebook.author.name}</Text>
      </Stack>

      <Group mt="md">
        <Button component={Link} href={`/guidebooks/${guidebook.id}`} variant="light" size="xs">
          查看
        </Button>
        {guidebook.editable && (
          <Button component={Link} href={`/guidebooks/${guidebook.id}/edit`} variant="subtle" size="xs">
            编辑
          </Button>
        )}
      </Group>
    </Card>
  )
}
