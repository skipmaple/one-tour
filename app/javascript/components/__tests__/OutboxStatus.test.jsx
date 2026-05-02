import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, act } from '@testing-library/react'
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
  router: { visit: vi.fn() },
}))

import { listByStatus } from '../../lib/outbox/queue'
import OutboxStatus from '../OutboxStatus'

const wrap = (ui) => <MantineProvider>{ui}</MantineProvider>

beforeEach(() => {
  vi.useFakeTimers()
  listByStatus.mockReset()
})
afterEach(() => {
  vi.useRealTimers()
})

describe('OutboxStatus', () => {
  it('renders nothing when both counts 0', async () => {
    listByStatus.mockResolvedValue([])
    await act(async () => {
      render(wrap(<OutboxStatus />))
      // 让 initial refresh + setState 在 act 内 flush
      await vi.advanceTimersByTimeAsync(50)
    })
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })

  it('shows pending count from IDB', async () => {
    listByStatus.mockImplementation((db, status) => {
      if (status === 'pending') return Promise.resolve([{ id: 1 }, { id: 2 }, { id: 3 }])
      return Promise.resolve([])
    })
    await act(async () => {
      render(wrap(<OutboxStatus />))
      // flush the initial refresh() call and its promise chain
      await vi.advanceTimersByTimeAsync(50)
    })
    expect(screen.getByText('3 条待同步')).toBeInTheDocument()
  })

  it('falls back gracefully when IDB throws (老浏览器)', async () => {
    listByStatus.mockRejectedValue(new Error('IDB unavailable'))
    await act(async () => {
      render(wrap(<OutboxStatus />))
      await vi.advanceTimersByTimeAsync(50)
    })
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })
})
