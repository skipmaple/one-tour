import { useEffect, useRef, useState } from 'react'
import { Drawer, Button, Group, Stack, Tabs, Text } from '@mantine/core'
import { useIsMobile } from '../../hooks/useIsMobile'
import { useForm } from '@mantine/form'
import { modals } from '@mantine/modals'
import { notifications } from '@mantine/notifications'
import { router } from '@inertiajs/react'
import { useUndoStack } from '../../hooks/useUndoStack'
import { KIND_SCHEMA } from './detailsSchema'
import CommonFields from './CommonFields'
import ActivityGalleryTab from './ActivityGalleryTab'
import ActivityRouteTab from './ActivityRouteTab'

const EMPTY_FORM_VALUES = {
  name: '',
  kind: 'scenic',
  citizen_level: 'tier_two',
  status: 'confirmed',
  lat: '',
  lng: '',
  address: '',
  pname: '', cityname: '', adname: '', type: '',
  planned_start_at: '',
  planned_duration_min: '',
  desc: '',
}

export default function ActivityDrawer({ tourId, opened, onClose, mode, activity, targetDayId, images, allActivities, days, routeLegs, canEdit, author, members }) {
  const isEdit = mode === 'edit'
  const isMobile = useIsMobile()
  const [saving, setSaving] = useState(false)
  const [activeTab, setActiveTab] = useState('basic')
  const undoStack = useUndoStack()
  const [participantUserIds, setParticipantUserIds] = useState(null)

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
      const d = activity.details || {}
      form.setValues({
        name: activity.name || '',
        kind: activity.kind || 'scenic',
        citizen_level: activity.citizen_level || 'tier_two',
        status: activity.status || 'confirmed',
        lat: activity.lat ?? '',
        lng: activity.lng ?? '',
        address: activity.address || '',
        // pname/cityname/adname/type 持久化在 details jsonb；
        // 读回到 form 顶层临时字段方便 LocationPicker 展示
        pname: d.pname || '',
        cityname: d.cityname || '',
        adname: d.adname || '',
        type: d.type || '',
        planned_start_at: activity.planned_start_at || '',
        planned_duration_min: activity.planned_duration_min ?? '',
        desc: activity.desc || '',
      })
      setDetails(activity.details || {})
      const ids = activity.participant_user_ids
      setParticipantUserIds(Array.isArray(ids) && ids.length > 0 ? ids : null)
      form.resetDirty()
      poiFilledName.current = ''
    }
    if (opened && !isEdit) {
      form.setValues(EMPTY_FORM_VALUES)
      form.resetDirty()
      setDetails({})
      setParticipantUserIds(null)
      poiFilledName.current = ''
    }
    if (opened) setActiveTab('basic')
  }, [opened, isEdit, activity?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  // When kind changes, keep only the keys that belong to the new kind's schema.
  // pname/cityname/adname/type 是跨 kind 的消歧义信息，保留。
  const handleKindChange = (newKind) => {
    form.setFieldValue('kind', newKind)
    if (newKind === 'road') {
      form.setFieldValue('citizen_level', 'tier_one')
    }
    const validKeys = (KIND_SCHEMA[newKind] || []).map(f => f.key)
    // 'place'(高德 POI 元数据)只属于按 POI 选点的 kind;景观公路用起止坐标,
    // 切到 road 时丢弃残留 place,避免评分/照片泄漏进 road 活动及其卡片 meta。
    const preserved = newKind === 'road'
      ? [ 'pname', 'cityname', 'adname', 'type' ]
      : [ 'pname', 'cityname', 'adname', 'type', 'place' ]
    const cleaned = {}
    for (const k of validKeys) {
      if (details[k] !== undefined) cleaned[k] = details[k]
    }
    for (const k of preserved) {
      if (details[k] !== undefined) cleaned[k] = details[k]
    }
    setDetails(cleaned)
  }

  const handlePoiPick = (picked) => {
    const kind = form.values.kind
    if (kind === 'road') {
      // Road kind: picked shape is { start, end } objects (or null for clear)
      const d = { ...(details || {}) }
      if (picked?.start) {
        d.start_name = picked.start.name
        d.start_lat = picked.start.lat
        d.start_lng = picked.start.lng
        d.start_address = picked.start.address
        d.start_pname = picked.start.pname
        d.start_cityname = picked.start.cityname
        d.start_adname = picked.start.adname
      } else if (picked && picked.start === null) {
        delete d.start_name; delete d.start_lat; delete d.start_lng
        delete d.start_address; delete d.start_pname; delete d.start_cityname; delete d.start_adname
      }
      if (picked?.end) {
        d.end_name = picked.end.name
        d.end_lat = picked.end.lat
        d.end_lng = picked.end.lng
        d.end_address = picked.end.address
        d.end_pname = picked.end.pname
        d.end_cityname = picked.end.cityname
        d.end_adname = picked.end.adname
      } else if (picked && picked.end === null) {
        delete d.end_name; delete d.end_lat; delete d.end_lng
        delete d.end_address; delete d.end_pname; delete d.end_cityname; delete d.end_adname
      }
      setDetails(d)
      // Name fallback: if empty, use start_name - end_name
      if (!form.values.name && d.start_name && d.end_name) {
        form.setFieldValue('name', `${d.start_name} - ${d.end_name}`)
      }
      return
    }

    // Non-road (existing behavior)
    if (picked === null) {
      form.setFieldValue('lat', '')
      form.setFieldValue('lng', '')
      form.setFieldValue('address', '')
      form.setFieldValue('pname', '')
      form.setFieldValue('cityname', '')
      form.setFieldValue('adname', '')
      form.setFieldValue('type', '')
      setDetails(prev => { const n = { ...prev }; delete n.place; return n })
      poiFilledName.current = ''
      return
    }
    const { name, lat, lng, address, pname, cityname, adname, type, place } = picked
    const current = form.values.name
    if (!current || current === poiFilledName.current) {
      form.setFieldValue('name', name)
      poiFilledName.current = name
    }
    form.setFieldValue('lat', lat)
    form.setFieldValue('lng', lng)
    form.setFieldValue('address', address || '')
    form.setFieldValue('pname', pname || '')
    form.setFieldValue('cityname', cityname || '')
    form.setFieldValue('adname', adname || '')
    form.setFieldValue('type', type || '')
    if (place) setDetails(prev => ({ ...prev, place }))
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

  // Auto-derive city hint from sibling activities in the same day, falling
  // back to tour-wide majority. Users can × it inside LocationPicker.
  const cityHint = (() => {
    const pool = (allActivities || []).filter(a => a.id !== activity?.id)
    const sameDay = pool.filter(a => a.day_id === targetDayId)
    const src = sameDay.length > 0 ? sameDay : pool
    const counts = {}
    src.forEach(a => {
      const city = a.details?.cityname
      if (city) counts[city] = (counts[city] || 0) + 1
    })
    const top = Object.entries(counts).sort((a, b) => b[1] - a[1])[0]
    return top ? top[0] : null
  })()

  const nearbyCenter = (() => {
    const pool = (allActivities || []).filter(
      a => a.id !== activity?.id && a.day_id === targetDayId && a.lat && a.lng
    )
    if (pool.length === 0) return null
    const avgLat = pool.reduce((s, a) => s + Number(a.lat), 0) / pool.length
    const avgLng = pool.reduce((s, a) => s + Number(a.lng), 0) / pool.length
    return { lat: avgLat, lng: avgLng }
  })()

  const handleSave = async () => {
    if (form.validate().hasErrors) return

    // If coords changed for an activity with overridden adjacent legs, confirm
    const affected = affectedLegsFromEdit(
      { ...form.values, details, kind: form.values.kind, citizen_level: form.values.citizen_level },
      activity,
      routeLegs
    )
    if (affected.length > 0) {
      const names = affected
        .map(l => `${l.from_activity_name || '起'} → ${l.to_activity_name || '止'}`)
        .join('、')
      const confirmed = await new Promise(resolve => {
        modals.openConfirmModal({
          title: '检测到驾驶段手动调整将被重置',
          children: (
            <div>
              <Text size="sm">以下驾驶段的 km / 时长 / 备注手动调整会被清空并回到高德原始值：</Text>
              <Text size="sm" fw={500} mt="xs">{names}</Text>
              <Text size="sm" c="dimmed" mt="xs">（因为起/终点坐标发生了变化）</Text>
            </div>
          ),
          labels: { confirm: '继续保存', cancel: '取消' },
          confirmProps: { color: 'orange' },
          onConfirm: () => resolve(true),
          onCancel: () => resolve(false),
        })
      })
      if (!confirmed) return
    }

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

    // 持久化省市区消歧义信息到 details（非 road kind；road 有自己的 start_*/end_*）
    // 让后续新建活动能从同日 activities.details.cityname 推断区域锚定 chip。
    const { pname, cityname, adname, type, ...formValues } = form.values
    if (kind !== 'road') {
      if (pname)    cleanDetails.pname = pname
      if (cityname) cleanDetails.cityname = cityname
      if (adname)   cleanDetails.adname = adname
      if (type)     cleanDetails.type = type
    }
    // AMAP place metadata (rating/hours/tel/keytag/typecode/photo) — kept across
    // kinds so cards can show it; sourced at POI-pick time, stored under .place.
    if (details.place) cleanDetails.place = details.place

    const payload = {
      activity: {
        ...formValues,
        planned_duration_min: formValues.planned_duration_min === '' ? null : Number(formValues.planned_duration_min),
        lat: formValues.lat === '' ? null : Number(formValues.lat),
        lng: formValues.lng === '' ? null : Number(formValues.lng),
        details: cleanDetails,
      },
      user_ids: participantUserIds ?? [],
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
                    status: savedAttrs.status,
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
      size={isMobile ? '100%' : 520}
      overlayProps={{ opacity: 0.4 }}
      padding="md"
    >
      <Stack gap="md">
        <Tabs value={activeTab} onChange={setActiveTab}>
          <Tabs.List>
            <Tabs.Tab value="basic">基础</Tabs.Tab>
            {isEdit && <Tabs.Tab value="images">图片{images?.length > 0 && ` (${images.length})`}</Tabs.Tab>}
            {isEdit && <Tabs.Tab value="route">路线</Tabs.Tab>}
          </Tabs.List>

          <Tabs.Panel value="basic" pt="md">
            <CommonFields
              form={formWithKindHook}
              onPoiPick={handlePoiPick}
              kind={form.values.kind}
              details={details}
              onDetailsChange={setDetails}
              author={author}
              members={members}
              canEdit={canEdit}
              participantUserIds={participantUserIds}
              onParticipantsChange={setParticipantUserIds}
              regionHint={cityHint}
              nearbyCenter={nearbyCenter}
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

        </Tabs>

        {/* Sticky footer: 保存 / 取消 始终贴在 Drawer 视区底部，
            不用滚到最底才能找到。配合 Drawer.body 的 overflow 自动处理。
            负边距 + padding 让它横向铺满、吃掉 Drawer 的 padding="md" 空隙。 */}
        <Group
          justify="space-between"
          p="md"
          style={{
            position: 'sticky',
            bottom: 'calc(-1 * var(--mantine-spacing-md))',
            marginInline: 'calc(-1 * var(--mantine-spacing-md))',
            marginBottom: 'calc(-1 * var(--mantine-spacing-md))',
            background: 'var(--mantine-color-body)',
            borderTop: '1px solid var(--mantine-color-gray-3)',
            zIndex: 2,
          }}
        >
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

// Given an edited activity and all known legs, return legs whose digest will
// invalidate because the activity's relevant coords are changing. For road
// kind, "relevant coords" = details.start/end; for others, activity.lat/lng.
function affectedLegsFromEdit(edited, originalActivity, routeLegs) {
  if (!originalActivity) return []  // create mode, no legs yet
  const id = originalActivity.id
  const related = (routeLegs || []).filter(
    l => l.from_activity_id === id || l.to_activity_id === id
  )
  if (related.length === 0) return []

  // 数值比较前两边都强制数化。details jsonb 可能存的是字符串（老数据 from
  // AI tools / form payload）或数字（编辑器写入），strict !== 会假阳性误报。
  const numEq = (a, b) => {
    const na = a == null || a === '' ? null : Number(a)
    const nb = b == null || b === '' ? null : Number(b)
    return na === nb || (Number.isNaN(na) && Number.isNaN(nb))
  }

  // 切换 tier_one road 与否 → backend resolve_endpoint_coords 的 source 字段
  // 从 activity.lat/lng 翻到 details.start_*/end_*（或反向）。原始坐标字段
  // 看起来没变（镜像关系），但实际 endpoint_digest 会变，Upsert 会清 override。
  // 这种 kind/citizen_level 切换必须触发 confirm，即便坐标字段比较"等值"。
  const wasTierOneRoad = originalActivity.kind === 'road' && originalActivity.citizen_level === 'tier_one'
  const isTierOneRoad = edited.kind === 'road' && edited.citizen_level === 'tier_one'
  const scenicRoadRoleChanged = wasTierOneRoad !== isTierOneRoad

  const coordsChanged = (() => {
    if (isTierOneRoad) {
      const d0 = originalActivity.details || {}
      const d1 = edited.details || {}
      return !numEq(d0.start_lat, d1.start_lat) || !numEq(d0.start_lng, d1.start_lng) ||
             !numEq(d0.end_lat,   d1.end_lat)   || !numEq(d0.end_lng,   d1.end_lng)
    }
    return !numEq(originalActivity.lat, edited.lat) ||
           !numEq(originalActivity.lng, edited.lng)
  })()
  if (!scenicRoadRoleChanged && !coordsChanged) return []

  return related.filter(l => l.overridden_at != null)
}

function csrfToken() {
  return document.querySelector('meta[name=csrf-token]')?.getAttribute('content') || ''
}
