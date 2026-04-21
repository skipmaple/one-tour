import { useState } from 'react'
import { Drawer, Stack, Group, Text, Button, Divider } from '@mantine/core'
import { IconPlus, IconPencil, IconMapPin } from '@tabler/icons-react'
import ActivityMiniMap from './ActivityMiniMap'
import ActivityGalleryLightbox from '../activity-editor/ActivityGalleryLightbox'
import { KIND_SCHEMA } from '../activity-editor/detailsSchema'
import UserLabel from './UserLabel'
import { effectiveParticipants, isFullRoster } from '../../lib/effectiveParticipants'

// Read-only detail view for a single Activity. Unified entry point for all
// roles when clicking an activity card — author/editor see [+ 记一笔] and
// [编辑] buttons; reader sees only the close button.
//
// Sections (from top to bottom, single-column scroll):
//   1. Header       — name + meta + action buttons
//   2. Location     — address + coords + kind-specific fields + mini-map
//   3. Description  — activity.desc (hidden when empty)
//   4. Gallery      — image thumbnails (hidden when empty)
//   5. Participants — read-only roster (default-全员 or explicit list)
//   6. Expenses     — activity-scope expense list + summary + [+ 记一笔]
//
// All data comes from props supplied by Tour/Show.jsx — zero network calls
// in this component. "记一笔" and "编辑" delegate to callback props; the
// parent wires them to AddExpenseDialog / ActivityDrawer.

function formatDuration(min) {
  if (min == null) return null
  if (min >= 60 && min % 30 === 0) return `${min / 60}h`
  return `${min}分`
}

function DetailHeaderSection({ activity, days, canEdit, onEdit, onAddExpense }) {
  const day = days.find((d) => d.id === activity.day_id)
  const dayLabel = day ? `D${day.day_index}` : '候选池'
  const duration = formatDuration(activity.planned_duration_min)
  return (
    <Stack gap={6} data-testid="detail-header">
      <Group justify="space-between" wrap="nowrap" align="flex-start">
        <Text size="xs" c="dimmed" component="div">
          {[ dayLabel, activity.kind, activity.citizen_level, activity.planned_start_at, duration ]
            .filter(Boolean).join(' · ')}
        </Text>
        {canEdit && (
          <Group gap="xs" wrap="nowrap">
            <Button
              size="xs"
              variant="filled"
              leftSection={<IconPlus size={14} />}
              onClick={() => onAddExpense(activity.id)}
            >
              记一笔
            </Button>
            <Button
              size="xs"
              variant="subtle"
              leftSection={<IconPencil size={14} />}
              onClick={() => onEdit(activity.id)}
            >
              编辑
            </Button>
          </Group>
        )}
      </Group>
    </Stack>
  )
}

function DetailLocationSection({ activity }) {
  const hasCoords = activity.lat != null && activity.lng != null
  const kindFields = KIND_SCHEMA[activity.kind] || []
  const detailEntries = kindFields
    .map((f) => {
      const raw = activity.details?.[f.key]
      if (raw == null || raw === '') return null
      const suffix = f.suffix ?? ''
      return { key: f.key, label: f.label, text: `${raw}${suffix}` }
    })
    .filter(Boolean)

  return (
    <Stack gap={6} data-testid="detail-location">
      <Group gap="xs" wrap="nowrap" align="flex-start">
        <IconMapPin size={14} style={{ marginTop: 3, flexShrink: 0 }} />
        <Text size="sm">
          {activity.address}
          {hasCoords ? (
            <Text component="span" size="xs" c="dimmed" ml="xs">
              {activity.lat.toFixed(4)}, {activity.lng.toFixed(4)}
            </Text>
          ) : (
            <Text component="span" size="xs" c="dimmed" ml={activity.address ? 'xs' : 0}>
              （未定位）
            </Text>
          )}
        </Text>
      </Group>
      {detailEntries.length > 0 && (
        <Group gap="md" wrap="wrap">
          {detailEntries.map((e) => (
            <Text key={e.key} size="xs" c="dimmed">
              {e.label}: {e.text}
            </Text>
          ))}
        </Group>
      )}
      {hasCoords && <ActivityMiniMap lat={activity.lat} lng={activity.lng} height={160} />}
    </Stack>
  )
}

