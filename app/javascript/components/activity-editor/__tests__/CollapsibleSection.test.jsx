import { render, screen, fireEvent, waitFor } from '@testing-library/react'
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
  // leaving the container permanently aria-hidden regardless of user clicks.
  // Assert on the Collapse container's `aria-hidden` — that's what Mantine's
  // useCollapse sets SYNCHRONOUSLY from the `expanded` prop (no animation
  // timing to wait on), so a future silent prop rename fails here immediately.
  it('toggles the Collapse container aria-hidden (regression: use `expanded` prop)', async () => {
    wrap(
      <CollapsibleSection title="参与人" defaultOpen>
        <div>toggle body</div>
      </CollapsibleSection>
    )
    const header = screen.getByRole('button')
    // Re-query each assertion so we never hold a stale DOM reference.
    const collapse = () => header.parentElement.children[1]

    // Initial (defaultOpen=true): aria-hidden must be false/absent
    expect(collapse().getAttribute('aria-hidden')).not.toBe('true')

    // Click → close. aria-expanded on the button flips synchronously;
    // wait for React commit before asserting on the Collapse container.
    fireEvent.click(header)
    await waitFor(() => expect(header).toHaveAttribute('aria-expanded', 'false'))
    expect(collapse().getAttribute('aria-hidden')).toBe('true')

    // Click → open. aria-hidden goes back to false.
    fireEvent.click(header)
    await waitFor(() => expect(header).toHaveAttribute('aria-expanded', 'true'))
    expect(collapse().getAttribute('aria-hidden')).not.toBe('true')
  })
})
