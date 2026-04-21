import { Stack, NavLink, Text } from '@mantine/core'
import { Link } from '@inertiajs/react'
import {
  IconLayoutDashboard, IconUsers, IconMap,
} from '@tabler/icons-react'
import UserSection from './UserSection'

const BUSINESS_ITEMS = [
  { label: '旅程', href: '/tours', icon: IconMap, match: (p) => p.startsWith('/tours') },
]

const ADMIN_ITEMS = [
  { label: '概览', href: '/admin',       icon: IconLayoutDashboard, match: (p) => p === '/admin' },
  { label: '用户', href: '/admin/users', icon: IconUsers,           match: (p) => p.startsWith('/admin/users') },
  { label: '旅程', href: '/admin/tours', icon: IconMap,             match: (p) => p.startsWith('/admin/tours') },
]

function renderItem(item, currentPath) {
  const active = item.match(currentPath)
  const Icon = item.icon
  return (
    <NavLink
      key={item.href}
      component={Link}
      href={item.href}
      label={item.label}
      leftSection={<Icon size={18} stroke={1.5} />}
      active={active}
      data-active={active || undefined}
    />
  )
}

export default function SidebarNav({ currentPath = '', isAdmin = false }) {
  return (
    <Stack gap={0} h="100%">
      <Stack gap={2} px="xs" pt="xs">
        {BUSINESS_ITEMS.map((item) => renderItem(item, currentPath))}
      </Stack>

      {isAdmin && (
        <Stack gap={2} px="xs">
          <Text size="xs" c="dimmed" tt="uppercase" px="md" pt="md" pb="xs">
            管理
          </Text>
          {ADMIN_ITEMS.map((item) => renderItem(item, currentPath))}
        </Stack>
      )}

      <Stack mt="auto" px={0} pb="xs">
        <UserSection />
      </Stack>
    </Stack>
  )
}
