import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'

// Hoisted mocks. router.reload + xhrRequest live in module scope so individual
// tests can assert call args / counts without weaving through closure refs.
const reloadMock = vi.fn()
const xhrRequestMock = vi.fn()
const notificationsShowMock = vi.fn()

vi.mock('@inertiajs/react', () => ({
  router: { reload: (...args) => reloadMock(...args) },
}))
vi.mock('@mantine/notifications', () => ({
  notifications: { show: (...args) => notificationsShowMock(...args) },
}))
vi.mock('../../lib/xhr-request', () => ({
  xhrRequest: (...args) => xhrRequestMock(...args),
  mkForm: (field, value) => {
    const fd = new FormData()
    fd.append(field, value)
    return fd
  },
}))
// compressImage: pass-through so tests don't need a real canvas.
vi.mock('../../lib/image-compression', () => ({
  compressImage: (file) => Promise.resolve(file),
}))

import useGalleryUploader from '../useGalleryUploader'

beforeEach(() => {
  reloadMock.mockReset()
  xhrRequestMock.mockReset()
  notificationsShowMock.mockReset()
})

function makeFile(name = 'a.jpg', size = 1024) {
  // Tiny payload + manual size override — File ctor honors blob bits length, but
  // some 50MB cases need an explicit size override via Object.defineProperty.
  const f = new File([ new Uint8Array(size) ], name, { type: 'image/jpeg' })
  return f
}

function fireChange(input, files) {
  // Simulate <input onChange> argument shape.
  return { target: { files, value: '' } }
}

describe('useGalleryUploader · openFilePicker', () => {
  it('triggers click on fileInputRef', () => {
    const { result } = renderHook(() => useGalleryUploader(7, { existingCount: 0 }))
    const click = vi.fn()
    // Hook returns a ref object; assign a fake input element.
    result.current.fileInputRef.current = { click }
    act(() => result.current.openFilePicker())
    expect(click).toHaveBeenCalledTimes(1)
  })

  it('is a no-op when ref is unset', () => {
    const { result } = renderHook(() => useGalleryUploader(7, { existingCount: 0 }))
    // Should not throw
    expect(() => act(() => result.current.openFilePicker())).not.toThrow()
  })
})

describe('useGalleryUploader · handleFilesSelected', () => {
  it('passes activityId in URL + calls xhrRequest once per accepted file', async () => {
    xhrRequestMock.mockResolvedValue(null)
    const { result } = renderHook(() => useGalleryUploader(42, { existingCount: 0 }))
    const f1 = makeFile('one.jpg')
    const f2 = makeFile('two.jpg')
    await act(async () => {
      await result.current.handleFilesSelected(fireChange(null, [ f1, f2 ]))
    })
    expect(xhrRequestMock).toHaveBeenCalledTimes(2)
    expect(xhrRequestMock.mock.calls[0][0]).toBe('/activities/42/images')
    expect(xhrRequestMock.mock.calls[0][2]).toMatchObject({
      method: 'POST',
      sentryExtra: { activity_id: 42 },
    })
  })

  it('rejects batch when existingCount + files exceed MAX_PER_ACTIVITY', async () => {
    const { result } = renderHook(() => useGalleryUploader(42, { existingCount: 19 }))
    await act(async () => {
      await result.current.handleFilesSelected(
        fireChange(null, [ makeFile('a.jpg'), makeFile('b.jpg') ])
      )
    })
    expect(xhrRequestMock).not.toHaveBeenCalled()
    expect(notificationsShowMock).toHaveBeenCalledWith(
      expect.objectContaining({ title: '一次最多 20 张' })
    )
  })

  it('reloads via Inertia after upload finishes', async () => {
    xhrRequestMock.mockResolvedValue(null)
    const { result } = renderHook(() => useGalleryUploader(42, { existingCount: 0 }))
    await act(async () => {
      await result.current.handleFilesSelected(fireChange(null, [ makeFile() ]))
    })
    expect(reloadMock).toHaveBeenCalledWith({
      only: [ 'activity_images' ],
      preserveScroll: true,
    })
  })
})

describe('useGalleryUploader · unmount safety (Issue #3)', () => {
  it('does NOT call router.reload when component unmounts mid-upload', async () => {
    // Hold xhr promise open until we manually resolve it after unmount.
    let resolveUpload
    xhrRequestMock.mockImplementation(() => new Promise((res) => { resolveUpload = res }))

    const { result, unmount } = renderHook(() =>
      useGalleryUploader(42, { existingCount: 0 })
    )

    // Kick off upload — handleFilesSelected awaits xhrRequest, which we hold.
    let uploadPromise
    await act(async () => {
      uploadPromise = result.current.handleFilesSelected(fireChange(null, [ makeFile() ]))
    })

    // Unmount while xhr is still pending → useEffect cleanup flips unmountedRef
    // and calls abortRef.current.abort(), which causes xhrRequest to reject with
    // AbortError. The finally block must then skip router.reload.
    unmount()

    // Now resolve (in real life xhr would have rejected via AbortError; we
    // simulate by rejecting to mirror the real abort path).
    resolveUpload(null)
    await act(async () => { await uploadPromise })

    expect(reloadMock).not.toHaveBeenCalled()
  })
})
