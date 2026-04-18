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

  test('soft-only: yellow chip with ⚠ {count}', () => {
    renderChip({ violations: [softV, softV2] })
    const chip = screen.getByTestId('constitution-chip')
    expect(chip).toBeInTheDocument()
    expect(chip).toHaveTextContent('⚠ 2')
    // Check color is set via data attribute or class
    const hasYellowColor = chip.className.includes('yellow') ||
                           chip.getAttribute('data-color') === 'yellow' ||
                           chip.style.cssText.includes('yellow')
    expect(hasYellowColor).toBe(true)
  })

  test('any hard violation makes the chip red, count is total', () => {
    renderChip({ violations: [softV, hardV, softV2] })
    const chip = screen.getByTestId('constitution-chip')
    expect(chip).toHaveTextContent('⛔ 3')
    // Check color is set via data attribute or class
    const hasRedColor = chip.className.includes('red') ||
                        chip.getAttribute('data-color') === 'red' ||
                        chip.style.cssText.includes('red')
    expect(hasRedColor).toBe(true)
  })

  test('all hard: still red with count', () => {
    renderChip({ violations: [hardV, hardV2] })
    expect(screen.getByTestId('constitution-chip')).toHaveTextContent('⛔ 2')
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
