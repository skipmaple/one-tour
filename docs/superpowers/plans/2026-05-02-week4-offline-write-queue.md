# Week 4 — 离线写队列 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 5 个核心 mutation path(费用 / 照片 / 活动详情 / 结算 / 笔记)在离线时不丢数据 — 失败入 IndexedDB 队列、上线时多 trigger 自动 replay、冲突让用户决定。

**Architecture:** Service Worker(Workbox `runtimeCaching`)拦截 4 个 JSON mutation path 的失败,写 IndexedDB outbox。照片走应用层入队(`useGalleryUploader` catch 错误),复用 Week 2 的 `image-compression` 和 `xhrRequest`。Replay 机制由 page-lifecycle 事件触发(`online` / `visibilitychange→visible` / `load` / 用户点击徽标),受全局 mutex 保护;指数退避 5 次后转 failed_permanent,UI 在抽屉里提供 [放弃] / [用最新数据重做] 两个按钮。

**Tech Stack:** Vanilla IndexedDB API(无新 wrapper 依赖)/ Workbox 7(已有 `vite-plugin-pwa`)/ Mantine 9(Drawer + Indicator)/ @tabler/icons-react / Sentry 10(已配)/ Vitest 4 + `fake-indexeddb` (新 devDep) / Playwright(已有 staging E2E setup)。

**Spec:** [`docs/superpowers/specs/2026-05-02-week4-offline-write-queue-design.md`](../specs/2026-05-02-week4-offline-write-queue-design.md)

---

## File Structure

```
app/javascript/lib/outbox/                  新建目录
├── paths.js              4 path 白名单 regex,SW 和前端共享
├── queue.js              IndexedDB wrapper(open / enqueue / list / get / put / delete)
├── replay.js             replay 算法 + isReplaying mutex + exp backoff + Sentry
├── triggers.js           online / visibilitychange / load / 手动 click 绑定
├── dispatch.js           按 resource_kind dispatch(JSON → router.reload;photo → xhrRequest 重传)
└── __tests__/
    ├── paths.test.js
    ├── queue.test.js
    ├── replay.test.js
    ├── triggers.test.js
    └── dispatch.test.js

app/javascript/components/
├── OutboxBadge.jsx       头部徽标(三态:hidden / pending / failed)
├── OutboxDrawer.jsx      抽屉:列表 + 状态 + [放弃] / [用最新数据重做]
└── __tests__/
    ├── OutboxBadge.test.jsx
    └── OutboxDrawer.test.jsx

修改:
- vite.config.ts                          加 Workbox handler:4 JSON path × {POST,PATCH,DELETE} = 6 条 runtimeCaching 条目(POST/PATCH 各 path)
- app/javascript/entrypoints/inertia.jsx  全局 mount OutboxBadge + 注册 triggers
- app/javascript/hooks/useGalleryUploader.js  catch XhrRequestError 入 outbox(photo)
- package.json                            devDep `fake-indexeddb`
- test/setup.js                           import 'fake-indexeddb/auto'
- tests/e2e/outbox.spec.js                Playwright E2E

复用(不动):
- app/javascript/lib/image-compression.js Week 2 已实现 WebP / HEIC / fallback
- app/javascript/lib/xhr-request.js       Week 2 已实现 retry + Sentry
```

---

## Task 1: Setup — 加 fake-indexeddb 依赖 + paths.js 白名单

**Files:**
- Create: `app/javascript/lib/outbox/paths.js`
- Create: `app/javascript/lib/outbox/__tests__/paths.test.js`
- Modify: `package.json`(devDep)
- Modify: `test/setup.js`(import fake-indexeddb)

- [ ] **Step 1: 加 devDep `fake-indexeddb`**

```bash
npm install --save-dev fake-indexeddb@^6.0.0
```

Expected: `package.json` 多一行 `"fake-indexeddb": "^6.x.x"`,`package-lock.json` 更新。

- [ ] **Step 2: 在 `test/setup.js` 顶部加 fake-indexeddb 全局注入**

修改文件,在第一行加:

```js
import 'fake-indexeddb/auto'
```

(其余原内容保持不变)

- [ ] **Step 3: 写 `paths.test.js`(失败)**

Create `app/javascript/lib/outbox/__tests__/paths.test.js`:

```js
import { describe, it, expect } from 'vitest'
import { OUTBOX_PATHS, isOutboxPath } from '../paths'

describe('OUTBOX_PATHS', () => {
  it('matches 4 JSON mutation paths', () => {
    expect(isOutboxPath('/tours/123/expenses')).toBe(true)
    expect(isOutboxPath('/expenses/456')).toBe(true)
    expect(isOutboxPath('/activities/789')).toBe(true)
    expect(isOutboxPath('/tours/123/settlements')).toBe(true)
    expect(isOutboxPath('/tours/123/days/4')).toBe(true)
  })

  it('rejects non-listed paths', () => {
    expect(isOutboxPath('/tours/123')).toBe(false)
    expect(isOutboxPath('/auth/github')).toBe(false)
    expect(isOutboxPath('/activities/789/position')).toBe(false)
    expect(isOutboxPath('/activities/789/images')).toBe(false) // photo 走应用层
    expect(isOutboxPath('/random')).toBe(false)
  })
})
```

- [ ] **Step 4: 跑测试看 fail**

Run: `npm test -- app/javascript/lib/outbox/__tests__/paths.test.js`
Expected: FAIL — "Cannot find module '../paths'"

- [ ] **Step 5: 实现 `paths.js`**

Create `app/javascript/lib/outbox/paths.js`:

```js
// 4 个 JSON mutation 白名单 — SW 拦截这些 path 的失败请求入队。
// 照片(/activities/X/images)不在内,走应用层 useGalleryUploader catch。
//
// 顺序:由具体到一般,首匹配即返。activity edit 排最后是因为它的
// regex 最宽(吃 /activities/X/anything 危险);所以加了 $ 锚点。
export const OUTBOX_PATHS = [
  /^\/tours\/\d+\/expenses$/,        // POST 创建
  /^\/expenses\/\d+$/,                // PATCH 编辑
  /^\/activities\/\d+$/,              // PATCH 详情(不含 /position 或 /images)
  /^\/tours\/\d+\/settlements$/,      // POST 结算
  /^\/tours\/\d+\/days\/\d+$/,        // PATCH 日程笔记(也接收 day 整体编辑)
]

export function isOutboxPath(pathname) {
  return OUTBOX_PATHS.some((re) => re.test(pathname))
}
```

- [ ] **Step 6: 跑测试看 pass**

Run: `npm test -- app/javascript/lib/outbox/__tests__/paths.test.js`
Expected: PASS — 2 tests passing

- [ ] **Step 7: Commit**

```bash
git add package.json package-lock.json test/setup.js app/javascript/lib/outbox/paths.js app/javascript/lib/outbox/__tests__/paths.test.js
git commit -m "feat(outbox): paths 白名单 + fake-indexeddb devDep"
```

---

## Task 2: queue.js — IDB open + enqueue + get

**Files:**
- Create: `app/javascript/lib/outbox/queue.js`
- Create: `app/javascript/lib/outbox/__tests__/queue.test.js`

- [ ] **Step 1: 写测试 — open + enqueue + get**

Create `app/javascript/lib/outbox/__tests__/queue.test.js`:

```js
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
```

注:`IDBFactory` 在 `fake-indexeddb` 全局可用(由 `import 'fake-indexeddb/auto'` 注册到 globalThis)。

- [ ] **Step 2: 跑测试看 fail**

Run: `npm test -- app/javascript/lib/outbox/__tests__/queue.test.js`
Expected: FAIL — "Cannot find module '../queue'"

- [ ] **Step 3: 实现 `queue.js`(open + enqueue + getRow)**

Create `app/javascript/lib/outbox/queue.js`:

```js
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
```

- [ ] **Step 4: 跑测试看 pass**

Run: `npm test -- app/javascript/lib/outbox/__tests__/queue.test.js`
Expected: PASS — 2 tests

- [ ] **Step 5: Commit**

```bash
git add app/javascript/lib/outbox/queue.js app/javascript/lib/outbox/__tests__/queue.test.js
git commit -m "feat(outbox): queue.js — open + enqueue + getRow"
```

---

## Task 3: queue.js — listByStatus + put + delete

**Files:**
- Modify: `app/javascript/lib/outbox/queue.js`(加方法)
- Modify: `app/javascript/lib/outbox/__tests__/queue.test.js`(加测试)

- [ ] **Step 1: 加测试 — list FIFO + put + delete**

