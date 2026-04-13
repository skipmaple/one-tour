import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { MantineProvider } from '@mantine/core'
import ImageUploader from './ImageUploader'

const wrap = (ui) => render(<MantineProvider>{ui}</MantineProvider>)

describe('ImageUploader', () => {
  it('returns null when no guidebookId', () => {
    const { container } = wrap(<ImageUploader guidebookId={null} />)
    expect(container.querySelector('[style*="border-top"]')).toBeNull()
  })

  it('renders drop zone when guidebookId is provided', () => {
    wrap(<ImageUploader guidebookId={1} />)
    expect(screen.getByText('拖拽图片到此处上传，或点击选择文件')).toBeInTheDocument()
  })

  it('uploads file on drop and shows filename', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ thumb: '/thumb/1.jpg', hd: '/hd/1.jpg' }),
    })

    wrap(<ImageUploader guidebookId={1} />)

    const dropZone = screen.getByText('拖拽图片到此处上传，或点击选择文件').parentElement
    const file = new File(['pixels'], 'photo.jpg', { type: 'image/jpeg' })

    fireEvent.drop(dropZone, {
      dataTransfer: { files: [file] },
    })

    await waitFor(() => {
      expect(screen.getByText('photo.jpg')).toBeInTheDocument()
    })

    expect(global.fetch).toHaveBeenCalledWith(
      '/guidebooks/1/images',
      expect.objectContaining({ method: 'POST' })
    )
  })

  it('shows error on failed upload', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 500 })

    wrap(<ImageUploader guidebookId={1} />)

    const dropZone = screen.getByText('拖拽图片到此处上传，或点击选择文件').parentElement
    const file = new File(['pixels'], 'bad.jpg', { type: 'image/jpeg' })

    fireEvent.drop(dropZone, { dataTransfer: { files: [file] } })

    await waitFor(() => {
      expect(screen.getByText('上传失败 (500)')).toBeInTheDocument()
    })
  })

  it('ignores non-image files', () => {
    global.fetch = vi.fn()

    wrap(<ImageUploader guidebookId={1} />)

    const dropZone = screen.getByText('拖拽图片到此处上传，或点击选择文件').parentElement
    const file = new File(['data'], 'doc.pdf', { type: 'application/pdf' })

    fireEvent.drop(dropZone, { dataTransfer: { files: [file] } })

    expect(global.fetch).not.toHaveBeenCalled()
  })
})
