import { AppShell, Group, Button, Avatar, Text, Menu } from '@mantine/core'
import { useDisclosure } from '@mantine/hooks'
import { Link, usePage } from '@inertiajs/react'
import ProfileSettingsModal from '../components/ProfileSettingsModal'

export default function AppLayout({ children }) {
  const { current_user } = usePage().props
  const [opened, { open, close }] = useDisclosure(false)

  return (
    <AppShell header={{ height: 56 }} padding="md">
      <AppShell.Header>
        <Group h="100%" px="md" justify="space-between">
          <Link href="/" style={{ textDecoration: 'none', color: 'inherit' }}>
            <Text fw={700} size="lg">路书</Text>
          </Link>

          <Group>
            {current_user ? (
              <>
                <Menu shadow="md" width={200}>
                  <Menu.Target>
                    <Avatar src={current_user.avatar_url} radius="xl" size="sm" style={{ cursor: 'pointer' }} />
                  </Menu.Target>
                  <Menu.Dropdown>
                    <Menu.Label>{current_user.name}</Menu.Label>
                    {current_user.email && (
                      <Menu.Label c="dimmed" fz="xs" style={{ fontWeight: 'normal' }}>{current_user.email}</Menu.Label>
                    )}
                    <Menu.Divider />
                    <Menu.Item onClick={open}>个人设置</Menu.Item>
                    <Menu.Item component={Link} href="/logout" method="delete" as="button">
                      退出
                    </Menu.Item>
                  </Menu.Dropdown>
                </Menu>
                <ProfileSettingsModal opened={opened} onClose={close} />
              </>
            ) : (
              <Button component={Link} href="/login" variant="light" size="sm">
                登录
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
