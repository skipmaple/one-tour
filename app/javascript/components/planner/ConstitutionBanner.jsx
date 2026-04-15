import { Stack, Paper, Group, Text, Button } from '@mantine/core'

export default function ConstitutionBanner({ violations }) {
  if (!violations || violations.length === 0) return null
  return (
    <Stack gap={4} mb="sm">
      {violations.map((v, i) => (
        <Paper
          key={i}
          p="xs"
          withBorder
          style={{
            borderColor: v.level === 'hard' ? '#c33' : '#c80',
            background: v.level === 'hard' ? '#fef0f0' : '#fef8e8',
            color: v.level === 'hard' ? '#c33' : '#c80'
          }}
        >
          <Group justify="space-between" wrap="nowrap">
            <Text size="sm">
              {v.level === 'hard' ? '⛔ ' : '⚠ '}{v.message}
            </Text>
            <Group gap="xs">
              {v.level === 'hard' && <Button size="compact-xs" color="red">帮我修正 →</Button>}
              <Button size="compact-xs" variant="default">
                {v.level === 'hard' ? '承认此违反' : '知道了'}
              </Button>
            </Group>
          </Group>
        </Paper>
      ))}
    </Stack>
  )
}
