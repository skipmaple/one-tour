import { useEffect, useState } from 'react'
import { Modal, Textarea, Checkbox, Button, Group, Stack } from '@mantine/core'
import { DateInput } from '@mantine/dates'
import { modals } from '@mantine/modals'
import { router } from '@inertiajs/react'
import { useUndoStack } from '../../hooks/useUndoStack'

export default function DayEditModal({ day, tourId, onClose }) {
  const [theme, setTheme] = useState('')
  const [date, setDate] = useState(null)
  const [bufferDay, setBufferDay] = useState(false)
  const [saving, setSaving] = useState(false)
  const undoStack = useUndoStack()

  useEffect(() => {
    if (day) {
      setTheme(day.theme || '')
      setDate(day.date ? new Date(day.date) : null)
      setBufferDay(!!day.buffer_day)
    }
  }, [day])

  if (!day) return null

  const handleSave = () => {
    setSaving(true)
    // Snapshot prev for undo
    const prevAttrs = {
      theme: day.theme,
      date: day.date,
      buffer_day: day.buffer_day,
    }
    const payload = {
      day: {
        theme: theme || null,
        date: date ? formatDateForApi(date) : null,
        buffer_day: bufferDay,
      }
    }
    router.patch(`/tours/${tourId}/days/${day.id}`, payload, {
      preserveScroll: true,
      only: ['days', 'activities', 'violations'],
      onSuccess: () => {
        setSaving(false)
        onClose()
        undoStack.push({
          label: `修改 D${day.day_index}`,
          undoFn: () => new Promise((resolve, reject) =>
            router.patch(`/tours/${tourId}/days/${day.id}`, { day: prevAttrs }, {
              preserveScroll: true,
              only: ['days', 'activities', 'violations'],
              onSuccess: () => resolve(),
              onError: () => reject(new Error('服务器拒绝'))
            })
          )
        })
      },
      onError: () => setSaving(false),
    })
  }

  const handleDelete = () => {
    modals.openConfirmModal({
      title: `确认删除 D${day.day_index}？`,
      children: '删除后该日下的行会自动回到候选池。',
      labels: { confirm: '删除', cancel: '取消' },
      confirmProps: { color: 'red' },
      onConfirm: () => {
        router.delete(`/tours/${tourId}/days/${day.id}`, {
          preserveScroll: true,
          only: ['days', 'activities', 'violations'],
          onSuccess: onClose,
        })
      },
    })
  }

  return (
    <Modal
      opened={!!day}
      onClose={onClose}
      title={`编辑 D${day.day_index}`}
      size="sm"
    >
      <Stack gap="md">
        <Textarea
          label="主题 / 副标题"
          placeholder="例如：抵达伊宁（适应日）"
          minRows={1}
          maxRows={3}
          autosize
          value={theme}
          onChange={e => setTheme(e.currentTarget.value)}
        />
        <DateInput
          label="日期"
          value={date}
          onChange={setDate}
          clearable
          valueFormat="YYYY-MM-DD"
        />
        <Checkbox
          label="机动日（缓冲，不排入核心行）"
          checked={bufferDay}
          onChange={e => setBufferDay(e.currentTarget.checked)}
        />
        <Group justify="space-between" mt="md" pt="md" style={{ borderTop: '1px solid #eee' }}>
          <Button variant="subtle" color="red" size="xs" onClick={handleDelete}>
            删除本日
          </Button>
          <Group>
            <Button variant="default" onClick={onClose}>取消</Button>
            <Button onClick={handleSave} loading={saving}>保存</Button>
          </Group>
        </Group>
      </Stack>
    </Modal>
  )
}

function formatDateForApi(date) {
  // DateInput gives either a Date object or an ISO string depending on version.
  // Normalize to YYYY-MM-DD.
  const d = date instanceof Date ? date : new Date(date)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}
