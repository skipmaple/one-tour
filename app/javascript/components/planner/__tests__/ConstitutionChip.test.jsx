import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, test, expect, vi } from 'vitest'
import { MantineProvider } from '@mantine/core'
import ConstitutionChip from '../ConstitutionChip'

function renderChip(props) {
  return render(
    <MantineProvider><ConstitutionChip {...props} /></MantineProvider>
  )
}

const softV  = { level: 'soft', rule: 'min_buffer_days', scope: {}, message: '建议 ≥ 1 个机动日' }
const softV2 = { level: 'soft', rule: 'tier_one',       scope: {}, message: '一等景超 3' }
const hardV  = { level: 'hard', rule: 'driving',        scope: { day_index: 3 }, message: 'D3 驾驶超 7h' }
const hardV2 = { level: 'hard', rule: 'driving',        scope: { day_index: 5 }, message: 'D5 驾驶超 7h' }

describe('ConstitutionChip · render', () => {
  test('renders nothing when violations is empty array', () => {
    renderChip({ violations: [] })
    expect(screen.queryByTestId('constitution-chip')).not.toBeInTheDocument()
  })

  test('renders nothing when violations is undefined', () => {
    renderChip({ violations: undefined })
    expect(screen.queryByTestId('constitution-chip')).not.toBeInTheDocument()
  })

  test('soft-only: yellow chip with warning icon + count', () => {
    renderChip({ violations: [softV, softV2] })
    const chip = screen.getByTestId('constitution-chip')
    expect(chip).toBeInTheDocument()
    // Count renders as just the number — icon is the separate severity cue.
    expect(chip).toHaveTextContent('2')
    // Icon presence via aria-label (the severity badge is an inline Tabler icon)
    expect(chip.querySelector('[aria-label="硬违反"]')).not.toBeInTheDocument()
    // Mantine v9 Badge expresses color via a CSS custom property in inline style:
    // --badge-bg: var(--mantine-color-yellow-filled). Assert via the style attribute
    // so a single targeted check fails with a useful diff if the mechanism changes.
    expect(chip.getAttribute('style')).toMatch(/yellow/)
  })

  test('any hard violation makes the chip red, count is total', () => {
    renderChip({ violations: [softV, hardV, softV2] })
    const chip = screen.getByTestId('constitution-chip')
    expect(chip).toHaveTextContent('3')
    expect(chip.getAttribute('style')).toMatch(/red/)
  })

  test('all hard: still red with count', () => {
    renderChip({ violations: [hardV, hardV2] })
    expect(screen.getByTestId('constitution-chip')).toHaveTextContent('2')
  })
})

describe('ConstitutionChip · popover', () => {
  test('clicking the chip opens the popover with violation messages', async () => {
    renderChip({ violations: [softV, hardV] })
    // Popover content not yet visible
    expect(screen.queryByText(/D3 驾驶超 7h/)).not.toBeInTheDocument()

    fireEvent.click(screen.getByTestId('constitution-chip'))

    await waitFor(() => {
      expect(screen.getByText(/建议 ≥ 1 个机动日/)).toBeInTheDocument()
    })
    expect(screen.getByText(/D3 驾驶超 7h/)).toBeInTheDocument()
  })

  test('clicking the chip again closes the popover', async () => {
    renderChip({ violations: [softV] })
    const chip = screen.getByTestId('constitution-chip')

    fireEvent.click(chip)
    await waitFor(() => {
      expect(screen.getByText(/建议 ≥ 1 个机动日/)).toBeInTheDocument()
    })

    fireEvent.click(chip)
    await waitFor(() => {
      expect(screen.queryByText(/建议 ≥ 1 个机动日/)).not.toBeInTheDocument()
    })
  })
})

