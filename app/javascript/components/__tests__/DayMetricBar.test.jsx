import { render, screen } from '@testing-library/react'
import { MantineProvider } from '@mantine/core'
import DayMetricBar, { barColor } from '../DayMetricBar'

function renderBar(props) {
  return render(
    <MantineProvider>
      <DayMetricBar {...props} />
    </MantineProvider>
  )
}

describe('barColor', () => {
  test('returns gray.4 when max is 0', () => {
    expect(barColor(3, 0)).toBe('gray.4')
  })

  test('returns gray.4 when max is falsy', () => {
    expect(barColor(3, null)).toBe('gray.4')
    expect(barColor(3, undefined)).toBe('gray.4')
  })

  test('returns gray.5 when pct < 0.9', () => {
    expect(barColor(0, 7)).toBe('gray.5')
    expect(barColor(3, 7)).toBe('gray.5')
    expect(barColor(6.2, 7)).toBe('gray.5')  // 0.885
  })

  test('returns yellow.6 when 0.9 <= pct <= 1.0', () => {
    expect(barColor(6.3, 7)).toBe('yellow.6')  // 0.9
    expect(barColor(7, 7)).toBe('yellow.6')    // 1.0
  })

  test('returns red.6 when pct > 1.0', () => {
    expect(barColor(7.1, 7)).toBe('red.6')
    expect(barColor(14, 7)).toBe('red.6')
  })
})

describe('DayMetricBar', () => {
  test('renders label, value/max, and unit', () => {
    renderBar({ label: '驾驶', value: 3, max: 7, unit: 'h' })
    expect(screen.getByText('驾驶')).toBeInTheDocument()
    expect(screen.getByText('3/7h')).toBeInTheDocument()
  })

  test('renders without unit when unit prop omitted', () => {
    renderBar({ label: '核心', value: 1, max: 3 })
    expect(screen.getByText('1/3')).toBeInTheDocument()
  })

  test('does not crash when max is 0', () => {
    renderBar({ label: '驾驶', value: 2, max: 0, unit: 'h' })
    expect(screen.getByText('2/0h')).toBeInTheDocument()
  })

  test('renders a progressbar role', () => {
    renderBar({ label: '驾驶', value: 3, max: 7, unit: 'h' })
    expect(screen.getByRole('progressbar')).toBeInTheDocument()
  })

  test('progressbar fill value is capped at 100 when value exceeds max', () => {
    renderBar({ label: '驾驶', value: 14, max: 7, unit: 'h' })
    const bar = screen.getByRole('progressbar')
    // Mantine v9 Progress exposes aria-valuenow with the normalized 0-100 value
    expect(bar.getAttribute('aria-valuenow')).toBe('100')
  })

  test('progressbar fill value is 0 when max is 0 (avoid NaN)', () => {
    renderBar({ label: '驾驶', value: 2, max: 0, unit: 'h' })
    const bar = screen.getByRole('progressbar')
    expect(bar.getAttribute('aria-valuenow')).toBe('0')
  })

  test('shows an over-budget caption with the overflow amount', () => {
    renderBar({ label: '驾驶', value: 18.3, max: 7, unit: 'h' })
    expect(screen.getByText('超出 11.3h')).toBeInTheDocument()
  })

  test('over-budget caption uses an integer overflow for unit-less counts', () => {
    renderBar({ label: '必去', value: 4, max: 3 })
    expect(screen.getByText('超出 1')).toBeInTheDocument()
  })

  test('renders no over-budget caption when within budget', () => {
    renderBar({ label: '驾驶', value: 3, max: 7, unit: 'h' })
    expect(screen.queryByText(/超出/)).not.toBeInTheDocument()
  })
})
