// app/javascript/lib/__tests__/pwa-register.test.js

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

describe('pwa-register', () => {
  beforeEach(() => {
    vi.resetModules() // 让 import 重新触发 setupPWA()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('calls navigator.serviceWorker.register with /sw.js + scope: /', async () => {
    const registerMock = vi.fn().mockResolvedValue({ scope: 'http://localhost/' })
    vi.stubGlobal('navigator', { serviceWorker: { register: registerMock } })
    await import('../pwa-register')

    expect(registerMock).toHaveBeenCalledTimes(1)
    expect(registerMock).toHaveBeenCalledWith('/sw.js', { scope: '/' })
  })

  it('logs SW scope only in DEV after successful register', async () => {
    const reg = { scope: 'http://localhost/' }
    const registerMock = vi.fn().mockResolvedValue(reg)
    vi.stubGlobal('navigator', { serviceWorker: { register: registerMock } })
    vi.stubGlobal('console', { log: vi.fn(), warn: vi.fn() })
    await import('../pwa-register')

    // 等 promise resolve
    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(console.log).toHaveBeenCalledWith('[PWA] SW registered:', 'http://localhost/')
  })

  it('warns to console when register rejects (not throw)', async () => {
    const err = new Error('scope mismatch')
    const registerMock = vi.fn().mockRejectedValue(err)
    vi.stubGlobal('navigator', { serviceWorker: { register: registerMock } })
    vi.stubGlobal('console', { log: vi.fn(), warn: vi.fn() })
    await import('../pwa-register')

    // 等 promise reject + catch handler 跑完
    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(console.warn).toHaveBeenCalledWith('[PWA] SW register failed:', err)
  })

  it('skips registration when serviceWorker not in navigator', async () => {
    const registerMock = vi.fn()
    vi.stubGlobal('navigator', {})
    await import('../pwa-register')

    expect(registerMock).not.toHaveBeenCalled()
  })
})
