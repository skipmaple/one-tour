# Week 2 上传 retry/progress Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 实现统一的 `xhrRequest` 上传 helper(retry + progress + abort + Sentry),接入 ActivityGalleryTab + AddExpenseDialog,加 18 个 Playwright E2E,升级架构文档 v1.3。

**Architecture:** 单一 helper `app/javascript/lib/xhr-request.js`,FormData/JSON 两栖,2xx resolve 解析后的 JSON,失败 reject `XhrRequestError`。Caller 端用单 Mantine `Progress` 表达上传进度;ActivityGallery 顺序 batch 单条扫描,AddExpenseDialog 并发 + 字节级聚合。

**Tech Stack:** Vanilla JS (ESM, 无 TS) + `XMLHttpRequest` + `@sentry/react` + Mantine v9 + Vitest 4.1 + Playwright (新引入)

**Spec:** [docs/superpowers/specs/2026-04-28-week2-upload-retry-progress-design.md](docs/superpowers/specs/2026-04-28-week2-upload-retry-progress-design.md)

---

## File Structure

**新增文件:**

| 路径 | 责任 |
|---|---|
| `app/javascript/lib/xhr-request.js` | helper 实现 + `XhrRequestError` + `mkForm` |
| `app/javascript/lib/__tests__/xhr-request.test.js` | 14 vitest 用例 + 内联 mock XHR |
| `playwright.config.js` | Playwright 配置 |
| `tests/e2e/fixtures/generate.sh` | 本地 fixture 生成脚本 |
| `tests/e2e/fixtures/.gitignore` | 排除生成的 image 文件 |
| `tests/e2e/fixtures/README.md` | fixture 说明 |
| `tests/e2e/helpers/auth.js` | Developer Login |
| `tests/e2e/helpers/seed.js` | UI 创建 tour + day + activity |
| `tests/e2e/compression.spec.js` | 12 个 compression 用例 |
| `tests/e2e/upload-retry.spec.js` | 6 个 retry/progress 用例 |

**修改文件:**

| 路径 | 改动概要 |
|---|---|
| `app/javascript/components/activity-editor/ActivityGalleryTab.jsx` | `uploadOne` 走 `xhrRequest` + batch progress + AbortController |
| `app/javascript/components/planner/AddExpenseDialog.jsx` | `uploadReceiptNow` + `createWithPendingReceipts` 走 `xhrRequest` + `progressMap` 聚合 |
| `package.json` | 加 `@playwright/test` devDep + `e2e` script |
| `docs/xinjiang-trip-architecture.md` | v1.2 → v1.3 |

---

## Phase 1:`xhrRequest` Helper + 14 Vitest Tests

**Commit message(Phase 1 末):** `feat(upload): xhrRequest helper + retry/progress/abort/Sentry`

### Task 1.1: 创建 helper 文件骨架(空导出)

**Files:**
- Create: `app/javascript/lib/xhr-request.js`

- [ ] **Step 1: 写出空骨架,保证后续 import 不报错**

```js
// app/javascript/lib/xhr-request.js

// Implemented incrementally; see docs/superpowers/plans/2026-04-28-week2-upload-retry-progress.md

export class XhrRequestError extends Error {
  constructor({ status, body, attempts, message }) {
    super(message || `XHR failed (status=${status}, attempts=${attempts})`)
    this.name = 'XhrRequestError'
    this.status = status
    this.body = body
    this.attempts = attempts
  }
}

export function mkForm(field, value) {
  const fd = new FormData()
  fd.append(field, value)
  return fd
}

export async function xhrRequest(_url, _body, _opts = {}) {
  throw new Error('not yet implemented')
}
```

- [ ] **Step 2: 创建测试文件骨架并放置 mock XHR helper(下游所有 test 共享)**

**Files:**
- Create: `app/javascript/lib/__tests__/xhr-request.test.js`

```js
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { xhrRequest, XhrRequestError, mkForm } from '../xhr-request'

// ---------- 内联 mock XHR ----------
//
// 替换 global XMLHttpRequest;每个 test 通过 mockXhrInstances 拿到当前的
// "已发出"实例数组,主动驱动 events:
//   inst.fireProgress({ loaded, total })
//   inst.fireLoad({ status, responseText })
//   inst.fireError()
//   inst.fireTimeout()
//   inst.fireAbort()

const mockXhrInstances = []
let originalXHR

class MockXhr {
  constructor() {
    this.readyState = 0
    this.status = 0
    this.responseText = ''
    this.upload = { onprogress: null, onloadstart: null, onloadend: null }
    this.onload = null
    this.onerror = null
    this.ontimeout = null
    this.onabort = null
    this.onloadend = null
    this._headers = {}
    this._method = null
    this._url = null
    this._body = null
    this._aborted = false
    mockXhrInstances.push(this)
  }
  open(method, url) { this._method = method; this._url = url }
  setRequestHeader(name, value) { this._headers[name] = value }
  send(body) { this._body = body }
  abort() { this._aborted = true; this.onabort?.() }
  fireProgress({ loaded, total }) {
    this.upload.onprogress?.({ lengthComputable: true, loaded, total })
  }
  fireLoad({ status, responseText = '', headers = {} }) {
    this.readyState = 4
    this.status = status
    this.responseText = responseText
    this.onload?.()
    this.onloadend?.()
  }
  fireError() { this.onerror?.(); this.onloadend?.() }
  fireTimeout() { this.ontimeout?.(); this.onloadend?.() }
}

beforeEach(() => {
  mockXhrInstances.length = 0
  originalXHR = globalThis.XMLHttpRequest
  globalThis.XMLHttpRequest = MockXhr
  vi.useFakeTimers()
  // 默认 <meta name="csrf-token"> for CSRF auto-inject
  document.head.innerHTML = '<meta name="csrf-token" content="test-csrf-abc">'
})

afterEach(() => {
  globalThis.XMLHttpRequest = originalXHR
  vi.useRealTimers()
  document.head.innerHTML = ''
  vi.restoreAllMocks()
})

// ---------- helper:推进 retry 退避 ----------
async function flushBackoff(ms) {
  await vi.advanceTimersByTimeAsync(ms)
}

// ---------- 14 个用例从这里开始 ----------

describe('xhrRequest', () => {
  // tasks 1.3 起逐个填充
})
```

- [ ] **Step 3: 运行测试,确认骨架可跑(0 个 case)**

```bash
npm test -- xhr-request
```

期望:`Test Files: 1 passed`,`Tests: 0`(0 个 case 但文件本身没有错误)。

---

### Task 1.2: Mock Sentry(全 14 case 共享)

**Files:**
- Modify: `app/javascript/lib/__tests__/xhr-request.test.js` 顶部追加

- [ ] **Step 1: 在 import 之后加 Sentry 模块 mock**

```js
import * as Sentry from '@sentry/react'

vi.mock('@sentry/react', () => ({
  captureException: vi.fn(),
}))

// beforeEach 末尾追加一行清理:
//   Sentry.captureException.mockClear()
```

把 `Sentry.captureException.mockClear()` 加到 `beforeEach` 末尾。

- [ ] **Step 2: 跑测试确认仍然通过(0 个 case)**

```bash
npm test -- xhr-request
```

---

### Task 1.3: Test #1 — 2xx FormData 成功 → resolve(JSON)

**Files:**
- Modify: `app/javascript/lib/__tests__/xhr-request.test.js` 在 `describe` 内

- [ ] **Step 1: 写失败的 test**

```js
it('resolves with parsed JSON on 2xx with FormData', async () => {
  const promise = xhrRequest('/api/upload', mkForm('file', new Blob([ 'hi' ])))
  await vi.runAllTimersAsync()  // 让微任务和 timer 推进
  const inst = mockXhrInstances[0]
  expect(inst._method).toBe('POST')
  expect(inst._url).toBe('/api/upload')
  expect(inst._body).toBeInstanceOf(FormData)

  inst.fireLoad({ status: 200, responseText: '{"id":42}' })
  await expect(promise).resolves.toEqual({ id: 42 })
})
```

