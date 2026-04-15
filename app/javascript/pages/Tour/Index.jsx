import { Stack, Group, Title, Button, Table, Text, Badge } from '@mantine/core'
import { Link, Head, router } from '@inertiajs/react'

export default function Index({ tours }) {
  const createTour = () => router.post('/tours', { tour: { title: '新旅程' } })

  return (
    <Stack gap="lg" p="md">
      <Head title="我的旅行程" />
      <Group justify="space-between">
        <Title order={2}>我的旅行程</Title>
        <Button onClick={createTour}>+ 新建 Tour</Button>
      </Group>

      <Table striped highlightOnHover>
        <Table.Thead>
          <Table.Tr>
            <Table.Th>标题</Table.Th>
            <Table.Th>日期 / 人数</Table.Th>
            <Table.Th>进度</Table.Th>
            <Table.Th>健康度</Table.Th>
            <Table.Th>最近活动</Table.Th>
            <Table.Th>角色</Table.Th>
            <Table.Th></Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {tours.map(t => (
            <Table.Tr key={t.id} style={{ opacity: t.archived ? 0.55 : 1 }}>
              <Table.Td><Text fw={600}>{t.title}</Text></Table.Td>
              <Table.Td>
                <Text size="sm">{t.date_range || '—'}</Text>
                <Text size="xs" c="dimmed">{t.team_size ? `${t.team_size} 人` : ''}</Text>
              </Table.Td>
              <Table.Td>
                <Text size="sm">{(t.days_count ?? 0)} 天 · {(t.activities_count ?? 0)} 行</Text>
              </Table.Td>
              <Table.Td>{formatHealth(t.health)}</Table.Td>
              <Table.Td>
                <Text size="sm">{t.last_activity_at || '—'}</Text>
              </Table.Td>
              <Table.Td>{t.my_role || 'author'}</Table.Td>
              <Table.Td>
                <Button component={Link} href={`/tours/${t.id}/constitution`} size="xs" variant="light">
                  打开 →
                </Button>
              </Table.Td>
            </Table.Tr>
          ))}
        </Table.Tbody>
      </Table>

      {tours.length === 0 && (
        <Text c="dimmed" ta="center" py="xl">还没有旅行程。点"新建 Tour"开始。</Text>
      )}
    </Stack>
  )
}

function formatHealth(h) {
  if (!h) return <Text size="sm" c="dimmed">—</Text>
  if (h.hard > 0) return <Badge color="red" variant="light">{h.hard} 硬违反</Badge>
  if (h.soft > 0) return <Badge color="yellow" variant="light">{h.soft} 软提示</Badge>
  return <Badge color="green" variant="light">全部符合</Badge>
}
