import { useState } from 'react'
import { Drawer, Stack, Text, Group, TextInput, Select, Button, Badge, Accordion, Table, Checkbox } from '@mantine/core'
import { modals } from '@mantine/modals'
import { notifications } from '@mantine/notifications'
import { router, usePage } from '@inertiajs/react'
import UserLabel from './UserLabel'

const ROLE_OPTIONS = [
  { value: 'editor', label: '编辑者' },
  { value: 'reader', label: '只读' },
]

export default function MembershipDrawer({ opened, onClose, tour, members, author, days }) {
  const { current_user } = usePage().props
  const isAuthor = current_user?.id === author.user_id

  return (
    <Drawer
      opened={opened}
      onClose={onClose}
      title="本程成员"
      position="right"
      size={460}
      padding="md"
    >
      <Stack gap="md">
        <CurrentMembers
          tour={tour}
          members={members}
          author={author}
          isAuthor={isAuthor}
          days={days || []}
        />
        <InviteSection tour={tour} isAuthor={isAuthor} />
        <PermissionMatrix />
      </Stack>
    </Drawer>
  )
}

function CurrentMembers({ tour, members, author, isAuthor, days }) {
  return (
    <Stack gap="xs">
      <Text fw={600} size="sm">当前成员</Text>

      {/* Author row -- always first, not editable */}
      <Group justify="space-between" p="xs" wrap="nowrap" style={{ background: '#f9f9f9', borderRadius: 4 }}>
        <div style={{ flex: 1, minWidth: 0 }} title={author.email}>
          <UserLabel user={author} isAuthor size={22} fz="sm" />
          <Text size="xs" c="dimmed" truncate>{author.email}</Text>
        </div>
        <Badge color="gray" variant="light" style={{ flexShrink: 0 }}>作者</Badge>
      </Group>

      {members.map(m => (
        <Stack key={m.id} gap={6} p="xs" style={{ borderBottom: '1px solid #eee' }}>
          <Group justify="space-between" wrap="nowrap">
            <div style={{ flex: 1, minWidth: 0 }} title={m.email}>
              <UserLabel user={m} size={22} fz="sm" />
              <Text size="xs" c="dimmed" truncate>{m.email}</Text>
            </div>
            <Group gap="xs">
              <Select
                data={ROLE_OPTIONS}
                value={m.role}
                onChange={newRole => {
                  router.patch(`/tours/${tour.id}/members/${m.id}`, { role: newRole }, {
                    preserveScroll: true,
                    only: ['members'],
                  })
                }}
                w={100}
                size="xs"
                allowDeselect={false}
                disabled={!isAuthor}
              />
              {isAuthor && (
                <Button
                  size="compact-xs"
                  variant="subtle"
                  color="red"
                  onClick={() => {
                    modals.openConfirmModal({
                      title: `将 ${m.name || m.email} 移出本程？`,
                      labels: { confirm: '移除', cancel: '取消' },
                      confirmProps: { color: 'red' },
                      onConfirm: () => {
                        router.delete(`/tours/${tour.id}/members/${m.id}`, {
                          preserveScroll: true,
                          only: ['members'],
                        })
                      },
                    })
                  }}
                >
                  移除
                </Button>
              )}
            </Group>
          </Group>

          {days.length > 0 && isAuthor && (
            <ParticipatingDays tour={tour} membership={m} days={days} />
          )}
        </Stack>
      ))}
    </Stack>
  )
}

