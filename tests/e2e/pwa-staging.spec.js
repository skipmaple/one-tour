// tests/e2e/pwa-staging.spec.js
//
// PWA E2E 跑在 staging.tour.skipmaple.com 上,通过 Playwright 移动 device
// profile(Pixel 5 + iPhone 15)模拟 Android Chrome / iOS Safari。覆盖
// 5 项 PR #54 Test plan 的"deploy 后才能验"项目:
//
//   P1 manifest 可达
//   P2 SW 注册到 / scope active
//   P3 /icon.png CacheFirst —— online 写入 + offline 命中
//   P4 Inertia GET NetworkFirst —— XHR online 写 inertia-pages + offline 命中
//   P5 /login NetworkOnly —— 不写 cache,offline fetch 失败
//
// 跑:`scripts/pwa-e2e-staging.sh`(读 .env.staging 自动注入 secret)
// 或:`STAGING_URL=https://... STAGING_LOGIN_SECRET=... STAGING_TEST_USER_ID=1 \
//      npx playwright test --config playwright.config.staging.js`

import { test, expect } from '@playwright/test'

// 登入由 setup project(tests/e2e/setup/staging-auth.setup.js)做完,
// session cookie 存到 .auth/staging-user.json,通过 storageState 自动 inherit
// 进每个测试。这样整个 suite 只命中 /login_test 1 次,不撞 PR #60 加的
// 5/min/IP rate limit(原 beforeEach 每 test 一次,5 次后 429)。

test.skip(
  !process.env.STAGING_LOGIN_SECRET || !process.env.STAGING_TEST_USER_ID,
  'Need STAGING_LOGIN_SECRET + STAGING_TEST_USER_ID env vars (see .env.staging)',
)

test('P1: /manifest 返回 OneTour standalone PWA 配置', async ({ page }) => {
  const res = await page.request.get('/manifest', {
    headers: { Accept: 'application/json' },
  })
  expect(res.status()).toBe(200)
  const json = await res.json()
  expect(json).toMatchObject({
    name: 'OneTour',
    short_name: 'OneTour',
    display: 'standalone',
    start_url: '/',
    scope: '/',
    theme_color: '#1971c2',
    lang: 'zh-CN',
  })
})

test('P2: SW 注册到 / scope, active', async ({ page }) => {
  await page.goto('/')
  // navigator.serviceWorker.ready 在 WebKit 上有时 'activating' 就 resolve,
  // 后续转 'activated' 是异步。poll 等真正 activated 状态(最多 5s)。
  const result = await page.evaluate(async () => {
    const reg = await navigator.serviceWorker.ready
    for (let i = 0; i < 50; i++) {
      if (reg.active?.state === 'activated') break
      await new Promise(r => setTimeout(r, 100))
    }
    return { scope: reg.scope, active: reg.active?.state ?? null }
  })
  expect(result.scope).toMatch(/\/$/)
  expect(result.active).toBe('activated')
})

