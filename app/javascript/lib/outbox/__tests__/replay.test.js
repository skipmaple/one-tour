import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('@sentry/react', () => ({
  addBreadcrumb: vi.fn(),
  captureException: vi.fn(),
}))

vi.mock('../dispatch', () => ({
  dispatchSuccess: vi.fn(),
  dispatchPhotoReplay: vi.fn(),
}))

import { openOutbox, enqueue, getRow, listByStatus } from '../queue'
import { replay, _resetMutex } from '../replay'
import * as Sentry from '@sentry/react'
import { dispatchSuccess, dispatchPhotoReplay } from '../dispatch'

beforeEach(() => {
  globalThis.indexedDB = new IDBFactory()
  global.fetch = vi.fn()
  Sentry.addBreadcrumb.mockClear()
  Sentry.captureException.mockClear()
  dispatchSuccess.mockClear()
  dispatchPhotoReplay.mockClear()
  _resetMutex()
})

afterEach(() => {
  delete global.fetch
})

describe('replay', () => {
  it('2xx → delete row + dispatchSuccess', async () => {
    const db = await openOutbox()
    const id = await enqueue(db, { path: '/tours/1/expenses', method: 'POST', body: { amount: 100 }, headers: {}, resource_kind: 'expense' })
    fetch.mockResolvedValue({ ok: true, status: 200 })

    await replay(db)

    expect(await getRow(db, id)).toBeUndefined()
    expect(dispatchSuccess).toHaveBeenCalledWith(expect.objectContaining({ id }))
  })

  it('4xx (non-408/429) → failed_permanent + Sentry capture', async () => {
    const db = await openOutbox()
    const id = await enqueue(db, { path: '/tours/1/expenses', method: 'POST', body: {}, headers: {}, resource_kind: 'expense' })
    fetch.mockResolvedValue({ ok: false, status: 404, text: () => Promise.resolve('Not Found') })

    await replay(db)

    const row = await getRow(db, id)
    expect(row.status).toBe('failed_permanent')
    expect(row.last_error).toContain('404')
    expect(Sentry.captureException).toHaveBeenCalledTimes(1)
  })

  it('5xx → attempts++ stays pending under cap', async () => {
    const db = await openOutbox()
    const id = await enqueue(db, { path: '/tours/1/expenses', method: 'POST', body: {}, headers: {}, resource_kind: 'expense' })
    fetch.mockResolvedValue({ ok: false, status: 503, text: () => Promise.resolve('') })

    await replay(db)

    const row = await getRow(db, id)
    expect(row.status).toBe('pending')
    expect(row.attempts).toBe(1)
  })

  it('5xx 5 次 → failed_permanent', async () => {
    const db = await openOutbox()
    const id = await enqueue(db, { path: '/tours/1/expenses', method: 'POST', body: {}, headers: {}, resource_kind: 'expense' })
    // 强制 attempts=4 起点
    const row = await getRow(db, id)
    row.attempts = 4
    const { put } = await import('../queue')
    await put(db, row)
    fetch.mockResolvedValue({ ok: false, status: 503, text: () => Promise.resolve('') })

    await replay(db)

    const after = await getRow(db, id)
    expect(after.attempts).toBe(5)
    expect(after.status).toBe('failed_permanent')
    expect(Sentry.captureException).toHaveBeenCalledTimes(1)
  })

  it('network err → 同 5xx 计 attempt', async () => {
    const db = await openOutbox()
    const id = await enqueue(db, { path: '/tours/1/expenses', method: 'POST', body: {}, headers: {}, resource_kind: 'expense' })
    fetch.mockRejectedValue(new TypeError('Network failure'))

    await replay(db)

    const row = await getRow(db, id)
    expect(row.status).toBe('pending')
    expect(row.attempts).toBe(1)
    expect(row.last_error).toContain('Network failure')
  })

  it('mutex blocks concurrent replay', async () => {
    const db = await openOutbox()
    await enqueue(db, { path: '/tours/1/expenses', method: 'POST', body: {}, headers: {}, resource_kind: 'expense' })

    let resolveFetch
    fetch.mockImplementation(() => new Promise(r => { resolveFetch = r }))

    const p1 = replay(db)
    const p2 = replay(db) // 应直接 return,不发第二次 fetch

    // flush one event-loop tick so p1's IDB listByStatus resolves and fetch is called;
    // p2 already returned (mutex) so no second fetch will ever be issued
    await new Promise(r => setTimeout(r, 0))
    expect(fetch).toHaveBeenCalledTimes(1)
    resolveFetch({ ok: true, status: 200 })
    await Promise.all([p1, p2])
  })

  it('408 → 算 retry 不算 permanent', async () => {
    const db = await openOutbox()
    const id = await enqueue(db, { path: '/tours/1/expenses', method: 'POST', body: {}, headers: {}, resource_kind: 'expense' })
    fetch.mockResolvedValue({ ok: false, status: 408, text: () => Promise.resolve('') })

    await replay(db)

    const row = await getRow(db, id)
    expect(row.status).toBe('pending')
    expect(row.attempts).toBe(1)
  })

  it('photo kind → dispatchPhotoReplay (not fetch)', async () => {
    const db = await openOutbox()
    const blob = new File(['fake'], 'img.webp', { type: 'image/webp' })
    const id = await enqueue(db, {
      path: '/activities/9/images',
      method: 'POST',
      body: { file_blob: blob, activity_id: 9, file_name: 'img.webp' },
      headers: {},
      resource_kind: 'photo',
    })
    dispatchPhotoReplay.mockResolvedValue({ ok: true })

    await replay(db)

    expect(dispatchPhotoReplay).toHaveBeenCalledTimes(1)
    expect(fetch).not.toHaveBeenCalled()
    expect(await getRow(db, id)).toBeUndefined()
  })
})
