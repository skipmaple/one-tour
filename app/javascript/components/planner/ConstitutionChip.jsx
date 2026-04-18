import { Badge } from '@mantine/core'

const noop = () => {}

export default function ConstitutionChip({
  violations,
  onFix = noop,           // eslint-disable-line no-unused-vars
  onAcknowledge = noop,   // eslint-disable-line no-unused-vars
  onDismiss = noop,       // eslint-disable-line no-unused-vars
  readOnly = false,       // eslint-disable-line no-unused-vars
}) {
  if (!violations || violations.length === 0) return null

  const hasHard = violations.some(v => v.level === 'hard')
  const color = hasHard ? 'red' : 'yellow'
  const icon = hasHard ? '⛔' : '⚠'

  return (
    <Badge
      color={color}
      size="sm"
      data-testid="constitution-chip"
      style={{ cursor: 'pointer', userSelect: 'none' }}
    >
      {icon} {violations.length}
    </Badge>
  )
}
