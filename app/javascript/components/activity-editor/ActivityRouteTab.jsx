import { useMemo, useState } from 'react'
import {
  Stack, Group, Text, Button, SegmentedControl, Card, Badge,
} from '@mantine/core'
import { router } from '@inertiajs/react'
import { notifications } from '@mantine/notifications'
import { IconRefresh, IconRoad } from '@tabler/icons-react'

const MODE_OPTIONS = [
  { value: 'driving', label: '开车' },
  { value: 'walking', label: '走路' },
]

// Computes the next adjacent activity after `activity` in the tour's linear
// order: sort all non-backlog activities by (day_index, position) ascending,
// then return the one immediately after this activity. Returns null when
// this is the last activity of the tour.
function computeNextActivity(activity, allActivities, days) {
  if (!activity?.day_id) return null
  const dayOrder = Object.fromEntries(days.map((d) => [ d.id, d.day_index ]))
  const ordered = allActivities
    .filter((a) => a.day_id != null)
    .slice()
    .sort((a, b) => {
      const da = dayOrder[a.day_id] ?? 0
      const db = dayOrder[b.day_id] ?? 0
      return da === db ? a.position - b.position : da - db
    })
  const idx = ordered.findIndex((a) => a.id === activity.id)
  if (idx < 0 || idx === ordered.length - 1) return null
  return ordered[idx + 1]
}

function hasCoords(a) {
  return a && a.lat != null && a.lng != null && Number.isFinite(parseFloat(a.lat)) && Number.isFinite(parseFloat(a.lng))
}

function formatDuration(seconds) {
  if (!seconds) return '—'
  const h = Math.floor(seconds / 3600)
  const m = Math.round((seconds % 3600) / 60)
  if (h > 0) return `${h}h ${m}m`
  return `${m} 分钟`
}

function formatDistance(meters) {
  if (!meters) return '—'
  if (meters >= 1000) return `${(meters / 1000).toFixed(1)} km`
  return `${meters} m`
}

