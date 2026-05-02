import { describe, it, expect, beforeEach } from 'vitest'
import { openOutbox, enqueue, getRow } from '../queue'

beforeEach(async () => {
  // fake-indexeddb 用 jsdom 全局 indexedDB,每个测试新实例
  indexedDB = new IDBFactory()
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
      headers: {},
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
  })
})
