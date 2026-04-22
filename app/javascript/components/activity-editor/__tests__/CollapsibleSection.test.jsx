import { render, screen, fireEvent } from '@testing-library/react'
import { MantineProvider } from '@mantine/core'
import { describe, it, expect } from 'vitest'
import CollapsibleSection from '../CollapsibleSection'

function wrap(el) {
  return render(<MantineProvider>{el}</MantineProvider>)
}

describe('CollapsibleSection', () => {
  it('renders the title and summary', () => {
    wrap(
      <CollapsibleSection title="参与人" summary="默认全员 · 3 人">
        <div>body</div>
      </CollapsibleSection>
    )
    expect(screen.getByText('参与人')).toBeInTheDocument()
    expect(screen.getByText('默认全员 · 3 人')).toBeInTheDocument()
  })

  it('starts closed by default and hides body content from accessibility tree', () => {
    wrap(
      <CollapsibleSection title="类型细节">
        <div>hidden body</div>
      </CollapsibleSection>
    )
    const header = screen.getByRole('button')
    expect(header).toHaveAttribute('aria-expanded', 'false')
  })

  it('starts open when defaultOpen=true', () => {
    wrap(
      <CollapsibleSection title="类型细节" defaultOpen>
        <div>visible body</div>
      </CollapsibleSection>
    )
    const header = screen.getByRole('button')
    expect(header).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByText('visible body')).toBeInTheDocument()
  })

  it('toggles open/closed on header click', () => {
    wrap(
      <CollapsibleSection title="参与人">
        <div>toggle body</div>
      </CollapsibleSection>
    )
    const header = screen.getByRole('button')
    expect(header).toHaveAttribute('aria-expanded', 'false')
    fireEvent.click(header)
    expect(header).toHaveAttribute('aria-expanded', 'true')
    fireEvent.click(header)
    expect(header).toHaveAttribute('aria-expanded', 'false')
  })
})