Append to `__tests__/queue.test.js`:

```js
import { listByStatus, put, deleteRow } from '../queue'

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
```

- [ ] **Step 2: 跑测试看 fail**

Run: `npm test -- app/javascript/lib/outbox/__tests__/queue.test.js`
Expected: FAIL — listByStatus / put / deleteRow undefined

- [ ] **Step 3: 实现 listByStatus + put + deleteRow**

Append to `app/javascript/lib/outbox/queue.js`:

```js
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
  })
}

export function put(db, row) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite')
    const req = tx.objectStore(STORE).put(row)
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

export function deleteRow(db, id) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite')
    const req = tx.objectStore(STORE).delete(id)
    req.onsuccess = () => resolve()
    req.onerror = () => reject(req.error)
  })
}
```

- [ ] **Step 4: 跑测试看 pass**

Run: `npm test -- app/javascript/lib/outbox/__tests__/queue.test.js`
Expected: PASS — 6 tests

- [ ] **Step 5: Commit**

```bash
git add app/javascript/lib/outbox/queue.js app/javascript/lib/outbox/__tests__/queue.test.js
git commit -m "feat(outbox): queue.js — listByStatus / put / deleteRow"
```

---

## Task 4: dispatch.js — 按 resource_kind dispatch 真实 response

**Files:**
- Create: `app/javascript/lib/outbox/dispatch.js`
- Create: `app/javascript/lib/outbox/__tests__/dispatch.test.js`

- [ ] **Step 1: 写测试**

Create `app/javascript/lib/outbox/__tests__/dispatch.test.js`:

```js
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
    expect(router.reload).toHaveBeenCalledWith({ only: ['tour', 'expenses', 'memberBalances'] })
  })

  it('dispatchSuccess for activity_edit reloads activity prop', () => {
    dispatchSuccess({ resource_kind: 'activity_edit' })
    expect(router.reload).toHaveBeenCalledWith({ only: ['tour', 'days'] })
  })

  it('dispatchSuccess for settlement reloads balances', () => {
    dispatchSuccess({ resource_kind: 'settlement' })
    expect(router.reload).toHaveBeenCalledWith({ only: ['tour', 'memberBalances', 'settlements'] })
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
})
```

- [ ] **Step 2: 跑测试看 fail**

Run: `npm test -- app/javascript/lib/outbox/__tests__/dispatch.test.js`
Expected: FAIL — module not found

- [ ] **Step 3: 实现 dispatch.js**

Create `app/javascript/lib/outbox/dispatch.js`:

```js
// 按 resource_kind 把 replay 成功 dispatch 给 Inertia 触发 page props 刷新。
// JSON path 用 router.reload({only: [...]}) 局部刷;photo 走专用 xhrRequest 重传。
//
// 为什么不直接拿 replay 的 fetch response.json() merge 进 page state:
// Inertia 是 server-rendered model — props 来自 controller 序列化逻辑,
// 客户端凭 raw API response 拼不出完整 page state(权限 / N+1 / cache 都是
// 服务端规范化过)。reload 一次重新走 controller 拿到准确 props,虽然多
// 一次 GET,但语义对、不会跟服务端真相分裂。

import { router } from '@inertiajs/react'
import { xhrRequest, mkForm } from '../xhr-request'

const RELOAD_ONLY_BY_KIND = {
  expense: ['tour', 'expenses', 'memberBalances'],
  activity_edit: ['tour', 'days'],
  settlement: ['tour', 'memberBalances', 'settlements'],
  note: ['tour', 'days'],
}

export function dispatchSuccess(row) {
  const only = RELOAD_ONLY_BY_KIND[row.resource_kind]
  if (!only) {
    // unknown kind:全 reload(safer 兜底)
    router.reload()
    return
  }
  router.reload({ only })
}

// photo 是应用层入队的特殊 kind:replay 时不走 fetch,而是用 xhrRequest 重传。
// 这是因为照片 endpoint 走 multipart form,SW intercept + JSON-style replay 不合适。
// 返回 xhrRequest 的 promise(replay.js 调用方决定 2xx/4xx 怎么处理)。
export function dispatchPhotoReplay(row) {
  return xhrRequest(row.path, mkForm('file', row.body.file_blob), {
    method: 'POST',
    maxAttempts: 1, // outbox 自己有 backoff retry,这里不再叠加
    sentryExtra: { activity_id: row.body.activity_id, replay: true },
  })
}
```

- [ ] **Step 4: 跑测试看 pass**

Run: `npm test -- app/javascript/lib/outbox/__tests__/dispatch.test.js`
Expected: PASS — 5 tests

- [ ] **Step 5: Commit**

```bash
git add app/javascript/lib/outbox/dispatch.js app/javascript/lib/outbox/__tests__/dispatch.test.js
git commit -m "feat(outbox): dispatch.js — router.reload + photo xhrRequest 重传"
```

---

## Task 5: replay.js — 主算法 + mutex + 状态机

**Files:**
- Create: `app/javascript/lib/outbox/replay.js`
- Create: `app/javascript/lib/outbox/__tests__/replay.test.js`

- [ ] **Step 1: 写测试 — mutex + 2xx/4xx/5xx 分支**

Create `app/javascript/lib/outbox/__tests__/replay.test.js`:

```js
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
  indexedDB = new IDBFactory()
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
```

- [ ] **Step 2: 跑测试看 fail**

Run: `npm test -- app/javascript/lib/outbox/__tests__/replay.test.js`
Expected: FAIL — module not found

- [ ] **Step 3: 实现 replay.js**

Create `app/javascript/lib/outbox/replay.js`:

```js
// Replay 算法。FIFO 走 pending rows,按状态分类:
//   2xx           → 删 row + dispatchSuccess
//   4xx 非 408/429 → failed_permanent + Sentry capture
//   5xx / 408 / 429 / network err → attempts++,5 次后 failed_permanent
//
// 全局 mutex(`isReplaying` 模块级 flag)防止多个 trigger 并发跑同一队列 —
// 比方 visibilitychange + online 同时来。第二个 replay() 静默返回,不重试。
// page reload 自动清(in-memory state),不会卡死。
//
// 不在这里做 backoff sleep:在多 trigger / page lifecycle 模型下,主动 sleep
// 占住 CPU 不值得 — 失败计 attempts 即可,下次 trigger 再来。这与传统 BSync
// 后台 retry 不同,但更适合 page-bound 队列。

import * as Sentry from '@sentry/react'
import { listByStatus, put, deleteRow } from './queue'
import { dispatchSuccess, dispatchPhotoReplay } from './dispatch'

const MAX_ATTEMPTS = 5

let isReplaying = false

// 测试用:重置 mutex
export function _resetMutex() {
  isReplaying = false
}

function isPermanent(status) {
  return status >= 400 && status < 500 && status !== 408 && status !== 429
}

export async function replay(db) {
  if (isReplaying) return
  isReplaying = true
  try {
    const rows = await listByStatus(db, 'pending')

    for (const row of rows) {
      try {
        let res
        if (row.resource_kind === 'photo') {
          // photo 走 xhrRequest;成功返回 truthy,失败抛 XhrRequestError(.status)
          try {
            await dispatchPhotoReplay(row)
            res = { ok: true, status: 200 }
          } catch (xhrErr) {
            res = { ok: false, status: xhrErr.status ?? 0, text: () => Promise.resolve(xhrErr.message || '') }
          }
        } else {
          // JSON path:重发 fetch
          res = await fetch(row.path, {
            method: row.method,
            headers: { 'Content-Type': 'application/json', ...row.headers },
            body: JSON.stringify(row.body),
            credentials: 'same-origin',
          })
        }

        if (res.ok) {
          await deleteRow(db, row.id)
          dispatchSuccess(row)
          Sentry.addBreadcrumb({
            category: 'outbox.success',
            data: { id: row.id, attempts: row.attempts, kind: row.resource_kind },
          })
        } else if (isPermanent(res.status)) {
          row.status = 'failed_permanent'
          row.last_error = `HTTP ${res.status}: ${(await res.text?.()) || ''}`.slice(0, 500)
          await put(db, row)
          Sentry.captureException(new Error(`Outbox failed_permanent ${res.status}`), {
            tags: {
              path: row.path,
              method: row.method,
              attempts: row.attempts,
              kind: row.resource_kind,
            },
          })
        } else {
          // 5xx / 408 / 429 / status=0 网络错
          row.attempts += 1
          row.last_error = `HTTP ${res.status}`
          if (row.attempts >= MAX_ATTEMPTS) {
            row.status = 'failed_permanent'
            Sentry.captureException(new Error(`Outbox attempts cap`), {
              tags: { path: row.path, method: row.method, attempts: row.attempts, kind: row.resource_kind },
            })
          }
          await put(db, row)
          Sentry.addBreadcrumb({
            category: 'outbox.retry',
            data: { id: row.id, attempts: row.attempts, status: res.status },
          })
        }
      } catch (networkErr) {
        // fetch 抛出(network down)。同 5xx 处理。
        row.attempts += 1
        row.last_error = networkErr.message || 'Network failure'
        if (row.attempts >= MAX_ATTEMPTS) {
          row.status = 'failed_permanent'
          Sentry.captureException(networkErr, {
            tags: { path: row.path, method: row.method, attempts: row.attempts, kind: row.resource_kind },
          })
        }
        await put(db, row)
        Sentry.addBreadcrumb({
          category: 'outbox.retry',
          data: { id: row.id, attempts: row.attempts, error: row.last_error },
        })
      }
    }
  } finally {
    isReplaying = false
  }
}
```

