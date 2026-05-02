// IndexedDB wrapper for outbox queue.
//
// 用原生 IDB API,不引 idb 库 — schema 简单(单 store),依赖换库的成本不值。
// API 是 Promise 化的封装(IDB 原生回调用起来痛苦)。
//
// 跨浏览器 quirk:Safari / iOS 在 page 失焦时会强制 abort 进行中的 IDB tx。
// 写操作 resolve 必须挂在 `tx.oncomplete`(req.onsuccess 早于 commit,Safari
// 上后续 read 可能看不到刚写的行)。tx.onabort / tx.onerror 也 reject,否则
// abort 时 Promise 永远 pending,UI 死等。读操作只 resolve req.onsuccess
// 即可(无 durability 担忧),但 abort/onerror 仍要 reject 防 hang。

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
    let newId
    req.onsuccess = () => { newId = req.result }
    req.onerror = () => reject(req.error)
    tx.oncomplete = () => resolve(newId)
    tx.onerror = () => reject(tx.error)
    tx.onabort = () => reject(tx.error || new DOMException('Transaction aborted', 'AbortError'))
  })
}

export function getRow(db, id) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly')
    const req = tx.objectStore(STORE).get(id)
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
    tx.onerror = () => reject(tx.error)
    tx.onabort = () => reject(tx.error || new DOMException('Transaction aborted', 'AbortError'))
  })
}

export function listByStatus(db, status) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly')
    const idx = tx.objectStore(STORE).index('status')
    const req = idx.getAll(status)
    req.onsuccess = () => {
      // 按 enqueued_at asc(FIFO replay)
      const sorted = req.result.sort((a, b) => a.enqueued_at - b.enqueued_at)
      resolve(sorted)
    }
    req.onerror = () => reject(req.error)
    tx.onerror = () => reject(tx.error)
    tx.onabort = () => reject(tx.error || new DOMException('Transaction aborted', 'AbortError'))
  })
}

export function put(db, row) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite')
    const req = tx.objectStore(STORE).put(row)
    let newId
    req.onsuccess = () => { newId = req.result }
    req.onerror = () => reject(req.error)
    tx.oncomplete = () => resolve(newId)
    tx.onerror = () => reject(tx.error)
    tx.onabort = () => reject(tx.error || new DOMException('Transaction aborted', 'AbortError'))
  })
}

export function deleteRow(db, id) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite')
    const req = tx.objectStore(STORE).delete(id)
    req.onerror = () => reject(req.error)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
    tx.onabort = () => reject(tx.error || new DOMException('Transaction aborted', 'AbortError'))
  })
}
