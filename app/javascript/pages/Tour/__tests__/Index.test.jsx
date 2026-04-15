import { render, screen } from '@testing-library/react'
import { MantineProvider } from '@mantine/core'
import { describe, it, expect, vi } from 'vitest'
import Index from '../Index'

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
    expect(screen.getByText(/还没有旅行程/)).toBeInTheDocument()
  })
})