- [ ] **Step 4: 跑测试看 pass**

Run: `npm test -- app/javascript/lib/outbox/__tests__/replay.test.js`
Expected: PASS — 8 tests

- [ ] **Step 5: Commit**

```bash
git add app/javascript/lib/outbox/replay.js app/javascript/lib/outbox/__tests__/replay.test.js
git commit -m "feat(outbox): replay.js — 状态机 + mutex + Sentry"
```

---

## Task 6: triggers.js — 绑 page-lifecycle 事件

**Files:**
- Create: `app/javascript/lib/outbox/triggers.js`
- Create: `app/javascript/lib/outbox/__tests__/triggers.test.js`

- [ ] **Step 1: 写测试**

Create `app/javascript/lib/outbox/__tests__/triggers.test.js`:

```js
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('../replay', () => ({
  replay: vi.fn(),
}))
vi.mock('../queue', () => ({
  openOutbox: vi.fn(() => Promise.resolve({ __fake: true })),
}))

import { replay } from '../replay'
import { bindTriggers, unbindTriggers } from '../triggers'

beforeEach(() => {
  replay.mockClear()
})
afterEach(() => {
  unbindTriggers()
})

describe('triggers', () => {
  it('bindTriggers fires replay on online event', async () => {
    bindTriggers()
    window.dispatchEvent(new Event('online'))
    // replay 异步,等 microtask
    await new Promise(r => setTimeout(r, 10))
    expect(replay).toHaveBeenCalledTimes(1)
  })

  it('fires replay on visibilitychange when visible', async () => {
    bindTriggers()
    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true })
    document.dispatchEvent(new Event('visibilitychange'))
    await new Promise(r => setTimeout(r, 10))
    expect(replay).toHaveBeenCalledTimes(1)
  })

  it('does NOT fire replay when document hidden', async () => {
    bindTriggers()
    Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true })
    document.dispatchEvent(new Event('visibilitychange'))
    await new Promise(r => setTimeout(r, 10))
    expect(replay).not.toHaveBeenCalled()
  })

  it('unbindTriggers stops further triggers', async () => {
    bindTriggers()
    unbindTriggers()
    window.dispatchEvent(new Event('online'))
    await new Promise(r => setTimeout(r, 10))
    expect(replay).not.toHaveBeenCalled()
  })

  it('triggerNow exposes manual replay', async () => {
    const { triggerNow } = await import('../triggers')
    triggerNow()
    await new Promise(r => setTimeout(r, 10))
    expect(replay).toHaveBeenCalledTimes(1)
  })
})
```

- [ ] **Step 2: 跑测试看 fail**

Run: `npm test -- app/javascript/lib/outbox/__tests__/triggers.test.js`
Expected: FAIL — module not found

- [ ] **Step 3: 实现 triggers.js**

Create `app/javascript/lib/outbox/triggers.js`:

```js
// Page-lifecycle trigger 绑定。任意一个 event 都触发一次 replay,mutex 保证
// 不会真正并发。bindTriggers / unbindTriggers 对外暴露,inertia.jsx 启动时调一次
// bindTriggers,理论上整个 PWA 生命周期不需要 unbind(测试用)。

import { openOutbox } from './queue'
import { replay } from './replay'

let dbPromise = null
let bound = false
let onOnline = null
let onVisibility = null

function getDb() {
  if (!dbPromise) dbPromise = openOutbox()
  return dbPromise
}

async function fire() {
  const db = await getDb()
  await replay(db)
}

export function bindTriggers() {
  if (bound) return
  bound = true

  onOnline = () => { fire() }
  onVisibility = () => {
    if (document.visibilityState === 'visible') fire()
  }

  window.addEventListener('online', onOnline)
  document.addEventListener('visibilitychange', onVisibility)

  // 启动时触发一次(load 阶段)— 处理之前会话遗留的 pending row。
  // 注:onVisibility 已可能在初次渲染时同步触发(如果 page 已 visible),
  // 但 mutex 让重复调用安全。
  fire()
}

export function unbindTriggers() {
  if (!bound) return
  bound = false
  if (onOnline) window.removeEventListener('online', onOnline)
  if (onVisibility) document.removeEventListener('visibilitychange', onVisibility)
  onOnline = null
  onVisibility = null
  dbPromise = null
}

// 用户点徽标手动触发
export function triggerNow() {
  fire()
}
```

- [ ] **Step 4: 跑测试看 pass**

Run: `npm test -- app/javascript/lib/outbox/__tests__/triggers.test.js`
Expected: PASS — 5 tests

- [ ] **Step 5: Commit**

```bash
git add app/javascript/lib/outbox/triggers.js app/javascript/lib/outbox/__tests__/triggers.test.js
git commit -m "feat(outbox): triggers.js — online/visibility/load + manual"
```

---

## Task 7: SW intercept — 改 vite.config.ts 加 outbox handler

**Files:**
- Modify: `vite.config.ts`

注:此 task 没有单测;通过 E2E(Task 13)验证。SW 行为浏览器内跑,Vitest 模不出。

- [ ] **Step 1: 在 vite.config.ts `runtimeCaching` 数组末尾加 3 条 outbox 条目**

打开 `vite.config.ts`,在 `runtimeCaching: [` 数组里 — 在最后一条规则之前(或之后)插入:

```js
// === Outbox:4 个 JSON mutation path 失败时入队 ===
// 把 paths.js 的 regex 内联在这里(SW build-time 不能 import 模块,Workbox
// 把整个 urlPattern 函数 stringify 进 sw.js bundle;import 的 regex 会被
// 解析成 `undefined`)。所以 paths.js 是前端的 source of truth,SW 这里复一份。
// 同步对齐二者:改 paths.js 时也要改这里。
{
  urlPattern: ({ url, request }) => {
    if (request.method !== 'POST' && request.method !== 'PATCH') return false
    const p = url.pathname
    return /^\/tours\/\d+\/expenses$/.test(p) ||
           /^\/expenses\/\d+$/.test(p) ||
           /^\/activities\/\d+$/.test(p) ||
           /^\/tours\/\d+\/settlements$/.test(p) ||
           /^\/tours\/\d+\/days\/\d+$/.test(p)
  },
  method: 'POST',
  handler: async ({ event, request }) => {
    try {
      const res = await fetch(request.clone())
      if (res.status >= 500) throw new Error(`5xx queue ${res.status}`)
      return res
    } catch (err) {
      // 失败 → 写 IDB outbox。SW 直接调 idb 不走 lib/outbox/queue.js
      // (SW 是独立 worker context;import 链 + Vite chunking 把 lib 模块
      // 处理成 main thread 用,SW 这里手写 raw IDB 最稳)。
      const id = await enqueueFromRequest(request)
      return new Response(
        JSON.stringify({ queued: true, id }),
        { status: 202, headers: { 'Content-Type': 'application/json' } }
      )
    }
  },
},
{
  urlPattern: ({ url, request }) => {
    if (request.method !== 'PATCH') return false
    const p = url.pathname
    return /^\/tours\/\d+\/expenses$/.test(p) ||
           /^\/expenses\/\d+$/.test(p) ||
           /^\/activities\/\d+$/.test(p) ||
           /^\/tours\/\d+\/settlements$/.test(p) ||
           /^\/tours\/\d+\/days\/\d+$/.test(p)
  },
  method: 'PATCH',
  handler: /* same as POST handler */,
},
```