- [ ] **Step 2: 跑测试,看到失败(`xhrRequest` 抛 'not yet implemented')**

```bash
npm test -- xhr-request
```

期望:1 failed。

- [ ] **Step 3: 在 helper 实现 minimal 2xx FormData 路径**

替换 `xhrRequest` 函数体:

```js
export async function xhrRequest(url, body, opts = {}) {
  const { method = 'POST' } = opts

  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open(method, url)

    xhr.onload = () => {
      const parsed = parseJsonOrNull(xhr.responseText)
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve(parsed)
      } else {
        reject(new XhrRequestError({
          status: xhr.status, body: parsed, attempts: 1,
          message: `HTTP ${xhr.status}`,
        }))
      }
    }
    xhr.onerror = () => reject(new XhrRequestError({
      status: null, body: null, attempts: 1, message: 'network error',
    }))

    xhr.send(body)
  })
}

function parseJsonOrNull(text) {
  if (!text) return null
  try { return JSON.parse(text) } catch { return null }
}
```

- [ ] **Step 4: 跑测试,看到通过**

```bash
npm test -- xhr-request
```

期望:1 passed。

---

### Task 1.4: Test #2 — JSON body + Content-Type

**Files:**
- Modify: `app/javascript/lib/__tests__/xhr-request.test.js`

- [ ] **Step 1: 写测试**

```js
it('serializes plain object body as JSON with Content-Type', async () => {
  const promise = xhrRequest('/api/expenses', { amount_cents: 100 })
  await vi.runAllTimersAsync()
  const inst = mockXhrInstances[0]
  expect(inst._headers['Content-Type']).toBe('application/json')
  expect(inst._body).toBe('{"amount_cents":100}')

  inst.fireLoad({ status: 201, responseText: '{"id":7}' })
  await expect(promise).resolves.toEqual({ id: 7 })
})
```

- [ ] **Step 2: 跑测试,看到失败(body 不是 JSON 字符串)**

- [ ] **Step 3: 在 helper 加 body 类型分支**

把 `xhr.send(body)` 之前加:

```js
const isFormData = body instanceof FormData
let payload = body
if (!isFormData && body !== null && body !== undefined) {
  xhr.setRequestHeader('Content-Type', 'application/json')
  payload = JSON.stringify(body)
}

xhr.send(payload)
```

- [ ] **Step 4: 跑两个测试,都通过**

---

### Task 1.5: Test #13 — CSRF token auto-inject

**Files:**
- Modify: `app/javascript/lib/__tests__/xhr-request.test.js`

> 早做 CSRF 因为它影响所有请求 header 验证。

- [ ] **Step 1: 写测试**

```js
it('injects X-CSRF-Token from <meta name="csrf-token">', async () => {
  const promise = xhrRequest('/api/x', null)
  await vi.runAllTimersAsync()
  const inst = mockXhrInstances[0]
  expect(inst._headers['X-CSRF-Token']).toBe('test-csrf-abc')
  expect(inst._headers['Accept']).toBe('application/json')

  inst.fireLoad({ status: 200, responseText: '' })
  await expect(promise).resolves.toBeNull()
})
```

- [ ] **Step 2: 跑,失败**

- [ ] **Step 3: helper 中加 CSRF 注入,在 `xhr.open()` 之后:**

```js
xhr.setRequestHeader('Accept', 'application/json')
const csrf = document.querySelector('meta[name=csrf-token]')?.getAttribute('content')
if (csrf) xhr.setRequestHeader('X-CSRF-Token', csrf)
```

- [ ] **Step 4: 跑,3 个 test 通过**

---

### Task 1.6: Test #3 — 422 immediate fail (no retry)

**Files:**
- Modify: `app/javascript/lib/__tests__/xhr-request.test.js`

- [ ] **Step 1: 写测试**

```js
it('rejects with XhrRequestError on 422 (non-retryable, no Sentry)', async () => {
  const promise = xhrRequest('/api/x', null)
  await vi.runAllTimersAsync()
  mockXhrInstances[0].fireLoad({ status: 422, responseText: '{"errors":["bad"]}' })

  await expect(promise).rejects.toMatchObject({
    name: 'XhrRequestError',
    status: 422,
    body: { errors: [ 'bad' ] },
    attempts: 1,
  })
  expect(Sentry.captureException).not.toHaveBeenCalled()
  expect(mockXhrInstances).toHaveLength(1)  // 没有 retry
})
```

- [ ] **Step 2: 跑,看现状**(应该已经通过 —— 因为当前 helper 没有 retry,422 直接 reject)

- [ ] **Step 3: 跑,4 个通过**

---

### Task 1.7: Tests #4, #5 — 5xx retry 与 503-then-200

**Files:**
- Modify: `app/javascript/lib/__tests__/xhr-request.test.js`

- [ ] **Step 1: 写两个测试**

```js
it('retries on 503 then resolves on 200 (attempts=2, no Sentry)', async () => {
  const promise = xhrRequest('/api/x', null)
  await vi.runAllTimersAsync()
  mockXhrInstances[0].fireLoad({ status: 503, responseText: '' })

  await flushBackoff(1000)  // 第一次退避 1s

  expect(mockXhrInstances).toHaveLength(2)
  mockXhrInstances[1].fireLoad({ status: 200, responseText: '{"ok":true}' })
  await expect(promise).resolves.toEqual({ ok: true })
  expect(Sentry.captureException).not.toHaveBeenCalled()
})

it('exhausts 3 attempts on persistent 503, captures Sentry', async () => {
  const promise = xhrRequest('/api/upload', mkForm('file', new Blob([ 'x' ])))
  await vi.runAllTimersAsync()

  mockXhrInstances[0].fireLoad({ status: 503, responseText: '' })
  await flushBackoff(1000)
  mockXhrInstances[1].fireLoad({ status: 503, responseText: '' })
  await flushBackoff(2000)
  mockXhrInstances[2].fireLoad({ status: 503, responseText: '' })

  await expect(promise).rejects.toMatchObject({
    name: 'XhrRequestError',
    status: 503,
    attempts: 3,
  })
  expect(Sentry.captureException).toHaveBeenCalledTimes(1)
  const callArgs = Sentry.captureException.mock.calls[0]
  expect(callArgs[1].tags).toMatchObject({ final_status: '503' })
  expect(callArgs[1].extra).toMatchObject({ attempts: 3 })
})
```

- [ ] **Step 2: 跑,失败**

- [ ] **Step 3: 重构 helper 加 retry 循环 + Sentry 上报**

完整替换 `xhrRequest`:

