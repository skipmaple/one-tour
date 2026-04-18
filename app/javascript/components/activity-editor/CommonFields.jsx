import { TextInput, Textarea, Select, Radio, Group, Stack, Text, NumberInput, Divider } from '@mantine/core'
import { TimeInput } from '@mantine/dates'
import { KIND_OPTIONS, CITIZEN_LEVEL_OPTIONS, DURATION_PRESET_CHIPS } from './detailsSchema'
import PoiSearchCombobox from './PoiSearchCombobox'
import PresetChips from './PresetChips'
import DetailsFields from './DetailsFields'

export default function CommonFields({ form, onPoiPick, kind, details, onDetailsChange }) {
  return (
    <Stack gap="md">
      {/* 段 1：位置 */}
      <Divider label="位置" labelPosition="left" />
      <PoiSearchCombobox onPick={onPoiPick} />
      <TextInput
        label="名称"
        required
        maxLength={80}
        {...form.getInputProps('name')}
      />
      {form.values.address && (
        <Text size="xs" c="dimmed">地址：{form.values.address}</Text>
      )}

      {/* 段 2：分类与时间 */}
      <Divider label="分类与时间" labelPosition="left" />
      <Select
        label="类型"
        data={KIND_OPTIONS}
        allowDeselect={false}
        {...form.getInputProps('kind')}
      />
      <Radio.Group label="公民等级" {...form.getInputProps('citizen_level')}>
        <Group mt={4} gap="md">
          {CITIZEN_LEVEL_OPTIONS.map(o => (
            <Radio key={o.value} value={o.value} label={o.label} />
          ))}
        </Group>
      </Radio.Group>
      <Group grow align="flex-end">
        <TimeInput
          label="开始时间"
          {...form.getInputProps('planned_start_at')}
        />
        <Stack gap={0} data-testid="duration-field">
          <NumberInput
            label="时长"
            min={0}
            value={form.values.planned_duration_min === '' ? '' : Number(form.values.planned_duration_min)}
            onChange={v => form.setFieldValue('planned_duration_min', v === '' ? '' : v)}
            rightSection={<span style={{ fontSize: 12, color: 'var(--mantine-color-gray-6)', paddingRight: 8 }}>分钟</span>}
            rightSectionWidth={46}
          />
          <PresetChips
            values={DURATION_PRESET_CHIPS}
            onPick={v => form.setFieldValue('planned_duration_min', v)}
          />
        </Stack>
      </Group>

      {/* 段 3：详情 */}
      <Divider label="详情" labelPosition="left" />
      <Textarea
        label="备注"
        minRows={2}
        maxRows={5}
        autosize
        {...form.getInputProps('desc')}
      />
      <DetailsFields kind={kind} details={details} onChange={onDetailsChange} />
    </Stack>
  )
}