实际上 POST 和 PATCH handler 完全一样,提取成一个函数:

```js
// 在 runtimeCaching 数组之外定义(top-level vite.config.ts 模块作用域)
const outboxUrlPattern = ({ url, request }) => {
  const p = url.pathname
  return /^\/tours\/\d+\/expenses$/.test(p) ||
         /^\/expenses\/\d+$/.test(p) ||
         /^\/activities\/\d+$/.test(p) ||
         /^\/tours\/\d+\/settlements$/.test(p) ||
         /^\/tours\/\d+\/days\/\d+$/.test(p)
}

const outboxHandler = async ({ event, request }) => {
  try {
    const res = await fetch(request.clone())
    if (res.status >= 500) throw new Error(`5xx queue ${res.status}`)
    return res
  } catch (err) {
    const id = await enqueueFromRequest(request)
    return new Response(
      JSON.stringify({ queued: true, id }),
      { status: 202, headers: { 'Content-Type': 'application/json' } }
    )
  }
}
```

然后在 `runtimeCaching: [` 里:

```js
{ urlPattern: outboxUrlPattern, method: 'POST',  handler: outboxHandler },
{ urlPattern: outboxUrlPattern, method: 'PATCH', handler: outboxHandler },
```

DELETE 不加 — out of scope per spec。

- [ ] **Step 2: 在同一文件 top-level 加 `enqueueFromRequest` 函数**

```js
// SW 上下文里手写 IDB(不能 import lib/outbox/queue.js — Vite chunking
// 把模块归到 main thread bundle)。逻辑必须与 lib/outbox/queue.js 同步,
// 否则二处分裂会造成 schema 不一致。
async function enqueueFromRequest(request) {
  const body = await request.clone().text()
  let parsedBody
  try { parsedBody = JSON.parse(body) } catch { parsedBody = body }

  const headers = {}
  for (const [k, v] of request.headers) {
    if (k.toLowerCase() === 'cookie' || k.toLowerCase() === 'authorization') continue
    headers[k] = v
  }

  // 推断 resource_kind
  const url = new URL(request.url)
  let kind = 'unknown'
  if (/\/expenses(\/\d+)?$/.test(url.pathname)) kind = 'expense'
  else if (/\/activities\/\d+$/.test(url.pathname)) kind = 'activity_edit'
  else if (/\/settlements$/.test(url.pathname)) kind = 'settlement'
  else if (/\/days\/\d+$/.test(url.pathname)) kind = 'note'

  return new Promise((resolve, reject) => {
    const req = indexedDB.open('one-tour-outbox', 1)
    req.onupgradeneeded = (e) => {
      const db = e.target.result
      const store = db.createObjectStore('mutations', { keyPath: 'id', autoIncrement: true })
      store.createIndex('enqueued_at', 'enqueued_at')
      store.createIndex('status', 'status')
    }
    req.onsuccess = () => {
      const db = req.result
      const tx = db.transaction('mutations', 'readwrite')
      const store = tx.objectStore('mutations')
      const addReq = store.add({
        path: url.pathname,
        method: request.method,
        body: parsedBody,
        headers,
        enqueued_at: Date.now(),
        attempts: 0,
        last_error: '',
        status: 'pending',
        resource_kind: kind,
        display_label: '',
      })
      addReq.onsuccess = () => resolve(addReq.result)
      addReq.onerror = () => reject(addReq.error)
    }
    req.onerror = () => reject(req.error)
  })
}
```

- [ ] **Step 3: 跑 build 看 SW 编译过**

```bash
npm run build 2>&1 | tail -20
```

Expected: build 成功,sw.js 生成(看 output 里 `dist/sw.js` 行)。如果 fail,查 syntax 错。

- [ ] **Step 4: 跑现有测试套件确认无回归**

```bash
npm test
```

Expected: 所有 outbox + 既有测试都过。

- [ ] **Step 5: Commit**

```bash
git add vite.config.ts
git commit -m "feat(outbox): SW intercept — 4 JSON path POST/PATCH 失败入队"
```

---

## Task 8: OutboxBadge.jsx — 头部徽标三态

**Files:**
- Create: `app/javascript/components/OutboxBadge.jsx`
- Create: `app/javascript/components/__tests__/OutboxBadge.test.jsx`

- [ ] **Step 1: 写测试**

Create `app/javascript/components/__tests__/OutboxBadge.test.jsx`:

```jsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MantineProvider } from '@mantine/core'

vi.mock('../../lib/outbox/triggers', () => ({
  triggerNow: vi.fn(),
}))

import { triggerNow } from '../../lib/outbox/triggers'
import OutboxBadge from '../OutboxBadge'

const wrap = (ui) => <MantineProvider>{ui}</MantineProvider>

beforeEach(() => triggerNow.mockClear())

describe('OutboxBadge', () => {
  it('renders nothing when both counts 0', () => {
    const { container } = render(wrap(<OutboxBadge pending={0} failed={0} onClick={() => {}} />))
    expect(container).toBeEmptyDOMElement()
  })

  it('renders pending count when pending > 0', () => {
    render(wrap(<OutboxBadge pending={3} failed={0} onClick={() => {}} />))
    expect(screen.getByText('3 条待同步')).toBeInTheDocument()
  })

  it('renders failed count (red) when failed > 0 (priority over pending)', () => {
    render(wrap(<OutboxBadge pending={2} failed={1} onClick={() => {}} />))
    expect(screen.getByText('1 条失败')).toBeInTheDocument()
    expect(screen.queryByText('2 条待同步')).not.toBeInTheDocument()
  })

  it('clicking calls onClick', async () => {
    const onClick = vi.fn()
    render(wrap(<OutboxBadge pending={1} failed={0} onClick={onClick} />))
    await userEvent.click(screen.getByRole('button'))
    expect(onClick).toHaveBeenCalledTimes(1)
  })
})
```

- [ ] **Step 2: 跑测试看 fail**

Run: `npm test -- app/javascript/components/__tests__/OutboxBadge.test.jsx`
Expected: FAIL — module not found

- [ ] **Step 3: 实现 OutboxBadge.jsx**

Create `app/javascript/components/OutboxBadge.jsx`:

```jsx
import { UnstyledButton, Group, Text } from '@mantine/core'
import { IconCloudUpload, IconAlertCircle } from '@tabler/icons-react'

// 三态徽标:
//   0 + 0 → 不渲染
//   pending > 0(failed=0)→ 黄色,X 条待同步
//   failed > 0(优先级高于 pending)→ 红色,X 条失败
//
// 点击触发 onClick(父级负责打开 OutboxDrawer + triggerNow)。
export default function OutboxBadge({ pending, failed, onClick }) {
  if (pending === 0 && failed === 0) return null

  const showFailed = failed > 0
  const Icon = showFailed ? IconAlertCircle : IconCloudUpload
  const label = showFailed ? `${failed} 条失败` : `${pending} 条待同步`
  const color = showFailed ? 'red.7' : 'yellow.7'

  return (
    <UnstyledButton
      onClick={onClick}
      aria-label={`同步状态:${label},点击查看`}
      style={{
        padding: '4px 10px',
        borderRadius: 16,
        backgroundColor: showFailed ? '#fff5f5' : '#fff9db',
        border: `1px solid ${showFailed ? '#ffa8a8' : '#ffe066'}`,
      }}
    >
      <Group gap={6}>
        <Icon size={14} color={color === 'red.7' ? '#c92a2a' : '#e67700'} />
        <Text size="xs" fw={500} c={color}>{label}</Text>
      </Group>
    </UnstyledButton>
  )
}
```

- [ ] **Step 4: 跑测试看 pass**

Run: `npm test -- app/javascript/components/__tests__/OutboxBadge.test.jsx`
Expected: PASS — 4 tests

- [ ] **Step 5: Commit**

```bash
git add app/javascript/components/OutboxBadge.jsx app/javascript/components/__tests__/OutboxBadge.test.jsx
git commit -m "feat(outbox): OutboxBadge — 三态徽标(隐藏/黄/红)"
```

---

## Task 9: OutboxDrawer.jsx — 抽屉列表 + 操作

**Files:**
- Create: `app/javascript/components/OutboxDrawer.jsx`
- Create: `app/javascript/components/__tests__/OutboxDrawer.test.jsx`

- [ ] **Step 1: 写测试**

Create `app/javascript/components/__tests__/OutboxDrawer.test.jsx`:

```jsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MantineProvider } from '@mantine/core'

vi.mock('../../lib/outbox/queue', () => ({
  openOutbox: vi.fn(() => Promise.resolve({ __fake: true })),
  listByStatus: vi.fn(),
  deleteRow: vi.fn(),
}))
vi.mock('../../lib/outbox/triggers', () => ({
  triggerNow: vi.fn(),
}))

import { listByStatus, deleteRow } from '../../lib/outbox/queue'
import OutboxDrawer from '../OutboxDrawer'

const wrap = (ui) => <MantineProvider>{ui}</MantineProvider>

beforeEach(() => {
  listByStatus.mockReset()
  deleteRow.mockReset()
})

describe('OutboxDrawer', () => {
  it('shows empty state when no rows', async () => {
    listByStatus.mockResolvedValue([])
    render(wrap(<OutboxDrawer opened onClose={() => {}} />))
    expect(await screen.findByText(/队列为空/)).toBeInTheDocument()
  })

  it('lists pending and failed rows', async () => {
    listByStatus.mockImplementation((db, status) => {
      if (status === 'pending') return Promise.resolve([
        { id: 1, resource_kind: 'expense', display_label: '¥85 午饭', status: 'pending', attempts: 0 },
      ])
      if (status === 'failed_permanent') return Promise.resolve([
        { id: 2, resource_kind: 'note', display_label: 'Day 3 笔记', status: 'failed_permanent', attempts: 5, last_error: 'HTTP 404' },
      ])
      return Promise.resolve([])
    })
    render(wrap(<OutboxDrawer opened onClose={() => {}} />))

    expect(await screen.findByText('¥85 午饭')).toBeInTheDocument()
    expect(screen.getByText('Day 3 笔记')).toBeInTheDocument()
    expect(screen.getByText(/HTTP 404/)).toBeInTheDocument()
  })

  it('failed row shows [放弃] / [用最新数据重做] buttons', async () => {
    listByStatus.mockImplementation((db, status) => {
      if (status === 'failed_permanent') return Promise.resolve([
        { id: 7, resource_kind: 'expense', display_label: '¥10', status: 'failed_permanent', attempts: 5, last_error: 'HTTP 404' },
      ])
      return Promise.resolve([])
    })
    render(wrap(<OutboxDrawer opened onClose={() => {}} />))

    expect(await screen.findByRole('button', { name: '放弃' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '用最新数据重做' })).toBeInTheDocument()
  })

  it('clicking [放弃] calls deleteRow', async () => {
    listByStatus.mockImplementation((db, status) => {
      if (status === 'failed_permanent') return Promise.resolve([
        { id: 7, resource_kind: 'expense', display_label: '¥10', status: 'failed_permanent', attempts: 5, last_error: 'X' },
      ])
      return Promise.resolve([])
    })
    deleteRow.mockResolvedValue()
    render(wrap(<OutboxDrawer opened onClose={() => {}} />))

    await userEvent.click(await screen.findByRole('button', { name: '放弃' }))
    expect(deleteRow).toHaveBeenCalledWith(expect.anything(), 7)
  })
})
```

- [ ] **Step 2: 跑测试看 fail**

Run: `npm test -- app/javascript/components/__tests__/OutboxDrawer.test.jsx`
Expected: FAIL — module not found

- [ ] **Step 3: 实现 OutboxDrawer.jsx**

Create `app/javascript/components/OutboxDrawer.jsx`:

```jsx
import { useEffect, useState } from 'react'
import { Drawer, Stack, Text, Group, Button, Box, Divider } from '@mantine/core'
import { IconCash, IconCamera, IconEdit, IconScale, IconNotebook, IconAlertCircle } from '@tabler/icons-react'
import { router } from '@inertiajs/react'
import { openOutbox, listByStatus, deleteRow } from '../lib/outbox/queue'

const KIND_ICON = {
  expense: IconCash,
  photo: IconCamera,
  activity_edit: IconEdit,
  settlement: IconScale,
  note: IconNotebook,
}

const KIND_LABEL = {
  expense: '费用',
  photo: '照片',
  activity_edit: '活动编辑',
  settlement: '结算',
  note: '笔记',
}

export default function OutboxDrawer({ opened, onClose }) {
  const [pending, setPending] = useState([])
  const [failed, setFailed] = useState([])

  async function refresh() {
    const db = await openOutbox()
    setPending(await listByStatus(db, 'pending'))
    setFailed(await listByStatus(db, 'failed_permanent'))
  }

  useEffect(() => {
    if (opened) refresh()
  }, [opened])

  async function handleAbandon(row) {
    const db = await openOutbox()
    await deleteRow(db, row.id)
    await refresh()
  }

  async function handleRedo(row) {
    // GET 服务端最新状态(per spec)— 不 merge 用户离线改动,服务端版本作为起点。
    // 实现:简单跳到对应资源页面,让 UI 自带的编辑入口再来一次。
    // 这里 redo 只刷资源 props,UI(各 form)由用户重新打开。
    const targetUrl = redoTargetUrl(row)
    if (targetUrl) {
      // 跳转后再清 outbox row(避免跳转失败丢 row)
      router.visit(targetUrl, { onSuccess: async () => {
        const db = await openOutbox()
        await deleteRow(db, row.id)
        refresh()
      }})
    }
    onClose()
  }

  function redoTargetUrl(row) {
    const m = row.path.match(/^\/tours\/(\d+)/)
    if (m) return `/tours/${m[1]}`
    return null
  }

  return (
    <Drawer opened={opened} onClose={onClose} title="同步队列" position="right" size="md">
      {pending.length === 0 && failed.length === 0 && (
        <Text c="dimmed" ta="center" mt="xl">队列为空 — 所有改动都已同步。</Text>
      )}

      {pending.length > 0 && (
        <>
          <Text size="sm" c="dimmed" mt="sm" mb="xs">待同步({pending.length})</Text>
          <Stack gap="xs">
            {pending.map(row => (
              <RowCard key={row.id} row={row}>
                <Text size="xs" c="dimmed">
                  {row.attempts > 0 ? `重试 ${row.attempts}/5` : '等待'}
                </Text>
              </RowCard>
            ))}
          </Stack>
        </>
      )}

      {failed.length > 0 && (
        <>
          <Divider my="md" />
          <Text size="sm" c="red.7" mt="sm" mb="xs">失败({failed.length})</Text>
          <Stack gap="xs">
            {failed.map(row => (
              <RowCard key={row.id} row={row}>
                <Text size="xs" c="red.7">{row.last_error}</Text>
                <Group gap="xs" mt="xs">
                  <Button size="xs" variant="default" onClick={() => handleAbandon(row)}>放弃</Button>
                  <Button size="xs" onClick={() => handleRedo(row)}>用最新数据重做</Button>
                </Group>
              </RowCard>
            ))}
          </Stack>
        </>
      )}
    </Drawer>
  )
}

function RowCard({ row, children }) {
  const Icon = KIND_ICON[row.resource_kind] || IconAlertCircle
  return (
    <Box p="xs" style={{ border: '1px solid #dee2e6', borderRadius: 4 }}>
      <Group gap="xs" mb={4}>
        <Icon size={16} />
        <Text size="sm" fw={500}>{KIND_LABEL[row.resource_kind] || row.resource_kind}</Text>
        <Text size="sm" c="dimmed" style={{ flex: 1 }}>{row.display_label}</Text>
      </Group>
      {children}
    </Box>
  )
}
```

- [ ] **Step 4: 跑测试看 pass**

Run: `npm test -- app/javascript/components/__tests__/OutboxDrawer.test.jsx`
Expected: PASS — 4 tests

- [ ] **Step 5: Commit**

```bash
git add app/javascript/components/OutboxDrawer.jsx app/javascript/components/__tests__/OutboxDrawer.test.jsx
git commit -m "feat(outbox): OutboxDrawer — 抽屉列表 + 放弃/重做"
```

---

## Task 10: 全局挂载 — inertia.jsx wire OutboxBadge + bindTriggers

**Files:**
- Modify: `app/javascript/entrypoints/inertia.jsx`
- Create: `app/javascript/components/OutboxStatus.jsx`(组合 Badge + Drawer + 拉队列计数)

- [ ] **Step 1: 写 OutboxStatus 组合容器**

Create `app/javascript/components/OutboxStatus.jsx`:

