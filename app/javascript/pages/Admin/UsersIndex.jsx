import { useState, useEffect } from 'react'
import { usePage, router, Link, Head } from '@inertiajs/react'
import {
  Container, Title, Stack, Table, TextInput, Group, Pagination,
  Text, Anchor, Badge, Paper,
} from '@mantine/core'
import { IconSearch } from '@tabler/icons-react'
import { useDebouncedValue } from '@mantine/hooks'
import { useIsMobile } from '../../hooks/useIsMobile'

function fmtCost(cents) { return `¥${(cents / 100).toFixed(2)}` }
function fmtNum(n)      { return n.toLocaleString() }
function fmtDate(iso)   { return new Date(iso).toLocaleDateString('zh-CN') }

const USER_ROLE_LABEL = { admin: '管理员', user: '普通用户' }

function RoleBadge({ role }) {
  return (
    <Badge color={role === 'admin' ? 'red' : 'gray'} variant="light">
      {USER_ROLE_LABEL[role] || role}
    </Badge>
  )
}

export default function UsersIndex() {
  const { props } = usePage()
  const { users, total, page, per_page, q, sort } = props
  const isMobile = useIsMobile()

  const [search, setSearch] = useState(q)
  const [debounced] = useDebouncedValue(search, 300)

  useEffect(() => {
    if (debounced !== q) {
      router.get('/admin/users',
        { q: debounced, sort, page: 1 },
        { preserveState: true, preserveScroll: true })
    }
  }, [debounced]) // eslint-disable-line react-hooks/exhaustive-deps

  const setSort = (col, dir) => {
    router.get('/admin/users',
      { q, sort: `${col}_${dir}`, page: 1 },
      { preserveState: true, preserveScroll: true })
  }

  const setPage = (p) => {
    router.get('/admin/users',
      { q, sort, page: p },
      { preserveState: true, preserveScroll: true })
  }

  const totalPages = Math.max(1, Math.ceil(total / per_page))

  return (
    <>
      <Head title="用户" />
      <Container fluid px="md">
        <Stack gap="md">
          <Title order={2}>用户</Title>
          <TextInput
            leftSection={<IconSearch size={16} />}
            placeholder="搜索姓名或邮箱"
            value={search}
            onChange={(e) => setSearch(e.currentTarget.value)}
          />
          {isMobile ? <UserCards users={users} /> : (
            <Table highlightOnHover stickyHeader>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>编号</Table.Th>
                  <Table.Th>姓名</Table.Th>
                  <Table.Th>邮箱</Table.Th>
                  <Table.Th>角色</Table.Th>
                  <SortHeader sort={sort} col="created" label="注册时间" setSort={setSort} />
                  <Table.Th>旅程数</Table.Th>
                  <SortHeader sort={sort} col="messages" label="近30天消息" setSort={setSort} />
                  <SortHeader sort={sort} col="tokens"   label="近30天用量" setSort={setSort} />
                  <SortHeader sort={sort} col="cost"     label="近30天花费" setSort={setSort} />
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {users.map((u) => (
                  <Table.Tr key={u.id}>
                    <Table.Td>{u.id}</Table.Td>
                    <Table.Td>
                      <Anchor component={Link} href={`/admin/users/${u.id}`}>{u.name}</Anchor>
                    </Table.Td>
                    <Table.Td>{u.email}</Table.Td>
                    <Table.Td><RoleBadge role={u.role} /></Table.Td>
                    <Table.Td>{fmtDate(u.created_at)}</Table.Td>
                    <Table.Td>{u.tours_count}</Table.Td>
                    <Table.Td>{fmtNum(u.messages_30d)}</Table.Td>
                    <Table.Td>{fmtNum(u.tokens_30d)}</Table.Td>
                    <Table.Td>{fmtCost(u.cost_30d_cents)}</Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          )}
          <Group justify="space-between">
            <Text size="sm" c="dimmed">共 {total} 条</Text>
            <Pagination value={page} onChange={setPage} total={totalPages} />
          </Group>
        </Stack>
      </Container>
    </>
  )
}

function UserCards({ users }) {
  return (
    <Stack gap="sm">
      {users.map((u) => (
        <Paper key={u.id} withBorder p="sm" radius="md">
          <Stack gap={4}>
            <Group justify="space-between" wrap="nowrap" align="flex-start">
              <Anchor component={Link} href={`/admin/users/${u.id}`} fw={700} style={{ minWidth: 0, wordBreak: 'break-all' }}>
                {u.name || '—'}
              </Anchor>
              <RoleBadge role={u.role} />
            </Group>
            <Text size="xs" c="dimmed" style={{ wordBreak: 'break-all' }}>{u.email}</Text>
            <Text size="xs" c="dimmed">注册 {fmtDate(u.created_at)} · {u.tours_count} 个旅程</Text>
          </Stack>
        </Paper>
      ))}
    </Stack>
  )
}

function SortHeader({ sort, col, label, setSort }) {
  const [curCol, curDir] = sort.split('_')
  const active = curCol === col
  const dir    = active && curDir === 'desc' ? 'asc' : 'desc'
  return (
    <Table.Th
      style={{ cursor: 'pointer', userSelect: 'none' }}
      onClick={() => setSort(col, dir)}
    >
      {label}{active ? (curDir === 'desc' ? ' ↓' : ' ↑') : ''}
    </Table.Th>
  )
}
