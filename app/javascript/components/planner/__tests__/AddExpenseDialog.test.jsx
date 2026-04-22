import { render, screen, fireEvent } from '@testing-library/react'
import { MantineProvider } from '@mantine/core'
import { ModalsProvider } from '@mantine/modals'
import { Notifications } from '@mantine/notifications'
import { vi, beforeEach, describe, test, expect } from 'vitest'
import AddExpenseDialog from '../AddExpenseDialog'

vi.mock('@inertiajs/react', () => ({
  router: {
    post:  vi.fn((url, data, opts) => opts?.onSuccess?.()),
    patch: vi.fn((url, data, opts) => opts?.onSuccess?.()),
    delete: vi.fn((url, opts) => opts?.onSuccess?.()),
  },
}))

beforeEach(async () => {
  const { router } = await import('@inertiajs/react')
  router.post.mockClear()
  router.patch.mockClear()
  router.delete.mockClear()
})

// Two activities with distinct participant sets:
//   A-default   — participant_user_ids: []       (= 默认全员, 3 人都算)
//   B-just-Bob  — participant_user_ids: [2]      (= 仅 Bob)
const AUTHOR  = { user_id: 1, name: 'Alice', email: 'a@x', avatar_url: null }
const MEMBERS = [
  { user_id: 2, name: 'Bob',   email: 'b@x', avatar_url: null, role: 'editor' },
  { user_id: 3, name: 'Cindy', email: 'c@x', avatar_url: null, role: 'reader' },
]
const DAYS = [ { id: 1, day_index: 1 } ]
const ACTIVITIES = [
  { id: 10, day_id: 1, position: 1, name: 'A-default',  participant_user_ids: [] },
  { id: 20, day_id: 1, position: 2, name: 'B-just-Bob', participant_user_ids: [ 2 ] },
]

function renderDialog(props = {}) {
  const defaults = {
    opened: true,
    onClose: vi.fn(),
    tour: { id: 1, currency: 'CNY' },
    days: DAYS,
    activities: ACTIVITIES,
    members: MEMBERS,
    author: AUTHOR,
    expense: null,
  }
  return render(
    <MantineProvider>
      <ModalsProvider>
        <Notifications />
        <AddExpenseDialog {...defaults} {...props} />
      </ModalsProvider>
    </MantineProvider>
  )
}

// Mantine's <Select searchable> renders a readonly combobox input (user-event
// skips readonly inputs, so we drive it via fireEvent.click). Multiple selects
// in this dialog share labels with other elements — find the activity combobox
// by its distinctive placeholder.
function switchActivityTo(label) {
  const trigger = screen.getByPlaceholderText('选择某一行')
  fireEvent.click(trigger)
  const option = screen.getByRole('option', { name: label })
  fireEvent.click(option)
}

function checkboxFor(name) {
  // Participant checkbox's accessible name is derived from the UserLabel content
  // which includes the user's name. Mantine renders a native input + visible
  // label node; use a regex match on the role name.
  return screen.getByRole('checkbox', { name: new RegExp(name) })
}

describe('AddExpenseDialog – participantIds prefill', () => {
  test('initial open prefills from the default activity (A-default → 全员)', () => {
    renderDialog()

    expect(checkboxFor('Alice')).toBeChecked()
    expect(checkboxFor('Bob')).toBeChecked()
    expect(checkboxFor('Cindy')).toBeChecked()
  })

  test('initialActivityId prop also drives participantIds default', () => {
    renderDialog({
      activities: [
        { id: 10, day_id: 1, position: 1, name: 'A-default',  participant_user_ids: [] },
        { id: 20, day_id: 1, position: 2, name: 'B-just-Bob', participant_user_ids: [ 2 ] },
      ],
      initialActivityId: 20,
    })

    // B has only Bob → participant list should be [Bob], not "all users"
    expect(checkboxFor('Bob')).toBeChecked()
    expect(checkboxFor('Alice')).not.toBeChecked()
    expect(checkboxFor('Cindy')).not.toBeChecked()
  })

  test('switching activity re-prefills when user has not manually edited', () => {
    renderDialog()
    // Baseline: A-default → all three checked (from initial prefill).
    expect(checkboxFor('Alice')).toBeChecked()

    switchActivityTo('B-just-Bob')

    // B-just-Bob.participant_user_ids = [2] → only Bob should be checked.
    expect(checkboxFor('Alice')).not.toBeChecked()
    expect(checkboxFor('Bob')).toBeChecked()
    expect(checkboxFor('Cindy')).not.toBeChecked()
  })

  test('switching activity preserves manual edits (user intent wins)', () => {
    renderDialog()
    // User manually unchecks Cindy — this flips the "dirty" flag.
    fireEvent.click(checkboxFor('Cindy'))
    expect(checkboxFor('Cindy')).not.toBeChecked()
    expect(checkboxFor('Alice')).toBeChecked()
    expect(checkboxFor('Bob')).toBeChecked()

    // Now switch activity. The prefill MUST NOT run — user has diverged.
    switchActivityTo('B-just-Bob')

    expect(checkboxFor('Alice')).toBeChecked()    // user had it checked
    expect(checkboxFor('Bob')).toBeChecked()      // user had it checked
    expect(checkboxFor('Cindy')).not.toBeChecked() // user had unchecked it
  })
})
