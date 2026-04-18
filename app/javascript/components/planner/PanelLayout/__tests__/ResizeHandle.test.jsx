import { render, screen, fireEvent } from '@testing-library/react'
import { describe, test, expect, vi } from 'vitest'
import ResizeHandle from '../ResizeHandle'

describe('ResizeHandle', () => {
  test('renders a draggable element with col-resize cursor', () => {
    render(<ResizeHandle onResize={() => {}} />)
    const handle = screen.getByRole('separator')
    expect(handle).toBeInTheDocument()
    expect(handle).toHaveStyle({ cursor: 'col-resize' })
  })

  test('returns null when disabled', () => {
    const { container } = render(<ResizeHandle disabled onResize={() => {}} />)
    expect(container).toBeEmptyDOMElement()
  })

  test('mousedown → mousemove → mouseup fires onResize with cumulative deltaPx', () => {
    const onResize = vi.fn()
    render(<ResizeHandle onResize={onResize} />)
    const handle = screen.getByRole('separator')

    fireEvent.mouseDown(handle, { clientX: 500 })
    fireEvent.mouseMove(window, { clientX: 530 })
    fireEvent.mouseMove(window, { clientX: 550 })
    fireEvent.mouseUp(window, { clientX: 550 })

    // Should be called for each mousemove with cumulative delta from start
    expect(onResize).toHaveBeenCalled()
    const lastCall = onResize.mock.calls[onResize.mock.calls.length - 1]
    expect(lastCall[0]).toBe(50)  // 550 - 500
  })

  test('mouseup outside the component still ends the drag', () => {
    const onResize = vi.fn()
    render(<ResizeHandle onResize={onResize} />)
    const handle = screen.getByRole('separator')

    fireEvent.mouseDown(handle, { clientX: 500 })
    fireEvent.mouseUp(window, { clientX: 600 })
    onResize.mockClear()

    // After mouseup, further mousemove should NOT fire onResize
    fireEvent.mouseMove(window, { clientX: 700 })
    expect(onResize).not.toHaveBeenCalled()
  })
})