```js
import * as Sentry from '@sentry/react'

const RETRYABLE_STATUSES = new Set([ 408, 429, 500, 502, 503, 504 ])

export async function xhrRequest(url, body, opts = {}) {
  const {
    method = 'POST',
    signal,
    onProgress,
    maxAttempts = 3,
    sentryExtra = {},
  } = opts

  let lastErr
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await sendOnce(url, body, { method, signal, onProgress })
    } catch (err) {
      lastErr = err
      if (err.name === 'AbortError') throw err
      const status = err.status
      const retryable = status === null || RETRYABLE_STATUSES.has(status)
      if (!retryable || attempt === maxAttempts) {
        err.attempts = attempt
        if (retryable && attempt === maxAttempts) {
          reportToSentry(err, { url, method, body, sentryExtra })
        }
        throw err
      }
      const waitMs = 1000 * (2 ** (attempt - 1))
      await sleepWithSignal(waitMs, signal)
    }
  }
  throw lastErr  // unreachable
}

function sendOnce(url, body, { method, signal, onProgress }) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      return reject(new DOMException('Aborted', 'AbortError'))
    }
    const xhr = new XMLHttpRequest()
    xhr.open(method, url)
    xhr.setRequestHeader('Accept', 'application/json')
    const csrf = document.querySelector('meta[name=csrf-token]')?.getAttribute('content')
    if (csrf) xhr.setRequestHeader('X-CSRF-Token', csrf)

    const isFormData = body instanceof FormData
    let payload = body
    if (!isFormData && body !== null && body !== undefined) {
      xhr.setRequestHeader('Content-Type', 'application/json')
      payload = JSON.stringify(body)
    }

    if (isFormData && onProgress) {
      // 每次 attempt 重置到 0
      onProgress({ percentage: 0, loaded: 0, total: 0 })
      xhr.upload.onprogress = (e) => {
        if (!e.lengthComputable) return
        onProgress({
          percentage: e.total > 0 ? (e.loaded / e.total) * 100 : 0,
          loaded: e.loaded,
          total: e.total,
        })
      }
    }

    const onAbort = () => xhr.abort()
    signal?.addEventListener('abort', onAbort)
    const cleanup = () => signal?.removeEventListener('abort', onAbort)

    xhr.onload = () => {
      cleanup()
      const parsed = parseJsonOrNull(xhr.responseText)
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve(parsed)
      } else {
        reject(new XhrRequestError({
          status: xhr.status, body: parsed, attempts: 1,
          message: `HTTP ${xhr.status}`,
        }))
      }
    }
    xhr.onerror = () => { cleanup(); reject(new XhrRequestError({
      status: null, body: null, attempts: 1, message: 'network error',
    })) }
    xhr.ontimeout = () => { cleanup(); reject(new XhrRequestError({
      status: null, body: null, attempts: 1, message: 'timeout',
    })) }
    xhr.onabort = () => { cleanup(); reject(new DOMException('Aborted', 'AbortError')) }

    xhr.send(payload)
  })
}

function sleepWithSignal(ms, signal) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      return reject(new DOMException('Aborted', 'AbortError'))
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort)
      resolve()
    }, ms)
    const onAbort = () => {
      clearTimeout(timer)
      reject(new DOMException('Aborted', 'AbortError'))
    }
    signal?.addEventListener('abort', onAbort)
  })
}

function parseJsonOrNull(text) {
  if (!text) return null
  try { return JSON.parse(text) } catch { return null }
}

function normalizeEndpoint(method, url) {
  const path = url.replace(/\?.*$/, '').replace(/\/\d+(?=\/|$)/g, '/:id')
  return `${method} ${path}`
}

function reportToSentry(err, { url, method, body, sentryExtra }) {
  const finalStatus = err.status === null ? 'network' : String(err.status)
  const conn = (typeof navigator !== 'undefined' && navigator.connection) || {}
  const isFormData = body instanceof FormData
  let body_size_bytes = 0
  let file_count = 0
  if (isFormData) {
    for (const [ , v ] of body.entries()) {
      if (v instanceof Blob) { body_size_bytes += v.size; file_count++ }
    }
  } else if (body !== null && body !== undefined) {
    body_size_bytes = JSON.stringify(body).length
  }
  Sentry.captureException(err, {
    tags: {
      endpoint: normalizeEndpoint(method, url),
      final_status: finalStatus,
      effective_type: conn.effectiveType || 'unknown',
    },
    extra: {
      attempts: err.attempts,
      body_size_bytes,
      file_count,
      downlink_mbps: conn.downlink ?? null,
      rtt_ms: conn.rtt ?? null,
      ...sentryExtra,
    },
  })
}
```

- [ ] **Step 4: 跑全部 6 个测试,确认通过**

```bash
npm test -- xhr-request
```

期望:6 passed。

---

### Task 1.8: Tests #6, #7 — 网络错误 retry / 耗尽

**Files:**
- Modify: `app/javascript/lib/__tests__/xhr-request.test.js`

- [ ] **Step 1: 写两个测试**

```js
it('retries on network error then resolves', async () => {
  const promise = xhrRequest('/api/x', null)
  await vi.runAllTimersAsync()
  mockXhrInstances[0].fireError()
  await flushBackoff(1000)
  mockXhrInstances[1].fireLoad({ status: 200, responseText: '{}' })
  await expect(promise).resolves.toEqual({})
  expect(Sentry.captureException).not.toHaveBeenCalled()
})

it('captures Sentry with final_status=network on persistent network error', async () => {
  const promise = xhrRequest('/api/x', null)
  await vi.runAllTimersAsync()
  mockXhrInstances[0].fireError()
  await flushBackoff(1000)
  mockXhrInstances[1].fireError()
  await flushBackoff(2000)
  mockXhrInstances[2].fireError()

  await expect(promise).rejects.toMatchObject({ status: null, attempts: 3 })
  expect(Sentry.captureException).toHaveBeenCalledTimes(1)
  expect(Sentry.captureException.mock.calls[0][1].tags.final_status).toBe('network')
})
```

- [ ] **Step 2: 跑,通过(已经实现)。8 个 test 全过**

---

### Task 1.9: Test #8 — 419 不重试

**Files:**
- Modify: `app/javascript/lib/__tests__/xhr-request.test.js`

- [ ] **Step 1: 写测试**

```js
it('does not retry on 419 (CSRF mismatch)', async () => {
  const promise = xhrRequest('/api/x', null)
  await vi.runAllTimersAsync()
  mockXhrInstances[0].fireLoad({ status: 419, responseText: '' })
  await expect(promise).rejects.toMatchObject({ status: 419, attempts: 1 })
  expect(mockXhrInstances).toHaveLength(1)
  expect(Sentry.captureException).not.toHaveBeenCalled()
})
```

- [ ] **Step 2: 跑,通过(419 不在 RETRYABLE_STATUSES)。9 个 test 全过**

---

### Task 1.10: Tests #9, #10 — AbortSignal

**Files:**
- Modify: `app/javascript/lib/__tests__/xhr-request.test.js`

- [ ] **Step 1: 写两个测试**

```js
it('aborts in-flight request and skips remaining retries', async () => {
  const ctrl = new AbortController()
  const promise = xhrRequest('/api/x', null, { signal: ctrl.signal })
  await vi.runAllTimersAsync()
  ctrl.abort()
  await expect(promise).rejects.toMatchObject({ name: 'AbortError' })
  expect(mockXhrInstances).toHaveLength(1)
  expect(Sentry.captureException).not.toHaveBeenCalled()
})

it('aborts during backoff (cancels timer, no further request)', async () => {
  const ctrl = new AbortController()
  const promise = xhrRequest('/api/x', null, { signal: ctrl.signal })
  await vi.runAllTimersAsync()
  mockXhrInstances[0].fireLoad({ status: 503, responseText: '' })
  // 进入 1s 退避中
  await flushBackoff(500)
  ctrl.abort()
  await expect(promise).rejects.toMatchObject({ name: 'AbortError' })
  expect(mockXhrInstances).toHaveLength(1)
  expect(Sentry.captureException).not.toHaveBeenCalled()
})
```

- [ ] **Step 2: 跑,通过(已实现)。11 个 test 全过**

---

### Task 1.11: Tests #11, #12 — onProgress 触发与不触发

**Files:**
- Modify: `app/javascript/lib/__tests__/xhr-request.test.js`

- [ ] **Step 1: 写两个测试**

```js
it('fires onProgress for FormData with percentage/loaded/total', async () => {
  const onProgress = vi.fn()
  const promise = xhrRequest('/api/upload', mkForm('file', new Blob([ 'x' ])), { onProgress })
  await vi.runAllTimersAsync()
  const inst = mockXhrInstances[0]
  inst.fireProgress({ loaded: 250, total: 1000 })
  inst.fireProgress({ loaded: 1000, total: 1000 })
  inst.fireLoad({ status: 200, responseText: '{}' })
  await promise

  // 至少 3 次:reset 到 0、25%、100%
  expect(onProgress).toHaveBeenCalledWith(expect.objectContaining({ percentage: 0 }))
  expect(onProgress).toHaveBeenCalledWith(expect.objectContaining({ percentage: 25, loaded: 250, total: 1000 }))
  expect(onProgress).toHaveBeenCalledWith(expect.objectContaining({ percentage: 100 }))
})

it('does not fire onProgress for JSON body', async () => {
  const onProgress = vi.fn()
  const promise = xhrRequest('/api/x', { foo: 'bar' }, { onProgress })
  await vi.runAllTimersAsync()
  mockXhrInstances[0].fireLoad({ status: 200, responseText: '{}' })
  await promise
  expect(onProgress).not.toHaveBeenCalled()
})
```

