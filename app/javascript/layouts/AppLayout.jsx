import { AppShell, Group, Button, Avatar, Text, Menu } from '@mantine/core'
import { Link, usePage } from '@inertiajs/react'

export default function AppLayout({ children }) {
  const { current_user } = usePage().props

  return (
    <AppShell header={{ height: 56 }} padding="md">
      <AppShell.Header>
        <Group h="100%" px="md" justify="space-between">
          <Link href="/" style={{ textDecoration: 'none', color: 'inherit' }}>
            <Text fw={700} size="lg">Guidebook</Text>
          </Link>

          <Group>
            {current_user ? (
              <Menu shadow="md" width={200}>
                <Menu.Target>
                  <Avatar src={current_user.avatar_url} radius="xl" size="sm" style={{ cursor: 'pointer' }} />
                </Menu.Target>
                <Menu.Dropdown>
                  <Menu.Label>{current_user.name}</Menu.Label>
                  <Menu.Item component={Link} href="/logout" method="delete" as="button">
                    Logout
                  </Menu.Item>
                </Menu.Dropdown>
              </Menu>
            ) : (
              <Button component={Link} href="/login" variant="light" size="sm">
                Login
              </Button>
            )}
          </Group>
        </Group>
      </AppShell.Header>

      <AppShell.Main>
        {children}
      </AppShell.Main>
    </AppShell>
  )
}
