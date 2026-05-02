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
import { friendlyError } from './errors'

const MAX_ATTEMPTS = 5

let isReplaying = false

// 测试用:重置 mutex
export function _resetMutex() {
  isReplaying = false
}

// 永久失败:4xx 大部分 status。例外:
//   408 / 429 — 客户端超时 / 限流,retry
//   409       — Inertia version mismatch(deploy 期最常见 — server 比 client 新),
//               必须 retry(用户刷新页拿最新 version 后,replay 自然成功)。
//               Copilot review item #3
function isPermanent(status) {
  return status >= 400 && status < 500
    && status !== 408 && status !== 429 && status !== 409
}

// IDB 写操作包装:返 boolean 让 caller 知道是否 commit 成功。Copilot review item #2
// 关键场景:dispatch 成功后 deleteRow 失败(iOS 后台 abort tx 时常见),如果继续按
// "已处理" 走,row 仍是 pending,下次 trigger 再发 → 后端**重复写**(费用记两次)。
// caller 看到 false 时应把 row 改 failed_permanent 防止再次 replay。
async function safeWrite(fn, row, context) {
  try {
    await fn()
    return true
  } catch (idbErr) {
    Sentry.captureException(idbErr, { tags: { context, id: row.id, kind: row.resource_kind } })
    return false
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
          // 关键:成功后必须确认 row 真的删了。delete 失败但还按"已处理"走 →
          // row 留 pending → 下次 trigger 再发 → 后端**重复写**。修法:delete
          // 失败 → 标 failed_permanent + Sentry capture(用户能从抽屉看到),
          // 不再 dispatch 让 UI 当成"成功了"。Copilot review item #2
          const deleted = await safeWrite(() => deleteRow(db, row.id), row, 'outbox.delete_failed')
          if (!deleted) {
            row.status = 'failed_permanent'
            row.last_error = '已发送但本地清理失败,请刷新页面'
            row.last_error_raw = `Delete after success failed (likely tx abort) — preventing duplicate replay`
            await safeWrite(() => put(db, row), row, 'outbox.put_after_delete_failed')
            Sentry.captureException(new Error('Outbox delete-after-success failed'), {
              tags: { path: row.path, method: row.method, kind: row.resource_kind },
              extra: { last_error_raw: row.last_error_raw },
            })
            // 注意:不调 dispatchSuccess(让 UI 不假装成功)— 用户从抽屉知道这条要刷新
          } else {
            dispatchSuccess(row)
            Sentry.addBreadcrumb({
              category: 'outbox.success',
              data: { id: row.id, attempts: row.attempts, kind: row.resource_kind },
            })
          }
        } else if (isPermanent(res.status)) {
          // 错误信息分两份:用户看的友好句子 + dev 看的 raw body(Sentry capture 也带 raw)
          const rawBody = ((await res.text?.()) || '').slice(0, 500)
          row.status = 'failed_permanent'
          row.last_error = friendlyError(res.status, rawBody)
          row.last_error_raw = `HTTP ${res.status}: ${rawBody}`
          await safeWrite(() => put(db, row), row, 'outbox.put_failed')
          Sentry.captureException(new Error(`Outbox failed_permanent ${res.status}`), {
            tags: {
              path: row.path,
              method: row.method,
              attempts: row.attempts,
              kind: row.resource_kind,
            },
            extra: { last_error_raw: row.last_error_raw },
          })
        } else {
          // 5xx / 408 / 429 / status=0 网络错
          row.attempts += 1
          if (row.attempts >= MAX_ATTEMPTS) {
            row.status = 'failed_permanent'
            row.last_error = friendlyError(res.status, '')
            row.last_error_raw = `HTTP ${res.status} (cap reached, attempts=${row.attempts})`
            Sentry.captureException(new Error(`Outbox attempts cap`), {
              tags: { path: row.path, method: row.method, attempts: row.attempts, kind: row.resource_kind },
              extra: { last_error_raw: row.last_error_raw },
            })
          } else {
            row.last_error = friendlyError(res.status, '')
            row.last_error_raw = `HTTP ${res.status}`
            Sentry.addBreadcrumb({
              category: 'outbox.retry',
              data: { id: row.id, attempts: row.attempts, status: res.status },
            })
          }
          await safeWrite(() => put(db, row), row, 'outbox.put_failed')
        }
      } catch (networkErr) {
        // fetch 抛出(network down)。当作 status=null 走友好文案。
        row.attempts += 1
        const rawMsg = networkErr.message || 'Network failure'
        if (row.attempts >= MAX_ATTEMPTS) {
          row.status = 'failed_permanent'
          row.last_error = friendlyError(null, '')
          row.last_error_raw = `Network: ${rawMsg} (cap reached, attempts=${row.attempts})`
          Sentry.captureException(networkErr, {
            tags: { path: row.path, method: row.method, attempts: row.attempts, kind: row.resource_kind },
            extra: { last_error_raw: row.last_error_raw },
          })
        } else {
          row.last_error = friendlyError(null, '')
          row.last_error_raw = `Network: ${rawMsg}`
          Sentry.addBreadcrumb({
            category: 'outbox.retry',
            data: { id: row.id, attempts: row.attempts, error: rawMsg },
          })
        }
        await safeWrite(() => put(db, row), row, 'outbox.put_failed')
      }
    }
  } finally {
    isReplaying = false
  }
}
