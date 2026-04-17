import { useEffect, useState } from 'react'
import { Drawer, Button, Group, Stack } from '@mantine/core'
import { useForm } from '@mantine/form'
import { modals } from '@mantine/modals'
import { notifications } from '@mantine/notifications'
import { router } from '@inertiajs/react'
import { useUndoStack } from '../../hooks/useUndoStack'
import { KIND_SCHEMA } from './detailsSchema'
import CommonFields from './CommonFields'

export default function ActivityDrawer({ tourId, opened, onClose, mode, activity, targetDayId }) {
  const isEdit = mode === 'edit'
  const [saving, setSaving] = useState(false)
  const undoStack = useUndoStack()

  const form = useForm({
    initialValues: {
      name: '',
      kind: 'scenic',
      citizen_level: 'tier_three',
      lat: '',
      lng: '',
      planned_start_at: '',
      planned_duration_min: '',
      description: '',
      tips: '',
    },
    validate: {
      name: (v) => (v.trim().length === 0 ? '名称不能为空' : null),
    },
  })

  const [details, setDetails] = useState({})

  // Populate form when editing an existing activity
  useEffect(() => {
    if (opened && isEdit && activity) {
      form.setValues({
        name: activity.name || '',
        kind: activity.kind || 'scenic',
        citizen_level: activity.citizen_level || 'tier_three',
        lat: activity.lat ?? '',
        lng: activity.lng ?? '',
        planned_start_at: activity.planned_start_at || '',
        planned_duration_min: activity.planned_duration_min ?? '',
        description: activity.description || '',
        tips: activity.tips || '',
      })
      setDetails(activity.details || {})
      form.resetDirty()
    }
    if (opened && !isEdit) {
      form.reset()
      setDetails({})
    }
  }, [opened, isEdit, activity?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  // When kind changes, keep only the keys that belong to the new kind's schema
  const handleKindChange = (newKind) => {
    form.setFieldValue('kind', newKind)
    const validKeys = (KIND_SCHEMA[newKind] || []).map(f => f.key)
    const cleaned = {}
    for (const k of validKeys) {
      if (details[k] !== undefined) cleaned[k] = details[k]
    }
    setDetails(cleaned)
  }

  const handlePoiPick = ({ name, lat, lng }) => {
    if (!form.values.name) form.setFieldValue('name', name)
    form.setFieldValue('lat', lat)
    form.setFieldValue('lng', lng)
  }

  const handleClose = () => {
    if (form.isDirty()) {
      modals.openConfirmModal({
        title: '放弃未保存的修改？',
        labels: { confirm: '放弃', cancel: '继续编辑' },
        confirmProps: { color: 'red' },
        onConfirm: onClose,
      })
    } else {
      onClose()
    }
  }

  const handleSave = async () => {
    if (form.validate().hasErrors) return
    setSaving(true)

    // Build payload: only include detail keys from current kind's schema
    const kind = form.values.kind
    const validKeys = (KIND_SCHEMA[kind] || []).map(f => f.key)
    const cleanDetails = {}
    for (const k of validKeys) {
      if (details[k] !== undefined && details[k] !== '' && details[k] !== null) {
        cleanDetails[k] = details[k]
      }
    }

    const payload = {
      activity: {
        ...form.values,
        planned_duration_min: form.values.planned_duration_min === '' ? null : Number(form.values.planned_duration_min),
        lat: form.values.lat === '' ? null : Number(form.values.lat),
        lng: form.values.lng === '' ? null : Number(form.values.lng),
        details: cleanDetails,
      },
    }

    if (isEdit) {
      // UPDATE path: snapshot prev for undo
      const prevAttrs = { ...activity }
      router.patch(`/activities/${activity.id}`, payload, {
        preserveScroll: true,
        only: ['activities', 'violations'],
        onSuccess: () => {
          setSaving(false)
          onClose()
          undoStack.push({
            label: `修改 ${form.values.name}`,
            undoFn: () => new Promise((resolve, reject) =>
              router.patch(`/activities/${activity.id}`, { activity: prevAttrs }, {
                preserveScroll: true,
                only: ['activities', 'violations'],
                onSuccess: () => resolve(),
                onError: () => reject(new Error('服务器拒绝'))
              })
            )
          })
        },
        onError: () => setSaving(false),
      })
    } else {
      // CREATE path: fetch to get id, then push delete-undo
      const url = targetDayId
        ? `/tours/${tourId}/days/${targetDayId}/activities`
        : `/tours/${tourId}/backlog_activities`
      try {
        const res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Accept': 'application/json', 'X-CSRF-Token': csrfToken() },
          body: JSON.stringify(payload)
        })
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const { id: newId } = await res.json()
        router.reload({ only: ['activities', 'violations'] })
        setSaving(false)
        onClose()
        undoStack.push({
          label: `新建 ${form.values.name}`,
          undoFn: () => fetch(`/activities/${newId}`, {
            method: 'DELETE',
            headers: { 'Accept': 'application/json', 'X-CSRF-Token': csrfToken() }
          }).then(r => {
            if (!r.ok) throw new Error('删除失败')
            router.reload({ only: ['activities', 'violations'] })
          })
        })
      } catch (err) {
        setSaving(false)
        notifications.show({ message: `保存失败：${err.message}`, color: 'red' })
      }
    }
  }

  const handleDelete = () => {
    modals.openConfirmModal({
      title: '确认删除此行？',
      labels: { confirm: '删除', cancel: '取消' },
      confirmProps: { color: 'red' },
      onConfirm: () => {
        const savedAttrs = { ...activity }
        const wasInDay = activity.day_id
        router.delete(`/activities/${activity.id}`, {
          preserveScroll: true,
          only: ['activities', 'violations'],
          onSuccess: () => {
            onClose()
            undoStack.push({
              label: `删除 ${activity.name}`,
              undoFn: async () => {
                const url = wasInDay
                  ? `/tours/${tourId}/days/${wasInDay}/activities`
                  : `/tours/${tourId}/backlog_activities`
                const payload = {
                  activity: {
                    name: savedAttrs.name,
                    kind: savedAttrs.kind,
                    citizen_level: savedAttrs.citizen_level,
                    lat: savedAttrs.lat,
                    lng: savedAttrs.lng,
                    planned_start_at: savedAttrs.planned_start_at,
                    planned_duration_min: savedAttrs.planned_duration_min,
                    details: savedAttrs.details || {}
                  }
                }
                const res = await fetch(url, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json', 'Accept': 'application/json', 'X-CSRF-Token': csrfToken() },
                  body: JSON.stringify(payload)
                })
                if (!res.ok) throw new Error(`HTTP ${res.status}`)
                router.reload({ only: ['activities', 'violations'] })
              }
            })
          },
        })
      },
    })
  }

  const handleMoveToBacklog = () => {
    router.patch(`/activities/${activity.id}/position`, { to_day_id: null, to_position: 1 }, {
      preserveScroll: true,
      only: ['activities', 'violations'],
      onSuccess: onClose,
    })
  }

  // Intercept kind changes to clean details
  const formWithKindHook = {
    ...form,
    getInputProps: (path) => {
      const props = form.getInputProps(path)
      if (path === 'kind') {
        return { ...props, onChange: handleKindChange }
      }
      return props
    },
  }

  return (
    <Drawer
      opened={opened}
      onClose={handleClose}
      title={isEdit ? '编辑行' : '新建行'}
      position="right"
      size={420}
      overlayProps={{ opacity: 0.4 }}
      padding="md"
    >
      <Stack gap="md">
        <CommonFields
          form={formWithKindHook}
          onPoiPick={handlePoiPick}
          kind={form.values.kind}
          details={details}
          onDetailsChange={setDetails}
        />

        <Group justify="space-between" mt="md" pt="md" style={{ borderTop: '1px solid #eee' }}>
          <Group>
            <Button onClick={handleSave} loading={saving}>保存</Button>
            <Button variant="default" onClick={handleClose}>取消</Button>
          </Group>
          {isEdit && (
            <Group>
              {activity?.day_id && (
                <Button variant="subtle" size="xs" onClick={handleMoveToBacklog}>移回候选池</Button>
              )}
              <Button variant="subtle" color="red" size="xs" onClick={handleDelete}>删除</Button>
            </Group>
          )}
        </Group>
      </Stack>
    </Drawer>
  )
}

function csrfToken() {
  return document.querySelector('meta[name=csrf-token]')?.getAttribute('content') || ''
}
