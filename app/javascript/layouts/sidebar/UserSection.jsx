import { Group, Avatar, Text, Menu, UnstyledButton } from '@mantine/core'
import { useDisclosure, useClipboard, useHover } from '@mantine/hooks'
import { IconCopy, IconCheck } from '@tabler/icons-react'
import { Link, usePage } from '@inertiajs/react'
import ProfileSettingsModal from '../../components/ProfileSettingsModal'

function EmailCopyItem({ email }) {
  const clipboard = useClipboard({ timeout: 1500 })
  const { hovered, ref } = useHover()
  const showIcon = hovered || clipboard.copied

  return (
    <UnstyledButton
      ref={ref}
      onClick={() => clipboard.copy(email)}
      aria-label={`复制邮箱 ${email}`}
      px="sm"
      py={4}
      w="100%"
      style={{ cursor: 'pointer' }}
    >
      <Group gap={6} wrap="nowrap" align="center" justify="space-between">
        <Text
          c="dimmed"
          fz="xs"
          style={{ wordBreak: 'break-all', whiteSpace: 'normal', flex: 1, minWidth: 0 }}
        >
          {clipboard.copied ? '已复制' : email}
        </Text>
        {clipboard.copied ? (
          <IconCheck
            size={14}
            style={{ color: 'var(--mantine-color-teal-6)', flexShrink: 0, opacity: 1, transition: 'opacity 120ms' }}
          />
        ) : (
          <IconCopy
            size={14}
            style={{ color: 'var(--mantine-color-dimmed)', flexShrink: 0, opacity: showIcon ? 1 : 0, transition: 'opacity 120ms' }}
          />
        )}
      </Group>
    </UnstyledButton>
  )
}

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
          {current_user.email && <EmailCopyItem email={current_user.email} />}
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
