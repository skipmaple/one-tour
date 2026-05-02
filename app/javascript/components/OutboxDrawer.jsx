import { useEffect, useState } from 'react'
import { Drawer, Stack, Text, Group, Button, Box, Divider } from '@mantine/core'
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

export default function OutboxDrawer({ opened, onClose }) {
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

  async function handleAbandon(row) {
    const db = await openOutbox()
    await deleteRow(db, row.id)
    await refresh()
  }

  async function handleRedo(row) {
    // GET 服务端最新状态(per spec)— 不 merge 用户离线改动,服务端版本作为起点。
    // 简单跳到对应资源页面,让 UI 自带的编辑入口再来一次。
    const targetUrl = redoTargetUrl(row)
    if (targetUrl) {
      // 跳转后再清 outbox row(避免跳转失败丢 row)
      router.visit(targetUrl, { onSuccess: async () => {
        const db = await openOutbox()
        await deleteRow(db, row.id)
        refresh()
      }})
    }
    // 注:targetUrl 为 null 时(path 缺失或不匹配 /tours/N),drawer 也关。
    // 当前数据 path 都来自 SW 拦截或 useGalleryUploader,二者都给完整 path,
    // 不会触发 null 分支。如果未来有 kind 不带 tour scoped path,要重新设计 redo。
    onClose()
  }

  function redoTargetUrl(row) {
    const m = row.path?.match(/^\/tours\/(\d+)/)
    if (m) return `/tours/${m[1]}`
    return null
  }

  return (
    <Drawer opened={opened} onClose={onClose} title="同步队列" position="right" size="md">
      {pending.length === 0 && failed.length === 0 && (
        <Text c="dimmed" ta="center" mt="xl">队列为空 — 所有改动都已同步。</Text>
      )}

      {pending.length > 0 && (
        <>
          <Text size="sm" c="dimmed" mt="sm" mb="xs">待同步({pending.length})</Text>
          <Stack gap="xs">
            {pending.map(row => (
              <RowCard key={row.id} row={row}>
                <Text size="xs" c="dimmed">
                  {row.attempts > 0 ? `正在重试 ${row.attempts}/5` : '等待联网'}
                </Text>
              </RowCard>
            ))}
          </Stack>
        </>
      )}

      {failed.length > 0 && (
        <>
          <Divider my="md" />
          {/* 文案:不再叫"失败",改"没传上去"— 失败带责备感,实际原因可能是同伴改了
              资源,用户行为本身没问题。下方 last_error 是 friendlyError 输出的友好句子。 */}
          <Text size="sm" c="red.7" mt="sm" mb="xs">没传上去({failed.length})</Text>
          <Stack gap="xs">
            {failed.map(row => (
              <RowCard key={row.id} row={row}>
                <Text size="xs" c="red.7">{row.last_error}</Text>
                <Group gap="xs" mt="xs">
                  <Button size="xs" variant="default" onClick={() => handleAbandon(row)}>不传了</Button>
                  <Button size="xs" onClick={() => handleRedo(row)}>用服务端最新数据再来</Button>
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
      <Group gap="xs" mb={4}>
        <Icon size={16} />
        <Text size="sm" fw={500}>{KIND_LABEL[row.resource_kind] || row.resource_kind}</Text>
        <Text size="sm" c="dimmed" style={{ flex: 1 }}>{row.display_label}</Text>
      </Group>
      {children}
    </Box>
  )
}
