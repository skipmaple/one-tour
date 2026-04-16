import { TextInput, Textarea, Select, Radio, Group, Stack } from '@mantine/core'
import { KIND_OPTIONS, CITIZEN_LEVEL_OPTIONS } from './detailsSchema'

export default function CommonFields({ form }) {
  return (
    <Stack gap="sm">
      <TextInput
        label="名称"
        required
        maxLength={80}
        {...form.getInputProps('name')}
      />
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
          label="纬度"
          type="number"
          step="any"
          {...form.getInputProps('lat')}
        />
        <TextInput
          label="经度"
          type="number"
          step="any"
          {...form.getInputProps('lng')}
        />
      </Group>
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
    </Stack>
  )
}
