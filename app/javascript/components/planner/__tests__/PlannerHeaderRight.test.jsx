import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MantineProvider } from '@mantine/core'
import { describe, it, expect, vi } from 'vitest'
import PlannerHeaderRight from '../PlannerHeaderRight'

function renderHeader(props = {}) {
  const defaults = {
    violations: [],
    onOpenConst: vi.fn(),
    onOpenTimeline: vi.fn(),
    onOpenExpense: vi.fn(),
    onOpenMembers: vi.fn(),
  }
  const merged = { ...defaults, ...props }
  render(
    <MantineProvider>
      <PlannerHeaderRight {...merged} />
    </MantineProvider>,
  )
  return merged
}

describe('PlannerHeaderRight', () => {
  it('renders four icon buttons with accessible names', () => {
    renderHeader()
    expect(screen.getByRole('button', { name: '宪法' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '总览' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '账单' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '成员' })).toBeInTheDocument()
  })

  it('calls the matching handler on click', async () => {
    const user = userEvent.setup()
    const props = renderHeader()
    await user.click(screen.getByRole('button', { name: '宪法' }))
    await user.click(screen.getByRole('button', { name: '总览' }))
    await user.click(screen.getByRole('button', { name: '账单' }))
    await user.click(screen.getByRole('button', { name: '成员' }))
    expect(props.onOpenConst).toHaveBeenCalledTimes(1)
    expect(props.onOpenTimeline).toHaveBeenCalledTimes(1)
    expect(props.onOpenExpense).toHaveBeenCalledTimes(1)
    expect(props.onOpenMembers).toHaveBeenCalledTimes(1)
  })

  it('shows no indicator count when violations is empty', () => {
    renderHeader({ violations: [] })
    expect(screen.queryByText(/^\d+$/)).not.toBeInTheDocument()
  })

  it('shows indicator with count when only soft violations', () => {
    renderHeader({ violations: [{ level: 'soft', message: 'x' }, { level: 'soft', message: 'y' }] })
    expect(screen.getByText('2')).toBeInTheDocument()
  })

  it('shows indicator with count when any hard violation', () => {
    renderHeader({ violations: [{ level: 'hard', message: 'x' }, { level: 'soft', message: 'y' }] })
    expect(screen.getByText('2')).toBeInTheDocument()
  })
})
