import { Paper, Group, Text, UnstyledButton, Tooltip } from '@mantine/core'

/**
 * Generic panel container — header (title + icon + extra slot + collapse button)
 * over body content. When open=false, renders a 40px vertical rail with the icon
 * and a vertical label that expands on click.
 *
 * Props:
 *   title            string  — header title
 *   icon             ReactNode — icon element (Tabler icon component) shown in
 *                                header and collapsed rail. Accepts any node for
 *                                flexibility (small badge, svg, etc.)
 *   open             bool    — whether to render full panel or rail
 *   onToggle         fn      — called on collapse/expand button click
 *   canToggle        bool    — false → collapse button disabled with tooltip
 *   flexStyle        object  — passed to wrapping Paper's style (flex + minWidth)
 *   headerExtra      node    — optional slot in header (left of collapse button)
 *   children         node    — body content (rendered when open)
 */
export default function PanelShell({
  title,
  icon,
  open,
  onToggle,
  canToggle = true,
  flexStyle,
  headerExtra,
  hideToggle = false,
  bare = false,
  children,
}) {
  if (!open) {
    return (
      <UnstyledButton
        onClick={onToggle}
        aria-label={`展开 ${title}`}
        style={{
          ...flexStyle,
          background: '#f3f3f3',
          border: '1px solid var(--mantine-color-default-border)',
          borderRadius: 4,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'flex-start',
          padding: '8px 0',
          gap: 6,
          cursor: 'pointer',
        }}
      >
        <Text size="sm">›</Text>
        <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--mantine-color-gray-7)' }}>
          {icon}
        </span>
        <Text size="xs" c="gray.7" style={{ writingMode: 'vertical-rl', marginTop: 4 }}>
          {title}
        </Text>
      </UnstyledButton>
    )
  }

  // Mobile single-panel mode: drop the bordered card + header chrome; the bottom
  // tab bar already labels the active panel, so the panel content goes full-bleed.
  if (bare) {
    return (
      <div style={{ ...flexStyle, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          {children}
        </div>
      </div>
    )
  }

  const collapseButton = (
    <UnstyledButton
      onClick={canToggle ? onToggle : undefined}
      disabled={!canToggle}
      aria-label="折叠"
      style={{
        color: canToggle ? '#999' : '#ccc',
        cursor: canToggle ? 'pointer' : 'not-allowed',
        fontSize: 14,
        lineHeight: 1,
        padding: '0 4px',
      }}
    >
      ‹
    </UnstyledButton>
  )

  return (
    <Paper withBorder style={{ ...flexStyle, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <Group justify="space-between" px="xs" py={6} bg="gray.1" style={{ borderBottom: '1px solid var(--mantine-color-default-border)' }}>
        <Group gap={6} wrap="nowrap" align="center" style={{ color: 'var(--mantine-color-dimmed)' }}>
          {icon}
          <Text size="xs" fw={600} c="dimmed">{title}</Text>
        </Group>
        <Group gap={6}>
          {headerExtra}
          {!hideToggle && (canToggle ? collapseButton : (
            <Tooltip label="至少保留一个面板打开" withArrow>
              <span>{collapseButton}</span>
            </Tooltip>
          ))}
        </Group>
      </Group>
      <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        {children}
      </div>
    </Paper>
  )
}
