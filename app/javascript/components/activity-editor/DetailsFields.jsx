import { TextInput, Checkbox, Select, Stack, Title } from '@mantine/core'
import { KIND_SCHEMA } from './detailsSchema'

export default function DetailsFields({ kind, details, onChange }) {
  const schema = KIND_SCHEMA[kind] || []
  if (schema.length === 0) return null

  const handleChange = (key, value) => {
    onChange({ ...details, [key]: value })
  }

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
              onChange={e => handleChange(field.key, e.currentTarget.checked)}
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
              onChange={v => handleChange(field.key, v)}
              clearable
            />
          )
        }
        if (field.type === 'number') {
          return (
            <TextInput
              key={field.key}
              label={field.label}
              type="number"
              value={value ?? ''}
              onChange={e => handleChange(field.key, e.currentTarget.value === '' ? null : Number(e.currentTarget.value))}
            />
          )
        }
        return (
          <TextInput
            key={field.key}
            label={field.label}
            value={value || ''}
            onChange={e => handleChange(field.key, e.currentTarget.value)}
          />
        )
      })}
    </Stack>
  )
}
