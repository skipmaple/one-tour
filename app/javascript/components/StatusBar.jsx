import { Group, Text } from '@mantine/core'

export default function StatusBar({ content, lastSaved, saving, error }) {
  const wordCount = content ? content.split(/\s+/).filter(Boolean).length : 0

  return (
    <Group gap="lg" px="md" py={4} style={{ borderTop: '1px solid var(--mantine-color-gray-3)' }}>
      <Text size="xs" c="dimmed">{wordCount} words</Text>
      {saving && <Text size="xs" c="blue">Saving...</Text>}
      {error && <Text size="xs" c="red">Save failed</Text>}
      {lastSaved && !saving && !error && (
        <Text size="xs" c="dimmed">Saved {lastSaved}</Text>
      )}
    </Group>
  )
}