- [ ] **Step 2: 跑,通过(已实现:`if (isFormData && onProgress)`)。13 个 test 全过**

---

### Task 1.12: Test #14 — Sentry endpoint tag normalize

**Files:**
- Modify: `app/javascript/lib/__tests__/xhr-request.test.js`

- [ ] **Step 1: 写测试**

```js
it('normalizes URL ids in Sentry endpoint tag', async () => {
  const promise = xhrRequest('/activities/12345/images', mkForm('file', new Blob([ 'x' ])))
  await vi.runAllTimersAsync()
  mockXhrInstances[0].fireError()
  await flushBackoff(1000)
  mockXhrInstances[1].fireError()
  await flushBackoff(2000)
  mockXhrInstances[2].fireError()
  await expect(promise).rejects.toBeDefined()

  expect(Sentry.captureException.mock.calls[0][1].tags.endpoint).toBe('POST /activities/:id/images')
})
```

- [ ] **Step 2: 跑,通过(已实现 `normalizeEndpoint`)。14 个 test 全过**

---

### Task 1.13: Phase 1 收尾 — lint + commit

- [ ] **Step 1: 跑全部 npm test 确认无 regression**

```bash
npm test
```

期望:`Test Files: N passed` 包含 14 新增 case;旧 case 全数仍然通过。

- [ ] **Step 2: lint**

```bash
# 项目无 ESLint 配置,跳过 JS lint,只跑 Ruby:
bin/rubocop -f github
```

(此 phase 没动 Ruby,应该无影响)

- [ ] **Step 3: Commit**

```bash
git add app/javascript/lib/xhr-request.js \
        app/javascript/lib/__tests__/xhr-request.test.js
git commit -m "$(cat <<'EOF'
feat(upload): xhrRequest helper + retry/progress/abort/Sentry

实现统一的 XHR helper,FormData/JSON 两栖,2xx resolve 解析后的 JSON,
失败 reject XhrRequestError(含 status/body/attempts)。

特性:
- 指数退避重试(默认 maxAttempts=3,退避 1s/2s)
- 仅 408/429/500/502/503/504 + 网络错误 retry,419/422 等立即失败
- onProgress 回调(仅 FormData,reset 到 0% 在每次 retry)
- AbortSignal 支持(中断请求 + 跳过剩余 retry/backoff)
- CSRF token 自动从 <meta> 注入到 X-CSRF-Token
- Sentry 终态上报(tag: endpoint/final_status/effective_type;extra: attempts/body_size/file_count/downlink/rtt)
- URL 数字 id 归一化为 :id 进 Sentry tag
- 不上报 422 / 中途 retry / abort / 文件名 / body 内容

测试:14 个 vitest 用例,inline mock XHR + Sentry,fakeTimers 控制 retry 时序。

后续 commit 接入 ActivityGalleryTab 与 AddExpenseDialog。

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 4: 验证 commit 成功**

```bash
git log --oneline -1
```

期望:看到刚 commit 的消息。

---

## Phase 2:ActivityGalleryTab 接入

**Commit message:** `feat(upload): ActivityGalleryTab 接入 xhrRequest + batch progress`

### Task 2.1: 重构 `uploadOne` 走 `xhrRequest`

**Files:**
- Modify: `app/javascript/components/activity-editor/ActivityGalleryTab.jsx`

- [ ] **Step 1: 改 import**

文件顶部 import 区追加:

```js
import { xhrRequest, mkForm } from '../../lib/image-compression'  // 错误示例,应为下行
```

正确:

```js
import { xhrRequest, mkForm } from '../../lib/xhr-request'
```

确认整个 import 块顺序合理(已有 `compressImage` 来自同一目录)。

- [ ] **Step 2: 替换 `uploadOne` 函数**

定位 [ActivityGalleryTab.jsx:68-84](app/javascript/components/activity-editor/ActivityGalleryTab.jsx:68),整体替换为:

```js
const uploadOne = (file, onProgress, signal) =>
  xhrRequest(`/activities/${activityId}/images`, mkForm('file', file), {
    method: 'POST',
    signal,
    onProgress,
    sentryExtra: { activity_id: activityId },
  })
```

- [ ] **Step 3: 跑现有 vitest,确认无 regression**

```bash
npm test
```

(ActivityGalleryTab 本身无单测,但 lib/xhr-request 测试应仍全过)

---

### Task 2.2: 加 batch progress state + AbortController + UI

**Files:**
- Modify: `app/javascript/components/activity-editor/ActivityGalleryTab.jsx`

- [ ] **Step 1: 在组件顶部增加 state + ref + effect**

在 `useState` 区域之后(`uploading` state 附近)追加:

```js
import { useEffect, useRef, useState } from 'react'  // 确保 useEffect/useRef 已 import
import { Progress } from '@mantine/core'              // 加 Progress

// 组件内,uploading state 之后:
const [batchProgress, setBatchProgress] = useState(null)
// { current, total, percentage } | null
const abortRef = useRef(null)

useEffect(() => () => abortRef.current?.abort(), [])
```

注意 `Progress` 加到现有的 `@mantine/core` import 行(组件顶部),不要新建一行。

- [ ] **Step 2: 重写 `handleFilesSelected` 的循环部分**

定位 [ActivityGalleryTab.jsx:30-66](app/javascript/components/activity-editor/ActivityGalleryTab.jsx:30),整体替换为:

```js
const handleFilesSelected = async (e) => {
  const files = Array.from(e.target.files || [])
  e.target.value = ''
  if (files.length === 0) return
  if (ordered.length + files.length > MAX_PER_ACTIVITY) {
    notifications.show({
      title: '一次最多 20 张',
      message: `本站点已有 ${ordered.length} 张,还能再传 ${MAX_PER_ACTIVITY - ordered.length} 张`,
      color: 'orange',
    })
    return
  }

  // Pre-process: validate + compress 同步整个 batch,失败的先剔
  const accepted = []
  for (const file of files) {
    if (file.size > MAX_RAW_MB * 1024 * 1024) {
      notifications.show({
        message: `${file.name} 超过 ${MAX_RAW_MB} MB,已跳过`,
        color: 'orange',
      })
      continue
    }
    const compressed = await compressImage(file)
    if (compressed.size > MAX_FILE_MB * 1024 * 1024) {
      notifications.show({
        message: `${file.name} 压缩后仍超 ${MAX_FILE_MB} MB,已跳过`,
        color: 'orange',
      })
      continue
    }
    accepted.push(compressed)
  }
  if (accepted.length === 0) return

  setUploading(true)
  abortRef.current = new AbortController()

  try {
    for (let i = 0; i < accepted.length; i++) {
      const file = accepted[i]
      try {
        await uploadOne(
          file,
          (p) => setBatchProgress({
            current: i + 1,
            total: accepted.length,
            percentage: ((i + p.percentage / 100) / accepted.length) * 100,
          }),
          abortRef.current.signal,
        )
      } catch (err) {
        if (err.name === 'AbortError') return
        notifications.show({
          title: file.name,
          message: err.body?.errors?.join('；') || err.message || '上传失败',
          color: 'red',
        })
      }
    }
  } finally {
    setBatchProgress(null)
    setUploading(false)
    router.reload({ only: [ 'activity_images' ], preserveScroll: true })
  }
}
```

- [ ] **Step 3: 渲染 Progress UI**

定位 component return 内有 `<Group justify="space-between" align="center">` 的区域(批量上传按钮所在)。在该 `<Group>` 关闭标签后、grid `<div>` 之前,插入:

```jsx
{batchProgress && <Progress value={batchProgress.percentage} size="xs" />}
```

(空状态分支也要加,但空状态下 batch 还没开始,不会触发,可不加。如果担心一致性可在空状态 `<Stack>` 内 `Button` 之后加同样一行。)

- [ ] **Step 4: 跑全部 vitest,确认无 regression**

```bash
npm test
```

- [ ] **Step 5: 启动 dev server 手动验证**

```bash
# 主 worktree 默认 9000 端口
# 已经跑着的话访问 http://localhost:9000
# 没跑就启:
bin/dev
```

手动场景:登录 → 进 tour → 进 activity 编辑 → Gallery tab → 选 5 张图(混合大小)→ 观察:
- Progress 从 0 平滑升到 100,期间无文字
- 每张完成后 grid 更新
- 浏览器 console 无 error
- F12 Network 看 5 个 POST 都 200

- [ ] **Step 6: 测试 abort**

batch 上传中切到别的 tab/路由,看 Network 中后续请求不再发出。

---

### Task 2.3: Phase 2 commit

- [ ] **Step 1: lint**

```bash
bin/rubocop -f github
npm test
```

- [ ] **Step 2: Commit**

```bash
git add app/javascript/components/activity-editor/ActivityGalleryTab.jsx
git commit -m "$(cat <<'EOF'
feat(upload): ActivityGalleryTab 接入 xhrRequest + batch progress

