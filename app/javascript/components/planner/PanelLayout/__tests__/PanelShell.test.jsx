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
