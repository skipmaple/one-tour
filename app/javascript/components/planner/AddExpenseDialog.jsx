import { useEffect, useState, useMemo } from 'react'
import {
  Modal, Stack, Group, Button, Select, NumberInput, TextInput,
  Checkbox, Text, Divider, SegmentedControl,
} from '@mantine/core'
import { router } from '@inertiajs/react'
import { notifications } from '@mantine/notifications'

// Minimal MVP: supports equal split + individual mode. Percentage / custom
// are UI-TODO; backend already supports them via params[:splits].
const SCOPE_OPTIONS = [
  { value: 'activity', label: '关联到具体站点' },
  { value: 'day',      label: '关联到某一天' },
  { value: 'tour',     label: '整程（出发前垫付等）' },
]

const CATEGORY_OPTIONS = [
  { value: 'food',    label: '吃饭' },
  { value: 'fuel',    label: '加油' },
  { value: 'lodging', label: '住宿' },
  { value: 'ticket',  label: '门票' },
  { value: 'refund',  label: '退款（填负数）' },
  { value: 'misc',    label: '其他' },
]

const STRATEGY_OPTIONS = [
  { value: 'equal',      label: 'AA 平分' },
  { value: 'individual', label: '各付各（不分摊）' },
]

export default function AddExpenseDialog({ opened, onClose, tour, days, activities, members, author }) {
  const [scope, setScope] = useState('activity')
  const [activityId, setActivityId] = useState('')
  const [dayId, setDayId] = useState('')
  const [paidById, setPaidById] = useState(String(author.user_id))
  const [amount, setAmount] = useState('')
  const [category, setCategory] = useState('food')
  const [strategy, setStrategy] = useState('equal')
  const [note, setNote] = useState('')
  const [participantIds, setParticipantIds] = useState([])
  const [saving, setSaving] = useState(false)

  // Users that can participate: author + all members.
  const allUsers = useMemo(() => {
    const list = [ { user_id: author.user_id, email: author.email } ]
    members.forEach((m) => {
      if (!list.find((u) => u.user_id === m.user_id)) {
        list.push({ user_id: m.user_id, email: m.email })
      }
    })
    return list
  }, [author, members])

  const nonBacklogActivities = useMemo(
    () => activities.filter((a) => a.day_id).sort((a, b) => a.day_id - b.day_id || a.position - b.position),
    [activities]
  )

  useEffect(() => {
    if (opened) {
      setScope('activity')
      setActivityId(nonBacklogActivities[0] ? String(nonBacklogActivities[0].id) : '')
      setDayId(days[0] ? String(days[0].id) : '')
      setPaidById(String(author.user_id))
      setAmount('')
      setCategory('food')
      setStrategy('equal')
      setNote('')
      setParticipantIds(allUsers.map((u) => u.user_id))
    }
  }, [opened])  // eslint-disable-line react-hooks/exhaustive-deps

  const toggleParticipant = (userId) => {
    setParticipantIds((prev) =>
      prev.includes(userId) ? prev.filter((id) => id !== userId) : [ ...prev, userId ]
    )
  }

  const handleSave = () => {
    if (!amount) {
      notifications.show({ message: '请填金额', color: 'orange' })
      return
    }
    const amountCents = Math.round(Number(amount) * 100)
    if (isNaN(amountCents)) {
      notifications.show({ message: '金额格式不对', color: 'orange' })
      return
    }
    if (scope === 'activity' && !activityId) {
      notifications.show({ message: '请选择关联的站点', color: 'orange' })
      return
    }
    if (scope === 'day' && !dayId) {
      notifications.show({ message: '请选择日期', color: 'orange' })
      return
    }
    if (strategy === 'equal' && participantIds.length === 0) {
      notifications.show({ message: '请选择至少一个分摊人', color: 'orange' })
      return
    }

    const payload = {
      expense: {
        scope,
        paid_by_id: Number(paidById),
        amount_cents: amountCents,
        category,
        split_strategy: strategy,
        note: note.trim(),
      },
    }
    if (scope === 'activity') payload.expense.activity_id = Number(activityId)
    if (scope === 'day')      payload.expense.day_id = Number(dayId)
    if (strategy === 'equal') payload.participant_ids = participantIds

    setSaving(true)
    router.post(`/tours/${tour.id}/expenses`, payload, {
      preserveScroll: true,
      only: [ 'expenses', 'expenses_summary' ],
      onSuccess: () => {
        setSaving(false)
        notifications.show({ message: '已记下这笔花销', color: 'green' })
        onClose()
      },
      onError: (errors) => {
        setSaving(false)
        const msg = Object.values(errors || {}).flat().join('；') || '保存失败'
        notifications.show({ message: msg, color: 'red' })
      },
    })
  }

  return (
    <Modal opened={opened} onClose={onClose} title="记一笔花销" size="md" padding="md">
      <Stack gap="sm">
        <Select
          label="适用范围"
          data={SCOPE_OPTIONS}
          value={scope}
          onChange={(v) => v && setScope(v)}
          allowDeselect={false}
        />

        {scope === 'activity' && (
          <Select
            label="关联站点"
            data={nonBacklogActivities.map((a) => ({ value: String(a.id), label: a.name }))}
            value={activityId}
            onChange={(v) => v && setActivityId(v)}
            searchable
            allowDeselect={false}
            placeholder="选择某个站点"
            nothingFoundMessage="没有可关联的站点（请先把活动排入某一天）"
          />
        )}

        {scope === 'day' && (
          <Select
            label="日期"
            data={days.map((d) => ({ value: String(d.id), label: `D${d.day_index}${d.title ? ' · ' + d.title : ''}` }))}
            value={dayId}
            onChange={(v) => v && setDayId(v)}
            allowDeselect={false}
          />
        )}

        <Select
          label="谁付的"
          data={allUsers.map((u) => ({ value: String(u.user_id), label: u.email + (u.user_id === author.user_id ? '（作者）' : '') }))}
          value={paidById}
          onChange={(v) => v && setPaidById(v)}
          allowDeselect={false}
        />

        <NumberInput
          label="金额"
          placeholder="单位：元"
          value={amount}
          onChange={setAmount}
          decimalScale={2}
          thousandSeparator=","
          description="退款请填负数"
        />

        <Select
          label="类别"
          data={CATEGORY_OPTIONS}
          value={category}
          onChange={(v) => v && setCategory(v)}
          allowDeselect={false}
        />

        <TextInput
          label="备注"
          placeholder="选填"
          value={note}
          onChange={(e) => setNote(e.currentTarget.value)}
          maxLength={280}
        />

        <Divider label="怎么分" labelPosition="left" my="xs" />

        <SegmentedControl
          value={strategy}
          onChange={setStrategy}
          data={STRATEGY_OPTIONS}
          fullWidth
        />

        {strategy === 'equal' && (
          <Stack gap={6}>
            <Text size="xs" c="dimmed">选哪几个人平分：</Text>
            {allUsers.map((u) => (
              <Checkbox
                key={u.user_id}
                label={u.email + (u.user_id === author.user_id ? '（作者）' : '')}
                checked={participantIds.includes(u.user_id)}
                onChange={() => toggleParticipant(u.user_id)}
              />
            ))}
          </Stack>
        )}

        {strategy === 'individual' && (
          <Text size="xs" c="dimmed">各付各：只记录付款人的一笔花销，不进结算</Text>
        )}

        <Group justify="flex-end" mt="md">
          <Button variant="default" onClick={onClose} disabled={saving}>取消</Button>
          <Button onClick={handleSave} loading={saving}>保存</Button>
        </Group>
      </Stack>
    </Modal>
  )
}