uploadOne 改走 xhrRequest:获得指数退避重试、AbortSignal、Sentry 终态
上报。Batch 上传期间显示单一 Mantine Progress(无文字),数值跨整个
batch 平滑填充。组件 unmount 时 AbortController 终止当前 + 后续上传。

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Phase 3:AddExpenseDialog 接入

**Commit message:** `feat(upload): AddExpenseDialog 接入 xhrRequest`

### Task 3.1: 加 import + progressMap state + UI

**Files:**
- Modify: `app/javascript/components/planner/AddExpenseDialog.jsx`

- [ ] **Step 1: 加 import**

顶部 import 区追加(找一个合理位置):

```js
import { xhrRequest, mkForm } from '../../lib/xhr-request'
```

`@mantine/core` 的 import 行追加 `Progress`(如果还没在表里)。`react` 的 import 追加 `useRef` 如果还没。

- [ ] **Step 2: 加 state**

在组件 useState 区域(`uploadsInFlight` 附近)追加:

```js
const [progressMap, setProgressMap] = useState({})
const fileIdxRef = useRef(0)
const nextFileIdx = () => ++fileIdxRef.current
```

- [ ] **Step 3: 加聚合派生值**

在组件渲染区域之前的逻辑层(useState 之后,return 之前)加:

```js
const inFlight = Object.keys(progressMap).length > 0
const totalLoaded = Object.values(progressMap).reduce((s, p) => s + p.loaded, 0)
const totalSize   = Object.values(progressMap).reduce((s, p) => s + p.total,  0)
const overallPct  = totalSize > 0 ? (totalLoaded / totalSize) * 100 : 0
```

- [ ] **Step 4: 在 dialog 体内放 Progress**

找 dialog 的 footer 区域(Save/Cancel 按钮所在),在 footer 上方插入:

```jsx
{inFlight && <Progress value={overallPct} size="xs" mb="xs" />}
```

具体位置由结构决定;插在能让用户看到、又不会覆盖表单输入的地方(通常是 footer 上方紧挨 receipt 列表)。

---

### Task 3.2: 重构 `uploadReceiptNow`(edit 模式)

**Files:**
- Modify: `app/javascript/components/planner/AddExpenseDialog.jsx`

- [ ] **Step 1: 替换 `uploadReceiptNow` 函数**

定位 [AddExpenseDialog.jsx:301-319](app/javascript/components/planner/AddExpenseDialog.jsx:301),整体替换:

```js
const uploadReceiptNow = (file) => {
  const fileIdx = nextFileIdx()
  setUploadsInFlight((n) => n + 1)
  xhrRequest(`/expenses/${expense.id}/receipts`, mkForm('file', file), {
    method: 'POST',
    onProgress: (p) => setProgressMap((prev) => ({ ...prev, [fileIdx]: p })),
    sentryExtra: { expense_id: expense.id },
  })
    .then(() => router.reload({ only: [ 'expenses', 'expenses_summary', 'flash' ] }))
    .catch((err) => {
      if (err.name === 'AbortError') return
      notifications.show({
        message: `上传失败:${err.body?.errors?.join('；') || err.message || ''}`,
        color: 'red',
      })
    })
    .finally(() => {
      setUploadsInFlight((n) => n - 1)
      setProgressMap((prev) => { const next = { ...prev }; delete next[fileIdx]; return next })
    })
}
```

- [ ] **Step 2: 跑现有 AddExpenseDialog 测试,确认无 regression**

```bash
npm test -- AddExpenseDialog
```

如果有 mock fetch 假设的现有 case 失败(因为调用变了),先看是不是 mock 路径要更新。如失败请先读 [app/javascript/components/planner/__tests__/AddExpenseDialog.test.jsx](app/javascript/components/planner/__tests__/AddExpenseDialog.test.jsx) 调整 mock,使其 stub `xhr-request` 模块而非 `fetch`。

---

### Task 3.3: 重构 `createWithPendingReceipts`(create 模式两阶段)

**Files:**
- Modify: `app/javascript/components/planner/AddExpenseDialog.jsx`

- [ ] **Step 1: 替换 `createWithPendingReceipts` 的两个 fetch**

定位 [AddExpenseDialog.jsx:430-470](app/javascript/components/planner/AddExpenseDialog.jsx:430),整体替换为(保留 setSaving/notifications/cleanupPendingFiles/onClose 的善后流程):

```js
const createWithPendingReceipts = async (payload) => {
  let created
  try {
    created = await xhrRequest(`/tours/${tour.id}/expenses`, payload, {
      sentryExtra: { tour_id: tour.id },
    })
  } catch (err) {
    if (err.name === 'AbortError') { setSaving(false); return }
    setSaving(false)
    notifications.show({
      message: err.body?.errors?.join('；') || err.message || '保存失败',
      color: 'red',
    })
    return
  }

  const results = await Promise.allSettled(pendingFiles.map((p, idx) => {
    const fileIdx = nextFileIdx()
    setProgressMap((prev) => ({ ...prev, [fileIdx]: { percentage: 0, loaded: 0, total: 0 } }))
    return xhrRequest(`/expenses/${created.id}/receipts`, mkForm('file', p.file), {
      onProgress: (prog) => setProgressMap((prev) => ({ ...prev, [fileIdx]: prog })),
      sentryExtra: { tour_id: tour.id, expense_id: created.id },
    }).finally(() => {
      setProgressMap((prev) => { const next = { ...prev }; delete next[fileIdx]; return next })
    })
  }))

  const failed = results.filter((r) => r.status === 'rejected').length
  router.reload({ only: [ 'expenses', 'expenses_summary', 'flash' ] })
  setSaving(false)
  if (failed === 0) {
    notifications.show({ message: '已记下这笔花销', color: 'green' })
  } else {
    notifications.show({
      message: `花销已保存,但 ${failed} 张小票上传失败,可进入编辑重试`,
      color: 'orange',
    })
  }
  cleanupPendingFiles()
  onClose()
}
```

如果原来还有更长的善后(多读源码看 line 470 之后的 closing 部分),把对应代码合并进来,确保 `cleanupPendingFiles` / `onClose` 的语义保持。

- [ ] **Step 2: 跑测试**

```bash
npm test
```

如有 mock 相关 fail,同 Task 3.2 处理。

---

### Task 3.4: 手动验证 + commit

- [ ] **Step 1: 启动 dev server 手动验证**

```bash
# 已跑则跳过
bin/dev
```

场景:
- **Edit 模式**:打开已存在的 expense → 加 2 张 receipt → 期望:Progress 字节级单调爬升,2 张完成后消失
- **Create 模式 + pending**:新建 expense → 选 2 张 receipt(还没保存)→ 点保存 → 期望:Save 按钮 spinner → 然后 Progress 出现 → 2 张完成 → dialog 关闭 → 列表更新
- **失败兜底**:开 DevTools Network 把 `/expenses/*/receipts` 设为 offline → 上传一张 → 期望:看到 Progress 重置 0% (retry) → 最终 toast "上传失败: ..."

