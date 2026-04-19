import { useEffect, useState, useMemo, useRef } from 'react'
import {
  Modal, Stack, Group, Button, Select, NumberInput, TextInput,
  Checkbox, Text, Divider, SegmentedControl, ActionIcon,
} from '@mantine/core'
import { router } from '@inertiajs/react'
import { notifications } from '@mantine/notifications'
import { modals } from '@mantine/modals'
import { IconPlus, IconX, IconReceipt2 } from '@tabler/icons-react'
import { useMediaQuery } from '@mantine/hooks'
import ActivityGalleryLightbox from '../activity-editor/ActivityGalleryLightbox'

const MAX_RECEIPTS = 3
const MAX_RECEIPT_BYTES = 5 * 1024 * 1024
const ALLOWED_RECEIPT_TYPES = [ 'image/jpeg', 'image/jpg', 'image/png', 'image/webp' ]

function csrfToken() {
  return document.querySelector('meta[name=csrf-token]')?.getAttribute('content') || ''
}

// Minimal MVP: supports equal split + individual mode. Percentage / custom
// are UI-TODO; backend already supports them via params[:splits].
const SCOPE_OPTIONS = [
  { value: 'activity', label: '关联到具体行' },
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

export default function AddExpenseDialog({ opened, onClose, tour, days, activities, members, author, expense }) {
  const isEdit = Boolean(expense)
  const isMobile = useMediaQuery('(max-width: 640px)')
  const [scope, setScope] = useState('activity')
  const [activityId, setActivityId] = useState('')
  const [dayId, setDayId] = useState('')
  const [paidById, setPaidById] = useState(String(author.user_id))
  const [amount, setAmount] = useState('')
  const [category, setCategory] = useState('food')
  const [strategy, setStrategy] = useState('equal')
  const [note, setNote] = useState('')
  const [participantIds, setParticipantIds] = useState([])
  const [externalCount, setExternalCount] = useState(0)
  const [externalAttributedToId, setExternalAttributedToId] = useState('')
  const [saving, setSaving] = useState(false)
  const [lightboxIndex, setLightboxIndex] = useState(null)
  const [uploading, setUploading] = useState(false)
  const [amountError, setAmountError] = useState(null)
  // CREATE mode: files are staged locally until the expense gets an id,
  // then uploaded in a second phase on save. Each stored as { file, url }
  // with url = createObjectURL(file) for preview + revoked on cleanup.
  const [pendingFiles, setPendingFiles] = useState([])
  const fileInputRef = useRef(null)
  const initialSnapshotRef = useRef('')

  const currentSnapshot = () => JSON.stringify({
    scope, activityId, dayId, paidById, amount, category, strategy, note,
    participantIds: [ ...participantIds ].sort(),
    externalCount, externalAttributedToId,
  })

  const confirmClose = () => {
    if (currentSnapshot() === initialSnapshotRef.current) {
      onClose()
      return
    }
    modals.openConfirmModal({
      title: '放弃未保存的修改？',
      labels: { confirm: '放弃', cancel: '继续编辑' },
      confirmProps: { color: 'red' },
      onConfirm: onClose,
    })
  }

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
    if (!opened) return
    const v = isEdit
      ? {
          scope: expense.scope,
          activityId: expense.activity_id ? String(expense.activity_id) : '',
          dayId: expense.day_id ? String(expense.day_id) : '',
          paidById: String(expense.paid_by_id),
          amount: String(expense.amount_cents / 100),
          category: expense.category,
          strategy: expense.split_strategy,
          note: expense.note || '',
          participantIds: expense.splits?.length
            ? expense.splits.map((s) => s.user_id)
            : allUsers.map((u) => u.user_id),
          externalCount: expense.external_count || 0,
          externalAttributedToId: expense.external_attributed_to_id
            ? String(expense.external_attributed_to_id)
            : String(expense.paid_by_id),
        }
      : {
          scope: 'activity',
          activityId: nonBacklogActivities[0] ? String(nonBacklogActivities[0].id) : '',
          dayId: days[0] ? String(days[0].id) : '',
          paidById: String(author.user_id),
          amount: '',
          category: 'food',
          strategy: 'equal',
          note: '',
          participantIds: allUsers.map((u) => u.user_id),
          externalCount: 0,
          externalAttributedToId: String(author.user_id),
        }

    setScope(v.scope)
    setActivityId(v.activityId)
    setDayId(v.dayId)
    setPaidById(v.paidById)
    setAmount(v.amount)
    setCategory(v.category)
    setStrategy(v.strategy)
    setNote(v.note)
    setParticipantIds(v.participantIds)
    setExternalCount(v.externalCount)
    setExternalAttributedToId(v.externalAttributedToId)
    setAmountError(null)
    // Clean up any stale pending previews from a previous open and reset.
    setPendingFiles((prev) => {
      prev.forEach((p) => URL.revokeObjectURL(p.url))
      return []
    })

    // Snapshot for dirty-check on close.
    initialSnapshotRef.current = JSON.stringify({
      ...v,
      participantIds: [ ...v.participantIds ].sort(),
    })
  }, [opened, expense?.id])  // eslint-disable-line react-hooks/exhaustive-deps

  // Revoke preview object URLs on unmount to avoid leaks.
  useEffect(() => () => {
    pendingFiles.forEach((p) => URL.revokeObjectURL(p.url))
  }, [])  // eslint-disable-line react-hooks/exhaustive-deps

  const toggleParticipant = (userId) => {
    setParticipantIds((prev) =>
      prev.includes(userId) ? prev.filter((id) => id !== userId) : [ ...prev, userId ]
    )
  }

  // Unified receipt view: persisted receipts for edit mode, pending local
  // previews for create mode.
  const displayReceipts = isEdit
    ? (expense.receipts || [])
    : pendingFiles.map((p, i) => ({ id: `pending-${i}`, url: p.url, _pending: true }))
  const canUploadMore = displayReceipts.length < MAX_RECEIPTS

  const validateFile = (file) => {
    if (!ALLOWED_RECEIPT_TYPES.includes(file.type)) {
      notifications.show({ message: `不支持 ${file.type},只能传 JPG/PNG/WebP`, color: 'orange' })
      return false
    }
    if (file.size > MAX_RECEIPT_BYTES) {
      notifications.show({ message: '单张不能超过 5MB', color: 'orange' })
      return false
    }
    return true
  }

  const handleFilesPicked = (e) => {
    const files = Array.from(e.target.files || [])
    e.target.value = ''
    if (files.length === 0) return
    const slots = MAX_RECEIPTS - displayReceipts.length
    const accepted = files.slice(0, slots).filter(validateFile)
    if (files.length > slots) {
      notifications.show({ message: `最多 ${MAX_RECEIPTS} 张,已忽略多余的`, color: 'orange' })
    }
    if (isEdit) {
      accepted.forEach(uploadReceiptNow)
    } else {
      setPendingFiles((prev) => [
        ...prev,
        ...accepted.map((f) => ({ file: f, url: URL.createObjectURL(f) })),
      ])
    }
  }

  const uploadReceiptNow = (file) => {
    const fd = new FormData()
    fd.append('file', file)
    setUploading(true)
    fetch(`/expenses/${expense.id}/receipts`, {
      method: 'POST',
      body: fd,
      headers: { 'Accept': 'application/json', 'X-CSRF-Token': csrfToken() },
    })
      .then(async (r) => {
        if (!r.ok) {
          const err = await r.json().catch(() => ({}))
          throw new Error(err.errors?.join('；') || `HTTP ${r.status}`)
        }
        router.reload({ only: [ 'expenses', 'expenses_summary', 'flash' ] })
      })
      .catch((err) => notifications.show({ message: `上传失败：${err.message}`, color: 'red' }))
      .finally(() => setUploading(false))
  }

  const deleteReceipt = (receipt) => {
    if (receipt._pending) {
      setPendingFiles((prev) => {
        const next = prev.filter((p) => p.url !== receipt.url)
        const removed = prev.find((p) => p.url === receipt.url)
        if (removed) URL.revokeObjectURL(removed.url)
        return next
      })
      return
    }
    fetch(`/expense_receipts/${receipt.id}`, {
      method: 'DELETE',
      headers: { 'Accept': 'application/json', 'X-CSRF-Token': csrfToken() },
    })
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        router.reload({ only: [ 'expenses', 'expenses_summary', 'flash' ] })
      })
      .catch(() => notifications.show({ message: '删除失败', color: 'red' }))
  }

  const handleSave = () => {
    // Allow 0 (免费门票 / 赠票 etc. are legitimate) — only reject missing/NaN.
    if (amount === '' || amount === null || amount === undefined) {
      setAmountError('请填金额')
      return
    }
    const amountCents = Math.round(Number(amount) * 100)
    if (isNaN(amountCents)) {
      setAmountError('金额格式不对')
      return
    }
    setAmountError(null)
    if (scope === 'activity' && !activityId) {
      notifications.show({ message: '请选择关联的行', color: 'orange' })
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
    // Nullify foreign keys we no longer want (scope shrank or changed) so
    // stale activity_id/day_id don't hang around after a scope switch.
    if (isEdit && scope !== 'activity') payload.expense.activity_id = null
    if (isEdit && scope !== 'day')      payload.expense.day_id = null
    if (strategy === 'equal') payload.participant_ids = participantIds
    if (strategy === 'equal' && externalCount > 0) {
      payload.expense.external_count = Number(externalCount)
      payload.expense.external_attributed_to_id = Number(externalAttributedToId) || Number(paidById)
    } else if (isEdit) {
      // Scrub old values when switching away from 'equal' or clearing externals,
      // otherwise stale external_count / external_attributed_to_id would linger.
      payload.expense.external_count = 0
      payload.expense.external_attributed_to_id = null
    }

    setSaving(true)

    // CREATE + pending receipts → two-phase: fetch POST to get id, then
    // upload each receipt, then reload the page props. router.post can't
    // carry both the expense body and the receipt files in one pass.
    if (!isEdit && pendingFiles.length > 0) {
      createWithPendingReceipts(payload)
      return
    }

    const request = isEdit
      ? (url, body, opts) => router.patch(url, body, opts)
      : (url, body, opts) => router.post(url, body, opts)
    const url = isEdit ? `/expenses/${expense.id}` : `/tours/${tour.id}/expenses`
    request(url, payload, {
      preserveScroll: true,
      only: [ 'expenses', 'expenses_summary', 'flash' ],
      onSuccess: (page) => {
        setSaving(false)
        const alert = page?.props?.flash?.alert
        if (alert) {
          notifications.show({ message: alert, color: 'red' })
        } else {
          notifications.show({ message: isEdit ? '已更新' : '已记下这笔花销', color: 'green' })
          onClose()
        }
      },
      onError: (errors) => {
        setSaving(false)
        const msg = Object.values(errors || {}).flat().join('；') || '保存失败'
        notifications.show({ message: msg, color: 'red' })
      },
    })
  }

  const createWithPendingReceipts = async (payload) => {
    try {
      const res = await fetch(`/tours/${tour.id}/expenses`, {
        method: 'POST',
        body: JSON.stringify(payload),
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'X-CSRF-Token': csrfToken(),
        },
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.errors?.join('；') || `HTTP ${res.status}`)
      }
      const created = await res.json()

      const results = await Promise.allSettled(pendingFiles.map((p) => {
        const fd = new FormData()
        fd.append('file', p.file)
        return fetch(`/expenses/${created.id}/receipts`, {
          method: 'POST',
          body: fd,
          headers: { 'Accept': 'application/json', 'X-CSRF-Token': csrfToken() },
        }).then(async (r) => {
          if (!r.ok) {
            const err = await r.json().catch(() => ({}))
            throw new Error(err.errors?.join('；') || `HTTP ${r.status}`)
          }
        })
      }))

      const failed = results.filter((r) => r.status === 'rejected').length
      router.reload({ only: [ 'expenses', 'expenses_summary', 'flash' ] })
      setSaving(false)
      if (failed === 0) {
        notifications.show({ message: '已记下这笔花销', color: 'green' })
      } else {
        notifications.show({
          message: `花销已保存，但 ${failed} 张小票上传失败,可进入编辑重试`,
          color: 'orange',
        })
      }
      onClose()
    } catch (err) {
      setSaving(false)
      notifications.show({ message: `保存失败：${err.message}`, color: 'red' })
    }
  }

  return (
    <Modal opened={opened} onClose={confirmClose} title={isEdit ? '改一笔花销' : '记一笔花销'} size={isMobile ? '100%' : 'md'} fullScreen={isMobile} padding="md">
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
            label="关联行"
            data={nonBacklogActivities.map((a) => ({ value: String(a.id), label: a.name }))}
            value={activityId}
            onChange={(v) => v && setActivityId(v)}
            searchable
            allowDeselect={false}
            placeholder="选择某一行"
            nothingFoundMessage="没有可关联的行（请先把活动排入某一天）"
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
          onChange={(v) => { setAmount(v); setAmountError(null) }}
          decimalScale={2}
          thousandSeparator=","
          description="退款请填负数"
          error={amountError}
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
            <Group gap="xs" mt={6} align="flex-end" wrap="wrap">
              <NumberInput
                label="带了几个非成员"
                description="朋友搭车 / 蹭饭算一份"
                min={0}
                max={20}
                value={externalCount}
                onChange={(v) => setExternalCount(v === '' || v == null ? 0 : Number(v))}
                style={{ minWidth: 160 }}
              />
              {externalCount > 0 && (
                <Select
                  label="谁负担他们的份"
                  data={allUsers.map((u) => ({
                    value: String(u.user_id),
                    label: u.email + (u.user_id === author.user_id ? '（作者）' : ''),
                  }))}
                  value={externalAttributedToId}
                  onChange={(v) => v && setExternalAttributedToId(v)}
                  allowDeselect={false}
                  style={{ minWidth: 180, flex: 1 }}
                />
              )}
            </Group>
            {externalCount > 0 && (
              <Text size="xs" c="dimmed">
                这笔按 {participantIds.length + Number(externalCount)} 份均分，
                其中 {allUsers.find((u) => String(u.user_id) === externalAttributedToId)?.email || '?'} 承担 {1 + Number(externalCount)} 份
              </Text>
            )}
          </Stack>
        )}

        {strategy === 'individual' && (
          <Text size="xs" c="dimmed">各付各：只记录付款人的一笔花销，不进结算</Text>
        )}

        <Divider label="小票" labelPosition="left" my="xs" />
        <Group gap="xs" wrap="wrap">
          {displayReceipts.map((r, i) => (
            <div key={r.id} style={{ position: 'relative', width: 64, height: 64 }}>
              <img
                src={r.url}
                alt="小票"
                onClick={() => setLightboxIndex(i)}
                style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 4, cursor: 'pointer', border: '1px solid #e9ecef' }}
              />
              <ActionIcon
                size="xs"
                variant="filled"
                color="red"
                style={{ position: 'absolute', top: -6, right: -6 }}
                onClick={() => deleteReceipt(r)}
                aria-label="删除小票"
              >
                <IconX size={12} stroke={2} />
              </ActionIcon>
            </div>
          ))}
          {canUploadMore && (
            <Button
              variant="light"
              size="sm"
              leftSection={<IconPlus size={14} />}
              loading={uploading}
              onClick={() => fileInputRef.current?.click()}
            >
              上传小票
            </Button>
          )}
        </Group>
        <Text size="xs" c="dimmed">
          最多 {MAX_RECEIPTS} 张,JPG / PNG / WebP,单张 5MB 以内
          {!isEdit && pendingFiles.length > 0 && `（保存时上传）`}
        </Text>
        <input
          ref={fileInputRef}
          type="file"
          accept={ALLOWED_RECEIPT_TYPES.join(',')}
          multiple
          style={{ display: 'none' }}
          onChange={handleFilesPicked}
        />
        <ActivityGalleryLightbox
          images={displayReceipts}
          initialIndex={lightboxIndex}
          onClose={() => setLightboxIndex(null)}
        />

        <Group justify="flex-end" mt="md">
          <Button variant="default" onClick={confirmClose} disabled={saving}>取消</Button>
          <Button onClick={handleSave} loading={saving}>保存</Button>
        </Group>
      </Stack>
    </Modal>
  )
}
