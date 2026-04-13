import { render, screen } from '@testing-library/react'
import { MantineProvider } from '@mantine/core'
import { describe, it, expect } from 'vitest'
import MarkdownPreview from './MarkdownPreview'

function renderWithMantine(ui) {
  return render(<MantineProvider>{ui}</MantineProvider>)
}

describe('MarkdownPreview', () => {
  it('renders markdown headings', () => {
    renderWithMantine(<MarkdownPreview content="# Hello World" />)
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Hello World')
  })

  it('renders GFM tables', () => {
    const md = '| A | B |\n|---|---|\n| 1 | 2 |'
    renderWithMantine(<MarkdownPreview content={md} />)
    expect(screen.getByRole('table')).toBeInTheDocument()
  })

  it('renders empty state for blank content', () => {
    renderWithMantine(<MarkdownPreview content="" />)
    expect(screen.getByText('暂无内容')).toBeInTheDocument()
  })
})
