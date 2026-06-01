import { useEffect, useState } from 'react'
import { Drawer, Stack, Text, Group, Button, Box, Divider, Title } from '@mantine/core'
import { useIsMobile } from '../hooks/useIsMobile'
import { modals } from '@mantine/modals'
import { notifications } from '@mantine/notifications'
import { IconCash, IconCamera, IconEdit, IconScale, IconNotebook, IconAlertCircle } from '@tabler/icons-react'
import { router } from '@inertiajs/react'
import { openOutbox, listByStatus, deleteRow } from '../lib/outbox/queue'

const KIND_ICON = {
  expense: IconCash,
  photo: IconCamera,
  activity_edit: IconEdit,
  settlement: IconScale,
  note: IconNotebook,
}

const KIND_LABEL = {
  expense: '费用',
  photo: '照片',
  activity_edit: '活动编辑',
  settlement: '结算',
  note: '笔记',
}

// 整 outbox 流里红色 token 唯一一份(P1 token consistency 跟 OutboxBadge 对齐)
const RED = '#c92a2a' // Mantine red.7,在浅红 / 白底都过 WCAG AA

// 按 row.resource_kind / row.path 计算 redo 跳转 URL。
// 设计原则:任何点击都不应"什么也不发生"(早期 redo 对 4/5 kind 是 null,设计师抓为 P0)。
// fallback 链:
//   1. row.path 匹配 /tours/N → 直接送回该 tour
//   2. activity-scoped(/activities/N)→ 用 window.location 当前 tour 上下文
//   3. 都没有(纯偶发,replay 只在用户 in-tour 时触发)→ /tours 列表
function redoTargetUrl(row) {
  const tourMatch = row.path?.match(/^\/tours\/(\d+)/)
  if (tourMatch) return `/tours/${tourMatch[1]}`

  if (typeof window !== 'undefined') {
    const currentTourMatch = window.location.pathname.match(/^\/tours\/(\d+)/)
    if (currentTourMatch) return `/tours/${currentTourMatch[1]}`
  }

  return '/tours'
}

