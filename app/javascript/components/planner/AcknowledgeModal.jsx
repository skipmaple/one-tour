import { useState } from 'react'
import { Modal, Textarea, Button, Group, Text, Alert, Stack } from '@mantine/core'
import { notifications } from '@mantine/notifications'
import { router } from '@inertiajs/react'

const MIN_REASON_LENGTH = 10

export default function AcknowledgeModal({ violation, tourId, onClose }) {
  const [reason, setReason] = useState('')
  const [submitting, setSubmitting] = useState(false)

  if (!violation) return null

  const valid = reason.trim().length >= MIN_REASON_LENGTH

  const handleSubmit = () => {
    if (!valid) return
    setSubmitting(true)
    router.post(`/tours/${tourId}/overrides`, {
      rule: violation.rule,
      scope: violation.scope,
      reason: reason.trim(),
    }, {
      preserveScroll: true,
      only: ['violations'],
      onSuccess: () => {
        setSubmitting(false)
        setReason('')
        onClose()
        notifications.show({ message: '已静音', color: 'green' })
      },
      onError: () => setSubmitting(false),
    })
  }

  return (
    <Modal
      opened={!!violation}
      onClose={onClose}
      title="承认此违反"
      size="md"
    >
      <Stack gap="md">
        <Alert color="red" variant="light">
          永久静音 《{violation.rule}》
        </Alert>
        <Text size="sm" c="dimmed">
          若后续你把相关 activity 改到别天（仍违反）或改了宪法，需手动撤销。撤销路径：宪法页 → 已承认列表 → 撤销
        </Text>
        <Textarea
          label="承认原因"
          required
          placeholder="例如：独库公路是本程核心，无法压缩；同行人员已确认"
          value={reason}
          onChange={e => setReason(e.currentTarget.value)}
          minRows={2}
        />
        <Text size="xs" c={valid ? 'green' : 'red'}>
          {reason.trim().length} / {MIN_REASON_LENGTH} 字 {valid ? '✓' : '×'}
        </Text>
        <Group justify="flex-end">
          <Button variant="default" onClick={onClose}>取消</Button>
          <Button
            color="red"
            variant="outline"
            disabled={!valid}
            loading={submitting}
            onClick={handleSubmit}
          >
            我确认承认
          </Button>
        </Group>
      </Stack>
    </Modal>
  )
}
