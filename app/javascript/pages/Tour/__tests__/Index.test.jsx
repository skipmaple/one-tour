import { render, screen } from '@testing-library/react'
import { MantineProvider } from '@mantine/core'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import Index, { openHref, formatRelative } from '../Index'

// Mock Inertia components
vi.mock('@inertiajs/react', () => ({
  Head: ({ children, title }) => null,
  Link: ({ href, children, ...props }) => <a href={href} {...props}>{children}</a>,
  router: {
    post: vi.fn(),
  },
}))

function renderWithMantine(ui) {
  return render(<MantineProvider>{ui}</MantineProvider>)
}

describe('Tour Index', () => {
  it('renders tour title', () => {
    renderWithMantine(<Index tours={[{ id: 1, title: '伊犁', team_size: 5, my_role: 'author' }]} />)
    expect(screen.getByText('伊犁')).toBeInTheDocument()
  })

  it('shows empty state when no tours', () => {
    renderWithMantine(<Index tours={[]} />)
    expect(screen.getByText(/还没有旅程/)).toBeInTheDocument()
  })

  it('routes to tour show page', () => {
    renderWithMantine(<Index tours={[{ id: 7, title: 't', days_count: 3, my_role: 'author' }]} />)
    const link = screen.getByRole('link', { name: /打开/ })
    expect(link).toHaveAttribute('href', '/tours/7')
  })

  it('routes to tour show page even when tour has no days yet', () => {
    renderWithMantine(<Index tours={[{ id: 8, title: 't', days_count: 0, my_role: 'author' }]} />)
    const link = screen.getByRole('link', { name: /打开/ })
    expect(link).toHaveAttribute('href', '/tours/8')
  })
})

describe('openHref', () => {
  it('points to tour show page', () => {
    expect(openHref({ id: 1, days_count: 5 })).toBe('/tours/1')
    expect(openHref({ id: 1, days_count: 0 })).toBe('/tours/1')
    expect(openHref({ id: 1 })).toBe('/tours/1')
  })
})

describe('formatRelative (BUG #8)', () => {
  const NOW = new Date('2026-04-15T18:00:00Z').getTime()

  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(NOW)
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('returns em-dash for empty input', () => {
    expect(formatRelative(null)).toBe('—')
    expect(formatRelative(undefined)).toBe('—')
    expect(formatRelative('')).toBe('—')
  })

  it('returns 刚刚 within the first minute', () => {
    // 20s rounds to 0 min (0.33 → 0 with Math.round); 30s would round up to 1
    expect(formatRelative(new Date(NOW - 20_000).toISOString())).toBe('刚刚')
  })

  it('returns "N 分钟前" for minutes', () => {
    expect(formatRelative(new Date(NOW - 5 * 60_000).toISOString())).toBe('5 分钟前')
    expect(formatRelative(new Date(NOW - 59 * 60_000).toISOString())).toBe('59 分钟前')
  })

  it('returns "N 小时前" for hours within a day', () => {
    expect(formatRelative(new Date(NOW - 3 * 3600_000).toISOString())).toBe('3 小时前')
  })

  it('returns "N 天前" for days within a month', () => {
    expect(formatRelative(new Date(NOW - 5 * 86400_000).toISOString())).toBe('5 天前')
  })

  it('falls back to locale date beyond 30 days', () => {
    const out = formatRelative(new Date(NOW - 60 * 86400_000).toISOString())
    // Locale output is environment-dependent; just assert it's not relative
    expect(out).not.toMatch(/前$/)
    expect(out.length).toBeGreaterThan(0)
  })
})
