import { render, screen, fireEvent } from '@testing-library/react'
import { describe, test, expect, vi, beforeEach } from 'vitest'
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

  test('mousedown → mousemove → mouseup fires onResize with INCREMENTAL deltaPx per frame', () => {
    const onResize = vi.fn()
    render(<ResizeHandle onResize={onResize} />)
    const handle = screen.getByRole('separator')

    fireEvent.mouseDown(handle, { clientX: 500 })
    fireEvent.mouseMove(window, { clientX: 530 })  // incremental: +30
    fireEvent.mouseMove(window, { clientX: 550 })  // incremental: +20
    fireEvent.mouseUp(window, { clientX: 550 })

    // Each mousemove should fire onResize with the per-frame increment, not the
    // cumulative delta from mousedown. Cumulative was a quadratic-drift bug:
    // applying cumulative delta to already-updated state each frame compounds.
    expect(onResize).toHaveBeenCalledTimes(2)
    expect(onResize.mock.calls[0][0]).toBe(30)  // 530 - 500
    expect(onResize.mock.calls[1][0]).toBe(20)  // 550 - 530
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

  test('hover widens the handle and changes color', () => {
    render(<ResizeHandle onResize={() => {}} />)
    const handle = screen.getByRole('separator')
    expect(handle).toHaveStyle({ width: '6px' })
    fireEvent.mouseEnter(handle)
    expect(handle).toHaveStyle({ width: '10px' })
    fireEvent.mouseLeave(handle)
    expect(handle).toHaveStyle({ width: '6px' })
  })

  test('drag shows tooltip with current delta', () => {
    render(<ResizeHandle onResize={() => {}} />)
    const handle = screen.getByRole('separator')
    fireEvent.mouseDown(handle, { clientX: 100 })
    fireEvent.mouseMove(window, { clientX: 150 })
    expect(screen.getByText(/\+50px/)).toBeInTheDocument()
    fireEvent.mouseUp(window, { clientX: 150 })
  })
})
