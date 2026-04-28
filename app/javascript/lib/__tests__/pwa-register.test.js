// app/javascript/lib/__tests__/pwa-register.test.js

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// vite-plugin-pwa 提供的虚拟模块,vitest 下需要 mock
const registerSWMock = vi.fn()
vi.mock('virtual:pwa-register', () => ({
  registerSW: registerSWMock,
}))

describe('pwa-register', () => {
  beforeEach(() => {
    registerSWMock.mockReset()
    vi.resetModules() // 让 import 重新触发 setupPWA()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('calls registerSW with onRegisteredSW + onRegisterError callbacks', async () => {
    vi.stubGlobal('navigator', { serviceWorker: { register: vi.fn() } })
    await import('../pwa-register')

    expect(registerSWMock).toHaveBeenCalledTimes(1)
    const opts = registerSWMock.mock.calls[0][0]
    expect(opts.immediate).toBe(true)
    expect(typeof opts.onRegisteredSW).toBe('function')
    expect(typeof opts.onRegisterError).toBe('function')
    // 显式断言:不挂 onNeedRefresh / onOfflineReady(autoUpdate 静默)
    expect(opts.onNeedRefresh).toBeUndefined()
    expect(opts.onOfflineReady).toBeUndefined()
  })

  it('onRegisteredSW logs only in DEV', async () => {
    vi.stubGlobal('navigator', { serviceWorker: { register: vi.fn() } })
    vi.stubGlobal('console', { log: vi.fn(), warn: vi.fn() })
    await import('../pwa-register')

    const opts = registerSWMock.mock.calls[0][0]
    opts.onRegisteredSW('http://localhost:9000/sw.js')

    expect(console.log).toHaveBeenCalledWith('[PWA] SW registered:', 'http://localhost:9000/sw.js')
  })

  it('onRegisterError warns to console (not throw)', async () => {
    vi.stubGlobal('navigator', { serviceWorker: { register: vi.fn() } })
    vi.stubGlobal('console', { log: vi.fn(), warn: vi.fn() })
    await import('../pwa-register')

    const opts = registerSWMock.mock.calls[0][0]
    const err = new Error('scope mismatch')
    expect(() => opts.onRegisterError(err)).not.toThrow()
    expect(console.warn).toHaveBeenCalledWith('[PWA] SW register failed:', err)
  })

  it('skips registration when serviceWorker not in navigator', async () => {
    vi.stubGlobal('navigator', {})
    await import('../pwa-register')

    expect(registerSWMock).not.toHaveBeenCalled()
  })
})
