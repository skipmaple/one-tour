import { Group, Avatar, Text, Menu, UnstyledButton } from '@mantine/core'
import { useDisclosure } from '@mantine/hooks'
import { Link, usePage } from '@inertiajs/react'
import ProfileSettingsModal from '../../components/ProfileSettingsModal'

export default function UserSection() {
  const { current_user } = usePage().props
  const [opened, { open, close }] = useDisclosure(false)

  if (!current_user) return null

  return (
    <>
      <Menu shadow="md" width={220} position="top-start">
        <Menu.Target>
          <UnstyledButton px="sm" py="xs" w="100%">
            <Group gap="sm" wrap="nowrap">
              <Avatar src={current_user.avatar_url} radius="xl" size="sm">
                {current_user.name?.[0]?.toUpperCase()}
              </Avatar>
              <Text size="sm" truncate>{current_user.name}</Text>
            </Group>
          </UnstyledButton>
        </Menu.Target>
        <Menu.Dropdown>
          <Menu.Label>{current_user.name}</Menu.Label>
          {current_user.email && (
            <Menu.Label c="dimmed" fz="xs" style={{ fontWeight: 'normal' }}>
              {current_user.email}
            </Menu.Label>
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
  )
}
