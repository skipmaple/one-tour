import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { xhrRequest, XhrRequestError, mkForm } from '../xhr-request'
import * as Sentry from '@sentry/react'

vi.mock('@sentry/react', () => ({
  captureException: vi.fn(),
}))

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
  fireLoad({ status, responseText = '' }) {
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
  document.head.innerHTML = '<meta name="csrf-token" content="test-csrf-abc">'
  Sentry.captureException.mockClear()
})

afterEach(() => {
  globalThis.XMLHttpRequest = originalXHR
  vi.useRealTimers()
  document.head.innerHTML = ''
  vi.restoreAllMocks()
})

async function flushBackoff(ms) {
  await vi.advanceTimersByTimeAsync(ms)
}

describe('xhrRequest', () => {
  it('resolves with parsed JSON on 2xx with FormData', async () => {
    const promise = xhrRequest('/api/upload', mkForm('file', new Blob([ 'hi' ])))
    await vi.runAllTimersAsync()
    const inst = mockXhrInstances[0]
    expect(inst._method).toBe('POST')
    expect(inst._url).toBe('/api/upload')
    expect(inst._body).toBeInstanceOf(FormData)

    inst.fireLoad({ status: 200, responseText: '{"id":42}' })
    await expect(promise).resolves.toEqual({ id: 42 })
  })

  it('serializes plain object body as JSON with Content-Type', async () => {
    const promise = xhrRequest('/api/expenses', { amount_cents: 100 })
    await vi.runAllTimersAsync()
    const inst = mockXhrInstances[0]
    expect(inst._headers['Content-Type']).toBe('application/json')
    expect(inst._body).toBe('{"amount_cents":100}')

    inst.fireLoad({ status: 201, responseText: '{"id":7}' })
    await expect(promise).resolves.toEqual({ id: 7 })
  })

  it('injects X-CSRF-Token from <meta name="csrf-token">', async () => {
    const promise = xhrRequest('/api/x', null)
    await vi.runAllTimersAsync()
    const inst = mockXhrInstances[0]
    expect(inst._headers['X-CSRF-Token']).toBe('test-csrf-abc')
    expect(inst._headers['Accept']).toBe('application/json')

    inst.fireLoad({ status: 200, responseText: '' })
    await expect(promise).resolves.toBeNull()
  })

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
    expect(mockXhrInstances).toHaveLength(1)
  })

  it('retries on 503 then resolves on 200 (attempts=2, no Sentry)', async () => {
    const promise = xhrRequest('/api/x', null)
    await vi.runAllTimersAsync()
    mockXhrInstances[0].fireLoad({ status: 503, responseText: '' })

    await flushBackoff(1000)

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

  it('does not retry on 419 (CSRF mismatch)', async () => {
    const promise = xhrRequest('/api/x', null)
    await vi.runAllTimersAsync()
    mockXhrInstances[0].fireLoad({ status: 419, responseText: '' })
    await expect(promise).rejects.toMatchObject({ status: 419, attempts: 1 })
    expect(mockXhrInstances).toHaveLength(1)
    expect(Sentry.captureException).not.toHaveBeenCalled()
  })

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
    await flushBackoff(500)
    ctrl.abort()
    await expect(promise).rejects.toMatchObject({ name: 'AbortError' })
    expect(mockXhrInstances).toHaveLength(1)
    expect(Sentry.captureException).not.toHaveBeenCalled()
  })

  it('fires onProgress for FormData with percentage/loaded/total', async () => {
    const onProgress = vi.fn()
    const promise = xhrRequest('/api/upload', mkForm('file', new Blob([ 'x' ])), { onProgress })
    await vi.runAllTimersAsync()
    const inst = mockXhrInstances[0]
    inst.fireProgress({ loaded: 250, total: 1000 })
    inst.fireProgress({ loaded: 1000, total: 1000 })
    inst.fireLoad({ status: 200, responseText: '{}' })
    await promise

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
})
