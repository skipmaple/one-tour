import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MantineProvider } from '@mantine/core'

vi.mock('../../lib/outbox/queue', () => ({
  openOutbox: vi.fn(() => Promise.resolve({ __fake: true })),
  listByStatus: vi.fn(),
  deleteRow: vi.fn(),
}))
vi.mock('../../lib/outbox/triggers', () => ({
  triggerNow: vi.fn(),
}))
vi.mock('@inertiajs/react', () => ({
  router: {
    visit: vi.fn(),
  },
}))

import { listByStatus, deleteRow } from '../../lib/outbox/queue'
import OutboxDrawer from '../OutboxDrawer'

const wrap = (ui) => <MantineProvider>{ui}</MantineProvider>

beforeEach(() => {
  listByStatus.mockReset()
  deleteRow.mockReset()
})

describe('OutboxDrawer', () => {
  it('shows empty state when no rows', async () => {
    listByStatus.mockResolvedValue([])
    render(wrap(<OutboxDrawer opened onClose={() => {}} />))
    expect(await screen.findByText(/队列为空/)).toBeInTheDocument()
  })

  it('lists pending and failed rows', async () => {
    listByStatus.mockImplementation((db, status) => {
      if (status === 'pending') return Promise.resolve([
        { id: 1, resource_kind: 'expense', display_label: '¥85 午饭', status: 'pending', attempts: 0 },
      ])
      if (status === 'failed_permanent') return Promise.resolve([
        { id: 2, resource_kind: 'note', display_label: 'Day 3 笔记', status: 'failed_permanent', attempts: 5, last_error: 'HTTP 404' },
      ])
      return Promise.resolve([])
    })
    render(wrap(<OutboxDrawer opened onClose={() => {}} />))

    expect(await screen.findByText('¥85 午饭')).toBeInTheDocument()
    expect(screen.getByText('Day 3 笔记')).toBeInTheDocument()
    expect(screen.getByText(/HTTP 404/)).toBeInTheDocument()
  })

  it('failed row shows [放弃] / [用最新数据重做] buttons', async () => {
    listByStatus.mockImplementation((db, status) => {
      if (status === 'failed_permanent') return Promise.resolve([
        { id: 7, resource_kind: 'expense', display_label: '¥10', path: '/tours/1/expenses', status: 'failed_permanent', attempts: 5, last_error: 'HTTP 404' },
      ])
      return Promise.resolve([])
    })
    render(wrap(<OutboxDrawer opened onClose={() => {}} />))

    expect(await screen.findByRole('button', { name: '放弃' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '用最新数据重做' })).toBeInTheDocument()
  })

  it('clicking [放弃] calls deleteRow', async () => {
    listByStatus.mockImplementation((db, status) => {
      if (status === 'failed_permanent') return Promise.resolve([
        { id: 7, resource_kind: 'expense', display_label: '¥10', path: '/tours/1/expenses', status: 'failed_permanent', attempts: 5, last_error: 'X' },
      ])
      return Promise.resolve([])
    })
    deleteRow.mockResolvedValue()
    render(wrap(<OutboxDrawer opened onClose={() => {}} />))

    await userEvent.click(await screen.findByRole('button', { name: '放弃' }))
    expect(deleteRow).toHaveBeenCalledWith(expect.anything(), 7)
  })
})
