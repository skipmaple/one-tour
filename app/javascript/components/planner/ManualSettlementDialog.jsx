import { useEffect, useState, useMemo } from 'react'
import {
  Modal, Stack, Group, Button, Select, NumberInput, TextInput, Alert,
} from '@mantine/core'
import { useMediaQuery } from '@mantine/hooks'
import { router } from '@inertiajs/react'
import { notifications } from '@mantine/notifications'

// Records a settlement the Settle algorithm didn't suggest — pre-trip loans,
// extra gifts, off-ledger repayments. Does NOT support partial payments of
// an existing suggested transfer (by product decision): a suggested
// "A→B ¥80" is always settled in full via "这笔已结" on the card.
//
// Validation mirrors server: from ≠ to, amount > 0, recorder (current_user)
// must be a party OR tour editor. The last check lives in the model; here
// we surface errors via the onError handler.
export default function ManualSettlementDialog({ opened, onClose, tour, members, author, currentUserId }) {
  const isMobile = useMediaQuery('(max-width: 640px)')

  const allUsers = useMemo(() => {
    const list = [ { user_id: author.user_id, email: author.email } ]
    members.forEach((m) => {
      if (!list.find((u) => u.user_id === m.user_id)) {
        list.push({ user_id: m.user_id, email: m.email })
      }
    })
    return list
  }, [ author, members ])

  const [fromId, setFromId] = useState('')
  const [toId, setToId] = useState('')
  const [amount, setAmount] = useState('')
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!opened) return
    // Default "from" to current user — party-centric recording is the common
    // flow. Readers are bound to this by backend validation anyway.
    setFromId(currentUserId ? String(currentUserId) : '')
    setToId('')
    setAmount('')
    setNote('')
  }, [ opened, currentUserId ])

  const handleSave = () => {
    if (!fromId || !toId) {
      notifications.show({ message: '请选择付款方和收款方', color: 'orange' })
      return
    }
    if (fromId === toId) {
      notifications.show({ message: '付款方和收款方不能是同一人', color: 'orange' })
      return
    }
    if (amount === '' || amount == null || Number(amount) <= 0) {
      notifications.show({ message: '请填写大于 0 的金额', color: 'orange' })
      return
    }

    setSaving(true)
    router.post(`/tours/${tour.id}/settlements`, {
      settlement: {
        from_user_id: Number(fromId),
        to_user_id: Number(toId),
        amount_cents: Math.round(Number(amount) * 100),
        note: note.trim(),
      },
    }, {
      preserveScroll: true,
      only: [ 'expenses_summary', 'settlements', 'flash' ],
      onSuccess: (page) => {
        setSaving(false)
        const alert = page?.props?.flash?.alert
        if (alert) {
          notifications.show({ message: alert, color: 'red' })
        } else {
          notifications.show({ message: '已登记转账', color: 'green' })
          onClose()
        }
      },
      onError: (errors) => {
        setSaving(false)
        const msg = Object.values(errors || {}).flat().join('；') || '登记失败'
        notifications.show({ message: msg, color: 'red' })
      },
    })
  }

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title="记一笔结算"
      size={isMobile ? '100%' : 'md'}
      fullScreen={isMobile}
      padding="md"
    >
      <Stack gap="sm">
        <Alert color="blue" variant="light">
          用于登记算法没建议的转账：出发前借的钱、额外支付、场外还款等。
        </Alert>

        <Select
          label="付款方"
          data={allUsers.map((u) => ({
            value: String(u.user_id),
            label: u.email + (u.user_id === author.user_id ? '（作者）' : ''),
          }))}
          value={fromId}
          onChange={(v) => v && setFromId(v)}
          allowDeselect={false}
        />

        <Select
          label="收款方"
          placeholder="谁收到了钱"
          data={allUsers
            .filter((u) => String(u.user_id) !== fromId)
            .map((u) => ({
              value: String(u.user_id),
              label: u.email + (u.user_id === author.user_id ? '（作者）' : ''),
            }))}
          value={toId}
          onChange={(v) => v && setToId(v)}
          allowDeselect={false}
        />

        <NumberInput
          label="金额"
          placeholder="单位：元"
          value={amount}
          onChange={setAmount}
          decimalScale={2}
          thousandSeparator=","
          min={0}
        />

        <TextInput
          label="备注"
          placeholder="选填，比如 出发前借的油费"
          value={note}
          onChange={(e) => setNote(e.currentTarget.value)}
          maxLength={140}
        />

        <Group justify="flex-end" mt="md">
          <Button variant="default" onClick={onClose} disabled={saving}>取消</Button>
          <Button onClick={handleSave} loading={saving}>保存</Button>
        </Group>
      </Stack>
    </Modal>
  )
}
