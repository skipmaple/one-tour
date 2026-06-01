import { useEffect, useMemo, useState } from 'react'
import {
  Modal, Stack, Group, Button, NumberInput, Text, Divider, Alert,
} from '@mantine/core'
import { router } from '@inertiajs/react'
import { useIsMobile } from '../../hooks/useIsMobile'
import { notifications } from '@mantine/notifications'

function csrfToken() {
  return document.querySelector('meta[name=csrf-token]')?.getAttribute('content') || ''
}

// Budgets are per-user. The server already filters `budgets` prop to only
// current_user's rows, so anything in this list is "mine".
export default function BudgetModal({ opened, onClose, tour, days, budgets }) {
  const isMobile = useIsMobile()

  const existing = useMemo(() => {
    const tourB = budgets.find((b) => !b.day_id && !b.activity_id)
    const dayMap = {}
    budgets.filter((b) => b.day_id && !b.activity_id).forEach((b) => { dayMap[b.day_id] = b })
    return { tourB, dayMap }
  }, [budgets])

  const [tourAmount, setTourAmount] = useState('')
  const [dayAmounts, setDayAmounts] = useState({})
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!opened) return
    setTourAmount(existing.tourB ? String(existing.tourB.amount_cents / 100) : '')
    const map = {}
    days.forEach((d) => {
      const b = existing.dayMap[d.id]
      map[d.id] = b ? String(b.amount_cents / 100) : ''
    })
    setDayAmounts(map)
  }, [opened, existing, days])

  const handleSave = async () => {
    setSaving(true)

    const ops = []
    const enqueueUpsert = (existingBudget, amount, scopeBody) => {
      const cents = (amount === '' || amount === null || amount === undefined)
        ? null
        : Math.round(Number(amount) * 100)
      if (cents === null) {
        if (existingBudget) {
          ops.push(fetch(`/tour_budgets/${existingBudget.id}`, {
            method: 'DELETE',
            headers: { 'Accept': 'application/json', 'X-CSRF-Token': csrfToken() },
          }))
        }
        return
      }
      if (cents === existingBudget?.amount_cents) return  // no-op

      if (existingBudget) {
        ops.push(fetch(`/tour_budgets/${existingBudget.id}`, {
          method: 'PATCH',
          body: JSON.stringify({ tour_budget: { amount_cents: cents } }),
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
            'X-CSRF-Token': csrfToken(),
          },
        }))
      } else {
        ops.push(fetch(`/tours/${tour.id}/budgets`, {
          method: 'POST',
          body: JSON.stringify({ tour_budget: { ...scopeBody, amount_cents: cents } }),
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
            'X-CSRF-Token': csrfToken(),
          },
        }))
      }
    }

    enqueueUpsert(existing.tourB, tourAmount, {})
    days.forEach((d) => {
      enqueueUpsert(existing.dayMap[d.id], dayAmounts[d.id] ?? '', { day_id: d.id })
    })

    const results = await Promise.allSettled(ops)
    const failed = results.filter((r) => r.status === 'rejected' || (r.value && !r.value.ok))
    router.reload({ only: [ 'tour_budgets', 'expenses_summary', 'flash' ] })
    setSaving(false)

    if (failed.length === 0) {
      notifications.show({ message: ops.length === 0 ? '没有改动' : '预算已保存', color: 'green' })
      onClose()
    } else {
      notifications.show({
        message: `保存了 ${ops.length - failed.length} / ${ops.length} 条，另 ${failed.length} 条失败`,
        color: 'orange',
      })
    }
  }

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title="我的预算"
      size={isMobile ? '100%' : 'md'}
      fullScreen={isMobile}
      padding="md"
    >
      <Stack gap="sm">
        <Alert color="blue" variant="light">
          只影响你自己的预算进度。清空数字等于取消该范围的预算。
        </Alert>

        <NumberInput
          label="总预算"
          description="整个行程我打算花多少（按规则该我出的总额）"
          placeholder="单位：元"
          value={tourAmount}
          onChange={setTourAmount}
          decimalScale={2}
          thousandSeparator=","
          min={0}
        />

        {days.length > 0 && (
          <>
            <Divider label="按天（可选）" labelPosition="left" my="xs" />
            {days.map((d) => (
              <NumberInput
                key={d.id}
                label={`D${d.day_index}${d.title ? ' · ' + d.title : ''}`}
                placeholder="不限"
                value={dayAmounts[d.id] ?? ''}
                onChange={(v) => setDayAmounts((prev) => ({ ...prev, [d.id]: v }))}
                decimalScale={2}
                thousandSeparator=","
                min={0}
              />
            ))}
          </>
        )}

        <Group justify="flex-end" mt="md">
          <Button variant="default" onClick={onClose} disabled={saving}>取消</Button>
          <Button onClick={handleSave} loading={saving}>保存</Button>
        </Group>
      </Stack>
    </Modal>
  )
}
