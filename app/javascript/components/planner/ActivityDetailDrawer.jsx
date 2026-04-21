import { useState } from 'react'
import { Drawer, Stack, Group, Text, Button, Divider, Tooltip } from '@mantine/core'
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

const CATEGORY_LABELS = {
  food: '吃饭', fuel: '加油', lodging: '住宿', ticket: '门票', refund: '退款', misc: '其他',
}

function formatYuan(cents) {
  const yuan = Math.round(cents / 100)
  return `¥${yuan.toLocaleString('zh-CN')}`
}

function usersById(author, members) {
  const map = { [author.user_id]: author }
  for (const m of members) map[m.user_id] = m
  return map
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

function DetailExpensesSection({ activity, expenses, author, members, canEdit, onAddExpense, onFocusExpense }) {
  const mine = (expenses || []).filter((e) => e.scope === 'activity' && e.activity_id === activity.id)
  const total = mine.reduce((sum, e) => sum + (e.amount_cents || 0), 0)
  const users = usersById(author, members)
  const isBacklog = activity.day_id == null

  return (
    <>
      <Divider />
      <Stack gap="xs" data-testid="detail-expenses">
        <Group justify="space-between" wrap="nowrap">
          <Text size="xs" c="dimmed">
            {mine.length === 0
              ? '账单'
              : `账单 · 共 ${formatYuan(total)} · ${mine.length} 笔`}
          </Text>
        </Group>

        {mine.length === 0 ? (
          <Text size="sm" c="dimmed">还没有花销记录。</Text>
        ) : (
          <Stack gap={4}>
            {mine.map((e) => {
              const payer = users[e.paid_by_id]
              const payerName = payer?.name || `用户 ${e.paid_by_id}`
              const strategyText = e.split_strategy === 'individual'
                ? '个人'
                : `AA ${e.splits?.length || 0} 人分`
              return (
                <button
                  key={e.id}
                  type="button"
                  data-testid={`detail-expense-row-${e.id}`}
                  onClick={() => onFocusExpense(e.id)}
                  style={{
                    textAlign: 'left', border: 0, background: 'transparent',
                    padding: '6px 4px', cursor: 'pointer', borderBottom: '1px solid #f0f0f0',
                  }}
                >
                  <Text size="sm">
                    {formatYuan(e.amount_cents)}  {CATEGORY_LABELS[e.category] || e.category}  ·  {payerName} 付  ·  {strategyText}
                  </Text>
                </button>
              )
            })}
          </Stack>
        )}

        {canEdit && (
          isBacklog ? (
            <Tooltip label="候选池活动无法记账，请先排入某一天">
              <Button
                data-testid="detail-expenses-add-btn"
                fullWidth
                variant="filled"
                leftSection={<IconPlus size={14} />}
                disabled
              >
                记一笔
              </Button>
            </Tooltip>
          ) : (
            <Button
              data-testid="detail-expenses-add-btn"
              fullWidth
              variant="filled"
              leftSection={<IconPlus size={14} />}
              onClick={() => onAddExpense(activity.id)}
            >
              记一笔
            </Button>
          )
        )}
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
          <DetailExpensesSection
            activity={activity}
            expenses={expenses}
            author={author}
            members={members}
            canEdit={canEdit}
            onAddExpense={onAddExpense}
            onFocusExpense={onFocusExpense}
          />
        </Stack>
      )}
    </Drawer>
  )
}