function timeSince(iso) {
  if (!iso) return '—'
  const diffMs = Date.now() - new Date(iso).getTime()
  if (diffMs < 0) return '刚刚'
  const minutes = Math.floor(diffMs / 60000)
  if (minutes < 1) return '刚刚'
  if (minutes < 60) return `${minutes} 分钟前`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours} 小时前`
  return `${Math.floor(hours / 24)} 天前`
}

export default function ActivityRouteTab({ tourId, activity, allActivities, days, routeLegs, canEdit }) {
  const [ mode, setMode ] = useState('driving')
  const [ refreshing, setRefreshing ] = useState(false)

  const nextActivity = useMemo(
    () => computeNextActivity(activity, allActivities, days),
    [ activity, allActivities, days ]
  )

  const leg = useMemo(() => {
    if (!activity || !nextActivity) return null
    return routeLegs.find(
      (l) => l.from_activity_id === activity.id && l.to_activity_id === nextActivity.id && l.mode === mode
    )
  }, [ activity, nextActivity, routeLegs, mode ])

  const handleRefresh = () => {
    if (!nextActivity) return
    setRefreshing(true)
    router.post(`/tours/${tourId}/route_legs`, {
      from_activity_id: activity.id,
      to_activity_id: nextActivity.id,
      mode,
    }, {
      preserveScroll: true,
      // Controllers redirect back to tour_path on success; partial reload
      // picks up fresh route_legs + flash.
      only: [ 'route_legs', 'flash' ],
      onSuccess: (page) => {
        setRefreshing(false)
        const alert = page?.props?.flash?.alert
        if (alert) {
          notifications.show({ message: alert, color: 'red' })
        } else {
          notifications.show({ message: '路线已更新', color: 'green' })
        }
      },
      onError: (errors) => {
        setRefreshing(false)
        const msg = Object.values(errors || {}).flat().join('；') || '查询失败'
        notifications.show({ message: msg, color: 'red' })
      },
    })
  }

  // Empty states
  if (!activity?.day_id) {
    return (
      <Card padding="xl" radius="sm" withBorder>
        <Stack align="center" gap="xs">
          <IconRoad size={40} stroke={1.2} color="#adb5bd" />
          <Text fw={600}>候选池的站点还没有路线</Text>
          <Text size="xs" c="dimmed" ta="center">
            先把这个站点拖到某一天再看路线。
          </Text>
        </Stack>
      </Card>
    )
  }

  if (!nextActivity) {
    return (
      <Card padding="xl" radius="sm" withBorder>
        <Stack align="center" gap="xs">
          <IconRoad size={40} stroke={1.2} color="#adb5bd" />
          <Text fw={600}>这是整程的最后一个站点</Text>
          <Text size="xs" c="dimmed">没有下一段路线需要规划。</Text>
        </Stack>
      </Card>
    )
  }

  if (!hasCoords(activity) || !hasCoords(nextActivity)) {
    return (
      <Card padding="lg" radius="sm" withBorder>
        <Stack gap="xs">
          <Text fw={600} size="sm">无法规划：有站点缺坐标</Text>
          <Text size="xs" c="dimmed">
            需要给以下站点填上位置再来规划：
          </Text>
          {!hasCoords(activity) && <Text size="xs">· 当前站点「{activity.name}」</Text>}
          {!hasCoords(nextActivity) && <Text size="xs">· 下一站「{nextActivity.name}」</Text>}
        </Stack>
      </Card>
    )
  }

  const constitutionWarning = mode === 'driving' && leg && leg.duration_s > 240 * 60

  return (
    <Stack gap="md">
      <Card padding="sm" radius="sm" withBorder>
        <Group justify="space-between" gap="xs">
          <Stack gap={2} style={{ flex: 1, minWidth: 0 }}>
            <Text size="xs" c="dimmed">本站点</Text>
            <Text size="sm" fw={500} truncate>{activity.name}</Text>
          </Stack>
          <Text c="dimmed">→</Text>
          <Stack gap={2} style={{ flex: 1, minWidth: 0 }}>
            <Text size="xs" c="dimmed">下一站</Text>
            <Text size="sm" fw={500} truncate>{nextActivity.name}</Text>
          </Stack>
        </Group>
      </Card>

      <SegmentedControl
        value={mode}
        onChange={setMode}
        data={MODE_OPTIONS}
        fullWidth
      />

      <Card padding="md" radius="sm" withBorder style={{ background: '#f8f9fa' }}>
        <Group justify="space-around">
          <Stack gap={2} align="center">
            <Text size="xs" c="dimmed">距离</Text>
            <Text fw={700}>{formatDistance(leg?.distance_m)}</Text>
          </Stack>
          <Stack gap={2} align="center">
            <Text size="xs" c="dimmed">{mode === 'walking' ? '走路' : '开车'}用时</Text>
            <Text fw={700}>{formatDuration(leg?.duration_s)}</Text>
          </Stack>
          <Stack gap={2} align="center">
            <Text size="xs" c="dimmed">上次查询</Text>
            <Text size="sm">{timeSince(leg?.fetched_at)}</Text>
          </Stack>
        </Group>
      </Card>

      {canEdit && (
        <Button
          onClick={handleRefresh}
          loading={refreshing}
          leftSection={<IconRefresh size={14} />}
          variant={leg ? 'light' : 'filled'}
          fullWidth
        >
          {leg ? '重新查一次导航时长' : '立即规划这段路线'}
        </Button>
      )}

      {constitutionWarning && (
        <Card padding="sm" radius="sm" withBorder style={{ borderLeft: '3px solid #fd7e14', background: '#fff4e6' }}>
          <Stack gap="xs">
            <Group gap="xs">
              <Badge color="orange" size="sm">超时</Badge>
              <Text size="sm" fw={500}>
                开车 {formatDuration(leg.duration_s)}，超过每天 4 小时的上限
              </Text>
            </Group>
            <Text size="xs" c="dimmed">
              可以在 AI 助手里问"D2 开车太久，帮我拆成两天"，或者选择走路 / 公交模式。
            </Text>
          </Stack>
        </Card>
      )}

      {!leg && canEdit && (
        <Text size="xs" c="dimmed" ta="center">
          首次规划会调用地图服务。坐标没变时，再点"重新查一次"只命中缓存，不会重复调用。
        </Text>
      )}
    </Stack>
  )
}