function ParticipatingDays({ tour, membership, days }) {
  const selected = new Set(membership.participating_day_ids || [])
  const isFullTrip = selected.size === 0

  const toggleDay = (dayId) => {
    let next
    if (isFullTrip) {
      // First toggle switches from "all" to explicit-list mode containing everything minus the toggled day.
      next = days.map((d) => d.id).filter((id) => id !== dayId)
    } else if (selected.has(dayId)) {
      next = [ ...selected ].filter((id) => id !== dayId)
    } else {
      next = [ ...selected, dayId ]
    }
    // If user re-selects all days, persist as [] (== 全程参与).
    if (next.length === days.length) next = []
    router.patch(`/tours/${tour.id}/members/${membership.id}`, { participating_day_ids: next }, {
      preserveScroll: true, only: ['members'],
    })
  }

  return (
    <Stack gap={4} pl="md">
      <Text size="xs" c="dimmed">参与的日期（"按参与天数"分账时生效）</Text>
      <Group gap={6} wrap="wrap">
        {days.map((d) => {
          const checked = isFullTrip || selected.has(d.id)
          return (
            <Checkbox
              key={d.id}
              size="xs"
              label={`D${d.day_index}`}
              checked={checked}
              onChange={() => toggleDay(d.id)}
            />
          )
        })}
      </Group>
      {!isFullTrip && selected.size < days.length && (
        <Text size="xs" c="orange">仅 {selected.size} / {days.length} 天</Text>
      )}
    </Stack>
  )
}

function InviteSection({ tour, isAuthor }) {
  const [email, setEmail] = useState('')
  const [role, setRole] = useState('reader')
  const [submitting, setSubmitting] = useState(false)

  const handleInvite = () => {
    if (!email.trim()) return
    setSubmitting(true)
    router.post(`/tours/${tour.id}/members`, { email: email.trim(), role }, {
      preserveScroll: true,
      only: ['members'],
      onSuccess: () => {
        setEmail('')
        setSubmitting(false)
      },
      onError: () => {
        notifications.show({ message: '该邮箱还没注册路书账号，请让对方先注册', color: 'red' })
        setSubmitting(false)
      },
    })
  }

  return (
    <Stack gap="xs">
      <Text fw={600} size="sm">邀请新成员</Text>
      {!isAuthor && (
        <Text size="xs" c="dimmed">仅作者可改成员</Text>
      )}
      <Group>
        <TextInput
          placeholder="email@example.com"
          value={email}
          onChange={e => setEmail(e.currentTarget.value)}
          style={{ flex: 1 }}
          disabled={!isAuthor}
        />
        <Select
          data={ROLE_OPTIONS}
          value={role}
          onChange={setRole}
          w={100}
          size="sm"
          allowDeselect={false}
          disabled={!isAuthor}
        />
        <Button size="sm" onClick={handleInvite} disabled={!isAuthor} loading={submitting}>
          邀请
        </Button>
      </Group>
    </Stack>
  )
}

function PermissionMatrix() {
  return (
    <Accordion>
      <Accordion.Item value="permissions">
        <Accordion.Control>权限矩阵</Accordion.Control>
        <Accordion.Panel>
          <Table fontSize="xs">
            <Table.Thead>
              <Table.Tr>
                <Table.Th>操作</Table.Th>
                <Table.Th>作者</Table.Th>
                <Table.Th>编辑者</Table.Th>
                <Table.Th>只读</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              <Table.Tr><Table.Td>查看行程</Table.Td><Table.Td>✓</Table.Td><Table.Td>✓</Table.Td><Table.Td>✓</Table.Td></Table.Tr>
              <Table.Tr><Table.Td>编辑 Activity/Day</Table.Td><Table.Td>✓</Table.Td><Table.Td>✓</Table.Td><Table.Td>✗</Table.Td></Table.Tr>
              <Table.Tr><Table.Td>管理成员</Table.Td><Table.Td>✓</Table.Td><Table.Td>✗</Table.Td><Table.Td>✗</Table.Td></Table.Tr>
              <Table.Tr><Table.Td>删除行程</Table.Td><Table.Td>✓</Table.Td><Table.Td>✗</Table.Td><Table.Td>✗</Table.Td></Table.Tr>
            </Table.Tbody>
          </Table>
        </Accordion.Panel>
      </Accordion.Item>
    </Accordion>
  )
}