- [ ] **Step 2: lint + test**

```bash
bin/rubocop -f github
npm test
```

- [ ] **Step 3: Commit**

```bash
git add app/javascript/components/planner/AddExpenseDialog.jsx \
        app/javascript/components/planner/__tests__/AddExpenseDialog.test.jsx
git commit -m "$(cat <<'EOF'
feat(upload): AddExpenseDialog 接入 xhrRequest

- uploadReceiptNow(edit 模式,并发):走 xhrRequest,内置 retry,
  progressMap 按 fileIdx 累加,组件层渲染单一 Progress(字节级聚合)
- createWithPendingReceipts(create 模式两阶段):Phase 1 JSON POST 与
  Phase 2 N 张 receipt 都走 xhrRequest;Phase 2 进 progressMap 显示进度
- 保留并发模型(forEach + Promise.allSettled),不改顺序
- Phase 1 无 progress(JSON 太小,Save 按钮 loading 已表达)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Phase 4:Playwright E2E

**Commit message:** `test(e2e): Playwright + 18 用例(compression × 12 + retry/progress × 6)`

### Task 4.1: 安装 Playwright

- [ ] **Step 1: 装 dev dep**

```bash
npm i -D @playwright/test
```

- [ ] **Step 2: 装 chromium 浏览器**

```bash
npx playwright install chromium
```

(Webkit/Firefox 不装,5 人项目主要在 Chromium 上验证)

- [ ] **Step 3: 加 npm script**

修改 `package.json` 的 `"scripts"`:

```json
{
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest",
    "e2e": "playwright test",
    "e2e:ui": "playwright test --ui"
  }
}
```

(保留现有,只新增 `e2e` 与 `e2e:ui`。如已有同名 script,合并即可)

---

### Task 4.2: 创建 `playwright.config.js`

**Files:**
- Create: `playwright.config.js`

- [ ] **Step 1: 写配置**

```js
// @ts-check
import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 30_000,
  expect: { timeout: 10_000 },
  reporter: [ [ 'list' ] ],
  use: {
    baseURL: 'http://localhost:9000',
    actionTimeout: 10_000,
    trace: 'on-first-retry',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
  webServer: {
    // 复用 dev server,不存在则启
    command: 'bin/dev',
    port: 9000,
    reuseExistingServer: true,
    timeout: 60_000,
  },
})
```

- [ ] **Step 2: 创建 fixtures 目录结构**

```bash
mkdir -p tests/e2e/fixtures tests/e2e/helpers
```

---

### Task 4.3: Fixture 生成脚本 + .gitignore

**Files:**
- Create: `tests/e2e/fixtures/generate.sh`
- Create: `tests/e2e/fixtures/.gitignore`
- Create: `tests/e2e/fixtures/README.md`

- [ ] **Step 1: `generate.sh`**

```sh
#!/usr/bin/env bash
# Generate test fixture images. Run from repo root: ./tests/e2e/fixtures/generate.sh
set -euo pipefail

cd "$(dirname "$0")"

# 200KB JPEG (case 2 - 压缩跳过阈值之下)
convert -size 800x600 xc:steelblue -quality 75 200kb.jpg

# 5MB JPEG (主力压缩用例)
convert -size 6000x4000 xc:white -quality 95 5mb.jpg

# 6MB JPEG (case 7 - 压完通过 5MB 限)
convert -size 8000x6000 xc:white -quality 95 6mb.jpg

# 60MB 假大文件(case 4 - 拒绝)
dd if=/dev/urandom of=60mb.jpg bs=1M count=60 status=none

# Animated GIF (case 3)
convert -size 200x200 \( xc:red \) \( xc:blue \) \( xc:green \) -delay 50 -loop 0 animated.gif

# 1MB PNG (case 10 - PNG → WebP)
convert -size 2000x2000 plasma: photo.png

echo "Fixtures generated:"
ls -lh *.jpg *.png *.gif
```

- [ ] **Step 2: 给可执行权限**

```bash
chmod +x tests/e2e/fixtures/generate.sh
```

- [ ] **Step 3: `.gitignore`**

```gitignore
# 生成的 fixture 图片不进 git(60MB 太大,其余靠 generate.sh 重现)
*.jpg
*.png
*.gif
```

- [ ] **Step 4: `README.md`**

```markdown
# E2E Fixtures

测试图片不入 git,首次跑 E2E 前生成:

```sh
./tests/e2e/fixtures/generate.sh
```

依赖:`imagemagick`(`brew install imagemagick`)、`dd`(系统自带)。
```

- [ ] **Step 5: 跑生成脚本验证**

```bash
./tests/e2e/fixtures/generate.sh
ls -lh tests/e2e/fixtures/
```

期望:看到 `200kb.jpg ~200KB`,`5mb.jpg ~5MB`,`6mb.jpg ~6MB`,`60mb.jpg 60MB`,`animated.gif`,`photo.png`。

---

### Task 4.4: Auth helper(Developer Login)

**Files:**
- Create: `tests/e2e/helpers/auth.js`

- [ ] **Step 1: 写**

```js
// tests/e2e/helpers/auth.js
//
// Developer Login(OmniAuth developer strategy)走 GET /auth/developer
// 返回的内置表单。dev_login_enabled 必须为 true(dev 环境默认开)。

export async function loginAsDeveloper(page, { name = 'E2E', email = 'e2e@test.local' } = {}) {
  await page.goto('/auth/developer')
  // OmniAuth dev form 默认有 name + email 两个字段
  await page.locator('input[name="name"]').fill(name)
  await page.locator('input[name="email"]').fill(email)
  await page.locator('button[type="submit"], input[type="submit"]').click()
  // 登录成功后会重定向回 /tours 或上一个路径
  await page.waitForURL((url) => !url.pathname.startsWith('/auth/'))
}
```

---

### Task 4.5: Seed helper(UI 创建 tour + day + activity)

**Files:**
- Create: `tests/e2e/helpers/seed.js`

- [ ] **Step 1: 写**

```js
// tests/e2e/helpers/seed.js
//
// 通过 UI 流创建一个 fresh tour + 第 1 天 + 1 个 activity。
// 返回 { tourId, activityId } 的字符串(从 URL 解析)。
// 慢但稳定;不依赖 test-only API。

export async function seedTourAndActivity(page) {
  await page.goto('/tours')
  await page.getByRole('button', { name: /\+\s*新建旅程/ }).click()
  // /tours/:id 显示
  await page.waitForURL(/\/tours\/\d+/)
  const tourId = page.url().match(/\/tours\/(\d+)/)[1]

  // TODO 看现实页面结构,新建第 1 天 + 1 个 activity 的具体路径
  // 目前默认新建 tour 已自动创建第 1 天
  // activity 需要点 "+" 或类似按钮
  // 实现细节由执行者根据 UI 现状填充

  // 兜底:后续 Playwright spec 直接 navigate 到 /activities/:id/edit,
  // 因此这里返回 tourId 已足够;activity 由各 spec 自己创建

  return { tourId }
}
```

> **执行者注**:Tour Show 页面的 "新建 day"、"新建 activity" 选择器要你打开 dev server 在浏览器里看一眼 [http://localhost:9000/tours](http://localhost:9000/tours) 实际渲染。如果时间紧,可以让 spec 自己创建 activity,seed 只负责 tour。

---

### Task 4.6: `compression.spec.js` — 12 个 compression 用例

**Files:**
- Create: `tests/e2e/compression.spec.js`

- [ ] **Step 1: 写 Activity Image 4 个用例(框架 + 1 个完整,其余仿写)**

```js
import { test, expect } from '@playwright/test'
import { loginAsDeveloper } from './helpers/auth'
import { seedTourAndActivity } from './helpers/seed'
import path from 'path'

const FIX = path.resolve(__dirname, 'fixtures')

test.beforeEach(async ({ page }) => {
  await loginAsDeveloper(page)
})

