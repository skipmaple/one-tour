import { useState } from 'react'
import { Collapse, Group, Text, UnstyledButton } from '@mantine/core'
import { IconChevronDown } from '@tabler/icons-react'

// Generic collapsible section used in the ActivityDrawer basic tab. Default
// state is driven by `defaultOpen` at mount; once the user clicks, local state
// wins (no re-syncing from the prop) — keeps the interaction feel local.
export default function CollapsibleSection({ title, summary, defaultOpen = false, children }) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div>
      <UnstyledButton
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        style={{ width: '100%', padding: '4px 0' }}
      >
        <Group justify="space-between" wrap="nowrap">
          <Group gap="xs" wrap="nowrap">
            <IconChevronDown
              size={16}
              style={{
                transition: 'transform 150ms',
                transform: open ? 'rotate(0deg)' : 'rotate(-90deg)',
              }}
            />
            <Text fw={500} size="sm">{title}</Text>
          </Group>
          {summary && <Text size="xs" c="dimmed">{summary}</Text>}
        </Group>
      </UnstyledButton>
      <Collapse expanded={open}>
        <div style={{ paddingTop: 8 }}>{children}</div>
      </Collapse>
    </div>
  )
}
