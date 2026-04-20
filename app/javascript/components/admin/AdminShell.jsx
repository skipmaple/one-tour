import { AppShell, Burger, Group, NavLink, Text, Badge } from '@mantine/core'
import { useDisclosure } from '@mantine/hooks'
import { Link } from '@inertiajs/react'
import {
  IconLayoutDashboard,
  IconUsers,
  IconMap,
  IconArrowBack,
} from '@tabler/icons-react'

const NAV_ITEMS = [
  { label: 'Dashboard', href: '/admin',        icon: IconLayoutDashboard, match: (p) => p === '/admin' },
  { label: '用户',       href: '/admin/users',  icon: IconUsers,           match: (p) => p.startsWith('/admin/users') },
  { label: 'Tour',       href: '/admin/tours',  icon: IconMap,             match: (p) => p.startsWith('/admin/tours') },
]

export default function AdminShell({ children, currentPath = '' }) {
  const [opened, { toggle }] = useDisclosure()

  return (
    <AppShell
      header={{ height: 56 }}
      navbar={{ width: 220, breakpoint: 'sm', collapsed: { mobile: !opened } }}
      padding="md"
    >
      <AppShell.Header>
        <Group h="100%" px="md" justify="space-between">
          <Group>
            <Burger opened={opened} onClick={toggle} hiddenFrom="sm" size="sm" />
            <Text fw={700}>One Tour</Text>
            <Badge color="red" variant="light">Admin</Badge>
          </Group>
          <Group gap="xs">
            <Link href="/" as="a">
              <Group gap={4}>
                <IconArrowBack size={16} />
                <Text size="sm">返回前台</Text>
              </Group>
            </Link>
          </Group>
        </Group>
      </AppShell.Header>

      <AppShell.Navbar p="xs">
        {NAV_ITEMS.map((item) => {
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
        })}
      </AppShell.Navbar>

      <AppShell.Main>{children}</AppShell.Main>
    </AppShell>
  )
}
