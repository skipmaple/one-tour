import { render, screen } from '@testing-library/react'
import { MantineProvider } from '@mantine/core'
import { describe, it, expect } from 'vitest'
import MarkdownView from '../MarkdownView'

function wrap(el) {
  return render(<MantineProvider>{el}</MantineProvider>)
}

describe('MarkdownView', () => {
  it('renders bold as <strong>', () => {
    wrap(<MarkdownView source="这是 **加粗** 文字" />)
    expect(screen.getByText('加粗').tagName.toLowerCase()).toBe('strong')
  })

  it('renders italic as <em>', () => {
    wrap(<MarkdownView source="这是 *斜体* 文字" />)
    expect(screen.getByText('斜体').tagName.toLowerCase()).toBe('em')
  })

  it('renders unordered list items', () => {
    // Use double newline so remark-breaks does not collapse items into one <li>
    const { container } = wrap(<MarkdownView source={'- 一\n\n- 二'} />)
    const lis = container.querySelectorAll('li')
    expect(lis.length).toBe(2)
    expect(lis[0].textContent.trim()).toBe('一')
    expect(lis[1].textContent.trim()).toBe('二')
  })

  it('renders links with target=_blank and rel=noopener', () => {
    wrap(<MarkdownView source="[百度](https://baidu.com)" />)
    const link = screen.getByRole('link', { name: '百度' })
    expect(link).toHaveAttribute('target', '_blank')
    expect(link).toHaveAttribute('rel', expect.stringContaining('noopener'))
  })

  it('escapes embedded HTML (XSS safe)', () => {
    const { container } = wrap(<MarkdownView source="<script>alert(1)</script>" />)
    expect(container.querySelector('script')).toBeNull()
    // The literal text should appear (escaped into the DOM, not executed)
    expect(container.textContent).toContain('<script>')
  })

  it('treats a single newline as a line break (remark-breaks)', () => {
    // Use a template literal to guarantee a real newline character is passed
    const { container } = wrap(<MarkdownView source={`line 1\nline 2`} />)
    expect(container.querySelectorAll('br').length).toBeGreaterThanOrEqual(1)
  })

  it('renders nothing for empty source', () => {
    const { container } = wrap(<MarkdownView source="" />)
    // MantineProvider injects <style> tags whose textContent includes CSS;
    // check only non-style DOM text to verify nothing is rendered.
    const nonStyleText = Array.from(container.childNodes)
      .filter(n => n.nodeName.toLowerCase() !== 'style')
      .map(n => n.textContent)
      .join('')
    expect(nonStyleText).toBe('')
  })
})
