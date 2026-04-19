import { Avatar, Group, Text } from '@mantine/core'

// Shared renderer for user references across the expense module — replaces
// bare emails with avatar + name, optional "（作者）" suffix.
//
// `user` shape: { user_id, name, avatar_url, email? }. When user is null
// (e.g. removed from the tour mid-flight) we render a neutral "（已离开）"
// placeholder instead of the jarring raw id fallback.
export default function UserLabel({ user, isAuthor = false, size = 20, fz = 'sm' }) {
  if (!user) {
    return <Text size={fz} c="dimmed">（已离开）</Text>
  }
  return (
    <Group gap={6} wrap="nowrap" style={{ minWidth: 0 }}>
      <Avatar
        src={user.avatar_url}
        size={size}
        radius="xl"
        alt={user.name}
      >
        {user.name?.[0] || '?'}
      </Avatar>
      <Text size={fz} truncate style={{ minWidth: 0 }}>
        {user.name || user.email || '?'}
        {isAuthor && <Text component="span" c="dimmed" size="xs">（作者）</Text>}
      </Text>
    </Group>
  )
}
