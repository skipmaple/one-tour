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

// IDB 写操作包装:单次 IDB 失败不中断整个 for 循环,异常上报 Sentry 后继续
async function safeWrite(fn, row, context) {
  try {
    await fn()
  } catch (idbErr) {
    Sentry.captureException(idbErr, { tags: { context, id: row.id, kind: row.resource_kind } })
  }
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
          await safeWrite(() => deleteRow(db, row.id), row, 'outbox.delete_failed')
          dispatchSuccess(row)
          Sentry.addBreadcrumb({
            category: 'outbox.success',
            data: { id: row.id, attempts: row.attempts, kind: row.resource_kind },
          })
        } else if (isPermanent(res.status)) {
          row.status = 'failed_permanent'
          row.last_error = `HTTP ${res.status}: ${(await res.text?.()) || ''}`.slice(0, 500)
          await safeWrite(() => put(db, row), row, 'outbox.put_failed')
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
          } else {
            Sentry.addBreadcrumb({
              category: 'outbox.retry',
              data: { id: row.id, attempts: row.attempts, status: res.status },
            })
          }
          await safeWrite(() => put(db, row), row, 'outbox.put_failed')
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
        } else {
          Sentry.addBreadcrumb({
            category: 'outbox.retry',
            data: { id: row.id, attempts: row.attempts, error: row.last_error },
          })
        }
        await safeWrite(() => put(db, row), row, 'outbox.put_failed')
      }
    }
  } finally {
    isReplaying = false
  }
}