test('P3: /icon.png CacheFirst —— online 写 + offline 命中', async ({ context, page, browserName }) => {
  await page.goto('/')

  // 等 SW 真正 activated + 接管这个 client。WebKit 上 <link rel="icon">
  // 自动 fetch 在 SW 还在 'installing' 时就发,会绕过 CacheFirst route。
  // 必须先等 controller 设定,再手动 fetch 才能保证走 SW 的 runtimeCaching。
  await page.evaluate(async () => {
    const reg = await navigator.serviceWorker.ready
    for (let i = 0; i < 50; i++) {
      if (reg.active?.state === 'activated' && navigator.serviceWorker.controller) break
      await new Promise(r => setTimeout(r, 100))
    }
  })

  // 浏览器内 fetch 让请求经过 SW(page.request.* 不走 SW)
  const r1 = await page.evaluate(() =>
    fetch('/icon.png').then((r) => ({ ok: r.ok })),
  )
  expect(r1.ok).toBe(true)

  // 等 SW 把 response 真写进 pwa-icons cache(WebKit 比 Chromium 慢)
  let cacheHit = false
  for (let i = 0; i < 30; i++) {
    cacheHit = await page.evaluate(async () => {
      const cache = await caches.open('pwa-icons')
      return Boolean(await cache.match('/icon.png'))
    })
    if (cacheHit) break
    await new Promise(r => setTimeout(r, 500))
  }
  if (!cacheHit) {
    // 失败前 dump 所有 caches 状态,console.log 进 Playwright report 方便定位
    const dump = await page.evaluate(async () => {
      const allKeys = await caches.keys()
      const allEntries = {}
      for (const k of allKeys) {
        const c = await caches.open(k)
        allEntries[k] = (await c.keys()).map(r => r.url)
      }
      return {
        controller: navigator.serviceWorker.controller?.scriptURL || null,
        allCaches: allKeys,
        allEntries,
      }
    })
    // eslint-disable-next-line no-console
    console.log('P3 cache miss dump:', JSON.stringify(dump, null, 2))
  }
  expect(cacheHit, 'pwa-icons 内没 /icon.png(看上面 cache miss dump)').toBe(true)

  // offline 兜底验证:WebKit Playwright emulation 的 context.setOffline(true)
  // 会让所有 fetch(包括 SW cache 回填的)直接 throw "Load failed",这是
  // emulation 限制(真 iOS Safari 上 SW cache 离线兜回填正常)。Chromium
  // 上 offline + SW cache 行为跟真机一致,所以这部分只在 Chromium 验。
  if (browserName !== 'webkit') {
    await context.setOffline(true)
    const r2 = await page.evaluate(() =>
      fetch('/icon.png').then((r) => ({ ok: r.ok, ct: r.headers.get('content-type') })),
    )
    expect(r2.ok).toBe(true)
    expect(r2.ct).toContain('image')
    await context.setOffline(false)
  }
})

test('P4: Inertia GET NetworkFirst —— X-Inertia XHR 写 inertia-pages, offline 兜', async ({ context, page, browserName }) => {
  await page.goto('/tours')
  await page.waitForLoadState('networkidle')

  // Inertia v3 把 page JSON 放在 <script data-page="app" type="application/json">
  // (不是 <div id="app" data-page=>)。从那 script.textContent 里拿 version。
  const version = await page.evaluate(() => {
    const script = document.querySelector('script[data-page="app"]')
    if (!script?.textContent) return ''
    try { return JSON.parse(script.textContent).version || '' } catch { return '' }
  })
  expect(version, 'Inertia v3 version 抽取失败').not.toBe('')

  const fetchToursAsInertia = () =>
    page.evaluate(async (v) => {
      const r = await fetch('/tours', {
        headers: {
          'X-Inertia': 'true',
          'X-Inertia-Version': v,
          Accept: 'text/html, application/xhtml+xml',
        },
      })
      return { status: r.status }
    }, version)

  const warm = await fetchToursAsInertia()
  expect(warm.status).toBe(200)

  await expect.poll(
    async () => page.evaluate(async () => {
      const cache = await caches.open('inertia-pages')
      return (await cache.keys()).length
    }),
    { timeout: 5_000 },
  ).toBeGreaterThan(0)

  // WebKit Playwright offline emulation 跟 Chromium 不一致(详见 P3 注释),
  // 离线兜回填只在 Chromium 验。
  if (browserName !== 'webkit') {
    await context.setOffline(true)
    const offline = await fetchToursAsInertia()
    expect(offline.status).toBe(200)
    await context.setOffline(false)
  }
})

test('P5: /login NetworkOnly —— 不写 cache, offline 直接失败', async ({ context, page }) => {
  await page.goto('/login')
  await page.waitForLoadState('networkidle')

  await context.setOffline(true)
  const failed = await page.evaluate(() =>
    fetch('/login').then(() => false).catch(() => true),
  )
  expect(failed).toBe(true)
  await context.setOffline(false)
})
