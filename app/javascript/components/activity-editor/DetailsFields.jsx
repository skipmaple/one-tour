import { TextInput, NumberInput, Checkbox, Select, Autocomplete, Stack, Title } from '@mantine/core'
import { KIND_SCHEMA } from './detailsSchema'
import PresetChips from './PresetChips'

export default function DetailsFields({ kind, details, onChange }) {
  const schema = KIND_SCHEMA[kind] || []
  if (schema.length === 0) return null

  const set = (key, value) => onChange({ ...details, [key]: value })

  return (
    <Stack gap="sm">
      <Title order={6} c="dimmed">类型细节</Title>
      {schema.map(field => {
        const value = details[field.key]
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
            <div key={field.key}>
              <NumberInput
                label={field.label}
                min={0}
                value={value ?? ''}
                onChange={v => set(field.key, v === '' ? null : v)}
                rightSection={field.suffix ? <span style={{ fontSize: 12, color: 'var(--mantine-color-gray-6)', paddingRight: 8 }}>{field.suffix}</span> : null}
                rightSectionWidth={field.suffix ? 46 : undefined}
              />
              {Array.isArray(field.presets) && field.presets.length > 0 && (
                <PresetChips values={field.presets} onPick={v => set(field.key, v)} />
              )}
            </div>
          )
        }
        if (field.type === 'number') {
          return (
            <TextInput
              key={field.key}
              label={field.label}
              type="number"
              value={value ?? ''}
              onChange={e => set(field.key, e.currentTarget.value === '' ? null : Number(e.currentTarget.value))}
            />
          )
        }
        return (
          <TextInput
            key={field.key}
            label={field.label}
            value={value || ''}
            onChange={e => set(field.key, e.currentTarget.value)}
          />
        )
      })}
    </Stack>
  )
}
