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

  // Regression guard: Mantine Collapse's prop is `expanded` (v9+), not `in`.
  // The previous impl used `<Collapse in={open}>` which was silently ignored,
  // leaving the body stuck at display:none regardless of aria-expanded state.
  // Assert on the actual Collapse container style so a future prop rename gets
  // caught by the test suite (not just by a user seeing a broken UI).
  it('actually toggles Collapse container display (regression: use `expanded` prop)', () => {
    const { container } = wrap(
      <CollapsibleSection title="参与人" defaultOpen>
        <div>toggle body</div>
      </CollapsibleSection>
    )
    const header = screen.getByRole('button')
    // Initially open → Collapse container should NOT be display:none
    const collapseContainer = header.parentElement.children[1]
    expect(collapseContainer).toBeTruthy()
    expect(collapseContainer.style.display).not.toBe('none')
    // Click to close → Collapse container becomes display:none (after animation)
    fireEvent.click(header)
    expect(header).toHaveAttribute('aria-expanded', 'false')
    // Click to open again → display returns to not-none
    fireEvent.click(header)
    expect(header).toHaveAttribute('aria-expanded', 'true')
    expect(collapseContainer.style.display).not.toBe('none')
    // And its aria-hidden flips back to "false" (or missing)
    expect(collapseContainer.getAttribute('aria-hidden')).not.toBe('true')
  })
})
