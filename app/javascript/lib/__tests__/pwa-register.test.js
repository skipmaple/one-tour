// app/javascript/lib/__tests__/pwa-register.test.js

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

describe('pwa-register', () => {
  beforeEach(() => {
    vi.resetModules() // 让 import 重新触发 setupPWA()
    // pwa-register 内部 import.meta.env.PROD 守门 —— vitest 默认是 test
    // 模式 PROD=false,需显式 stub 才能跑到 register 路径(dev/test 噪音
    // 那条 case 下面单独反向 stub)。
    vi.stubEnv('PROD', true)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.unstubAllEnvs()
  })

  it('calls navigator.serviceWorker.register with /sw.js + scope: / + updateViaCache: none', async () => {
    const registerMock = vi.fn().mockResolvedValue({ scope: 'http://localhost/' })
    vi.stubGlobal('navigator', { serviceWorker: { register: registerMock } })
    await import('../pwa-register')

    expect(registerMock).toHaveBeenCalledTimes(1)
    expect(registerMock).toHaveBeenCalledWith('/sw.js', { scope: '/', updateViaCache: 'none' })
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

  it('skips registration in dev/test (import.meta.env.PROD = false)', async () => {
    // dev/test 模式下 vite-plugin-pwa devOptions.enabled: false → public/vite/sw.js
    // 不存在 → register reject + 噪音。靠 PROD 守门提前 return。
    vi.stubEnv('PROD', false)
    const accessProbe = vi.fn()
    const stubNavigator = new Proxy(
      {},
      {
        has() { return true }, // 即使 serviceWorker 'in' navigator 看似存在
        get(_, prop) {
          if (prop === 'serviceWorker') accessProbe()
          return undefined
        },
      },
    )
    vi.stubGlobal('navigator', stubNavigator)
    await import('../pwa-register')

    // PROD 守门提前 return,navigator.serviceWorker 全程没被读到
    expect(accessProbe).not.toHaveBeenCalled()
  })

  it('skips registration when serviceWorker not in navigator', async () => {
    // 用 Proxy 让 `'serviceWorker' in navigator` 返回 false 并埋探针 —
    // pwa-register 早 return 后 .serviceWorker 应永远没被读到。原版直接
    // `vi.stubGlobal('navigator', {})` + `expect(registerMock).not.toHaveBeenCalled()`
    // 是 tautology:registerMock 没绑到任何地方,断言永远真。
    const accessProbe = vi.fn()
    const stubNavigator = new Proxy(
      {},
      {
        has(_, prop) {
          return prop === 'serviceWorker' ? false : Reflect.has(_, prop)
        },
        get(_, prop) {
          if (prop === 'serviceWorker') accessProbe()
          return undefined
        },
      },
    )
    vi.stubGlobal('navigator', stubNavigator)
    await import('../pwa-register')

    expect(accessProbe).not.toHaveBeenCalled()
  })
})