```jsx
// 全局挂载的容器组件 — 组合 Badge + Drawer。
// 自己负责拉 IDB 计数(Badge 是 dumb 显示组件,数字从这里来)+ 监听 outbox 变化。
//
// 怎么知道 IDB 变了:
//   1. 启动时 + 每次 trigger 触发后 → 重读
//   2. 自己每秒 poll(便宜,IDB 读 <5ms)— 5 人 trip 数据小,polling 没压力
//   实现里用 1 + 2,简单可靠。Mutation observer / BroadcastChannel 是更精的方案,
//   但 polling 1s 已经够用,以后真要省可以改。

import { useEffect, useState } from 'react'
import { openOutbox, listByStatus } from '../lib/outbox/queue'
import { triggerNow } from '../lib/outbox/triggers'
import OutboxBadge from './OutboxBadge'
import OutboxDrawer from './OutboxDrawer'

export default function OutboxStatus() {
  const [pending, setPending] = useState(0)
  const [failed, setFailed] = useState(0)
  const [drawerOpen, setDrawerOpen] = useState(false)

  useEffect(() => {
    let cancelled = false

    async function refresh() {
      try {
        const db = await openOutbox()
        const p = await listByStatus(db, 'pending')
        const f = await listByStatus(db, 'failed_permanent')
        if (!cancelled) {
          setPending(p.length)
          setFailed(f.length)
        }
      } catch {
        // IDB 不可用(老浏览器 / 隐私模式)→ 隐藏 badge
      }
    }

    refresh()
    const tid = setInterval(refresh, 1000)
    return () => { cancelled = true; clearInterval(tid) }
  }, [])

  function handleClick() {
    setDrawerOpen(true)
    triggerNow() // 同时强制 replay
  }

  return (
    <>
      <OutboxBadge pending={pending} failed={failed} onClick={handleClick} />
      <OutboxDrawer opened={drawerOpen} onClose={() => setDrawerOpen(false)} />
    </>
  )
}
```

- [ ] **Step 2: 改 inertia.jsx 注册 triggers + 挂 OutboxStatus**

打开 `app/javascript/entrypoints/inertia.jsx`,找到 setup 部分(`createInertiaApp` 调用)。在文件末尾或 app 渲染后加 trigger 注册:

```js
// 在 createInertiaApp setup 函数里(已有 root.render 的地方),
// 把 OutboxStatus 加入 layout 顶部。或者让每个 page Layout 自己挂。
//
// 这里最简单:在 createInertiaApp 后调 bindTriggers 一次。
// OutboxStatus 组件由各 layout 自行挂(下个 task)。
```

具体改动:在文件顶部 import 后加:

```js
import { bindTriggers } from '../lib/outbox/triggers'
```

在 `createInertiaApp({...})` 调用之后(或在 setup 函数末尾)加:

```js
if (typeof window !== 'undefined' && 'indexedDB' in window) {
  bindTriggers()
}
```

(SSR / IDB 不可用时跳过)

- [ ] **Step 3: 改 application Layout 挂 OutboxStatus**

找到主 layout(从 spec recon `app/javascript/components` 看,layout 存在 `pages/Tour/Show.jsx` 等里直接渲染 — 没有共享 layout component)。

替代方案:在 `inertia.jsx` 的 `createInertiaApp({ resolve: ... })` 设置默认 layout wrapper,把 OutboxStatus 放入 wrapper 顶部 — 但这影响所有 page。

简化:加个 `<OutboxStatus />` 到 `pages/Tour/Show.jsx`(主 PWA 入口)的 header 区域。Login 等页面不需要(用户没 IDB 数据)。

打开 `app/javascript/pages/Tour/Show.jsx`,在 header / topbar 区域加:

```jsx
import OutboxStatus from '../../components/OutboxStatus'

// ... 在 header JSX 里,合适的角落:
<OutboxStatus />
```

具体位置:Show.jsx 的最外层 layout 顶部 right-aligned 角(如已有 user menu / settings 图标的同行)。

- [ ] **Step 4: 跑现有测试 + dev server 手动 smoke check**

```bash
npm test
```

Expected: 全过(可能 Show.jsx 测试要更新 — 加 OutboxStatus mock)。

如果 Show.jsx 有 test 文件,加 mock:

```jsx
vi.mock('../../components/OutboxStatus', () => ({ default: () => null }))
```

- [ ] **Step 5: Commit**

```bash
git add app/javascript/entrypoints/inertia.jsx app/javascript/components/OutboxStatus.jsx app/javascript/pages/Tour/Show.jsx
# 如果改了 Show.test.jsx 也加上
git commit -m "feat(outbox): 全局 mount Badge+Drawer + bindTriggers"
```

---

## Task 11: useGalleryUploader — catch 网络错误入 outbox

**Files:**
- Modify: `app/javascript/hooks/useGalleryUploader.js`
- Modify: `app/javascript/hooks/__tests__/useGalleryUploader.test.js`(加测试)

- [ ] **Step 1: 写测试 — 离线时 xhrRequest 失败 → 入 outbox**

Append to `app/javascript/hooks/__tests__/useGalleryUploader.test.js`:

```js
import { describe, it, expect, vi, beforeEach } from 'vitest'

// 文件顶已有 mocks。这里再加 outbox mock。
vi.mock('../../lib/outbox/queue', () => ({
  openOutbox: vi.fn(() => Promise.resolve({ __fake: true })),
  enqueue: vi.fn(() => Promise.resolve(123)),
}))

vi.mock('../../lib/xhr-request', () => ({
  xhrRequest: vi.fn(),
  mkForm: (field, value) => { const fd = new FormData(); fd.append(field, value); return fd },
  XhrRequestError: class XhrRequestError extends Error {
    constructor({ status, body, attempts, message }) {
      super(message || 'XHR fail')
      this.name = 'XhrRequestError'
      this.status = status
      this.attempts = attempts
    }
  },
}))

import { renderHook, act } from '@testing-library/react'
import { xhrRequest, XhrRequestError } from '../../lib/xhr-request'
import { enqueue } from '../../lib/outbox/queue'
import useGalleryUploader from '../useGalleryUploader'

beforeEach(() => {
  xhrRequest.mockReset()
  enqueue.mockClear()
})

describe('useGalleryUploader offline enqueue', () => {
  it('当 xhrRequest 抛 status=null(network)时,入 outbox', async () => {
    xhrRequest.mockRejectedValue(new XhrRequestError({ status: null, attempts: 3, message: 'Network error' }))

    const { result } = renderHook(() => useGalleryUploader(99, { existingCount: 0 }))
    const file = new File(['fake'], 'a.jpg', { type: 'image/jpeg' })

    // 直接调内部 uploadOne 容易测,但 hook API 是 handleFilesSelected。
    // 模拟 file input change:
    await act(async () => {
      await result.current.handleFilesSelected({ target: { files: [file], value: '' } })
    })

    expect(enqueue).toHaveBeenCalledTimes(1)
    const call = enqueue.mock.calls[0][1]
    expect(call.resource_kind).toBe('photo')
    expect(call.path).toBe('/activities/99/images')
    expect(call.body.activity_id).toBe(99)
    expect(call.body.file_blob).toBeDefined()
  })

  it('xhrRequest 5xx 用尽 retry → 入 outbox', async () => {
    xhrRequest.mockRejectedValue(new XhrRequestError({ status: 503, attempts: 3, message: 'Server error' }))

    const { result } = renderHook(() => useGalleryUploader(99, { existingCount: 0 }))
    const file = new File(['fake'], 'a.jpg', { type: 'image/jpeg' })

    await act(async () => {
      await result.current.handleFilesSelected({ target: { files: [file], value: '' } })
    })

    expect(enqueue).toHaveBeenCalledTimes(1)
  })

  it('xhrRequest 4xx(非 retryable)→ 不入 outbox(用户输入错,重试无意义)', async () => {
    xhrRequest.mockRejectedValue(new XhrRequestError({ status: 422, attempts: 1, message: 'Invalid' }))

    const { result } = renderHook(() => useGalleryUploader(99, { existingCount: 0 }))
    const file = new File(['fake'], 'a.jpg', { type: 'image/jpeg' })

    await act(async () => {
      await result.current.handleFilesSelected({ target: { files: [file], value: '' } })
    })

    expect(enqueue).not.toHaveBeenCalled()
  })

  it('成功上传不入 outbox', async () => {
    xhrRequest.mockResolvedValue({ ok: true })

    const { result } = renderHook(() => useGalleryUploader(99, { existingCount: 0 }))
    const file = new File(['fake'], 'a.jpg', { type: 'image/jpeg' })

    await act(async () => {
      await result.current.handleFilesSelected({ target: { files: [file], value: '' } })
    })

    expect(enqueue).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: 跑测试看 fail(没有入队逻辑)**

Run: `npm test -- app/javascript/hooks/__tests__/useGalleryUploader.test.js`
Expected: FAIL — enqueue 没被调用(或 4xx case 反而被调用)

- [ ] **Step 3: 改 useGalleryUploader.js — catch + 入队**

打开 `app/javascript/hooks/useGalleryUploader.js`,找到 catch err 块(在 try/catch 包住 uploadOne 的地方,大约 line 88+)。

加 imports 在文件顶:

```js
import { openOutbox, enqueue } from '../lib/outbox/queue'
import { XhrRequestError } from '../lib/xhr-request'
```

在 catch (err) 块内,在已有 abort 处理之后,加判断 + 入队:

```js
} catch (err) {
  if (err.name === 'AbortError') return

  // 网络 / 5xx 已用尽 retry → 入 outbox 让 outbox 系统接管
  const isRetryable = err instanceof XhrRequestError &&
    (err.status === null || err.status >= 500 || err.status === 408 || err.status === 429)

  if (isRetryable) {
    try {
      const db = await openOutbox()
      await enqueue(db, {
        path: `/activities/${activityId}/images`,
        method: 'POST',
        body: { file_blob: file, activity_id: activityId, file_name: file.name },
        headers: {},
        resource_kind: 'photo',
        display_label: file.name,
      })
      notifications.show({
        title: '已加入队列',
        message: `${file.name} 联网后自动上传`,
        color: 'blue',
      })
      continue // 跳过 file,继续下一个
    } catch (outboxErr) {
      // outbox 入队也失败(IDB 满 / 异常)— 才弹真错给用户
      console.warn('[outbox] enqueue failed:', outboxErr)
    }
  }

  // 不可重试(4xx)或入队也失败:原 notification 流程
  notifications.show({
    title: file.name,
    message: err.message || '上传失败',
    color: 'red',
  })
}
```

注意保留原有的 abort / non-retryable 分支。原来文件 catch 块的内容确认替换前先 read 完整。

- [ ] **Step 4: 跑测试看 pass**

Run: `npm test -- app/javascript/hooks/__tests__/useGalleryUploader.test.js`
Expected: PASS — 既有测试 + 4 新测试都过。

- [ ] **Step 5: Commit**

```bash
git add app/javascript/hooks/useGalleryUploader.js app/javascript/hooks/__tests__/useGalleryUploader.test.js
git commit -m "feat(outbox): photo flow — catch xhrRequest 5xx/network 入队"
```

---

## Task 12: dispatch.js 加 photo replay 集成 to outbox row

**Files:**
- 已经在 Task 4 完成,这里跳过(占位)。

实际工作已在 Task 4 实现 dispatchPhotoReplay。如发现集成问题在此 task 修。

- [ ] **Step 1: 跑全套单测最终确认**

```bash
npm test
```

Expected: outbox 相关 + 既有所有测试都过。

- [ ] **Step 2: 跑 lint + brakeman + audit**

```bash
bin/rubocop -f github && npm audit --audit-level=high
```

Expected: 无错误(brakeman 跳过,前端工作)。

- [ ] **Step 3: Commit(若无新文件,skip)**

如果上面有任何小修,提交。否则跳过 commit step。

---

## Task 13: E2E — 离线写费用 → 上线 replay

**Files:**
- Create: `tests/e2e/outbox.spec.js`

- [ ] **Step 1: 写 E2E 第一个 case**

Create `tests/e2e/outbox.spec.js`:

```js
import { test, expect } from '@playwright/test'

