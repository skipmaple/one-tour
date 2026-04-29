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

const STAGING_LOGIN_SECRET = process.env.STAGING_LOGIN_SECRET
const STAGING_TEST_USER_ID = process.env.STAGING_TEST_USER_ID

test.skip(
  !STAGING_LOGIN_SECRET || !STAGING_TEST_USER_ID,
  'Need STAGING_LOGIN_SECRET + STAGING_TEST_USER_ID env vars (see .env.staging + db:seed RAILS_ENV=staging)',
)

test.beforeEach(async ({ page }) => {
  // 通过 /login_test 登录(staging gate 用 X-Staging-Login-Secret header)
  const res = await page.request.post('/login_test', {
    headers: { 'X-Staging-Login-Secret': STAGING_LOGIN_SECRET },
    form: { user_id: STAGING_TEST_USER_ID },
  })
  if (!res.ok()) {
    // 失败时暴露 status + body 方便定位(secret 不对 / RAILS_ENV 不对 /
    // user_id 不存在 都返 404,要看 body 区分)
    const body = await res.text()
    throw new Error(
      `login_test failed: status=${res.status()} statusText="${res.statusText()}" body=${body.slice(0, 200)}`,
    )
  }
})

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
  const result = await page.evaluate(async () => {
    const reg = await navigator.serviceWorker.ready
    return { scope: reg.scope, active: reg.active?.state ?? null }
  })
  expect(result.scope).toMatch(/\/$/)
  expect(result.active).toBe('activated')
})

test('P3: /icon.png CacheFirst —— online 写 + offline 命中', async ({ context, page }) => {
  await page.goto('/')
  // 浏览器内 fetch 让请求经过 SW(page.request.* 不走 SW)
  const r1 = await page.evaluate(() =>
    fetch('/icon.png').then((r) => ({ ok: r.ok })),
  )
  expect(r1.ok).toBe(true)

  // 等 SW 把 response 真写进 pwa-icons cache
  await expect.poll(
    async () => page.evaluate(async () => {
      const cache = await caches.open('pwa-icons')
      return Boolean(await cache.match('/icon.png'))
    }),
    { timeout: 5_000 },
  ).toBe(true)

  // offline 后浏览器 fetch —— CacheFirst 兜命中
  await context.setOffline(true)
  const r2 = await page.evaluate(() =>
    fetch('/icon.png').then((r) => ({ ok: r.ok, ct: r.headers.get('content-type') })),
  )
  expect(r2.ok).toBe(true)
  expect(r2.ct).toContain('image')
  await context.setOffline(false)
})

test('P4: Inertia GET NetworkFirst —— X-Inertia XHR 写 inertia-pages, offline 兜', async ({ context, page }) => {
  await page.goto('/tours')
  await page.waitForLoadState('networkidle')

  // 从 data-page 读 Inertia version(避免 X-Inertia-Version mismatch 触发 409)
  const version = await page.evaluate(() => {
    const data = document.getElementById('app')?.dataset?.page
    if (!data) return ''
    try { return JSON.parse(data).version || '' } catch { return '' }
  })

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

  await context.setOffline(true)
  const offline = await fetchToursAsInertia()
  expect(offline.status).toBe(200)
  await context.setOffline(false)
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
