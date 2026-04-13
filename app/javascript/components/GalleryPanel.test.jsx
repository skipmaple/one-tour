import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import GalleryPanel from './GalleryPanel'

const photos = [
  { img: { thumb: 'photos/thumb/1.jpg', hd: 'photos/hd/1.jpg' }, title: '彩色岩层', reason: '壮观' },
  { img: { thumb: 'photos/thumb/2.jpg', hd: 'photos/hd/2.jpg' }, title: '峡谷光影', reason: '光影层次' },
]

describe('GalleryPanel', () => {
  const defaultProps = {
    spotName: '安集海大峡谷',
    photos,
    popupElement: null,
    sidebarWidth: 370,
    onClose: vi.fn(),
    onOpenLightbox: vi.fn(),
    triggerRef: { current: null },
  }

  it('renders spot name and photo count', () => {
    render(<GalleryPanel {...defaultProps} />)
    expect(screen.getByText('安集海大峡谷')).toBeInTheDocument()
    expect(screen.getByText('2 张推荐机位')).toBeInTheDocument()
  })

  it('renders gallery cards with titles', () => {
    render(<GalleryPanel {...defaultProps} />)
    expect(screen.getByText('彩色岩层')).toBeInTheDocument()
    expect(screen.getByText('峡谷光影')).toBeInTheDocument()
  })

  it('renders thumbnail images with correct src', () => {
    render(<GalleryPanel {...defaultProps} />)
    const imgs = screen.getAllByRole('img')
    expect(imgs[0]).toHaveAttribute('src', '/photos/thumb/1.jpg') // component prefixes with /
  })

  it('calls onOpenLightbox when card is clicked', () => {
    const onOpenLightbox = vi.fn()
    render(<GalleryPanel {...defaultProps} onOpenLightbox={onOpenLightbox} />)
    fireEvent.click(screen.getByText('彩色岩层'))
    expect(onOpenLightbox).toHaveBeenCalledWith(0)
  })

  it('calls onClose when close button is clicked', () => {
    const onClose = vi.fn()
    render(<GalleryPanel {...defaultProps} onClose={onClose} />)
    fireEvent.click(screen.getByLabelText('关闭图库'))
    expect(onClose).toHaveBeenCalled()
  })

  it('calls onClose on Escape key', () => {
    const onClose = vi.fn()
    const { container } = render(<GalleryPanel {...defaultProps} onClose={onClose} />)
    fireEvent.keyDown(container.firstChild, { key: 'Escape' })
    expect(onClose).toHaveBeenCalled()
  })

  it('returns null when photos is empty', () => {
    const { container } = render(<GalleryPanel {...defaultProps} photos={[]} />)
    expect(container.innerHTML).toBe('')
  })

  it('has complementary role and aria-label', () => {
    render(<GalleryPanel {...defaultProps} />)
    expect(screen.getByRole('complementary', { name: '推荐机位' })).toBeInTheDocument()
  })
})
