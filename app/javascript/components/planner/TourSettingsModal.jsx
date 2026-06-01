import { useEffect, useState } from 'react'
import { Modal, TextInput, NumberInput, Select, Button, Group, Stack, Text } from '@mantine/core'
import { router } from '@inertiajs/react'
import { useIsMobile } from '../../hooks/useIsMobile'

const CURRENCY_OPTIONS = [
  { value: 'CNY', label: 'CNY 人民币' },
  { value: 'USD', label: 'USD 美元' },
  { value: 'EUR', label: 'EUR 欧元' },
  { value: 'JPY', label: 'JPY 日元' },
  { value: 'KZT', label: 'KZT 哈萨克坚戈' },
]

const TIMEZONE_OPTIONS = [
  { value: 'Asia/Shanghai', label: '中国时间 Asia/Shanghai' },
  { value: 'Asia/Urumqi',   label: '乌鲁木齐时间 Asia/Urumqi' },
  { value: 'Asia/Tokyo',    label: '东京时间 Asia/Tokyo' },
  { value: 'UTC',           label: '世界时间 UTC' },
]

export default function TourSettingsModal({ tour, opened, onClose }) {
  const isMobile = useIsMobile()
  const [title, setTitle] = useState('')
  const [dateRange, setDateRange] = useState('')
  const [teamSize, setTeamSize] = useState('')
  const [vehicle, setVehicle] = useState('')
  const [currency, setCurrency] = useState('CNY')
  const [timezone, setTimezone] = useState('Asia/Shanghai')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (opened && tour) {
      setTitle(tour.title || '')
      setDateRange(tour.date_range || '')
      setTeamSize(tour.team_size || '')
      setVehicle(tour.vehicle || '')
      setCurrency(tour.currency || 'CNY')
      setTimezone(tour.timezone || 'Asia/Shanghai')
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
        currency,
        timezone,
      }
    }, {
      preserveScroll: true,
      only: ['tour'],
      onSuccess: () => { setSaving(false); onClose() },
      onError: () => setSaving(false),
    })
  }

  return (
    <Modal opened={opened} onClose={onClose} title="程设置" size="md" fullScreen={isMobile}>
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
        <Select
          label="货币"
          data={CURRENCY_OPTIONS}
          value={currency}
          onChange={(v) => v && setCurrency(v)}
          allowDeselect={false}
        />
        <Select
          label="时区"
          data={TIMEZONE_OPTIONS}
          value={timezone}
          onChange={(v) => v && setTimezone(v)}
          allowDeselect={false}
          description="切换时区后已录入的时间不会重新换算"
        />
        <Group justify="flex-end" mt="md">
          <Button variant="default" onClick={onClose}>取消</Button>
          <Button onClick={handleSave} loading={saving}>保存</Button>
        </Group>
      </Stack>
    </Modal>
  )
}
