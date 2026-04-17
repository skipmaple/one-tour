import { useState } from 'react'
import { TextInput, Textarea, Select, Radio, Group, Stack, Text, Button, Collapse } from '@mantine/core'
import { KIND_OPTIONS, CITIZEN_LEVEL_OPTIONS } from './detailsSchema'
import PoiSearchCombobox from './PoiSearchCombobox'
import DetailsFields from './DetailsFields'

export default function CommonFields({ form, onPoiPick, kind, details, onDetailsChange }) {
  const [moreOpen, setMoreOpen] = useState(false)
  const lat = form.values.lat
  const lng = form.values.lng

  return (
    <Stack gap="sm">
      <PoiSearchCombobox onPick={onPoiPick} />
      <TextInput
        label="名称"
        required
        maxLength={80}
        {...form.getInputProps('name')}
      />
      {(lat && lng) && (
        <Text size="xs" c="dimmed">📍 {Number(lat).toFixed(2)}, {Number(lng).toFixed(2)}</Text>
      )}
      <Group grow>
        <Select
          label="类型"
          data={KIND_OPTIONS}
          allowDeselect={false}
          {...form.getInputProps('kind')}
        />
      </Group>
      <Radio.Group
        label="公民等级"
        {...form.getInputProps('citizen_level')}
      >
        <Group mt={4}>
          {CITIZEN_LEVEL_OPTIONS.map(o => (
            <Radio key={o.value} value={o.value} label={o.label} />
          ))}
        </Group>
      </Radio.Group>
      <Group grow>
        <TextInput
          label="开始时间"
          placeholder="HH:MM"
          {...form.getInputProps('planned_start_at')}
        />
        <TextInput
          label="时长 (分钟)"
          type="number"
          {...form.getInputProps('planned_duration_min')}
        />
      </Group>

      <Button variant="subtle" size="sm" onClick={() => setMoreOpen(o => !o)}>
        {moreOpen ? '▴ 收起' : '▾ 更多设置'}
      </Button>
      <Collapse expanded={moreOpen}>
        <Stack gap="sm">
          <Textarea
            label="描述"
            minRows={2}
            maxRows={4}
            autosize
            {...form.getInputProps('description')}
          />
          <Textarea
            label="贴士"
            minRows={1}
            maxRows={3}
            autosize
            {...form.getInputProps('tips')}
          />
          <DetailsFields kind={kind} details={details} onChange={onDetailsChange} />
        </Stack>
      </Collapse>
    </Stack>
  )
}
