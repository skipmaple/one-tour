import { useEffect, useRef, useState } from 'react'
import { Alert, Checkbox, Drawer, Button, Group, Stack, Tabs } from '@mantine/core'
import { useForm } from '@mantine/form'
import { modals } from '@mantine/modals'
import { notifications } from '@mantine/notifications'
import { router } from '@inertiajs/react'
import { useUndoStack } from '../../hooks/useUndoStack'
import { KIND_SCHEMA } from './detailsSchema'
import CommonFields from './CommonFields'
import ActivityGalleryTab from './ActivityGalleryTab'
import ActivityRouteTab from './ActivityRouteTab'
import UserLabel from '../planner/UserLabel'

const EMPTY_FORM_VALUES = {
  name: '',
  kind: 'scenic',
  citizen_level: 'tier_three',
  lat: '',
  lng: '',
  address: '',
  planned_start_at: '',
  planned_duration_min: '',
  desc: '',
}

export default function ActivityDrawer({ tourId, opened, onClose, mode, activity, targetDayId, images, allActivities, days, routeLegs, canEdit, author, members }) {
  const isEdit = mode === 'edit'
  const [saving, setSaving] = useState(false)
  const [activeTab, setActiveTab] = useState('basic')
  const undoStack = useUndoStack()

  const form = useForm({
    initialValues: EMPTY_FORM_VALUES,
    validate: {
      name: (v) => (v.trim().length === 0 ? '名称不能为空' : null),
    },
  })

  const [details, setDetails] = useState({})

  // Tracks the name last auto-filled by a POI pick. If the user picks another
  // POI while `form.values.name` still matches this, we treat the name as
  // "not user-edited" and overwrite it with the new POI's name. Any manual
  // edit makes the value diverge, so we preserve what the user typed.
  const poiFilledName = useRef('')

  // Populate form when editing an existing activity. Note: `form.resetDirty()`
  // in Mantine overwrites the form's "initial snapshot" with current values —
  // so after we load edit data and call resetDirty, a later `form.reset()`
  // would restore THOSE edit values, not EMPTY_FORM_VALUES. When switching to
  // create mode we therefore reset the snapshot explicitly.
  useEffect(() => {
    if (opened && isEdit && activity) {
      form.setValues({
        name: activity.name || '',
        kind: activity.kind || 'scenic',
        citizen_level: activity.citizen_level || 'tier_three',
        lat: activity.lat ?? '',
        lng: activity.lng ?? '',
        address: activity.address || '',
        planned_start_at: activity.planned_start_at || '',
        planned_duration_min: activity.planned_duration_min ?? '',
        desc: activity.desc || '',
      })
      setDetails(activity.details || {})
      form.resetDirty()
      poiFilledName.current = ''
    }
    if (opened && !isEdit) {
      form.setValues(EMPTY_FORM_VALUES)
      form.resetDirty()
      setDetails({})
      poiFilledName.current = ''
    }
    if (opened) setActiveTab('basic')
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

  const handlePoiPick = ({ name, lat, lng, address }) => {
    const current = form.values.name
    if (!current || current === poiFilledName.current) {
      form.setFieldValue('name', name)
      poiFilledName.current = name
    }
    form.setFieldValue('lat', lat)
    form.setFieldValue('lng', lng)
    form.setFieldValue('address', address || '')
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
                    address: savedAttrs.address,
                    planned_start_at: savedAttrs.planned_start_at,
                    planned_duration_min: savedAttrs.planned_duration_min,
                    desc: savedAttrs.desc,
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
      size={520}
      overlayProps={{ opacity: 0.4 }}
      padding="md"
    >
      <Stack gap="md">
        <Tabs value={activeTab} onChange={setActiveTab}>
          <Tabs.List>
            <Tabs.Tab value="basic">基础</Tabs.Tab>
            {isEdit && <Tabs.Tab value="images">图片{images?.length > 0 && ` (${images.length})`}</Tabs.Tab>}
            {isEdit && <Tabs.Tab value="route">路线</Tabs.Tab>}
            {isEdit && <Tabs.Tab value="participants">参与人</Tabs.Tab>}
          </Tabs.List>

          <Tabs.Panel value="basic" pt="md">
            <CommonFields
              form={formWithKindHook}
              onPoiPick={handlePoiPick}
              kind={form.values.kind}
              details={details}
              onDetailsChange={setDetails}
            />
          </Tabs.Panel>

          {isEdit && (
            <Tabs.Panel value="images" pt="md">
              <ActivityGalleryTab
                activityId={activity?.id}
                images={images || []}
                hasCoordinates={Boolean(activity?.lat) && Boolean(activity?.lng)}
              />
            </Tabs.Panel>
          )}

          {isEdit && (
            <Tabs.Panel value="route" pt="md">
              <ActivityRouteTab
                tourId={tourId}
                activity={activity}
                allActivities={allActivities || []}
                days={days || []}
                routeLegs={routeLegs || []}
                canEdit={canEdit}
              />
            </Tabs.Panel>
          )}

          {isEdit && (
            <Tabs.Panel value="participants" pt="md">
              <ParticipantsTab
                activity={activity}
                author={author}
                members={members}
                canEdit={canEdit}
              />
            </Tabs.Panel>
          )}
        </Tabs>

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

function ParticipantsTab({ activity, author, members, canEdit }) {
  const candidates = [
    { user_id: author.user_id, name: author.name, avatar_url: author.avatar_url, email: author.email, isAuthor: true },
    ...members.map((m) => ({
      user_id: m.user_id, name: m.name, avatar_url: m.avatar_url, email: m.email, isAuthor: false,
    })),
  ]
  const explicit = activity.participant_user_ids || []
  const isFullTrip = explicit.length === 0
  const selected = new Set(explicit)

  const persist = (userIdsNext) => {
    router.put(`/activities/${activity.id}/participants`, { user_ids: userIdsNext }, {
      preserveScroll: true,
      only: ['activities'],
    })
  }

  const toggle = (userId, checked) => {
    let next
    if (isFullTrip && !checked) {
      next = candidates.map((c) => c.user_id).filter((id) => id !== userId)
    } else if (!isFullTrip && checked) {
      next = [ ...selected, userId ]
    } else if (!isFullTrip && !checked) {
      next = [ ...selected ].filter((id) => id !== userId)
    } else {
      return
    }
    if (next.length === candidates.length) next = []
    persist(next)
  }

  return (
    <Stack gap="sm">
      {isFullTrip && (
        <Alert color="blue" variant="light">
          默认全员参与。取消勾选某人即切换为"仅列出成员参与"模式。
        </Alert>
      )}
      {candidates.map((c) => {
        const checked = isFullTrip || selected.has(c.user_id)
        return (
          <Checkbox
            key={c.user_id}
            checked={checked}
            disabled={!canEdit}
            onChange={(e) => toggle(c.user_id, e.currentTarget.checked)}
            label={
              <Group gap="xs" wrap="nowrap">
                <UserLabel user={c} isAuthor={c.isAuthor} size={22} fz="sm" />
              </Group>
            }
          />
        )
      })}
    </Stack>
  )
}