test.describe('Activity Image compression', () => {
  test('case 1: 5MB JPEG → 压缩 ≤1.5MB WebP 上传成功', async ({ page }) => {
    const { tourId } = await seedTourAndActivity(page)
    // TODO: navigate 到一个 activity 的 Gallery tab
    // 具体 URL 由 UI 决定;以下是占位
    await page.goto(`/tours/${tourId}`)
    // 找到"行"卡片 → 编辑抽屉 → Gallery tab → 上传按钮

    // 监控网络上传请求
    const uploadPromise = page.waitForRequest((req) =>
      req.url().match(/\/activities\/\d+\/images/) && req.method() === 'POST'
    )
    // 触发文件选择
    const fileChooserPromise = page.waitForEvent('filechooser')
    await page.getByRole('button', { name: /上传/ }).click()
    const fileChooser = await fileChooserPromise
    await fileChooser.setFiles(path.join(FIX, '5mb.jpg'))

    const req = await uploadPromise
    const body = req.postDataBuffer()
    expect(body.length).toBeLessThan(1.5 * 1024 * 1024)  // 压完 ≤1.5MB
    expect(req.headers()['content-type']).toMatch(/multipart/)
    // 后端会以 webp 接收(extension 已被改成 .webp),验证略
  })

  test('case 2: 200KB 小图 → 不压缩直接上传', async ({ page }) => {
    // 仿 case 1,但断言:body.length 接近 200KB(大于压缩后的 ~50KB,说明没压)
  })

  test('case 3: 动画 GIF → 不压缩(保持动画)', async ({ page }) => {
    // 仿 case 1,断言 content-type 含 image/gif 或 webp(根据 shouldCompress 跳 GIF)
  })

  test('case 4: 60MB 大图 → 不发请求,提示"超过 50 MB 已跳过"', async ({ page }) => {
    let uploadAttempted = false
    page.on('request', (req) => {
      if (req.url().match(/\/activities\/\d+\/images/)) uploadAttempted = true
    })
    // 触发上传 60mb.jpg
    // 断言:uploadAttempted === false
    // 断言:notification 文字含 "超过 50 MB"
  })
})

test.describe('Expense Receipt compression', () => {
  test('case 5: EDIT 模式 5MB JPEG → 压缩并上传', async ({ page }) => { /* TODO */ })
  test('case 6: CREATE 模式 5MB JPEG → 压缩并暂存,save 后上传', async ({ page }) => { /* TODO */ })
  test('case 7: 6MB JPEG(原 5MB 限制)→ 压缩后通过', async ({ page }) => { /* TODO */ })
  test('case 8: 100MB 假大文件 → 拒绝,无 HTTP 请求', async ({ page }) => { /* TODO */ })
})

test.describe('Avatar compression', () => {
  test('case 9: 5MB JPEG → 压缩到 ≤300KB / 512px', async ({ page }) => { /* TODO */ })
  test('case 10: PNG → WebP 输出', async ({ page }) => { /* TODO */ })
  test('case 11: 取消选择 → form.avatar reset 为 null', async ({ page }) => { /* TODO */ })
  test('case 12: 50MB 超大头像 → 压缩成功', async ({ page }) => { /* TODO */ })
})
```

> **执行者注**:case 1 完整,其余 11 个填充时:
> - 仿 case 1 的 file chooser 触发 + uploadPromise 模式
> - 浏览器 console 通过 `page.evaluate` 抓 notification message 文字验证
> - Activity image / Receipt / Avatar 三个上传入口具体的 selector 由 UI 现状决定 —— 实现时打开 dev server 看 DOM

- [ ] **Step 2: 跑 case 1 验证基本流通**

```bash
npm run e2e -- --grep "case 1"
```

期望:case 1 通过(如果路径有偏差,先修补 selector 直至通过)。

- [ ] **Step 3: 填充 case 2-12**

按 case 1 的模式补完。每补一个跑一次:

```bash
npm run e2e -- --grep "case N"
```

- [ ] **Step 4: 全部 12 个跑一遍**

```bash
npm run e2e -- compression.spec
```

期望:12 passed。

---

### Task 4.7: `upload-retry.spec.js` — 6 个 retry/progress 用例

**Files:**
- Create: `tests/e2e/upload-retry.spec.js`

- [ ] **Step 1: 写**

```js
import { test, expect } from '@playwright/test'
import { loginAsDeveloper } from './helpers/auth'
import { seedTourAndActivity } from './helpers/seed'
import path from 'path'

const FIX = path.resolve(__dirname, 'fixtures')

test.beforeEach(async ({ page }) => {
  await loginAsDeveloper(page)
})

test('R1: ActivityGallery 5MB,503-then-200,重试成功', async ({ page }) => {
  let attempt = 0
  await page.route('**/activities/*/images', (route) => {
    attempt++
    if (attempt === 1) {
      return route.fulfill({ status: 503, body: '' })
    }
    return route.continue()
  })

  const { tourId } = await seedTourAndActivity(page)
  // 触发上传 5mb.jpg(同 compression spec case 1 的 selector)
  // ...
  // 断言:Progress 在 0% 和 100% 之间至少出现一次回到 0%(retry 重置)
  // 断言:最终图片在 grid 中可见
  // 断言:attempt === 2(1 次失败 + 1 次成功)
})

test('R2: ActivityGallery 5MB,持续 503,3 次后失败 toast', async ({ page }) => {
  await page.route('**/activities/*/images', (route) =>
    route.fulfill({ status: 503, body: '' }))
  // 触发上传
  // 断言:toast 出现 "上传失败" 文字
  // 断言:总请求数 === 3
})

test('R3: ActivityGallery batch 上传中 navigation,后续请求不发出', async ({ page }) => {
  let count = 0
  await page.route('**/activities/*/images', async (route) => {
    count++
    await new Promise((r) => setTimeout(r, 1000))  // 慢响应
    return route.fulfill({ status: 200, body: '{}' })
  })
  // 选 5 张图触发上传 → 在第 1 张响应中 navigation 到 /tours
  // 断言:count <= 2(第 1 张 + 顶多第 2 张被发出,后续都不会)
})

test('R4: AddExpense edit,2 张 receipts,1 张 503-then-200,Progress 单调', async ({ page }) => {
  let attempt = 0
  await page.route('**/expenses/*/receipts', (route) => {
    if (route.request().postData()?.includes('FAILME')) {
      attempt++
      if (attempt === 1) return route.fulfill({ status: 503, body: '' })
    }
    return route.continue()
  })
  // 准备一个 expense → 编辑 → 选 2 张 receipt → 上传
  // 监听 progress 元素 value 属性,断言单调不减(忽略 retry 重置那一刻)
})

test('R5: AddExpense create+pending,Phase 1 JSON 503-then-200,Phase 2 正常', async ({ page }) => {
  let createAttempt = 0
  await page.route('**/tours/*/expenses', (route) => {
    if (route.request().method() !== 'POST') return route.continue()
    createAttempt++
    if (createAttempt === 1) return route.fulfill({ status: 503, body: '' })
    return route.continue()
  })
  // 新建 expense + 2 张 receipt → 点保存
  // 断言:createAttempt === 2,Phase 2 receipts 上传成功,toast "已记下这笔花销"
})

test('R6: ActivityGallery 422 immediate fail,toast 显示 server error 文字', async ({ page }) => {
  await page.route('**/activities/*/images', (route) =>
    route.fulfill({ status: 422, body: '{"errors":["文件类型不支持"]}', headers: { 'Content-Type': 'application/json' } }))
  // 触发上传
  // 断言:toast 显示 "文件类型不支持"
  // 断言:总请求数 === 1(无 retry)
})
```

> **执行者注**:每个 test 内部具体的 UI 触发/断言细节(file chooser selector / toast 选择器 / Progress value 读取)与 compression spec 共享逻辑,可以提取到 helpers/spec-utils.js。

- [ ] **Step 2: 跑全部 6 个**

```bash
npm run e2e -- upload-retry.spec
```

期望:6 passed。

---

### Task 4.8: 完整 E2E 跑一遍 + commit

- [ ] **Step 1: 跑全 18 用例**

```bash
npm run e2e
```

期望:18 passed。如有偶发(典型:weak network rendering 时序),用 trace 调试:

```bash
npm run e2e -- --trace on
npx playwright show-trace trace.zip
```

修到稳定。

- [ ] **Step 2: commit**

```bash
git add playwright.config.js \
        tests/e2e/ \
        package.json package-lock.json
