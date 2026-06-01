import { useState, useEffect } from 'react'
import { Modal, Stack, Group, Text, NumberInput, Textarea, Button, ActionIcon } from '@mantine/core'
import { IconRefresh } from '@tabler/icons-react'
import { router } from '@inertiajs/react'
import { useIsMobile } from '../../hooks/useIsMobile'

export default function RouteLegEditModal({ opened, onClose, leg }) {
  const isMobile = useIsMobile()
  const [distKm, setDistKm] = useState('')
  const [durMin, setDurMin] = useState('')
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!leg) return
    setDistKm(leg.distance_m_override != null
      ? Math.round(leg.distance_m_override / 1000)
      : Math.round(leg.distance_m / 1000))
    setDurMin(leg.duration_s_override != null
      ? Math.round(leg.duration_s_override / 60)
      : Math.round(leg.duration_s / 60))
    setNote(leg.note || '')
  }, [leg?.id])

  if (!leg) return null

  const amapKm = Math.round(leg.distance_m / 1000)
  const amapMin = Math.round(leg.duration_s / 60)

  const csrfToken = () =>
    document.querySelector('meta[name=csrf-token]')?.getAttribute('content') || ''

  // Convert user input to override payload. Empty/nullish → null (leave
  // the override clear, so effective_* falls back to AMAP original). Don't
  // coerce empty string via Number() — that silently yields 0 and would
  // write a 0-km / 0-min override + mark overridden_at.
  const parseOverride = (raw, factor) => {
    if (raw === '' || raw == null) return null
    const n = Number(raw)
    return Number.isFinite(n) ? n * factor : null
  }
  const bothEmpty = (distKm === '' || distKm == null) && (durMin === '' || durMin == null)

  const handleSave = () => {
    // Guard: Save button is already disabled when both fields empty + note empty,
    // but defend in depth.
    if (bothEmpty && !note) return

    setSaving(true)
    fetch(`/route_legs/${leg.id}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json', 'Accept': 'application/json',
        'X-CSRF-Token': csrfToken()
      },
      body: JSON.stringify({ route_leg: {
        distance_m_override: parseOverride(distKm, 1000),
        duration_s_override: parseOverride(durMin, 60),
        note: note || null
      }})
    })
      .then(res => {
        if (res.ok) { router.reload({ only: [ 'route_legs' ] }); onClose() }
      })
      .catch(() => {})  // don't strand the saving state on network error
      .finally(() => setSaving(false))
  }

  const handleReset = () => {
    setSaving(true)
    fetch(`/route_legs/${leg.id}`, {
      method: 'DELETE',
      headers: {
        'Accept': 'application/json',
        'X-CSRF-Token': csrfToken()
      }
    })
      .then(res => {
        if (res.ok) { router.reload({ only: [ 'route_legs' ] }); onClose() }
      })
      .catch(() => {})
      .finally(() => setSaving(false))
  }

  return (
    <Modal opened={opened} onClose={onClose} title="编辑驾驶段" centered size="md" fullScreen={isMobile}>
      <Stack gap="md">
        <Text size="sm" c="dimmed">
          {leg.from_activity_name} → {leg.to_activity_name}
        </Text>
        <Group grow align="flex-end">
          <NumberInput
            label="距离" value={distKm} onChange={v => setDistKm(v)}
            rightSection={<Text size="xs" c="dimmed" pr="xs">km</Text>} rightSectionWidth={36}
            min={0}
            description={
              <Group gap={4}>
                <Text size="xs" c="dimmed">高德: {amapKm} km</Text>
                <ActionIcon size="xs" variant="subtle" onClick={() => setDistKm(amapKm)}>
                  <IconRefresh size={12} />
                </ActionIcon>
              </Group>
            }
          />
          <NumberInput
            label="时长" value={durMin} onChange={v => setDurMin(v)}
            rightSection={<Text size="xs" c="dimmed" pr="xs">分钟</Text>} rightSectionWidth={56}
            min={0}
            description={
              <Group gap={4}>
                <Text size="xs" c="dimmed">高德: {amapMin} 分钟</Text>
                <ActionIcon size="xs" variant="subtle" onClick={() => setDurMin(amapMin)}>
                  <IconRefresh size={12} />
                </ActionIcon>
              </Group>
            }
          />
        </Group>
        <Textarea label="备注" value={note} onChange={e => setNote(e.currentTarget.value)}
                  placeholder="如: 实际走了绕行路" minRows={2} />
        <Group justify="space-between">
          <Button variant="subtle" onClick={handleReset} loading={saving}>重置为高德原始值</Button>
          <Group>
            <Button variant="default" onClick={onClose}>取消</Button>
            <Button onClick={handleSave} loading={saving} disabled={bothEmpty && !note}>保存</Button>
          </Group>
        </Group>
      </Stack>
    </Modal>
  )
}
