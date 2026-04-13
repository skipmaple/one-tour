import { Table, Select, Button, Group, TextInput, Text } from '@mantine/core'
import { useForm, router } from '@inertiajs/react'

export default function MemberManager({ guidebookId, memberships }) {
  const form = useForm({ email: '', role: 'reader' })

  const handleInvite = (e) => {
    e.preventDefault()
    form.post(`/guidebooks/${guidebookId}/memberships`, {
      data: { membership: { email: form.data.email, role: form.data.role } },
      onSuccess: () => form.reset(),
    })
  }

  const handleRoleChange = (membershipId, role) => {
    router.patch(`/guidebooks/${guidebookId}/memberships/${membershipId}`, {
      membership: { role },
    })
  }

  const handleRemove = (membershipId) => {
    router.delete(`/guidebooks/${guidebookId}/memberships/${membershipId}`)
  }

  return (
    <div>
      <form onSubmit={handleInvite}>
        <Group mb="md">
          <TextInput
            placeholder="邮箱地址"
            value={form.data.email}
            onChange={(e) => form.setData('email', e.target.value)}
            style={{ flex: 1 }}
          />
          <Select
            data={[
              { value: 'reader', label: '读者' },
              { value: 'editor', label: '编辑者' },
            ]}
            value={form.data.role}
            onChange={(val) => form.setData('role', val)}
            w={120}
          />
          <Button type="submit" loading={form.processing}>邀请</Button>
        </Group>
      </form>

      <Table>
        <Table.Thead>
          <Table.Tr>
            <Table.Th>用户</Table.Th>
            <Table.Th>角色</Table.Th>
            <Table.Th>操作</Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {memberships.map((m) => (
            <Table.Tr key={m.id}>
              <Table.Td>
                <div>
                  <Text size="sm" fw={500}>{m.user.name}</Text>
                  <Text size="xs" c="dimmed">{m.user.email}</Text>
                </div>
              </Table.Td>
              <Table.Td>
                <Select
                  data={[
                    { value: 'reader', label: 'Reader' },
                    { value: 'editor', label: 'Editor' },
                  ]}
                  value={m.role}
                  onChange={(val) => handleRoleChange(m.id, val)}
                  size="xs"
                  w={120}
                />
              </Table.Td>
              <Table.Td>
                <Button variant="subtle" color="red" size="xs" onClick={() => handleRemove(m.id)}>
                  移除
                </Button>
              </Table.Td>
            </Table.Tr>
          ))}
        </Table.Tbody>
      </Table>

      {memberships.length === 0 && (
        <Text c="dimmed" ta="center" py="md">暂无成员，通过上方邮箱邀请</Text>
      )}
    </div>
  )
}
