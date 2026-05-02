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