export default function OutboxDrawer({ opened, onClose }) {
  const isMobile = useIsMobile()
  const [pending, setPending] = useState([])
  const [failed, setFailed] = useState([])

  async function refresh() {
    const db = await openOutbox()
    setPending(await listByStatus(db, 'pending'))
    setFailed(await listByStatus(db, 'failed_permanent'))
  }

  useEffect(() => {
    if (opened) refresh()
  }, [opened])

  // P0 安全护栏:[不传了] 是 destructive,误触损失费用 / 节点编辑等真数据。
  // 走 Mantine modals.openConfirmModal 二次确认,显示 display_label 让用户确认丢的是哪条。
  function handleAbandon(row) {
    modals.openConfirmModal({
      title: '丢弃这条改动?',
      centered: true,
      children: (
        <Text size="sm">
          「{row.display_label || KIND_LABEL[row.resource_kind] || '该条'}」
          没传到服务器,丢弃后无法找回。
        </Text>
      ),
      labels: { confirm: '丢弃', cancel: '保留' },
      confirmProps: { color: 'red' },
      onConfirm: async () => {
        const db = await openOutbox()
        await deleteRow(db, row.id)
        await refresh()
      },
    })
  }

  // 批量丢弃:出行 1 周回来 outbox 堆 12 条,一条条点不现实。
  // 单次 confirm 列出数量,确认后清空所有 failed。
  function handleAbandonAll() {
    if (failed.length === 0) return
    modals.openConfirmModal({
      title: `丢弃所有 ${failed.length} 条没传上去的改动?`,
      centered: true,
      children: (
        <Text size="sm">
          这些改动没传到服务器,丢弃后无法找回。
          {failed.length >= 5 && '（出行结束后清队列时常用，如果有想保留的请单独点保留）'}
        </Text>
      ),
      // confirm 文案跟触发按钮"全部丢弃"区分,避免 a11y 上出现两个同名 button
      // 用户点过"全部丢弃"后看到 modal,需要明确这是二次确认动作。
      labels: { confirm: '确认丢弃', cancel: '取消' },
      confirmProps: { color: 'red' },
      onConfirm: async () => {
        const db = await openOutbox()
        for (const row of failed) {
          await deleteRow(db, row.id)
        }
        await refresh()
      },
    })
  }

  // P0 redo:确保按钮总有用户能感知的反馈。
  // - 跳转目标永远不 null(redoTargetUrl fallback)
  // - 跳转后立刻 notification 引导用户找到对应表单重新填(非 modal,不阻塞)
  // - 删 row 在 onSuccess(用户真的到了目标页才清,失败保留 row 等再次 redo)
  async function handleRedo(row) {
    const targetUrl = redoTargetUrl(row)
    const kindLabel = KIND_LABEL[row.resource_kind] || '改动'

    onClose()

    router.visit(targetUrl, {
      onSuccess: async () => {
        const db = await openOutbox()
        await deleteRow(db, row.id)
        notifications.show({
          title: `请重新填一遍${kindLabel}`,
          message: `「${row.display_label || ''}」原数据已丢弃,服务器最新状态作为起点 — 找到对应入口重新提交。`,
          color: 'blue',
          autoClose: 8000,
        })
      },
      onError: () => {
        notifications.show({
          title: '跳转失败',
          message: '请手动打开对应页面重新提交。',
          color: 'red',
        })
      },
    })
  }

  return (
    <Drawer
      opened={opened}
      onClose={onClose}
      title={<Title order={3}>同步队列</Title>}
      position="right"
      size={isMobile ? '100%' : 'md'}
    >
      {pending.length === 0 && failed.length === 0 && (
        <Stack align="center" gap="xs" mt="xl">
          <Text size="lg" c="green.7" fw={600}>全部同步完成 ✓</Text>
          <Text size="sm" c="dimmed">所有改动都已传到服务器。</Text>
        </Stack>
      )}

      {pending.length > 0 && (
        <>
          <Text size="sm" c="dimmed" fw={600} mt="sm" mb="xs">
            待同步({pending.length})
          </Text>
          <Stack gap="xs">
            {pending.map(row => (
              <RowCard key={row.id} row={row}>
                <Text size="xs" c="dimmed">
                  {row.attempts > 0 ? `已重试 ${row.attempts} 次 / 共 5 次` : '等待联网'}
                </Text>
              </RowCard>
            ))}
          </Stack>
        </>
      )}

      {failed.length > 0 && (
        <>
          <Divider my="md" />
          {/* failed section header:fw=600 提层级,inline color = badge 同色 #c92a2a */}
          <Group justify="space-between" mt="sm" mb="xs">
            <Text size="sm" fw={600} style={{ color: RED }}>
              没传上去({failed.length})
            </Text>
            {failed.length >= 2 && (
              <Button size="xs" variant="subtle" color="red" onClick={handleAbandonAll}>
                全部丢弃
              </Button>
            )}
          </Group>
          <Stack gap="xs">
            {failed.map(row => (
              <RowCard key={row.id} row={row}>
                <Text size="xs" style={{ color: RED }}>{row.last_error}</Text>
                <Group gap="xs" mt="xs">
                  <Button size="xs" variant="default" onClick={() => handleAbandon(row)}>
                    不传了
                  </Button>
                  <Button size="xs" onClick={() => handleRedo(row)}>
                    重新填一遍
                  </Button>
                </Group>
              </RowCard>
            ))}
          </Stack>
        </>
      )}
    </Drawer>
  )
}

function RowCard({ row, children }) {
  const Icon = KIND_ICON[row.resource_kind] || IconAlertCircle
  return (
    <Box p="xs" style={{ border: '1px solid #dee2e6', borderRadius: 4 }}>
      <Group gap="xs" mb={4} wrap="nowrap">
        <Icon size={16} />
        <Text size="sm" fw={500}>{KIND_LABEL[row.resource_kind] || row.resource_kind}</Text>
        {/* display_label 可能很长(用户编辑文字),truncate 防止撑爆抽屉布局 */}
        <Text size="sm" c="dimmed" style={{ flex: 1, minWidth: 0 }} truncate="end" title={row.display_label}>
          {row.display_label}
        </Text>
      </Group>
      {children}
    </Box>
  )
}