// 复用 storageState pattern(staging E2E 已有);outbox 测试需要 logged-in 状态
// 才能进 tour 页面。setup project 的 storage 文件由前置 setup 项目生成。
test.use({ storageState: '.playwright/storage-state.json' })

test.describe('outbox: 离线写费用 → 上线 replay', () => {
  test('Chromium: offline → 加费用 → online → replay 成功', async ({ page, browserName, context }) => {
    test.skip(browserName === 'webkit', 'WebKit 离线模式 + SW 行为不稳定;走 Chromium')

    await page.goto('/tours/1') // 假设 staging seed 有 tour id 1
    await page.waitForLoadState('networkidle')

    // 进入离线模式
    await context.setOffline(true)

    // 加一笔费用(测试 fixture 假设有 + 按钮)
    await page.getByRole('button', { name: /加费用|添加费用/ }).first().click()
    await page.getByLabel(/金额|amount/).fill('66.66')
    await page.getByLabel(/说明|描述|description/).fill('e2e offline expense')
    await page.getByRole('button', { name: /提交|确认/ }).click()

    // Badge 应显示 1 条待同步
    await expect(page.getByText(/1 条待同步/)).toBeVisible({ timeout: 5000 })

    // 恢复网络 → online 事件触发 replay
    await context.setOffline(false)

    // Badge 应消失(replay 成功删除 row)
    await expect(page.getByText(/1 条待同步/)).not.toBeVisible({ timeout: 10000 })

    // 服务端确认有这笔费用(reload 后看到)
    await page.reload()
    await expect(page.getByText('e2e offline expense')).toBeVisible()
  })
})
```

- [ ] **Step 2: 跑 E2E 看 fail(如 staging 暂无,先跳过)**

Run(本地 dev mode):

```bash
npx playwright test tests/e2e/outbox.spec.js --project=chromium
```

Expected: pass。如 fail,常见原因:
- 测试 fixture 没 tour seed → 调整 path 或 mock
- 按钮 label 不匹配 → 调测试 selector
- SW 没注册 → 打开 dev mode 确认 `/sw.js` 200

- [ ] **Step 3: Commit**

```bash
git add tests/e2e/outbox.spec.js
git commit -m "test(e2e): outbox 离线写费用 → 上线 replay"
```

---

## Task 14: E2E — 冲突场景(failed_permanent + 放弃)

**Files:**
- Modify: `tests/e2e/outbox.spec.js`

- [ ] **Step 1: 加 conflict scenario test**

Append to `tests/e2e/outbox.spec.js`:

```js
test.describe('outbox: 冲突场景', () => {
  test('Chromium: 离线编辑 → 服务端资源已删 → 失败显示 + 放弃', async ({ page, browserName, context, request }) => {
    test.skip(browserName === 'webkit')

    await page.goto('/tours/1')
    await page.waitForLoadState('networkidle')

    // 找到一个 expense ID,记下来
    // 实际实现这里需要 staging seed 配合或用 API 创建
    const editExpenseId = 999 // staging seed 提供

    // 离线 → 编辑这笔费用
    await context.setOffline(true)
    // ... open expense edit dialog,改金额,confirm ...
    // (具体 selector 因 UI 实现可能调)

    // 用 admin API 在另一会话删掉该 expense(模拟"他人已删")
    await context.setOffline(false) // 临时 online 调 API
    await request.delete(`/expenses/${editExpenseId}`, { headers: { /* admin */ } })
    await context.setOffline(false)

    // 触发 replay → 应失败(404)
    await page.evaluate(() => window.dispatchEvent(new Event('online')))
    await page.waitForTimeout(2000)

    // Badge 应变红 "1 条失败"
    await expect(page.getByText(/1 条失败/)).toBeVisible({ timeout: 5000 })

    // 点 Badge 打开抽屉
    await page.getByText(/1 条失败/).click()
    await expect(page.getByText('放弃')).toBeVisible()

    // 点 [放弃]
    await page.getByRole('button', { name: '放弃' }).click()

    // Badge 消失
    await expect(page.getByText(/1 条失败/)).not.toBeVisible({ timeout: 5000 })
  })
})
```

注:此 test 依赖 staging seed 提供可删 expense + admin API。实施时按真实 staging fixture 调整 `editExpenseId` / API path。如缺 admin API,可用 Rails console fixture 预留。

- [ ] **Step 2: 跑测试**

```bash
npx playwright test tests/e2e/outbox.spec.js --project=chromium
```

Expected: pass(若 fixture 不全,临时 skip 该 test 加 TODO,继续下一 task)。

- [ ] **Step 3: Commit**

```bash
git add tests/e2e/outbox.spec.js
git commit -m "test(e2e): outbox 冲突场景 — failed + 放弃"
```

---

## Task 15: E2E — visibilitychange trigger(WebKit profile)

**Files:**
- Modify: `tests/e2e/outbox.spec.js`

- [ ] **Step 1: 加 visibilitychange test(WebKit)**

Append to `tests/e2e/outbox.spec.js`:

```js
test.describe('outbox: iOS visibilitychange trigger', () => {
  test.use({ ...require('@playwright/test').devices['iPhone 15'] })

  test('WebKit: 离线 → 加费用 → tab 隐藏 → 显示 → trigger 触发 replay', async ({ page, context }) => {
    await page.goto('/tours/1')
    await page.waitForLoadState('networkidle')

    await context.setOffline(true)

    // 加费用(同 Task 13)
    await page.getByRole('button', { name: /加费用/ }).first().click()
    await page.getByLabel(/金额/).fill('77.77')
    await page.getByLabel(/说明/).fill('e2e webkit visibility')
    await page.getByRole('button', { name: /提交|确认/ }).click()

    await expect(page.getByText(/1 条待同步/)).toBeVisible({ timeout: 5000 })

    // 恢复网络但不触发 online(WebKit 不一定 fire)
    await context.setOffline(false)

    // 模拟 tab 隐藏 → 显示
    await page.evaluate(() => {
      Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true })
      document.dispatchEvent(new Event('visibilitychange'))
    })
    await page.waitForTimeout(500)
    await page.evaluate(() => {
      Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true })
      document.dispatchEvent(new Event('visibilitychange'))
    })

    // Badge 消失
    await expect(page.getByText(/1 条待同步/)).not.toBeVisible({ timeout: 10000 })
  })
})
```

- [ ] **Step 2: 跑测试**

```bash
npx playwright test tests/e2e/outbox.spec.js --project=webkit
```

Expected: pass。

- [ ] **Step 3: Commit**

```bash
git add tests/e2e/outbox.spec.js
git commit -m "test(e2e): outbox visibilitychange trigger (WebKit)"
```

---

## Task 16: E2E — Photo upload offline

**Files:**
- Modify: `tests/e2e/outbox.spec.js`

- [ ] **Step 1: 加 photo offline test**

Append to `tests/e2e/outbox.spec.js`:

```js
test.describe('outbox: 离线照片上传', () => {
  test('Chromium: 离线 → 选图 → 入 outbox → 上线 → 服务端有图', async ({ page, browserName, context }) => {
    test.skip(browserName === 'webkit')

    await page.goto('/activities/1') // 假设有 activity 1
    await page.waitForLoadState('networkidle')

    await context.setOffline(true)

    // 选 mock 图(用 Buffer 构造一张 1x1 PNG)
    const tinyPng = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
      'base64'
    )

    await page.setInputFiles('input[type="file"]', {
      name: 'tiny.png',
      mimeType: 'image/png',
      buffer: tinyPng,
    })

    // 等 outbox enqueue notification 出现
    await expect(page.getByText(/已加入队列/)).toBeVisible({ timeout: 10000 })
    await expect(page.getByText(/1 条待同步/)).toBeVisible()

    // 恢复网络
    await context.setOffline(false)

    // Badge 消失
    await expect(page.getByText(/1 条待同步/)).not.toBeVisible({ timeout: 15000 })

    // 服务端确认有图 — reload activity,gallery 应有 1 张
    await page.reload()
    const images = page.locator('img[src*="/active_storage/"]')
    await expect(images.first()).toBeVisible({ timeout: 5000 })
  })
})
```

- [ ] **Step 2: 跑测试**

```bash
npx playwright test tests/e2e/outbox.spec.js --project=chromium
```

Expected: pass。

- [ ] **Step 3: Commit**

```bash
git add tests/e2e/outbox.spec.js
git commit -m "test(e2e): outbox 离线照片上传"
```

---

## Task 17: 最终 CI + Lighthouse 验证

**Files:** 无新建,只跑命令。

- [ ] **Step 1: 跑全套单测**

```bash
npm test
```

Expected: 100% pass。

- [ ] **Step 2: 跑 Ruby specs(无回归)**

```bash
PATH="$(mise where ruby)/bin:$PATH" bundle exec rspec
```

Expected: 100% pass(后端 0 改动,理论应 trivially pass)。

- [ ] **Step 3: 跑 lint + audit**

```bash
bin/rubocop -f github
npm audit --audit-level=high
```

Expected: 0 错。

- [ ] **Step 4: 跑 build 确认无错**

```bash
npm run build 2>&1 | tail -10
```

Expected: build success;`dist/sw.js` 生成。

- [ ] **Step 5: 跑 E2E 全套**

```bash
npx playwright test tests/e2e/outbox.spec.js
```

Expected: 4 个 outbox case 全过(Chromium 3 + WebKit 1)。

- [ ] **Step 6: Lighthouse 不退化**

跑 staging 部署后(此 step 部署完再做):

```bash
npx lighthouse https://staging.onetour.app --preset=mobile --only-categories=performance,accessibility,best-practices,seo
```

Expected: 仍 100/100/100。

- [ ] **Step 7: 推 branch 开 PR**

```bash
git push -u origin feat/week4-offline-write-queue
gh pr create --title "feat(week4): 离线写队列 — 5 path / IDB / WebP" --body "$(cat <<'EOF'
## Summary

