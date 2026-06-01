import { UnstyledButton, Text } from '@mantine/core'
import { IconInbox, IconCalendarEvent, IconMap2, IconSparkles } from '@tabler/icons-react'

export const PLANNER_TABS = [
  { id: 'candidates', label: '候选', Icon: IconInbox },
  { id: 'days', label: '日程', Icon: IconCalendarEvent },
  { id: 'map', label: '地图', Icon: IconMap2 },
  { id: 'ai', label: 'AI', Icon: IconSparkles },
]

export default function MobilePlannerTabs({ active, onChange }) {
  return (
    <nav aria-label="规划器面板切换" style={{ display: 'flex', flexShrink: 0, background: '#fff', borderTop: '1px solid var(--mantine-color-default-border)', boxShadow: '0 -2px 8px rgba(0,0,0,0.05)' }}>
      {PLANNER_TABS.map(({ id, label, Icon }) => {
        const on = active === id
        return (
          <UnstyledButton key={id} onClick={() => onChange(id)} aria-label={label} aria-current={on ? 'page' : undefined}
            style={{ flex: 1, minHeight: 52, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 2,
                     color: on ? 'var(--mantine-color-blue-6)' : 'var(--mantine-color-gray-6)' }}>
            <Icon size={22} stroke={on ? 2 : 1.6} />
            <Text fz={10} fw={on ? 600 : 400}>{label}</Text>
          </UnstyledButton>
        )
      })}
    </nav>
  )
}
