// IndexedDB wrapper for outbox queue.
//
// 用原生 IDB API,不引 idb 库 — schema 简单(单 store),依赖换库的成本不值。
// API 是 Promise 化的封装(IDB 原生回调用起来痛苦)。
//
// 跨浏览器 quirk:Safari 在 transaction 完成后才能 await `.onsuccess`;
// 我们用 `.complete` Promise 等到 transaction 整个 commit 才 resolve,
// 避免 "transaction has finished" race。

const DB_NAME = 'one-tour-outbox'
const DB_VERSION = 1
const STORE = 'mutations'

export function openOutbox() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onerror = () => reject(req.error)
    req.onupgradeneeded = (e) => {
      const db = e.target.result
      const store = db.createObjectStore(STORE, { keyPath: 'id', autoIncrement: true })
      store.createIndex('enqueued_at', 'enqueued_at')
      store.createIndex('status', 'status')
    }
    req.onsuccess = () => resolve(req.result)
  })
}

export function enqueue(db, partial) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite')
    const store = tx.objectStore(STORE)
    const row = {
      path: partial.path,
      method: partial.method,
      body: partial.body,
      headers: partial.headers || {},
      enqueued_at: Date.now(),
      attempts: 0,
      last_error: '',
      status: 'pending',
      resource_kind: partial.resource_kind,
      display_label: partial.display_label || '',
    }
    const req = store.add(row)
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

export function getRow(db, id) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly')
    const req = tx.objectStore(STORE).get(id)
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}