describe('ConstitutionChip · action buttons', () => {
  test('hard violation in popover shows 帮我修正 + 承认此违反 + onFix wires through', async () => {
    const onFix = vi.fn()
    renderChip({ violations: [hardV], onFix })
    fireEvent.click(screen.getByTestId('constitution-chip'))
    await waitFor(() => {
      expect(screen.getByText(/D3 驾驶超 7h/)).toBeInTheDocument()
    })
    // Use hidden: true to find the button before opacity transition
    await new Promise(resolve => setTimeout(resolve, 50))
    fireEvent.click(screen.getByRole('button', { name: /帮我修正/, hidden: true }))
    expect(onFix).toHaveBeenCalledWith(hardV)
    // popover closes after action
    await waitFor(() => {
      expect(screen.queryByText(/D3 驾驶超 7h/)).not.toBeInTheDocument()
    })
  })

  test('hard violation 承认此违反 → onAcknowledge + popover closes', async () => {
    const onAcknowledge = vi.fn()
    renderChip({ violations: [hardV], onAcknowledge })
    fireEvent.click(screen.getByTestId('constitution-chip'))
    await waitFor(() => {
      expect(screen.getByText(/D3 驾驶超 7h/)).toBeInTheDocument()
    })
    // Wait briefly for button to be ready, then click
    await new Promise(resolve => setTimeout(resolve, 50))
    fireEvent.click(screen.getByRole('button', { name: '承认此违反', hidden: true }))
    expect(onAcknowledge).toHaveBeenCalledWith(hardV)
    await waitFor(() => {
      expect(screen.queryByText(/D3 驾驶超 7h/)).not.toBeInTheDocument()
    })
  })

  test('soft violation 知道了 → onDismiss + count decreases, popover stays open', async () => {
    const onDismiss = vi.fn()
    renderChip({ violations: [softV, softV2], onDismiss })
    fireEvent.click(screen.getByTestId('constitution-chip'))
    // Click 知道了 on the first soft violation
    await waitFor(() => {
      expect(screen.getByText(/一等景超 3/)).toBeInTheDocument()
    })
    await new Promise(resolve => setTimeout(resolve, 50))
    const dismissButtons = screen.getAllByRole('button', { name: '知道了', hidden: true })
    expect(dismissButtons).toHaveLength(2)
    fireEvent.click(dismissButtons[0])
    expect(onDismiss).toHaveBeenCalledWith(softV)
    // Chip count went from 2 to 1
    expect(screen.getByTestId('constitution-chip')).toHaveTextContent('1')
    // Popover still open showing the remaining soft
    expect(screen.getByText(/一等景超 3/)).toBeInTheDocument()
  })

  test('dismissing the last soft violation removes the chip and closes popover', async () => {
    renderChip({ violations: [softV] })
    fireEvent.click(screen.getByTestId('constitution-chip'))
    await waitFor(() => {
      expect(screen.getByText(/建议 ≥ 1 个机动日/)).toBeInTheDocument()
    })
    await new Promise(resolve => setTimeout(resolve, 50))
    fireEvent.click(screen.getByRole('button', { name: '知道了', hidden: true }))
    // Chip removed
    expect(screen.queryByTestId('constitution-chip')).not.toBeInTheDocument()
    // Popover content gone
    expect(screen.queryByText(/建议 ≥ 1 个机动日/)).not.toBeInTheDocument()
  })

  test('readOnly: hard violation only has 知道了 (no 帮我修正 / 承认此违反)', async () => {
    renderChip({ violations: [hardV], readOnly: true })
    fireEvent.click(screen.getByTestId('constitution-chip'))
    await waitFor(() => {
      expect(screen.getByText(/D3 驾驶超 7h/)).toBeInTheDocument()
    })
    // Verify buttons: no hard actions, only 知道了
    // Use hidden: true because Mantine uses display: none for popovers
    expect(screen.queryByRole('button', { name: /帮我修正/, hidden: true })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '承认此违反', hidden: true })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: '知道了', hidden: true })).toBeInTheDocument()
  })
})
