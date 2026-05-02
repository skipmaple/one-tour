// app/javascript/lib/xhr-request.js

// Implemented incrementally; see docs/superpowers/plans/2026-04-28-week2-upload-retry-progress.md

import * as Sentry from '@sentry/react'

// Exported so consumers (useGalleryUploader)可以判断"xhrRequest 已耗尽 retry"
// 用于决定是入 outbox 还是直接报错给用户。两处用同一份 set 防 drift。
export const RETRYABLE_STATUSES = new Set([ 408, 429, 500, 502, 503, 504 ])

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
  throw lastErr
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
    // { once: true } —— abort 触发后浏览器自动 remove,避免 listener 在
    // 长生命 AbortSignal 上累积(现实中 caller 每次 batch 重建 controller,
    // 但显式 once 是更便宜的防御)
    signal?.addEventListener('abort', onAbort, { once: true })
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
