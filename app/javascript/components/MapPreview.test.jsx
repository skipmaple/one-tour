import { render, screen } from '@testing-library/react'
import { MantineProvider } from '@mantine/core'
import { describe, it, expect } from 'vitest'
import MapPreview from './MapPreview'

function renderWithMantine(ui) {
  return render(<MantineProvider>{ui}</MantineProvider>)
}

describe('MapPreview', () => {
  it('renders error message when frontmatter is null', () => {
    renderWithMantine(<MapPreview frontmatter={null} />)
    expect(screen.getByText(/no map data/i)).toBeInTheDocument()
  })

  it('renders error message when frontmatter has no days', () => {
    renderWithMantine(<MapPreview frontmatter={{ title: 'Test' }} />)
    expect(screen.getByText(/no map data/i)).toBeInTheDocument()
  })
})
