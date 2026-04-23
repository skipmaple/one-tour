import { useState, useEffect } from 'react'
import { Modal, Stack, Group, Text, NumberInput, Textarea, Button, ActionIcon } from '@mantine/core'
import { IconRefresh } from '@tabler/icons-react'
import { router } from '@inertiajs/react'

export default function RouteLegEditModal({ opened, onClose, leg }) {
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

  const handleSave = () => {
    setSaving(true)
    fetch(`/route_legs/${leg.id}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json', 'Accept': 'application/json',
        'X-CSRF-Token': csrfToken()
      },
      body: JSON.stringify({ route_leg: {
        distance_m_override: Number(distKm) * 1000,
        duration_s_override: Number(durMin) * 60,
        note: note || null
      }})
    }).then(res => {
      setSaving(false)
      if (res.ok) { router.reload({ only: [ 'route_legs' ] }); onClose() }
    })
  }

  const handleReset = () => {
    setSaving(true)
    fetch(`/route_legs/${leg.id}`, {
      method: 'DELETE',
      headers: {
        'Accept': 'application/json',
        'X-CSRF-Token': csrfToken()
      }
    }).then(res => {
      setSaving(false)
      if (res.ok) { router.reload({ only: [ 'route_legs' ] }); onClose() }
    })
  }

  return (
    <Modal opened={opened} onClose={onClose} title="编辑驾驶段" centered size="md">
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
            <Button onClick={handleSave} loading={saving}>保存</Button>
          </Group>
        </Group>
      </Stack>
    </Modal>
  )
}
