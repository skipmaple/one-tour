import { render, screen, fireEvent } from '@testing-library/react'
import { describe, test, expect, vi } from 'vitest'
import { MantineProvider } from '@mantine/core'
import PanelShell from '../PanelShell'

function renderShell(props = {}) {
  return render(
    <MantineProvider>
      <PanelShell
        title="候选"
        icon="📋"
        open={true}
        onToggle={() => {}}
        canToggle={true}
        flexStyle={{ flex: '2 1 0', minWidth: 64 }}
        {...props}
      >
        <div>panel content</div>
      </PanelShell>
    </MantineProvider>
  )
}

describe('PanelShell · open state', () => {
  test('renders header with title + icon', () => {
    renderShell()
    expect(screen.getByText(/候选/)).toBeInTheDocument()
    expect(screen.getByText(/📋/)).toBeInTheDocument()
  })

  test('renders children inside the body', () => {
    renderShell()
    expect(screen.getByText('panel content')).toBeInTheDocument()
  })

  test('clicking the collapse button calls onToggle', () => {
    const onToggle = vi.fn()
    renderShell({ onToggle })
    fireEvent.click(screen.getByLabelText('折叠'))
    expect(onToggle).toHaveBeenCalledOnce()
  })

  test('renders headerExtra slot when provided', () => {
    renderShell({ headerExtra: <span data-testid="extra-slot">📐</span> })
    expect(screen.getByTestId('extra-slot')).toBeInTheDocument()
  })
})

describe('PanelShell · collapsed rail', () => {
  test('renders rail with icon + vertical label when open=false', () => {
    renderShell({ open: false })
    expect(screen.getByText('📋')).toBeInTheDocument()
    expect(screen.getByText('候选')).toBeInTheDocument()
    expect(screen.getByLabelText('展开 候选')).toBeInTheDocument()
  })

  test('clicking the rail calls onToggle (expand)', () => {
    const onToggle = vi.fn()
    renderShell({ open: false, onToggle })
    fireEvent.click(screen.getByLabelText('展开 候选'))
    expect(onToggle).toHaveBeenCalledOnce()
  })

  test('rail does NOT render children', () => {
    renderShell({ open: false })
    expect(screen.queryByText('panel content')).not.toBeInTheDocument()
  })
})

describe('PanelShell · canToggle=false (last open)', () => {
  test('collapse button is disabled', () => {
    renderShell({ canToggle: false })
    expect(screen.getByLabelText('折叠')).toBeDisabled()
  })

  test('clicking disabled collapse button does NOT call onToggle', () => {
    const onToggle = vi.fn()
    renderShell({ canToggle: false, onToggle })
    fireEvent.click(screen.getByLabelText('折叠'))
    expect(onToggle).not.toHaveBeenCalled()
  })
})
