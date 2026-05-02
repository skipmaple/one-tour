import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MantineProvider } from '@mantine/core'

import OutboxBadge from '../OutboxBadge'

const wrap = (ui) => <MantineProvider>{ui}</MantineProvider>

describe('OutboxBadge', () => {
  it('renders nothing when both counts 0', () => {
    render(wrap(<OutboxBadge pending={0} failed={0} onClick={() => {}} />))
    // MantineProvider 注 <style> 进 container,不能用 toBeEmptyDOMElement;
    // queryByRole('button') 是 null 即证明没渲 button(component 唯一的 DOM 输出)
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })

  it('renders pending only when pending > 0 / failed = 0', () => {
    render(wrap(<OutboxBadge pending={3} failed={0} onClick={() => {}} />))
    expect(screen.getByText('3 条待同步')).toBeInTheDocument()
  })

  it('renders failed only when failed > 0 / pending = 0(微文案不再用"失败")', () => {
    render(wrap(<OutboxBadge pending={0} failed={3} onClick={() => {}} />))
    expect(screen.getByText('3 条没传上去')).toBeInTheDocument()
  })

  it('renders BOTH counts (failed first) when both > 0', () => {
    // 早期实现:failed > 0 时 hide pending → 用户清掉 failed 后 pending 突现,体验跳。
    // 现版本合显避免这种"凭空冒出"。
    render(wrap(<OutboxBadge pending={2} failed={1} onClick={() => {}} />))
    expect(screen.getByText(/1 条没传上去 · 2 条待同步/)).toBeInTheDocument()
  })

  it('aria-label 含整段标签 + 点击提示', () => {
    render(wrap(<OutboxBadge pending={2} failed={1} onClick={() => {}} />))
    const btn = screen.getByRole('button')
    expect(btn.getAttribute('aria-label')).toBe('同步状态:1 条没传上去 · 2 条待同步,点击查看')
  })

  it('layout guard:whiteSpace=nowrap + flexShrink=0 防窄屏挤压换行', () => {
    render(wrap(<OutboxBadge pending={3} failed={0} onClick={() => {}} />))
    const btn = screen.getByRole('button')
    const cs = getComputedStyle(btn)
    expect(cs.whiteSpace).toBe('nowrap')
    expect(cs.flexShrink).toBe('0')
    // tap target 下限
    expect(parseInt(btn.style.minHeight)).toBeGreaterThanOrEqual(36)
  })

  it('extra style prop 合并(给 Mantine Transition 注 fade)', () => {
    render(wrap(<OutboxBadge pending={1} failed={0} onClick={() => {}} style={{ opacity: 0.5 }} />))
    const btn = screen.getByRole('button')
    expect(btn.style.opacity).toBe('0.5')
    // 内部样式仍生效
    expect(btn.style.borderRadius).toBe('18px')
  })

  it('clicking calls onClick', async () => {
    const onClick = vi.fn()
    render(wrap(<OutboxBadge pending={1} failed={0} onClick={onClick} />))
    await userEvent.click(screen.getByRole('button'))
    expect(onClick).toHaveBeenCalledTimes(1)
  })
})
