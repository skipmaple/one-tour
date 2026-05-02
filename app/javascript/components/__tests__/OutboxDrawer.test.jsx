import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MantineProvider } from '@mantine/core'
import { ModalsProvider } from '@mantine/modals'

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
vi.mock('@mantine/notifications', () => ({
  notifications: {
    show: vi.fn(),
  },
}))

import { listByStatus, deleteRow } from '../../lib/outbox/queue'
import OutboxDrawer from '../OutboxDrawer'

// Drawer 用 modals.openConfirmModal 做 destructive 二次确认。
// 测试需要 ModalsProvider 包一层让 modals API 实际工作。
const wrap = (ui) => (
  <MantineProvider>
    <ModalsProvider>{ui}</ModalsProvider>
  </MantineProvider>
)

beforeEach(() => {
  listByStatus.mockReset()
  deleteRow.mockReset()
})

describe('OutboxDrawer', () => {
  it('empty state:友好正向反馈"全部同步完成 ✓"', async () => {
    listByStatus.mockResolvedValue([])
    render(wrap(<OutboxDrawer opened onClose={() => {}} />))
    expect(await screen.findByText(/全部同步完成/)).toBeInTheDocument()
  })

  it('lists pending and failed rows with friendly error message', async () => {
    listByStatus.mockImplementation((db, status) => {
      if (status === 'pending') return Promise.resolve([
        { id: 1, resource_kind: 'expense', display_label: '¥85 午饭', status: 'pending', attempts: 0 },
      ])
      if (status === 'failed_permanent') return Promise.resolve([
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

  it('failed section header 用「没传上去」+ fw=600 + 红色 token 一致', async () => {
    listByStatus.mockImplementation((db, status) => {
      if (status === 'failed_permanent') return Promise.resolve([
        { id: 7, resource_kind: 'expense', display_label: '¥10', path: '/tours/1/expenses', status: 'failed_permanent', attempts: 5, last_error: '...' },
      ])
      return Promise.resolve([])
    })
    render(wrap(<OutboxDrawer opened onClose={() => {}} />))

    const header = await screen.findByText(/没传上去\(1\)/)
    const cs = getComputedStyle(header)
    // 红色 token 跟 OutboxBadge 同源 #c92a2a(red.7)
    expect(cs.color).toBe('rgb(201, 42, 42)')
    expect(cs.fontWeight).toBe('600')
  })

  it('failed row 显示 [不传了] / [重新填一遍] buttons(口语化,微文案 P2 polish)', async () => {
    listByStatus.mockImplementation((db, status) => {
      if (status === 'failed_permanent') return Promise.resolve([
        { id: 7, resource_kind: 'expense', display_label: '¥10', path: '/tours/1/expenses', status: 'failed_permanent', attempts: 5, last_error: '...' },
      ])
      return Promise.resolve([])
    })
    render(wrap(<OutboxDrawer opened onClose={() => {}} />))

    expect(await screen.findByRole('button', { name: '不传了' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '重新填一遍' })).toBeInTheDocument()
  })

  it('clicking [不传了] 弹 modal 二次确认(P0 数据安全 — 误触不丢失)', async () => {
    listByStatus.mockImplementation((db, status) => {
      if (status === 'failed_permanent') return Promise.resolve([
        { id: 7, resource_kind: 'expense', display_label: '¥85 午饭', path: '/tours/1/expenses', status: 'failed_permanent', attempts: 5, last_error: 'X' },
      ])
      return Promise.resolve([])
    })
    deleteRow.mockResolvedValue()
    render(wrap(<OutboxDrawer opened onClose={() => {}} />))

    await userEvent.click(await screen.findByRole('button', { name: '不传了' }))

    // Modal 跟 Drawer 都是 role=dialog,用 accessible-name 锁定 modal
    const modal = await screen.findByRole('dialog', { name: '丢弃这条改动?' })
    expect(within(modal).getByText(/¥85 午饭/)).toBeInTheDocument()

    // 没确认前不能删
    expect(deleteRow).not.toHaveBeenCalled()

    // 点 [丢弃] 确认 → 删
    await userEvent.click(within(modal).getByRole('button', { name: '丢弃' }))
    await waitFor(() => expect(deleteRow).toHaveBeenCalledWith(expect.anything(), 7))
  })

  it('clicking [不传了] 然后取消 → 不删', async () => {
    listByStatus.mockImplementation((db, status) => {
      if (status === 'failed_permanent') return Promise.resolve([
        { id: 7, resource_kind: 'expense', display_label: '¥10', path: '/tours/1/expenses', status: 'failed_permanent', attempts: 5, last_error: 'X' },
      ])
      return Promise.resolve([])
    })
    deleteRow.mockResolvedValue()
    render(wrap(<OutboxDrawer opened onClose={() => {}} />))

    await userEvent.click(await screen.findByRole('button', { name: '不传了' }))
    await userEvent.click(await screen.findByRole('button', { name: '保留' }))
    expect(deleteRow).not.toHaveBeenCalled()
  })

  it('failed >=2 时显「全部丢弃」批量按钮(出行结束清队列场景)', async () => {
    listByStatus.mockImplementation((db, status) => {
      if (status === 'failed_permanent') return Promise.resolve([
        { id: 1, resource_kind: 'expense', display_label: '¥10', path: '/tours/1/expenses', status: 'failed_permanent', attempts: 5, last_error: 'X' },
        { id: 2, resource_kind: 'note', display_label: 'note', path: '/tours/1/days/1', status: 'failed_permanent', attempts: 5, last_error: 'X' },
      ])
      return Promise.resolve([])
    })
    render(wrap(<OutboxDrawer opened onClose={() => {}} />))
    expect(await screen.findByRole('button', { name: '全部丢弃' })).toBeInTheDocument()
  })

  it('failed = 1 时不显「全部丢弃」(单条用 row 自己的按钮即可)', async () => {
    listByStatus.mockImplementation((db, status) => {
      if (status === 'failed_permanent') return Promise.resolve([
        { id: 1, resource_kind: 'expense', display_label: '¥10', path: '/tours/1/expenses', status: 'failed_permanent', attempts: 5, last_error: 'X' },
      ])
      return Promise.resolve([])
    })
    render(wrap(<OutboxDrawer opened onClose={() => {}} />))
    await screen.findByRole('button', { name: '不传了' })
    expect(screen.queryByRole('button', { name: '全部丢弃' })).not.toBeInTheDocument()
  })

  it('clicking 全部丢弃 弹批量 confirm → 确认后全删', async () => {
    listByStatus.mockImplementation((db, status) => {
      if (status === 'failed_permanent') return Promise.resolve([
        { id: 1, resource_kind: 'expense', display_label: 'a', path: '/tours/1/expenses', status: 'failed_permanent', attempts: 5, last_error: 'X' },
        { id: 2, resource_kind: 'note', display_label: 'b', path: '/tours/1/days/1', status: 'failed_permanent', attempts: 5, last_error: 'X' },
        { id: 3, resource_kind: 'photo', display_label: 'c', path: '/activities/1/images', status: 'failed_permanent', attempts: 5, last_error: 'X' },
      ])
      return Promise.resolve([])
    })
    deleteRow.mockResolvedValue()
    render(wrap(<OutboxDrawer opened onClose={() => {}} />))

    await userEvent.click(await screen.findByRole('button', { name: '全部丢弃' }))
    const modal = await screen.findByRole('dialog', { name: /丢弃所有 3 条没传上去的改动\?/ })

    // modal confirm 文案是 '确认丢弃',跟触发按钮 '全部丢弃' 区分
    await userEvent.click(within(modal).getByRole('button', { name: '确认丢弃' }))
    await waitFor(() => expect(deleteRow).toHaveBeenCalledTimes(3))
    expect(deleteRow).toHaveBeenCalledWith(expect.anything(), 1)
    expect(deleteRow).toHaveBeenCalledWith(expect.anything(), 2)
    expect(deleteRow).toHaveBeenCalledWith(expect.anything(), 3)
  })

  it('clicking [重新填一遍] for /tours/N/... → router.visit /tours/N + onSuccess delete + notification', async () => {
    const { router } = await import('@inertiajs/react')
    const { notifications } = await import('@mantine/notifications')
    router.visit.mockClear()
    notifications.show.mockClear()

    listByStatus.mockImplementation((db, status) => {
      if (status === 'failed_permanent') return Promise.resolve([
        { id: 7, resource_kind: 'expense', display_label: '¥10 早餐', path: '/tours/42/expenses', status: 'failed_permanent', attempts: 5, last_error: 'X' },
      ])
      return Promise.resolve([])
    })
    deleteRow.mockResolvedValue()
    render(wrap(<OutboxDrawer opened onClose={vi.fn()} />))

    await userEvent.click(await screen.findByRole('button', { name: '重新填一遍' }))
    expect(router.visit).toHaveBeenCalledWith('/tours/42', expect.objectContaining({ onSuccess: expect.any(Function) }))

    // 模拟 onSuccess 触发(用户跳到目标页)
    const visitOpts = router.visit.mock.calls[0][1]
    await visitOpts.onSuccess()
    expect(deleteRow).toHaveBeenCalledWith(expect.anything(), 7)
    expect(notifications.show).toHaveBeenCalledWith(expect.objectContaining({
      title: expect.stringContaining('请重新填一遍'),
    }))
  })

  it('clicking [重新填一遍] for activity-scoped path(P0 fix:之前 redo_target=null)', async () => {
    const { router } = await import('@inertiajs/react')
    router.visit.mockClear()

    // 模拟 user 在 /tours/99 上(window.location)
    delete window.location
    window.location = new URL('https://example.com/tours/99')

    listByStatus.mockImplementation((db, status) => {
      if (status === 'failed_permanent') return Promise.resolve([
        { id: 5, resource_kind: 'activity_edit', display_label: '改活动', path: '/activities/2', status: 'failed_permanent', attempts: 5, last_error: 'X' },
      ])
      return Promise.resolve([])
    })
    render(wrap(<OutboxDrawer opened onClose={vi.fn()} />))

    await userEvent.click(await screen.findByRole('button', { name: '重新填一遍' }))
    // fallback 到当前 tour 上下文(/tours/99)
    expect(router.visit).toHaveBeenCalledWith('/tours/99', expect.anything())
  })

  it('pending row 显示「已重试 N 次 / 共 5 次」when attempts > 0', async () => {
    listByStatus.mockImplementation((db, status) => {
      if (status === 'pending') return Promise.resolve([
        { id: 9, resource_kind: 'expense', display_label: '¥30', status: 'pending', attempts: 3 },
      ])
      return Promise.resolve([])
    })
    render(wrap(<OutboxDrawer opened onClose={() => {}} />))
    expect(await screen.findByText('已重试 3 次 / 共 5 次')).toBeInTheDocument()
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

  it('display_label truncate when 过长(防撑爆 row 布局)', async () => {
    const long = '改"独库北段日落点"开始时间(原 18:00 → 19:30,等阴影回到山谷再走)'
    listByStatus.mockImplementation((db, status) => {
      if (status === 'failed_permanent') return Promise.resolve([
        { id: 1, resource_kind: 'activity_edit', display_label: long, path: '/tours/1/activities', status: 'failed_permanent', attempts: 5, last_error: 'X' },
      ])
      return Promise.resolve([])
    })
    render(wrap(<OutboxDrawer opened onClose={() => {}} />))
    const labelEl = await screen.findByText(long)
    // Mantine truncate prop 转 data-truncate 并加 ellipsis 样式
    // hover title attr 用于完整内容
    expect(labelEl.getAttribute('title')).toBe(long)
  })
})