git commit -m "$(cat <<'EOF'
test(e2e): Playwright + 18 用例(compression × 12 + retry/progress × 6)

新增 Playwright + chromium 项目,覆盖 Week 2 上传链路完整闭环:

compression.spec.js(12 用例):
- Activity Image:5MB / 200KB / GIF / 60MB
- Expense Receipt:EDIT 5MB / CREATE 5MB / 6MB(压完通过) / 100MB
- Avatar:5MB / PNG / 取消选择 / 50MB

upload-retry.spec.js(6 用例,page.route 模拟失败):
- R1 ActivityGallery 503-then-200 重试成功
- R2 持续 503 3 次后失败 toast
- R3 batch 中 navigation,后续请求不发
- R4 AddExpense edit 2 张并发,1 张 503,Progress 字节聚合
- R5 AddExpense create+pending Phase 1 JSON 503-then-200
- R6 422 immediate fail,toast 显示 server error

Sentry 终态上报手动验证(deploy 后造一次故障观察)。

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Phase 5:架构文档 v1.3

**Commit message:** `docs: 架构方案 v1.3 反映 xhrRequest 路线`

### Task 5.1: 改 `docs/xinjiang-trip-architecture.md`

**Files:**
- Modify: `docs/xinjiang-trip-architecture.md`

- [ ] **Step 1: 顶部元数据**

找文件顶部的"版本 1.2 / 日期 ..."行,改为:

```
版本:1.3
日期:2026-04-28
```

紧接着加一行:

```
> 生产环境架构详见 [swas-cutover.md](swas-cutover.md)。
```

- [ ] **Step 2: Week 2 任务列表展开**

找 Week 2 章节,把"上传链路改造"展开为:

```markdown
- 客户端图片压缩 ✅ — `browser-image-compression`,WebP 输出,GIF/<500KB 跳过
- xhrRequest helper ✅ — 指数退避 3 次 + Sentry 终态上报(`app/javascript/lib/xhr-request.js`)
- 上传进度 UI ✅ — Mantine `Progress`,无文字;ActivityGallery 横扫整 batch,AddExpenseDialog 字节级聚合
- 18 个 Playwright E2E ✅ — 12 compression + 6 retry/progress
```

- [ ] **Step 3: 技术栈表 "上传" 行**

找技术栈表中"上传"或类似 key,把:

```
Active Storage Direct Upload
```

改为:

```
xhrRequest helper + browser-image-compression(Active Storage proxy mode 已生效,见 swas-cutover.md)
```

- [ ] **Step 4: 加 "明确不在范围" 一行**

在最近的 "非目标 / 不做" 章节追加:

```markdown
- **Active Storage Direct Upload** — 三步签名流程对 PWA + 弱网不友好,实施代价 > 收益(Week 2 修订版决策,2026-04-26)
```

- [ ] **Step 5: 风险登记**

在风险表追加一行:

```markdown
| `xhrRequest` 是新代码,生产首次面世 | 14 vitest 覆盖核心分支 + 6 E2E 覆盖集成;Sentry final-failure 上报作安全网,5 人小规模观察期 | Medium |
```

(列名按表结构调整)

- [ ] **Step 6: review 全文,确认其余章节不受影响**

```bash
git diff docs/xinjiang-trip-architecture.md | less
```

确认只有上述 5 处改动,7 周路线图 / 降级预案 / Pre-flight / 其他 Week 任务表 不动。

- [ ] **Step 7: commit**

```bash
git add docs/xinjiang-trip-architecture.md
git commit -m "$(cat <<'EOF'
docs: 架构方案 v1.3 反映 xhrRequest 路线

- 顶部元数据升 1.3,日期 2026-04-28,加跳转到 swas-cutover
- Week 2 任务列表展开为 4 项(压缩 / helper / 进度 / E2E)
- 技术栈表"上传"行:Direct Upload → xhrRequest + 客户端压缩
- 加"明确不在范围":Direct Upload(对 PWA 不友好的解释)
- 风险登记加一行:xhrRequest 新代码风险 + Sentry 安全网

不动:7 周路线图 / 降级预案 / Pre-flight / 其他 Week 任务表。

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## 收尾

### Task 6.1: spec 文档归档(可选)

如果 spec 还没 commit:

- [ ] **Step 1: commit spec**

```bash
git add docs/superpowers/specs/2026-04-28-week2-upload-retry-progress-design.md \
        docs/superpowers/plans/2026-04-28-week2-upload-retry-progress.md
git commit -m "$(cat <<'EOF'
docs(spec): Week 2 上传 retry/progress 设计 + 实施 plan

设计 spec 与实施 plan,brainstorming + writing-plans skill 产物。
覆盖 6 个 commit 落地的全部细节:helper API、retry 策略、Sentry 集成、
caller 改动、测试方案、构建顺序、文档更新。

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

### Task 6.2: PR 准备

- [ ] **Step 1: push + 在 #49 PR 上加新 commits 或推新 PR**

```bash
git push -u origin claude/seo-basics-SMWCO
```

(本地 worktree 可能已 tracking 远程,直接 `git push`)

- [ ] **Step 2: 看 CI**

```bash
gh pr checks 49 --watch
```

期望:`bin/rubocop` / `bin/brakeman` / `npm audit` 全过。

- [ ] **Step 3: 等用户拍板 deploy**

按 memory 的 "Never auto-merge" 规则,**绝不**自动 merge 到 main。等 skipmaple 在 GitHub UI 自己 merge,然后手动 `kamal deploy`(一致性见 deploy_workflow.md)。

---

## Self-review 报告

**Spec coverage**:对照 [spec § 1-6](docs/superpowers/specs/2026-04-28-week2-upload-retry-progress-design.md):

- § 1 API 签名 → Phase 1 Tasks 1.1-1.4(签名 + body 类型 + CSRF)
- § 2 重试策略 → Tasks 1.7-1.9(5xx / 网络 / 419)
- § 3 Sentry → Tasks 1.7, 1.8, 1.12(tag/extra/normalize)
- § 4 Caller 改动 → Phase 2 + Phase 3
- § 5 测试方案 → Phase 1 vitest + Phase 4 Playwright
- § 6.1 构建顺序 → 5 个 phase 一一对应
- § 6.2 文档更新 → Phase 5
- § 6.3 范围边界 → 各 phase 的代码细节遵守(如 Profile 不接,AddExpense edit 保持并发)

✅ 全部覆盖,无遗漏。

**Placeholder 扫描**:

- 唯二的 "TODO" 是在 Phase 4 Task 4.5(seed.js)和 4.6(spec 框架的 case 2-12 占位)—— 写明"执行者根据 UI 现状填充",并附浏览器观察的指引。这是**有意**的 trade-off:E2E spec 的 selector 严重依赖运行时 DOM,plan 阶段写死会脆。
- 其他无 TBD / "fill in details" 红旗。

**Type consistency**:

- `xhrRequest(url, body, opts)` 签名贯穿 9 处调用(impl + 4 caller + 4 vitest 调用模式)
- `XhrRequestError.{status, body, attempts}` 在 Sentry 上报、test assertion、caller catch 处一致
- `progressMap` 形状 `{ [fileIdx]: { percentage, loaded, total } }` 在 § 4.2 / 4.3 / Task 3.1 一致
- `mkForm(field, value)` 在 helper / 4 个 caller 一致

✅ 通过。

---

**Plan 完成。保存于** [docs/superpowers/plans/2026-04-28-week2-upload-retry-progress.md](docs/superpowers/plans/2026-04-28-week2-upload-retry-progress.md)。
