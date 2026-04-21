import { useState, useEffect } from 'react'
import { usePage, router, Link, Head } from '@inertiajs/react'
import {
  Container, Title, Stack, Table, TextInput, Group, Pagination,
  Text, Anchor,
} from '@mantine/core'
import { IconSearch } from '@tabler/icons-react'
import { useDebouncedValue } from '@mantine/hooks'

function fmtDate(iso) { return new Date(iso).toLocaleDateString('zh-CN') }

export default function ToursIndex() {
  const { props } = usePage()
  const { tours, total, page, per_page, q, sort } = props

  const [search, setSearch] = useState(q)
  const [debounced] = useDebouncedValue(search, 300)

  useEffect(() => {
    if (debounced !== q) {
      router.get('/admin/tours',
        { q: debounced, sort, page: 1 },
        { preserveState: true, preserveScroll: true })
    }
  }, [debounced]) // eslint-disable-line react-hooks/exhaustive-deps

  const setPage = (p) => {
    router.get('/admin/tours',
      { q, sort, page: p },
      { preserveState: true, preserveScroll: true })
  }

  const totalPages = Math.max(1, Math.ceil(total / per_page))

  return (
    <>
      <Head title="旅程" />
      <Container fluid px="md">
        <Stack gap="md">
          <Title order={2}>旅程</Title>
          <TextInput
            leftSection={<IconSearch size={16} />}
            placeholder="搜索标题"
            value={search}
            onChange={(e) => setSearch(e.currentTarget.value)}
          />
          <Table highlightOnHover stickyHeader>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>编号</Table.Th>
                <Table.Th>标题</Table.Th>
                <Table.Th>作者</Table.Th>
                <Table.Th>成员数</Table.Th>
                <Table.Th>天数</Table.Th>
                <Table.Th>行数</Table.Th>
                <Table.Th>创建时间</Table.Th>
                <Table.Th>最近更新</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {tours.map((t) => (
                <Table.Tr key={t.id}>
                  <Table.Td>{t.id}</Table.Td>
                  <Table.Td>
                    <Anchor component={Link} href={`/admin/tours/${t.id}`}>{t.title}</Anchor>
                  </Table.Td>
                  <Table.Td>
                    <Anchor component={Link} href={`/admin/users/${t.author_id}`}>
                      {t.author_name}
                    </Anchor>
                    <Text size="xs" c="dimmed">{t.author_email}</Text>
                  </Table.Td>
                  <Table.Td>{t.members_count}</Table.Td>
                  <Table.Td>{t.day_count}</Table.Td>
                  <Table.Td>{t.activity_count}</Table.Td>
                  <Table.Td>{fmtDate(t.created_at)}</Table.Td>
                  <Table.Td>{fmtDate(t.updated_at)}</Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
          <Group justify="space-between">
            <Text size="sm" c="dimmed">共 {total} 条</Text>
            <Pagination value={page} onChange={setPage} total={totalPages} />
          </Group>
        </Stack>
      </Container>
    </>
  )
}
