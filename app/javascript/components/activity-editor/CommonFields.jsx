import { TextInput, Select, Radio, Group, SimpleGrid, Stack, NumberInput, Divider, Text } from '@mantine/core'
import { TimePicker } from '@mantine/dates'
import { KIND_OPTIONS, KIND_ICONS, CITIZEN_LEVEL_OPTIONS, DURATION_PRESET_CHIPS, KIND_SCHEMA } from './detailsSchema'
import LocationPicker from './LocationPicker'
import PresetChips from './PresetChips'
import DetailsFields from './DetailsFields'
import CollapsibleSection from './CollapsibleSection'
import MarkdownEditor from './MarkdownEditor'
import ParticipantsSection from './ParticipantsSection'
import useAmapDirection from '../../hooks/useAmapDirection'

function countFilledDetails(kind, details) {
  const schema = KIND_SCHEMA[kind] || []
  return schema.reduce((n, f) => {
    const v = details?.[f.key]
    if (v == null || v === '' || v === false) return n
    return n + 1
  }, 0)
}

function participantSummary(value, memberCount) {
  if (value === null) return `默认全员 · ${memberCount} 人`
  return `${value.length} / ${memberCount} 人`
}

function RoadLocationSection({ form, details, onDetailsChange, onScenicRoadChange, regionHint, canEdit }) {
  const d = details || {}
  const start = d.start_lat ? {
    name: d.start_name,
    lat: Number(d.start_lat),
    lng: Number(d.start_lng),
    address: d.start_address,
    pname: d.start_pname,
    cityname: d.start_cityname,
    adname: d.start_adname,
  } : null

  const end = d.end_lat ? {
    name: d.end_name,
    lat: Number(d.end_lat),
    lng: Number(d.end_lng),
    address: d.end_address,
    pname: d.end_pname,
    cityname: d.end_cityname,
    adname: d.end_adname,
  } : null

  const amapCoords = (start && end) ? {
    from: { lat: start.lat, lng: start.lng },
    to:   { lat: end.lat,   lng: end.lng }
  } : null
  const { status, data } = useAmapDirection(amapCoords)

  const handleChange = ({ start: nextStart, end: nextEnd }) => {
    onScenicRoadChange({ start: nextStart, end: nextEnd })
  }

  const updateDetailField = (key, value) => {
    onDetailsChange({ ...(details || {}), [key]: value })
  }

  return (
    <Stack gap="sm">
      <LocationPicker
        mode="dual"
        value={{ start, end }}
        onChange={handleChange}
        regionHint={regionHint}
        disabled={!canEdit}
      />
      <Group grow>
        <NumberInput
          label="里程" min={0}
          value={d.km ?? ''}
          onChange={v => updateDetailField('km', v === '' ? null : Number(v))}
          rightSection={<Text size="xs" c="dimmed" pr="xs">km</Text>}
          rightSectionWidth={40}
          description={data ? `AMAP: ${Math.round(data.distance_m / 1000)} km` : null}
        />
        <NumberInput
          label="驾驶时长" min={0}
          value={d.drive_min ?? ''}
          onChange={v => updateDetailField('drive_min', v === '' ? null : Number(v))}
          rightSection={<Text size="xs" c="dimmed" pr="xs">分钟</Text>}
          rightSectionWidth={56}
          description={data ? `AMAP: ${Math.round(data.duration_s / 60)} 分钟` : null}
        />
      </Group>
      {status === 'error' && (
        <Text size="xs" c="red">AMAP 预估失败，请手动输入里程和时长</Text>
      )}
    </Stack>
  )
}

export default function CommonFields({
  form, onPoiPick, kind, details, onDetailsChange,
  author, members, canEdit,
  participantUserIds, onParticipantsChange,
  regionHint, nearbyCenter,
}) {
  const filledCount = countFilledDetails(kind, details)
  const totalMembers = 1 + (members?.length || 0)
  const hasExplicitParticipants = Array.isArray(participantUserIds)

  return (
    <Stack gap="md">
      {/* 段 1：位置 */}
      <Divider label="位置" labelPosition="left" />
      {kind === 'road' ? (
        <RoadLocationSection
          form={form}
          details={details}
          onDetailsChange={onDetailsChange}
          onScenicRoadChange={onPoiPick}
          regionHint={regionHint}
          canEdit={canEdit}
        />
      ) : (
        <LocationPicker
          // 显式空串/null 判，避免 0 经纬度被当 falsy（理论可能：赤道/本初子午线交点）
          value={form.values.lat !== '' && form.values.lat != null &&
                 form.values.lng !== '' && form.values.lng != null ? {
            name: form.values.name || '未命名',
            lat: Number(form.values.lat),
            lng: Number(form.values.lng),
            address: form.values.address || '',
            pname: form.values.pname || '',
            cityname: form.values.cityname || '',
            adname: form.values.adname || '',
            type: form.values.type || '',
          } : null}
          onChange={onPoiPick}
          regionHint={regionHint}
          nearbyCenter={nearbyCenter}
          disabled={!canEdit}
        />
      )}
      <TextInput
        label="名称"
        required
        maxLength={80}
        {...form.getInputProps('name')}
      />

      {/* 段 2：分类与时间 */}
      <Divider label="分类与时间" labelPosition="left" />
      <Select
        label="类型"
        data={KIND_OPTIONS}
        allowDeselect={false}
        leftSection={(() => {
          const Icon = KIND_ICONS[form.values.kind]
          return Icon ? <Icon size={16} /> : null
        })()}
        renderOption={({ option }) => {
          const Icon = KIND_ICONS[option.value]
          return (
            <Group gap="xs" wrap="nowrap">
              {Icon ? <Icon size={16} /> : null}
              <span>{option.label}</span>
            </Group>
          )
        }}
        {...form.getInputProps('kind')}
      />
      <Radio.Group label="公民等级" {...form.getInputProps('citizen_level')}>
        <SimpleGrid cols={2} spacing="xs" mt={4}>
          {CITIZEN_LEVEL_OPTIONS.map(o => (
            <Radio key={o.value} value={o.value} label={o.label}
                   disabled={form.values.kind === 'road' && o.value !== 'tier_one'} />
          ))}
        </SimpleGrid>
      </Radio.Group>
      <Group grow align="flex-start">
        <TimePicker
          label="开始时间"
          format="24h"
          clearable
          withDropdown
          minutesStep={5}
          hoursInputLabel="小时"
          minutesInputLabel="分钟"
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
            ariaLabelPrefix="时长"
          />
        </Stack>
      </Group>

      {/* 段 3：备注（保持展开） */}
      <Divider label="备注" labelPosition="left" />
      <MarkdownEditor
        value={form.values.desc}
        onChange={(v) => form.setFieldValue('desc', v)}
      />

      {/* 段 4：类型细节（默认折叠；有值则展开） */}
      <CollapsibleSection
        title="类型细节"
        summary={filledCount > 0 ? `${filledCount} 项已填` : '未填写'}
        defaultOpen={filledCount > 0}
      >
        <DetailsFields kind={kind} details={details} onChange={onDetailsChange} />
      </CollapsibleSection>

      {/* 段 5：参与人（默认折叠；edit 模式下有显式名单则展开） */}
      <CollapsibleSection
        title="参与人"
        summary={participantSummary(participantUserIds, totalMembers)}
        defaultOpen={hasExplicitParticipants}
      >
        <ParticipantsSection
          author={author}
          members={members}
          canEdit={canEdit}
          value={participantUserIds}
          onChange={onParticipantsChange}
        />
      </CollapsibleSection>
    </Stack>
  )
}
