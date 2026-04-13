import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import Lightbox from './Lightbox'

const photos = [
  { img: { thumb: 't/1.jpg', hd: 'hd/1.jpg' }, title: '彩色岩层俯瞰', reason: '壮观景色' },
  { img: { thumb: 't/2.jpg', hd: 'hd/2.jpg' }, title: '峡谷光影', reason: '光影层次' },
  { img: { thumb: 't/3.jpg', hd: 'hd/3.jpg' }, title: '地质奇观', reason: '岩层纹理' },
]

describe('Lightbox', () => {
  const defaultProps = {
    photos,
    spotName: '安集海大峡谷',
    initialIndex: 0,
    onClose: vi.fn(),
    triggerIndex: 0,
  }

  it('renders photo title and spot name', () => {
    render(<Lightbox {...defaultProps} />)
    expect(screen.getByText('彩色岩层俯瞰')).toBeInTheDocument()
    expect(screen.getByText('安集海大峡谷')).toBeInTheDocument()
  })

  it('renders HD image with correct src', () => {
    render(<Lightbox {...defaultProps} />)
    const img = screen.getByAltText('彩色岩层俯瞰')
    expect(img).toHaveAttribute('src', '/hd/1.jpg') // component prefixes with /
  })

  it('renders reason text', () => {
    render(<Lightbox {...defaultProps} />)
    expect(screen.getByText('壮观景色')).toBeInTheDocument()
  })

  it('shows nav buttons when multiple photos', () => {
    render(<Lightbox {...defaultProps} />)
    expect(screen.getByLabelText('上一张')).toBeInTheDocument()
    expect(screen.getByLabelText('下一张')).toBeInTheDocument()
  })

  it('hides nav buttons when single photo', () => {
    render(<Lightbox {...defaultProps} photos={[photos[0]]} />)
    expect(screen.queryByLabelText('上一张')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('下一张')).not.toBeInTheDocument()
  })

  it('navigates to next photo on click', () => {
    render(<Lightbox {...defaultProps} />)
    fireEvent.click(screen.getByLabelText('下一张'))
    expect(screen.getByText('峡谷光影')).toBeInTheDocument()
  })

  it('navigates to previous photo on click', () => {
    render(<Lightbox {...defaultProps} initialIndex={1} />)
    fireEvent.click(screen.getByLabelText('上一张'))
    expect(screen.getByText('彩色岩层俯瞰')).toBeInTheDocument()
  })

  it('navigates with arrow keys', () => {
    const { container } = render(<Lightbox {...defaultProps} />)
    fireEvent.keyDown(container.firstChild, { key: 'ArrowRight' })
    expect(screen.getByText('峡谷光影')).toBeInTheDocument()
    fireEvent.keyDown(container.firstChild, { key: 'ArrowLeft' })
    expect(screen.getByText('彩色岩层俯瞰')).toBeInTheDocument()
  })

  it('calls onClose on Escape key', () => {
    const onClose = vi.fn()
    const { container } = render(<Lightbox {...defaultProps} onClose={onClose} />)
    fireEvent.keyDown(container.firstChild, { key: 'Escape' })
    expect(onClose).toHaveBeenCalled()
  })

  it('calls onClose on backdrop click', () => {
    const onClose = vi.fn()
    render(<Lightbox {...defaultProps} onClose={onClose} />)
    fireEvent.click(screen.getByLabelText('关闭大图'))
    expect(onClose).toHaveBeenCalled()
  })

  it('has dialog role and aria-label', () => {
    render(<Lightbox {...defaultProps} />)
    expect(screen.getByRole('dialog', { name: '图片大图预览' })).toBeInTheDocument()
  })

  it('wraps around from last to first photo', () => {
    render(<Lightbox {...defaultProps} initialIndex={2} />)
    expect(screen.getByText('地质奇观')).toBeInTheDocument()
    fireEvent.click(screen.getByLabelText('下一张'))
    expect(screen.getByText('彩色岩层俯瞰')).toBeInTheDocument()
  })
})
