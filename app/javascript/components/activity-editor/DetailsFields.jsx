import { TextInput, NumberInput, Checkbox, Select, Autocomplete, Group, Stack } from '@mantine/core'
import { KIND_SCHEMA } from './detailsSchema'
import PresetChips from './PresetChips'

// Group adjacent schema fields that share a `row` id, so they render
// side-by-side in a flex row (used for pairs like 海拔/建议停留, 里程/驾驶时长).
function groupFieldsByRow(schema) {
  const groups = []
  let current = null
  for (const field of schema) {
    if (field.row && current?.row === field.row) {
      current.fields.push(field)
    } else {
      current = { row: field.row || null, fields: [field] }
      groups.push(current)
    }
  }
  return groups
}

function renderField(field, value, set) {
  if (field.type === 'checkbox') {
    return (
      <Checkbox
        key={field.key}
        label={field.label}
        checked={!!value}
        onChange={e => set(field.key, e.currentTarget.checked)}
      />
    )
  }
  if (field.type === 'select') {
    return (
      <Select
        key={field.key}
        label={field.label}
        data={field.options}
        value={value || null}
        onChange={v => set(field.key, v)}
        clearable
      />
    )
  }
  if (field.type === 'autocomplete') {
    return (
      <Autocomplete
        key={field.key}
        label={field.label}
        data={field.suggestions || []}
        value={value || ''}
        onChange={v => set(field.key, v)}
      />
    )
  }
  if (field.type === 'number_with_suffix') {
    return (
      <Stack key={field.key} gap={0}>
        <NumberInput
          label={field.label}
          min={0}
          max={field.max}
          clampBehavior="strict"
          value={value ?? ''}
          onChange={v => set(field.key, v === '' ? null : v)}
          rightSection={field.suffix ? <span style={{ fontSize: 12, color: 'var(--mantine-color-gray-6)', paddingRight: 8 }}>{field.suffix}</span> : null}
          rightSectionWidth={field.suffix ? 46 : undefined}
        />
        {Array.isArray(field.presets) && field.presets.length > 0 && (
          <PresetChips values={field.presets} onPick={v => set(field.key, v)} ariaLabelPrefix={field.label} />
        )}
      </Stack>
    )
  }
  return (
    <TextInput
      key={field.key}
      label={field.label}
      placeholder={field.placeholder}
      value={value || ''}
      onChange={e => set(field.key, e.currentTarget.value)}
    />
  )
}

export default function DetailsFields({ kind, details, onChange }) {
  const schema = KIND_SCHEMA[kind] || []
  if (schema.length === 0) return null

  const set = (key, value) => onChange({ ...details, [key]: value })
  const groups = groupFieldsByRow(schema)

  return (
    <Stack gap="sm">
      {groups.map((group, idx) => {
        if (group.row) {
          return (
            <Group key={group.row} grow align="flex-end">
              {group.fields.map(f => renderField(f, details[f.key], set))}
            </Group>
          )
        }
        const f = group.fields[0]
        return renderField(f, details[f.key], set)
      })}
    </Stack>
  )
}
