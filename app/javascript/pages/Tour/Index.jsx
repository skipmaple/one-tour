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
                <Text size="sm" title={t.last_activity_at || ''}>
                  {formatRelative(t.last_activity_at)}
                </Text>
              </Table.Td>
              <Table.Td>{t.my_role || 'author'}</Table.Td>
              <Table.Td>
                <Button component={Link} href={openHref(t)} size="xs" variant="light">
                  {(t.days_count ?? 0) > 0 ? '打开 →' : '继续设置 →'}
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

// Tours with no days yet haven't finished the guided-setup; send the user
// back to the constitution page to complete it. Once days exist, jump
// straight into the planner.
export function openHref(t) {
  return (t.days_count ?? 0) > 0 ? `/tours/${t.id}` : `/tours/${t.id}/constitution`
}

// Relative Chinese formatter with ISO tooltip on hover (<Text title>).
// Thresholds: "刚刚" < 1 min; "N 分钟前" < 1 h; "N 小时前" < 1 d;
// "N 天前" < 30 d; then fall back to zh-CN date.
export function formatRelative(iso) {
  if (!iso) return '—'
  const t = new Date(iso).getTime()
  if (Number.isNaN(t)) return String(iso)
  const mins = Math.max(0, Math.round((Date.now() - t) / 60000))
  if (mins < 1) return '刚刚'
  if (mins < 60) return `${mins} 分钟前`
  const hours = Math.round(mins / 60)
  if (hours < 24) return `${hours} 小时前`
  const days = Math.round(hours / 24)
  if (days < 30) return `${days} 天前`
  return new Date(iso).toLocaleDateString('zh-CN')
}

function formatHealth(h) {
  if (!h) return <Text size="sm" c="dimmed">—</Text>
  if (h.hard > 0) return <Badge color="red" variant="light">{h.hard} 硬违反</Badge>
  if (h.soft > 0) return <Badge color="yellow" variant="light">{h.soft} 软提示</Badge>
  return <Badge color="green" variant="light">全部符合</Badge>
}