function DetailDescSection({ activity }) {
  if (!activity.desc) return null
  return (
    <>
      <Divider />
      <Stack gap={6}>
        <Text size="xs" c="dimmed">介绍</Text>
        <Text size="sm" data-testid="detail-desc" style={{ whiteSpace: 'pre-wrap' }}>
          {activity.desc}
        </Text>
      </Stack>
    </>
  )
}

function DetailGallerySection({ activity, activityImages }) {
  const images = (activityImages || []).filter((img) => img.activity_id === activity.id)
  const [ lightboxIndex, setLightboxIndex ] = useState(null)

  if (images.length === 0) return null

  return (
    <>
      <Divider />
      <Stack gap={6}>
        <Text size="xs" c="dimmed">图集 · {images.length}</Text>
        <Group gap="xs" wrap="nowrap" style={{ overflowX: 'auto' }}>
          {images.map((img, idx) => (
            <button
              key={img.id}
              type="button"
              data-testid={`detail-thumb-${idx}`}
              onClick={() => setLightboxIndex(idx)}
              style={{
                width: 80, height: 80, border: 0, padding: 0, cursor: 'pointer',
                backgroundImage: `url(${img.url})`, backgroundSize: 'cover', backgroundPosition: 'center',
                borderRadius: 4, flexShrink: 0,
              }}
              aria-label={`图片 ${idx + 1}`}
            />
          ))}
        </Group>
      </Stack>
      <ActivityGalleryLightbox
        images={images}
        initialIndex={lightboxIndex}
        onClose={() => setLightboxIndex(null)}
      />
    </>
  )
}

function DetailParticipantsSection({ activity, author, members }) {
  const ids = effectiveParticipants(activity, { author, members })
  const isDefault = isFullRoster(activity)
  const allUsers = [
    { ...author, isAuthor: true },
    ...members.map((m) => ({ ...m, isAuthor: false })),
  ]
  const displayed = ids
    .map((id) => allUsers.find((u) => u.user_id === id))
    .filter(Boolean)

  const title = isDefault ? '默认全员' : '参与人'

  return (
    <>
      <Divider />
      <Stack gap={6} data-testid="detail-participants">
        <Text size="xs" c="dimmed">{title} · {displayed.length} 人</Text>
        <Stack gap={4}>
          {displayed.map((u) => (
            <UserLabel key={u.user_id} user={u} isAuthor={u.isAuthor} size={22} fz="sm" />
          ))}
        </Stack>
      </Stack>
    </>
  )
}

export default function ActivityDetailDrawer({
  opened, onClose,
  tour, days, activity, activityImages, author, members, expenses,
  canEdit,
  onEdit, onAddExpense, onFocusExpense,
}) {
  return (
    <Drawer
      opened={opened}
      onClose={onClose}
      position="right"
      size={480}
      padding="md"
      withCloseButton
      closeButtonProps={{ 'aria-label': 'Close' }}
      title={activity ? activity.name : null}
    >
      {activity && (
        <Stack gap="md">
          <DetailHeaderSection
            activity={activity}
            days={days}
            canEdit={canEdit}
            onEdit={onEdit}
            onAddExpense={onAddExpense}
          />
          <DetailLocationSection activity={activity} />
          <DetailDescSection activity={activity} />
          <DetailGallerySection activity={activity} activityImages={activityImages} />
          <DetailParticipantsSection activity={activity} author={author} members={members} />
          {/* Expenses section plugged in by Task 9 */}
        </Stack>
      )}
    </Drawer>
  )
}
