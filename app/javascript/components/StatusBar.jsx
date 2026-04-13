import { Group, Text } from '@mantine/core'

export default function StatusBar({ content, lastSaved, saving, error }) {
  const wordCount = content ? content.split(/\s+/).filter(Boolean).length : 0

  return (
    <Group gap="lg" px="md" py={4} style={{ borderTop: '1px solid var(--mantine-color-gray-3)' }}>
      <Text size="xs" c="dimmed">{wordCount} 字</Text>
      {saving && <Text size="xs" c="blue">保存中...</Text>}
      {error && <Text size="xs" c="red">保存失败</Text>}
      {lastSaved && !saving && !error && (
        <Text size="xs" c="dimmed">已保存 {lastSaved}</Text>
      )}
    </Group>
  )
}
