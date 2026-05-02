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

  it('lists pending and failed rows with friendly error message', async () => {
    listByStatus.mockImplementation((db, status) => {
      if (status === 'pending') return Promise.resolve([
        { id: 1, resource_kind: 'expense', display_label: '¥85 午饭', status: 'pending', attempts: 0 },
      ])
      if (status === 'failed_permanent') return Promise.resolve([
        // last_error 是 friendlyError 输出的友好句子,不是 raw HTTP code / HTML
        { id: 2, resource_kind: 'note', display_label: 'Day 3 笔记', status: 'failed_permanent', attempts: 5, last_error: '这条已被同伴删除,无法同步' },
      ])
      return Promise.resolve([])
    })
    render(wrap(<OutboxDrawer opened onClose={() => {}} />))

    expect(await screen.findByText('¥85 午饭')).toBeInTheDocument()
    expect(screen.getByText('Day 3 笔记')).toBeInTheDocument()
    expect(screen.getByText('这条已被同伴删除,无法同步')).toBeInTheDocument()
    // 不应渲染 HTTP code / HTML
    expect(screen.queryByText(/HTTP \d{3}/)).not.toBeInTheDocument()
    expect(screen.queryByText(/<!DOCTYPE/)).not.toBeInTheDocument()
  })

  it('failed section header 用「没传上去」不用「失败」', async () => {
    listByStatus.mockImplementation((db, status) => {
      if (status === 'failed_permanent') return Promise.resolve([
        { id: 7, resource_kind: 'expense', display_label: '¥10', path: '/tours/1/expenses', status: 'failed_permanent', attempts: 5, last_error: '服务器拒绝了这条改动,请编辑后重试' },
      ])
      return Promise.resolve([])
    })
    render(wrap(<OutboxDrawer opened onClose={() => {}} />))

    expect(await screen.findByText(/没传上去\(1\)/)).toBeInTheDocument()
  })

  it('failed row 显示 [不传了] / [用服务端最新数据再来] buttons(口语化)', async () => {
    listByStatus.mockImplementation((db, status) => {
      if (status === 'failed_permanent') return Promise.resolve([
        { id: 7, resource_kind: 'expense', display_label: '¥10', path: '/tours/1/expenses', status: 'failed_permanent', attempts: 5, last_error: '...' },
      ])
      return Promise.resolve([])
    })
    render(wrap(<OutboxDrawer opened onClose={() => {}} />))

    expect(await screen.findByRole('button', { name: '不传了' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '用服务端最新数据再来' })).toBeInTheDocument()
  })

  it('clicking [不传了] calls deleteRow', async () => {
    listByStatus.mockImplementation((db, status) => {
      if (status === 'failed_permanent') return Promise.resolve([
        { id: 7, resource_kind: 'expense', display_label: '¥10', path: '/tours/1/expenses', status: 'failed_permanent', attempts: 5, last_error: 'X' },
      ])
      return Promise.resolve([])
    })
    deleteRow.mockResolvedValue()
    render(wrap(<OutboxDrawer opened onClose={() => {}} />))

    await userEvent.click(await screen.findByRole('button', { name: '不传了' }))
    expect(deleteRow).toHaveBeenCalledWith(expect.anything(), 7)
  })

  it('clicking [用服务端最新数据再来] calls router.visit with tour URL', async () => {
    const { router } = await import('@inertiajs/react')
    router.visit.mockClear()
    listByStatus.mockImplementation((db, status) => {
      if (status === 'failed_permanent') return Promise.resolve([
        { id: 7, resource_kind: 'expense', display_label: '¥10', path: '/tours/42/expenses', status: 'failed_permanent', attempts: 5, last_error: 'X' },
      ])
      return Promise.resolve([])
    })
    render(wrap(<OutboxDrawer opened onClose={vi.fn()} />))

    await userEvent.click(await screen.findByRole('button', { name: '用服务端最新数据再来' }))
    expect(router.visit).toHaveBeenCalledWith('/tours/42', expect.objectContaining({ onSuccess: expect.any(Function) }))
  })

  it('pending row 显示「正在重试 N/5」when attempts > 0(动词化)', async () => {
    listByStatus.mockImplementation((db, status) => {
      if (status === 'pending') return Promise.resolve([
        { id: 9, resource_kind: 'expense', display_label: '¥30', status: 'pending', attempts: 3 },
      ])
      return Promise.resolve([])
    })
    render(wrap(<OutboxDrawer opened onClose={() => {}} />))
    expect(await screen.findByText(/正在重试 3\/5/)).toBeInTheDocument()
  })

  it('pending row attempts=0 显示「等待联网」', async () => {
    listByStatus.mockImplementation((db, status) => {
      if (status === 'pending') return Promise.resolve([
        { id: 9, resource_kind: 'expense', display_label: '¥30', status: 'pending', attempts: 0 },
      ])
      return Promise.resolve([])
    })
    render(wrap(<OutboxDrawer opened onClose={() => {}} />))
    expect(await screen.findByText('等待联网')).toBeInTheDocument()
  })
})
