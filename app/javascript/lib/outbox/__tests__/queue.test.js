import { describe, it, expect, beforeEach } from 'vitest'
import { openOutbox, enqueue, getRow, listByStatus, put, deleteRow } from '../queue'

beforeEach(async () => {
  // fake-indexeddb 用 jsdom 全局 indexedDB,每个测试新实例
  globalThis.indexedDB = new IDBFactory()
})

describe('outbox.queue list/put/delete', () => {
  it('listByStatus returns pending rows in FIFO order', async () => {
    const db = await openOutbox()
    const id1 = await enqueue(db, { path: '/a', method: 'POST', body: {}, headers: {}, resource_kind: 'expense' })
    // 强制 enqueued_at 不同
    await new Promise(r => setTimeout(r, 5))
    const id2 = await enqueue(db, { path: '/b', method: 'POST', body: {}, headers: {}, resource_kind: 'expense' })

    const rows = await listByStatus(db, 'pending')
    expect(rows.map(r => r.id)).toEqual([id1, id2])
  })

  it('put updates an existing row', async () => {
    const db = await openOutbox()
    const id = await enqueue(db, { path: '/a', method: 'POST', body: {}, headers: {}, resource_kind: 'expense' })
    const row = await getRow(db, id)
    row.attempts = 3
    row.last_error = 'HTTP 500'
    await put(db, row)

    const updated = await getRow(db, id)
    expect(updated.attempts).toBe(3)
    expect(updated.last_error).toBe('HTTP 500')
  })

  it('deleteRow removes a row', async () => {
    const db = await openOutbox()
    const id = await enqueue(db, { path: '/a', method: 'POST', body: {}, headers: {}, resource_kind: 'expense' })
    await deleteRow(db, id)
    const row = await getRow(db, id)
    expect(row).toBeUndefined()
  })

  it('listByStatus filters by failed_permanent', async () => {
    const db = await openOutbox()
    const id = await enqueue(db, { path: '/a', method: 'POST', body: {}, headers: {}, resource_kind: 'expense' })
    const row = await getRow(db, id)
    row.status = 'failed_permanent'
    await put(db, row)

    expect((await listByStatus(db, 'pending')).length).toBe(0)
    expect((await listByStatus(db, 'failed_permanent')).length).toBe(1)
  })
})

describe('outbox.queue', () => {
  it('opens DB and enqueues a row', async () => {
    const db = await openOutbox()
    const id = await enqueue(db, {
      path: '/tours/1/expenses',
      method: 'POST',
      body: { amount: 8500 },
      headers: { 'Content-Type': 'application/json' },
      resource_kind: 'expense',
      display_label: '¥85 午饭',
    })

    expect(typeof id).toBe('number')
    expect(id).toBeGreaterThan(0)
  })

  it('getRow returns full row with defaults applied', async () => {
    const db = await openOutbox()
    const id = await enqueue(db, {
      path: '/expenses/42',
      method: 'PATCH',
      body: { amount: 9000 },
      // headers omitted → tests default
      resource_kind: 'expense',
      display_label: '改 ¥90',
    })
    const row = await getRow(db, id)

    expect(row.id).toBe(id)
    expect(row.path).toBe('/expenses/42')
    expect(row.method).toBe('PATCH')
    expect(row.attempts).toBe(0)
    expect(row.last_error).toBe('')
    expect(row.status).toBe('pending')
    expect(row.enqueued_at).toBeGreaterThan(0)
    expect(row.resource_kind).toBe('expense')
    expect(row.display_label).toBe('改 ¥90')
    expect(row.headers).toEqual({})
  })
})
