import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MantineProvider } from '@mantine/core'

vi.mock('../../lib/outbox/triggers', () => ({
  triggerNow: vi.fn(),
}))

import { triggerNow } from '../../lib/outbox/triggers'
import OutboxBadge from '../OutboxBadge'

const wrap = (ui) => <MantineProvider>{ui}</MantineProvider>

beforeEach(() => triggerNow.mockClear())

describe('OutboxBadge', () => {
  it('renders nothing when both counts 0', () => {
    render(wrap(<OutboxBadge pending={0} failed={0} onClick={() => {}} />))
    expect(document.querySelector('button')).toBeNull()
  })

  it('renders pending count when pending > 0', () => {
    render(wrap(<OutboxBadge pending={3} failed={0} onClick={() => {}} />))
    expect(screen.getByText('3 条待同步')).toBeInTheDocument()
  })

  it('renders failed count (red) when failed > 0 (priority over pending)', () => {
    render(wrap(<OutboxBadge pending={2} failed={1} onClick={() => {}} />))
    expect(screen.getByText('1 条失败')).toBeInTheDocument()
    expect(screen.queryByText('2 条待同步')).not.toBeInTheDocument()
  })

  it('clicking calls onClick', async () => {
    const onClick = vi.fn()
    render(wrap(<OutboxBadge pending={1} failed={0} onClick={onClick} />))
    await userEvent.click(screen.getByRole('button'))
    expect(onClick).toHaveBeenCalledTimes(1)
  })
})
