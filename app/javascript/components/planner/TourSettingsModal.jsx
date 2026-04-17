import { useEffect, useState } from 'react'
import { Modal, TextInput, NumberInput, Button, Group, Stack } from '@mantine/core'
import { router } from '@inertiajs/react'

export default function TourSettingsModal({ tour, opened, onClose }) {
  const [title, setTitle] = useState('')
  const [dateRange, setDateRange] = useState('')
  const [teamSize, setTeamSize] = useState('')
  const [vehicle, setVehicle] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (opened && tour) {
      setTitle(tour.title || '')
      setDateRange(tour.date_range || '')
      setTeamSize(tour.team_size || '')
      setVehicle(tour.vehicle || '')
    }
  }, [opened, tour?.id])

  const handleSave = () => {
    if (!title.trim()) return
    setSaving(true)
    router.patch(`/tours/${tour.id}`, {
      tour: {
        title: title.trim(),
        date_range: dateRange || null,
        team_size: teamSize || null,
        vehicle: vehicle || null,
      }
    }, {
      preserveScroll: true,
      only: ['tour'],
      onSuccess: () => { setSaving(false); onClose() },
      onError: () => setSaving(false),
    })
  }

  return (
    <Modal opened={opened} onClose={onClose} title="程设置" size="md">
      <Stack gap="md">
        <TextInput
          label="程名"
          value={title}
          onChange={e => setTitle(e.currentTarget.value)}
          required
        />
        <Group grow>
          <TextInput
            label="日期范围"
            placeholder="例如：2026年6月10日-19日"
            value={dateRange}
            onChange={e => setDateRange(e.currentTarget.value)}
          />
          <NumberInput
            label="人数"
            value={teamSize}
            onChange={setTeamSize}
            min={1}
            max={50}
          />
        </Group>
        <TextInput
          label="车型"
          placeholder="例如：丰田普拉多"
          value={vehicle}
          onChange={e => setVehicle(e.currentTarget.value)}
        />
        <Group justify="flex-end" mt="md">
          <Button variant="default" onClick={onClose}>取消</Button>
          <Button onClick={handleSave} loading={saving}>保存</Button>
        </Group>
      </Stack>
    </Modal>
  )
}
