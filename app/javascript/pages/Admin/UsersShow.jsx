import { usePage, Link } from '@inertiajs/react'
import {
  Container, Stack, Title, Card, Group, Text, Badge, SimpleGrid,
  Tabs, Table, Avatar, Anchor,
} from '@mantine/core'
import { IconArrowLeft } from '@tabler/icons-react'
import AdminShell from '../../components/admin/AdminShell'

function fmtCost(cents) {
  if (cents == null) return '—'
  return `¥${(cents / 100).toFixed(2)}`
}
function fmtNum(n) { return n == null ? '—' : n.toLocaleString() }
function fmtDate(iso) { return new Date(iso).toLocaleString('zh-CN') }

const USER_ROLE_LABEL = { admin: '管理员', user: '普通用户' }
const MESSAGE_ROLE_LABEL = { user: '用户', assistant: '助手', system: '系统', tool: '工具' }
const MEMBER_ROLE_LABEL = { reader: '成员', editor: '编辑' }

function StatCard({ label, value }) {
  return (
    <Card withBorder padding="md" radius="md">
      <Text size="sm" c="dimmed">{label}</Text>
      <Title order={3} mt={4}>{value}</Title>
    </Card>
  )
}

export default function UsersShow() {
  const { props } = usePage()
  const { profile, lifetime_stats, authored_tours, joined_tours, recent_messages } = props

  return (
    <AdminShell currentPath="/admin/users">
      <Container size="lg" px={0}>
        <Stack gap="md">
          <Anchor component={Link} href="/admin/users">
            <Group gap={4}><IconArrowLeft size={14} /><Text size="sm">返回用户列表</Text></Group>
          </Anchor>

          {/* Profile */}
          <Card withBorder padding="md" radius="md">
            <Group>
              <Avatar src={profile.avatar_url} size="xl" radius="xl" />
              <Stack gap={4}>
                <Group gap="xs">
                  <Title order={3}>{profile.name}</Title>
                  <Badge color={profile.role === 'admin' ? 'red' : 'gray'} variant="light">
                    {USER_ROLE_LABEL[profile.role] || profile.role}
                  </Badge>
                </Group>
                <Text size="sm">{profile.email}</Text>
                <Text size="xs" c="dimmed">
                  编号 {profile.id} · 注册 {fmtDate(profile.created_at)}
                  {profile.oauth_providers.length > 0 &&
                    ` · 登录方式：${profile.oauth_providers.join('、')}`}
                </Text>
              </Stack>
            </Group>
          </Card>

          {/* Lifetime */}
          <SimpleGrid cols={{ base: 2, sm: 4 }}>
            <StatCard label="累计旅程" value={lifetime_stats.total_tours} />
            <StatCard label="累计消息" value={fmtNum(lifetime_stats.total_messages)} />
            <StatCard label="累计用量" value={fmtNum(lifetime_stats.total_tokens)} />
            <StatCard label="累计花费" value={fmtCost(lifetime_stats.total_cost_cents)} />
          </SimpleGrid>

          {/* Tours tabs */}
          <Card withBorder padding="md" radius="md">
            <Tabs defaultValue="authored">
              <Tabs.List>
                <Tabs.Tab value="authored">我的旅程 ({authored_tours.length})</Tabs.Tab>
                <Tabs.Tab value="joined">参与的旅程 ({joined_tours.length})</Tabs.Tab>
              </Tabs.List>
              <Tabs.Panel value="authored" pt="md">
                <TourList items={authored_tours} showRole={false} />
              </Tabs.Panel>
              <Tabs.Panel value="joined" pt="md">
                <TourList items={joined_tours} showRole />
              </Tabs.Panel>
            </Tabs>
          </Card>

          {/* Recent messages */}
          <Card withBorder padding="md" radius="md">
            <Title order={4} mb="sm">最近 20 条消息</Title>
            {recent_messages.length === 0 ? (
              <Text c="dimmed">暂无消息</Text>
            ) : (
              <Table striped highlightOnHover>
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>时间</Table.Th>
                    <Table.Th>角色</Table.Th>
                    <Table.Th>内容（前 200 字）</Table.Th>
                    <Table.Th>用量（输入/输出）</Table.Th>
                    <Table.Th>花费</Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {recent_messages.map((m) => (
                    <Table.Tr key={m.id}>
                      <Table.Td>{fmtDate(m.created_at)}</Table.Td>
                      <Table.Td><Badge variant="light">{MESSAGE_ROLE_LABEL[m.role] || m.role}</Badge></Table.Td>
                      <Table.Td>{m.content}</Table.Td>
                      <Table.Td>
                        {m.tokens_in != null ? `${m.tokens_in} / ${m.tokens_out}` : '—'}
                      </Table.Td>
                      <Table.Td>{fmtCost(m.cost_cents)}</Table.Td>
                    </Table.Tr>
                  ))}
                </Table.Tbody>
              </Table>
            )}
          </Card>
        </Stack>
      </Container>
    </AdminShell>
  )
}

function TourList({ items, showRole }) {
  if (items.length === 0) return <Text c="dimmed">暂无</Text>
  return (
    <Table>
      <Table.Thead>
        <Table.Tr>
          <Table.Th>标题</Table.Th>
          {showRole && <Table.Th>角色</Table.Th>}
          <Table.Th>天数</Table.Th>
          <Table.Th>更新时间</Table.Th>
        </Table.Tr>
      </Table.Thead>
      <Table.Tbody>
        {items.map((t) => (
          <Table.Tr key={t.id}>
            <Table.Td>
              <Anchor component={Link} href={`/admin/tours/${t.id}`}>{t.title}</Anchor>
            </Table.Td>
            {showRole && <Table.Td>{MEMBER_ROLE_LABEL[t.role] || t.role}</Table.Td>}
            <Table.Td>{t.day_count ?? '—'}</Table.Td>
            <Table.Td>{fmtDate(t.updated_at)}</Table.Td>
          </Table.Tr>
        ))}
      </Table.Tbody>
    </Table>
  )
}
