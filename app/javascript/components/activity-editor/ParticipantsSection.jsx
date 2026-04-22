import { Alert, Checkbox, Group, Stack } from '@mantine/core'
import UserLabel from '../planner/UserLabel'

// Controlled participant picker. Shared between create + edit flows in
// ActivityDrawer (rendered inside a CollapsibleSection in the basic tab).
//
// value semantics:
//   null       = 默认全员 (no explicit set; server stores 0 AP rows)
//   number[]   = explicit subset
//
// onChange always emits the normalized form: an explicit list that would
// include every candidate collapses back to `null`, and an empty list
// collapses to `null` (保底回落 — we never emit "no one participates").
export default function ParticipantsSection({ author, members, canEdit, value, onChange }) {
  const candidates = [
    { user_id: author.user_id, name: author.name, avatar_url: author.avatar_url, email: author.email, isAuthor: true },
    ...members.map((m) => ({
      user_id: m.user_id, name: m.name, avatar_url: m.avatar_url, email: m.email, isAuthor: false,
    })),
  ]
  const allIds = candidates.map((c) => c.user_id)
  const isFullTrip = value === null
  const selected = new Set(isFullTrip ? allIds : value)

  const normalize = (ids) => {
    if (ids.length === 0) return null
    if (ids.length === allIds.length) return null
    return ids
  }

  const toggle = (userId, checked) => {
    const base = isFullTrip ? allIds : value
    const next = checked
      ? [ ...base, userId ]
      : base.filter((id) => id !== userId)
    onChange(normalize(next))
  }

  return (
    <Stack gap="sm">
      {isFullTrip && (
        <Alert color="blue" variant="light">
          默认全员参与。取消勾选某人即切换为"仅列出成员参与"模式。
        </Alert>
      )}
      {candidates.map((c) => {
        const checked = selected.has(c.user_id)
        return (
          <Checkbox
            key={c.user_id}
            checked={checked}
            disabled={!canEdit}
            onChange={(e) => toggle(c.user_id, e.currentTarget.checked)}
            label={
              <Group gap="xs" wrap="nowrap">
                <UserLabel user={c} isAuthor={c.isAuthor} size={22} fz="sm" />
              </Group>
            }
          />
        )
      })}
    </Stack>
  )
}