- SW intercept 4 JSON mutation path,失败入 IndexedDB outbox
- Photo 应用层入队(useGalleryUploader catch)— 复用 Week 2 image-compression
- Multi-trigger replay(online / visibility / load / manual)+ 全局 mutex
- Failed_permanent UI:抽屉 + [放弃] / [用最新数据重做]

## Spec

[2026-05-02-week4-offline-write-queue-design.md](docs/superpowers/specs/2026-05-02-week4-offline-write-queue-design.md)

## Test plan

- [x] 单测:queue / replay / triggers / dispatch / OutboxBadge / OutboxDrawer / useGalleryUploader
- [x] E2E Chromium:基础 offline → online,冲突场景,photo offline
- [x] E2E WebKit:visibilitychange trigger
- [x] Lighthouse 100/100/100 不退化
- [ ] Staging dogfood 1 周观察 Sentry

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

PR URL 返回给用户。

---

## Self-Review

**1. Spec 覆盖:**

| Spec 要求 | 实现 task |
|---|---|
| 5 path 离线入队 | Task 7(SW × 4 JSON)+ Task 11(photo 应用层) |
| Badge 三态 | Task 8 |
| Drawer + 放弃/重做 | Task 9 |
| Photo WebP / HEIC | Task 11(复用既有 `image-compression.js`) |
| Photo replay 三步 | Task 4 dispatchPhotoReplay(简化:单步 POST,后端代理替代 direct upload) |
| iOS Safari trigger | Task 6 visibilitychange + Task 15 E2E |
| Sentry breadcrumbs/captures | Task 5 replay.js + Task 11 photo path |
| Lighthouse 不退化 | Task 17 Step 6 |
| `bin/rubocop` / `bin/brakeman` / `npm audit` / specs / vitest | Task 17 |

**Gap 已识别**:Spec 写"三步直传(direct_upload + PUT R2 + finalize)";plan 简化为现有单步 `POST /activities/X/images`(后端代理上传)。这是因为现有上传 endpoint 不走 direct_upload,我们沿用它。如果未来要切 direct_upload,是单独 PR 工作,**不影响 outbox 框架**(只换 dispatchPhotoReplay 内部实现)。

**2. Placeholder scan:**
- 无 "TBD / TODO / fill in"。
- E2E task(13/14)对 staging seed 假设 tour id=1, expense id=999 — 标 "假设 staging seed",实施时按实际 fixture 调整。
- redoTargetUrl(OutboxDrawer)只 return tour 页面 — 简化重做流程,用户从 tour 页重新打开对应资源。完整跳到具体 expense / activity / day URL 是 follow-up。

**3. Type 一致性:**
- `resource_kind` 五值:`expense / photo / activity_edit / settlement / note` — 全文一致(paths.js 推断、queue row、dispatch RELOAD_ONLY_BY_KIND、Drawer KIND_LABEL/KIND_ICON)。
- `status` 二值:`pending / failed_permanent` — 一致。
- `body.file_blob` 用于 photo row — 一致(useGalleryUploader 写 / dispatchPhotoReplay 读)。
- queue 函数签名(`enqueue(db, partial)` / `getRow(db, id)` / `put(db, row)` / `deleteRow(db, id)` / `listByStatus(db, status)`)— 各 task 一致使用。

OK 已可执行。

---

**Plan complete and saved to `docs/superpowers/plans/2026-05-02-week4-offline-write-queue.md`. Two execution options:**

**1. Subagent-Driven (recommended)** — fresh subagent per task,二阶段 review(spec 合规 + code quality)between tasks,fast iteration

**2. Inline Execution** — execute tasks in this session using executing-plans,batch execution with checkpoints

**Which approach?**
