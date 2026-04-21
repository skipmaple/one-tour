import { Drawer, Stack } from '@mantine/core'

// Read-only detail view for a single Activity. Unified entry point for all
// roles when clicking an activity card — author/editor see [+ 记一笔] and
// [编辑] buttons; reader sees only the close button.
//
// Sections (from top to bottom, single-column scroll):
//   1. Header       — name + meta + action buttons
//   2. Location     — address + coords + kind-specific fields + mini-map
//   3. Description  — activity.desc (hidden when empty)
//   4. Gallery      — image thumbnails (hidden when empty)
//   5. Participants — read-only roster (default-全员 or explicit list)
//   6. Expenses     — activity-scope expense list + summary + [+ 记一笔]
//
// All data comes from props supplied by Tour/Show.jsx — zero network calls
// in this component. "记一笔" and "编辑" delegate to callback props; the
// parent wires them to AddExpenseDialog / ActivityDrawer.
export default function ActivityDetailDrawer({
  opened, onClose,
  tour, days, activity, activityImages, author, members, expenses,
  canEdit,
  onEdit, onAddExpense, onFocusExpense,
}) {
  return (
    <Drawer
      opened={opened}
      onClose={onClose}
      position="right"
      size={480}
      padding="md"
      withCloseButton
      closeButtonProps={{ 'aria-label': 'Close' }}
      title={activity ? activity.name : null}
    >
      {activity && (
        <Stack gap="md">
          {/* Sections plugged in by Tasks 4-8 */}
        </Stack>
      )}
    </Drawer>
  )
}
