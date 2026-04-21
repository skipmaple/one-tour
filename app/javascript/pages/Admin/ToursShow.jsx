import { usePage, Link } from '@inertiajs/react'
import {
  Container, Stack, Title, Card, Group, Text, Badge, SimpleGrid, Table, Anchor,
} from '@mantine/core'
import { IconArrowLeft } from '@tabler/icons-react'
import AdminShell from '../../components/admin/AdminShell'

function fmtCost(cents) {
  if (cents == null) return '—'
  return `¥${(cents / 100).toFixed(2)}`
}
function fmtNum(n) { return n == null ? '—' : n.toLocaleString() }
function fmtDate(iso) { return iso ? new Date(iso).toLocaleString('zh-CN') : '—' }

function Stat({ label, value }) {
  return (
    <Card withBorder padding="sm" radius="md">
      <Text size="sm" c="dimmed">{label}</Text>
      <Title order={4} mt={4}>{value}</Title>
    </Card>
  )
}

export default function ToursShow() {
  const { props } = usePage()
  const { tour, members, days, conversation_stats: stats } = props

  return (
    <AdminShell currentPath="/admin/tours">
      <Container size="lg" px={0}>
        <Stack gap="md">
          <Anchor component={Link} href="/admin/tours">
            <Group gap={4}><IconArrowLeft size={14} /><Text size="sm">返回 Tour 列表</Text></Group>
          </Anchor>

          {/* Tour profile */}
          <Card withBorder padding="md" radius="md">
            <Title order={3}>{tour.title}</Title>
            <Text size="sm" mt={4}>
              作者：
              <Anchor component={Link} href={`/admin/users/${tour.author.id}`}>
                {tour.author.name}
              </Anchor>
              {' '}<Text span c="dimmed">{tour.author.email}</Text>
            </Text>
            <Text size="xs" c="dimmed" mt={4}>
              ID #{tour.id} · 创建 {fmtDate(tour.created_at)} · 更新 {fmtDate(tour.updated_at)}
              {tour.start_date && ` · ${tour.start_date} → ${tour.end_date || '—'}`}
            </Text>
          </Card>

          {/* Members */}
          <Card withBorder padding="md" radius="md">
            <Title order={4} mb="sm">成员 ({members.length})</Title>
            <Table striped>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>姓名</Table.Th>
                  <Table.Th>邮箱</Table.Th>
                  <Table.Th>角色</Table.Th>
                  <Table.Th>加入时间</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {members.map((m) => (
                  <Table.Tr key={m.user_id}>
                    <Table.Td>
                      <Anchor component={Link} href={`/admin/users/${m.user_id}`}>{m.name}</Anchor>
                    </Table.Td>
                    <Table.Td>{m.email}</Table.Td>
                    <Table.Td>
                      <Badge variant="light" color={m.role === 'author' ? 'grape' : 'gray'}>
                        {m.role}
                      </Badge>
                    </Table.Td>
                    <Table.Td>{fmtDate(m.joined_at)}</Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </Card>

          {/* Days */}
          <Card withBorder padding="md" radius="md">
            <Title order={4} mb="sm">Days ({days.length})</Title>
            {days.length === 0 ? (
              <Text c="dimmed">暂无 Day</Text>
            ) : (
              <Table>
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>Day</Table.Th>
                    <Table.Th>日期</Table.Th>
                    <Table.Th>Activity 数</Table.Th>
                    <Table.Th>更新时间</Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {days.map((d) => (
                    <Table.Tr key={d.id}>
                      <Table.Td>Day {d.day_index}</Table.Td>
                      <Table.Td>{d.date || '—'}</Table.Td>
                      <Table.Td>{d.activity_count}</Table.Td>
                      <Table.Td>{fmtDate(d.updated_at)}</Table.Td>
                    </Table.Tr>
                  ))}
                </Table.Tbody>
              </Table>
            )}
          </Card>

          {/* Conversation stats */}
          <Card withBorder padding="md" radius="md">
            <Title order={4} mb="sm">对话统计</Title>
            <SimpleGrid cols={{ base: 2, sm: 4 }}>
              <Stat label="消息数" value={fmtNum(stats.total_messages)} />
              <Stat label="总 token" value={fmtNum(stats.total_tokens)} />
              <Stat label="总成本" value={fmtCost(stats.total_cost_cents)} />
              <Stat label="最后发言" value={fmtDate(stats.last_message_at)} />
            </SimpleGrid>
          </Card>
        </Stack>
      </Container>
    </AdminShell>
  )
}
