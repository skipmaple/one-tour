import { render, screen, fireEvent } from '@testing-library/react'
import { MantineProvider } from '@mantine/core'
import { describe, it, expect, vi } from 'vitest'
import ParticipantsSection from '../ParticipantsSection'

const AUTHOR = { user_id: 1, name: '作者', avatar_url: null, email: 'a@x.com' }
const MEMBERS = [
  { user_id: 2, name: '甲', avatar_url: null, email: 'b@x.com' },
  { user_id: 3, name: '乙', avatar_url: null, email: 'c@x.com' },
]

function wrap(el) {
  return render(<MantineProvider>{el}</MantineProvider>)
}

describe('ParticipantsSection', () => {
  it('shows 默认全员 alert and all checkboxes checked when value=null', () => {
    wrap(
      <ParticipantsSection author={AUTHOR} members={MEMBERS} canEdit value={null} onChange={() => {}} />
    )
    expect(screen.getByText(/默认全员/)).toBeInTheDocument()
    const boxes = screen.getAllByRole('checkbox')
    expect(boxes).toHaveLength(3)
    boxes.forEach((b) => expect(b).toBeChecked())
  })

  it('unchecks the clicked user and calls onChange with explicit list (not null)', () => {
    const onChange = vi.fn()
    wrap(
      <ParticipantsSection author={AUTHOR} members={MEMBERS} canEdit value={null} onChange={onChange} />
    )
    // Uncheck "甲" (user 2)
    fireEvent.click(screen.getByLabelText(/甲/))
    expect(onChange).toHaveBeenCalledWith([ 1, 3 ])
  })

  it('checks the clicked user and calls onChange with null when that makes everyone selected', () => {
    const onChange = vi.fn()
    wrap(
      <ParticipantsSection
        author={AUTHOR} members={MEMBERS} canEdit
        value={[ 1, 2 ]}
        onChange={onChange}
      />
    )
    // Check "乙" (user 3) → all three checked → normalize to null
    fireEvent.click(screen.getByLabelText(/乙/))
    expect(onChange).toHaveBeenCalledWith(null)
  })

  it('passes null when unchecking results in empty selection', () => {
    const onChange = vi.fn()
    wrap(
      <ParticipantsSection
        author={AUTHOR} members={MEMBERS} canEdit
        value={[ 2 ]}
        onChange={onChange}
      />
    )
    fireEvent.click(screen.getByLabelText(/甲/)) // uncheck user 2
    expect(onChange).toHaveBeenCalledWith(null)
  })

  it('disables checkboxes when canEdit=false', () => {
    wrap(
      <ParticipantsSection author={AUTHOR} members={MEMBERS} canEdit={false} value={null} onChange={() => {}} />
    )
    screen.getAllByRole('checkbox').forEach((b) => expect(b).toBeDisabled())
  })
})
