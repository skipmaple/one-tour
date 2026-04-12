import { useState } from 'react'
import { Paper, Title, Text, Group, Badge, Stack, ScrollArea, Collapse } from '@mantine/core'
import MapPreview from '../../components/MapPreview'

export default function Show({ guidebook }) {
  const fm = guidebook.frontmatter || {}
  const days = fm.days || []
  const [activeDayIndex, setActiveDayIndex] = useState(null)

  return (
    <div style={{ display: 'flex', height: 'calc(100vh - 56px - 32px)' }}>
      {/* Left: Map */}
      <div style={{ flex: 1 }}>
        <MapPreview frontmatter={fm} />
      </div>

      {/* Right: Sidebar */}
      <Paper
        shadow="md"
        style={{
          width: 380,
          height: '100%',
          overflow: 'hidden',
          borderLeft: '1px solid var(--mantine-color-gray-3)',
        }}
      >
        <ScrollArea h="100%" type="auto" offsetScrollbars>
          <Stack p="md" gap="sm">
            <Title order={3}>{guidebook.title}</Title>
            {fm.date_range && <Text size="sm" c="dimmed">{fm.date_range}</Text>}

            <Group gap="xs">
              {fm.total_km && <Badge variant="light">{fm.total_km} km</Badge>}
              {fm.team_size && <Badge variant="light">{fm.team_size} people</Badge>}
              {fm.vehicle && <Badge variant="light">{fm.vehicle}</Badge>}
            </Group>

            {days.map((day, idx) => (
              <DayCard
                key={day.day}
                day={day}
                active={activeDayIndex === idx}
                onClick={() => setActiveDayIndex(activeDayIndex === idx ? null : idx)}
              />
            ))}
          </Stack>
        </ScrollArea>
      </Paper>
    </div>
  )
}

const INTENSITY_BADGE = {
  green: { color: 'green', label: 'Easy' },
  yellow: { color: 'yellow', label: 'Medium' },
  red: { color: 'red', label: 'Hard' },
}

function DayCard({ day, active, onClick }) {
  const badge = INTENSITY_BADGE[day.intensity] || INTENSITY_BADGE.green

  return (
    <Paper
      withBorder
      p="sm"
      radius="md"
      style={{ cursor: 'pointer', background: active ? 'var(--mantine-color-blue-0)' : undefined }}
      onClick={onClick}
    >
      <Group justify="space-between">
        <Group gap="xs">
          <Badge circle size="lg" color={badge.color}>{day.day}</Badge>
          <div>
            <Text size="sm" fw={600}>{day.title}</Text>
            {day.km > 0 && <Text size="xs" c="dimmed">{day.km} km</Text>}
          </div>
        </Group>
      </Group>

      <Collapse in={active}>
        <Stack gap="xs" mt="sm">
          {(day.highlights || []).map((hl, i) => (
            <Text key={i} size="xs" c="dimmed">• {hl.name}</Text>
          ))}
        </Stack>
      </Collapse>
    </Paper>
  )
}
