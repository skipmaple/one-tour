import { render, screen, fireEvent } from '@testing-library/react'
import { MantineProvider } from '@mantine/core'
import { describe, it, expect, vi } from 'vitest'
import MarkdownEditor from '../MarkdownEditor'

function wrap(el) {
  return render(<MantineProvider>{el}</MantineProvider>)
}

// Helper: select a range in the textarea (jsdom supports setSelectionRange)
function select(textarea, start, end) {
  textarea.focus()
  textarea.setSelectionRange(start, end)
}

describe('MarkdownEditor', () => {
  it('wraps selection with ** on Bold click', () => {
    const onChange = vi.fn()
    wrap(<MarkdownEditor value="hello world" onChange={onChange} />)
    const textarea = screen.getByRole('textbox')
    select(textarea, 6, 11) // "world"
    fireEvent.click(screen.getByLabelText('粗体'))
    expect(onChange).toHaveBeenLastCalledWith('hello **world**')
  })

  it('inserts **粗体** with selection when no range is selected on Bold click', () => {
    const onChange = vi.fn()
    wrap(<MarkdownEditor value="" onChange={onChange} />)
    fireEvent.click(screen.getByLabelText('粗体'))
    expect(onChange).toHaveBeenLastCalledWith('**粗体**')
  })

  it('wraps selection with * on Italic click', () => {
    const onChange = vi.fn()
    wrap(<MarkdownEditor value="hello world" onChange={onChange} />)
    const textarea = screen.getByRole('textbox')
    select(textarea, 6, 11)
    fireEvent.click(screen.getByLabelText('斜体'))
    expect(onChange).toHaveBeenLastCalledWith('hello *world*')
  })

  it('prefixes the current line with "- " on List click', () => {
    const onChange = vi.fn()
    wrap(<MarkdownEditor value={'一\n二\n三'} onChange={onChange} />)
    const textarea = screen.getByRole('textbox')
    select(textarea, 2, 2) // caret at start of second line
    fireEvent.click(screen.getByLabelText('无序列表'))
    expect(onChange).toHaveBeenLastCalledWith('一\n- 二\n三')
  })

  it('prefixes every selected line with "- " when List click spans multiple lines', () => {
    const onChange = vi.fn()
    wrap(<MarkdownEditor value={'一\n二\n三'} onChange={onChange} />)
    const textarea = screen.getByRole('textbox')
    select(textarea, 0, 5) // covers "一\n二\n三"
    fireEvent.click(screen.getByLabelText('无序列表'))
    expect(onChange).toHaveBeenLastCalledWith('- 一\n- 二\n- 三')
  })

  it('wraps selection as [text](url) on Link click', () => {
    const onChange = vi.fn()
    wrap(<MarkdownEditor value="visit baidu now" onChange={onChange} />)
    const textarea = screen.getByRole('textbox')
    select(textarea, 6, 11) // "baidu"
    fireEvent.click(screen.getByLabelText('链接'))
    expect(onChange).toHaveBeenLastCalledWith('visit [baidu](url) now')
  })

  it('inserts [](url) template with no selection on Link click', () => {
    const onChange = vi.fn()
    wrap(<MarkdownEditor value="" onChange={onChange} />)
    fireEvent.click(screen.getByLabelText('链接'))
    expect(onChange).toHaveBeenLastCalledWith('[](url)')
  })

  it('prefixes the current line with "### " on Heading click', () => {
    const onChange = vi.fn()
    wrap(<MarkdownEditor value="标题" onChange={onChange} />)
    const textarea = screen.getByRole('textbox')
    select(textarea, 0, 0)
    fireEvent.click(screen.getByLabelText('标题'))
    expect(onChange).toHaveBeenLastCalledWith('### 标题')
  })

  it('toggles "### " off on second Heading click', () => {
    const onChange = vi.fn()
    wrap(<MarkdownEditor value="### 标题" onChange={onChange} />)
    const textarea = screen.getByRole('textbox')
    select(textarea, 4, 4) // caret after the prefix
    fireEvent.click(screen.getByLabelText('标题'))
    expect(onChange).toHaveBeenLastCalledWith('标题')
  })

  it('counts UTF-8 bytes (not JS code units) so CJK is accurate vs the server limit', () => {
    // "你好" is 2 JS chars but 6 UTF-8 bytes (3 bytes per CJK char).
    wrap(<MarkdownEditor value="你好" onChange={() => {}} />)
    expect(screen.getByText('6 / 50000 字节')).toBeInTheDocument()
  })

  it('counter shows 0 for empty value', () => {
    wrap(<MarkdownEditor value="" onChange={() => {}} />)
    expect(screen.getByText('0 / 50000 字节')).toBeInTheDocument()
  })

  it('counter matches ASCII length 1:1', () => {
    wrap(<MarkdownEditor value={'x'.repeat(42)} onChange={() => {}} />)
    expect(screen.getByText('42 / 50000 字节')).toBeInTheDocument()
  })
})
