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

  it('4xx (non-408/429) → failed_permanent + 友好 last_error + raw 留给 dev', async () => {
    const db = await openOutbox()
    const id = await enqueue(db, { path: '/tours/1/expenses', method: 'POST', body: {}, headers: {}, resource_kind: 'expense' })
    fetch.mockResolvedValue({ ok: false, status: 404, text: () => Promise.resolve('<!DOCTYPE html>...Not Found...') })

    await replay(db)

    const row = await getRow(db, id)
    expect(row.status).toBe('failed_permanent')
    // 用户看的是友好句子(无 HTTP code / 无 HTML)
    expect(row.last_error).toBe('这条已被同伴删除,无法同步')
    expect(row.last_error).not.toMatch(/HTTP|<!DOCTYPE/)
    // raw 留给 dev / Sentry
    expect(row.last_error_raw).toContain('HTTP 404')
    expect(row.last_error_raw).toContain('<!DOCTYPE')
    expect(Sentry.captureException).toHaveBeenCalledTimes(1)
    // Sentry extra 应带 raw 用于调试
    expect(Sentry.captureException.mock.calls[0][1].extra.last_error_raw).toContain('HTTP 404')
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
    // 用户看友好文案,raw 保留 message 给 dev
    expect(row.last_error).toBe('网络一直没好,改动还在排队')
    expect(row.last_error_raw).toContain('Network failure')
  })

  it('mutex blocks concurrent replay', async () => {
    const db = await openOutbox()
    await enqueue(db, { path: '/tours/1/expenses', method: 'POST', body: {}, headers: {}, resource_kind: 'expense' })

    let resolveFetch
    fetch.mockImplementation(() => new Promise(r => { resolveFetch = r }))

    const p1 = replay(db)
    const p2 = replay(db) // 应直接 return,不发第二次 fetch

    // 让 p1 走过 listByStatus 的 await:fake-indexeddb 用 setImmediate 调度
    // IDB 回调,用 setImmediate flush 比 setTimeout(0) 更精确(不含 4ms 最小延迟),
    // 再追一个 microtask 让 Promise chain 传播完毕。
    await new Promise(r => setImmediate(r))
    await Promise.resolve()
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

  it('409 → 算 retry 不算 permanent(Inertia version mismatch on deploy)', async () => {
    // Copilot review item #3:409 是 Inertia version mismatch 的标准状态码,
    // 部署期最常见。当 permanent 处理会让所有飞行 mutation 在部署后秒变失败 —
    // 实际只需用户刷新页拿新 version,replay 即可成功。
    const db = await openOutbox()
    const id = await enqueue(db, { path: '/tours/1/expenses', method: 'POST', body: {}, headers: {}, resource_kind: 'expense' })
    fetch.mockResolvedValue({ ok: false, status: 409, text: () => Promise.resolve('') })

    await replay(db)

    const row = await getRow(db, id)
    expect(row.status).toBe('pending')
    expect(row.attempts).toBe(1)
    expect(Sentry.captureException).not.toHaveBeenCalled() // 409 不上报 capture
  })

  it('成功 + delete 失败 → 标 failed_permanent 防重复 replay(Copilot item #2)', async () => {
    // 场景:replay 拿到 2xx 成功响应,但 deleteRow 失败(iOS 后台 IDB tx abort 常见)。
    // 早先实现继续按"已处理"走,row 仍 pending → 下次 trigger 再发 → 后端重复写。
    // 修后:delete 失败 → 标 failed_permanent + Sentry capture,不假装成功。
    const db = await openOutbox()
    const id = await enqueue(db, { path: '/tours/1/expenses', method: 'POST', body: { x: 1 }, headers: {}, resource_kind: 'expense' })
    fetch.mockResolvedValue({ ok: true, status: 200 })

    // 强制 deleteRow 抛(模拟 iOS 后台 tx abort)
    const queueModule = await import('../queue')
    const realDelete = queueModule.deleteRow
    const spy = vi.spyOn(queueModule, 'deleteRow').mockRejectedValue(new Error('Transaction aborted'))

    await replay(db)

    const row = await getRow(db, id)
    expect(row.status).toBe('failed_permanent')
    expect(row.last_error).toContain('已发送但本地清理失败')
    expect(row.last_error_raw).toContain('Delete after success failed')
    // 关键:不应 dispatchSuccess(否则 UI 当真成功 + row 仍在抽屉里 → 矛盾)
    expect(dispatchSuccess).not.toHaveBeenCalled()
    expect(Sentry.captureException).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({ tags: expect.objectContaining({ path: '/tours/1/expenses' }) }),
    )

    spy.mockRestore()
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
