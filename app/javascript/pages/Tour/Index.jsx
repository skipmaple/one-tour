import { Stack, Group, Title, Button, Table, Text, Badge, Center, Paper } from '@mantine/core'
import { Link, Head, router } from '@inertiajs/react'
import { IconChevronRight } from '@tabler/icons-react'
import LuluFull from '../../components/Lulu/LuluFull'
import { useIsMobile } from '../../hooks/useIsMobile'

export default function Index({ tours }) {
  const isMobile = useIsMobile()
  // Create with no title — onboarding step 1 requires 程名 before advancing,
  // so users can't leave the tour in an anonymous state. List rows and
  // headers fall back to "未命名旅程" if the user abandons before saving.
  const createTour = () => router.post('/tours', {})

  return (
    <Stack gap="lg" p="md">
      <Head title="我的旅程" />
      <Group justify="space-between">
        <Title order={2} fz={isMobile ? 'xl' : undefined}>我的旅程</Title>
        <Button onClick={createTour}>+ 新建旅程</Button>
      </Group>

      {isMobile ? <TourCards tours={tours} /> : (
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
                <Table.Td><Text fw={600}>{t.title || '未命名旅程'}</Text></Table.Td>
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
                <Table.Td>{roleLabel(t.my_role)}</Table.Td>
                <Table.Td>
                  <Button component={Link} href={openHref(t)} size="xs" variant="light">
                    打开 →
                  </Button>
                </Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      )}

      {tours.length === 0 && (
        <Paper withBorder p="xl" radius="md">
          <Center>
            <Stack align="center" gap="sm" maw={320}>
              <LuluFull size={120} bg="blue" radius={16} alt="路路 mascot" />
              <Text fw={700} size="lg">还没有旅程</Text>
              <Text c="dimmed" size="sm" ta="center">
                路路在等你建第一段路。从一次说走就走的周末开始？
              </Text>
              <Button mt="xs" onClick={createTour}>新建旅程</Button>
            </Stack>
          </Center>
        </Paper>
      )}
    </Stack>
  )
}

export function openHref(t) {
  return `/tours/${t.id}`
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

// 角色显示名称：author→作者，editor→编辑，reader→只读，其余原样或默认作者
function roleLabel(r) { return r === 'author' ? '作者' : r === 'editor' ? '编辑' : r === 'reader' ? '只读' : r || '作者' }

// 手机卡片视图，每个旅程一张 Paper 卡片
function TourCards({ tours }) {
  return (
    <Stack gap="sm">
      {tours.map(t => (
        <Paper
          key={t.id}
          component={Link}
          href={openHref(t)}
          withBorder
          p="md"
          radius="md"
          style={{ opacity: t.archived ? 0.55 : 1, display: 'block', textDecoration: 'none', color: 'inherit' }}
        >
          <Group justify="space-between" wrap="nowrap" align="center">
            <Stack gap={4} style={{ minWidth: 0 }}>
              <Text fw={600}>{t.title || '未命名旅程'}</Text>
              <Text size="sm" c="dimmed">{t.date_range || '—'}</Text>
              <Text size="sm">{(t.days_count ?? 0)} 天 · {(t.activities_count ?? 0)} 行{t.team_size ? ` · ${t.team_size} 人` : ''} · {roleLabel(t.my_role)}</Text>
              <Group gap="xs">{formatHealth(t.health)}<Text size="xs" c="dimmed">{formatRelative(t.last_activity_at)}</Text></Group>
            </Stack>
            <IconChevronRight size={18} stroke={1.5} color="var(--mantine-color-gray-5)" style={{ flexShrink: 0 }} />
          </Group>
        </Paper>
      ))}
    </Stack>
  )
}
