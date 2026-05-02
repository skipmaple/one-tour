import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@inertiajs/react', () => ({
  router: {
    reload: vi.fn(),
  },
}))

vi.mock('../../xhr-request', () => ({
  xhrRequest: vi.fn(),
  mkForm: (field, value) => {
    const fd = new FormData()
    fd.append(field, value)
    return fd
  },
}))

import { router } from '@inertiajs/react'
import { xhrRequest } from '../../xhr-request'
import { dispatchSuccess, dispatchPhotoReplay } from '../dispatch'

beforeEach(() => {
  router.reload.mockClear()
  xhrRequest.mockClear()
})

describe('dispatch', () => {
  it('dispatchSuccess for expense reloads tour props', () => {
    dispatchSuccess({ resource_kind: 'expense' })
    expect(router.reload).toHaveBeenCalledWith({ only: ['tour', 'expenses', 'expenses_summary'] })
  })

  it('dispatchSuccess for activity_edit reloads activity prop', () => {
    dispatchSuccess({ resource_kind: 'activity_edit' })
    expect(router.reload).toHaveBeenCalledWith({ only: ['tour', 'activities', 'violations'] })
  })

  it('dispatchSuccess for settlement reloads balances', () => {
    dispatchSuccess({ resource_kind: 'settlement' })
    expect(router.reload).toHaveBeenCalledWith({ only: ['tour', 'expenses_summary', 'settlements'] })
  })

  it('dispatchSuccess for note reloads days', () => {
    dispatchSuccess({ resource_kind: 'note' })
    expect(router.reload).toHaveBeenCalledWith({ only: ['tour', 'days'] })
  })

  it('dispatchPhotoReplay reuploads file via xhrRequest', async () => {
    xhrRequest.mockResolvedValue({ ok: true })
    const blob = new File(['fake'], 'img.webp', { type: 'image/webp' })
    const row = {
      resource_kind: 'photo',
      path: '/activities/9/images',
      body: { file_blob: blob, activity_id: 9, file_name: 'img.webp' },
    }
    await dispatchPhotoReplay(row)

    expect(xhrRequest).toHaveBeenCalledTimes(1)
    const [url, formData, opts] = xhrRequest.mock.calls[0]
    expect(url).toBe('/activities/9/images')
    expect(formData.get('file')).toBe(blob)
    expect(opts.method).toBe('POST')
    expect(opts.maxAttempts).toBe(1) // outbox 自己已经 retry,不要双层 retry
  })

  it('dispatchPhotoReplay forwards sentryExtra for diagnostics', async () => {
    xhrRequest.mockResolvedValue({ ok: true })
    const blob = new File(['fake'], 'img.webp', { type: 'image/webp' })
    const row = {
      resource_kind: 'photo',
      path: '/activities/9/images',
      body: { file_blob: blob, activity_id: 9, file_name: 'img.webp' },
    }
    await dispatchPhotoReplay(row)

    const [,, opts] = xhrRequest.mock.calls[0]
    expect(opts.sentryExtra).toEqual({ activity_id: 9, replay: true })
  })

  it('dispatchSuccess for unknown kind does a full reload (fallback)', () => {
    dispatchSuccess({ resource_kind: 'unknown_future_kind' })
    expect(router.reload).toHaveBeenCalledWith()
  })
})
