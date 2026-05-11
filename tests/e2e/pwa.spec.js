// tests/e2e/pwa.spec.js
//
// PWA 集成 E2E:验证 manifest / SW 注册 / 三类缓存策略命中 / 离线 fallback。
//
// 注意:这些测试需要 prod build 才能完整跑(devOptions.enabled: false)。
// 本地手跑前先 `RAILS_ENV=production bin/vite build && bin/rails s -e production`,
// 或在 dev 9000 端口(SW 不会真注册,P2 会 skip,P3-P5 退化为 NetworkOnly 行为)。

import { test, expect } from '@playwright/test'
import { loginAsDeveloper } from './helpers/auth'

// SW 探针:dev 模式 vite-plugin-pwa devOptions.enabled: false → /sw.js 不存在;
// prod build workbox 输出到根。返回 true 表示 SW 应已注册,false 表示 dev 跑应 skip。
async function swServed(page) {
  return page.request.get('/sw.js')
    .then((r) => r.ok())
    .catch(() => false)
}

test.beforeEach(async ({ page }) => {
  await loginAsDeveloper(page)
})

test('P1: /manifest 返回 OneTour 配置 + standalone display + Mantine 蓝主题', async ({ page }) => {
  // 纯 HTTP fetch /manifest endpoint,不依赖 SW,dev + prod 都跑。
  const res = await page.request.get('/manifest', { headers: { Accept: 'application/json' } })
  expect(res.status()).toBe(200)
  const json = await res.json()
  expect(json).toMatchObject({
    name: 'OneTour',
    short_name: 'OneTour',
    display: 'standalone',
    start_url: '/',
    scope: '/',
    theme_color: '#1971c2',
    background_color: '#ffffff',
    lang: 'zh-CN',
  })
  expect(Array.isArray(json.icons)).toBe(true)
  // Manifest 含三档 PNG:192 / 512 / 512 maskable。PR #68 之后才拆开三档,
  // 之前只有 /icon-lulu.png 一档既当 maskable 又当非 maskable。
  expect(json.icons.length).toBeGreaterThanOrEqual(3)
  expect(json.icons).toEqual(expect.arrayContaining([
    expect.objectContaining({ src: '/icon-192.png', sizes: '192x192' }),
    expect.objectContaining({ src: '/icon-512.png', sizes: '512x512' }),
    expect.objectContaining({ src: '/icon-512-maskable.png', sizes: '512x512', purpose: 'maskable' }),
  ]))
})

test('P2: SW 注册到 / scope,active 状态(prod only)', async ({ page }) => {
  // dev mode 下 vite-plugin-pwa devOptions.enabled: false → SW 不注册
  const swExists = await swServed(page)
  test.skip(!swExists, 'SW only in prod build (devOptions.enabled: false)')

  await page.goto('/')
  // 等 SW activate
  const result = await page.evaluate(async () => {
    const reg = await navigator.serviceWorker.ready
    return { scope: reg.scope, active: reg.active?.state ?? null }
  })
  expect(result.scope).toMatch(/\/$/) // scope = http://host/
  expect(result.active).toBe('activated')
})

test('P3: /icon-lulu.png CacheFirst — offline 仍可加载(prod only)', async ({ context, page }) => {
  const swExists = await swServed(page)
  test.skip(!swExists, 'SW only in prod build')

  // 在线访问一次,**用浏览器内 fetch** 让请求经过 SW 注册到 pwa-icons cache
  // (page.request.* 是 Playwright Node HTTP client,不走 SW)
  await page.goto('/')
  const iconRes1 = await page.evaluate(() =>
    fetch('/icon-lulu.png').then((r) => ({ ok: r.ok, ct: r.headers.get('content-type') })),
  )
  expect(iconRes1.ok).toBe(true)

  // poll Cache API 等 SW write 真实完成,避免 hardcoded sleep race
  await expect.poll(
    async () => page.evaluate(async () => {
      const cache = await caches.open('pwa-icons')
      const match = await cache.match('/icon-lulu.png')
      return Boolean(match)
    }),
    { timeout: 5_000 },
  ).toBe(true)

  // offline 后浏览器 fetch — CacheFirst 命中 cache
  await context.setOffline(true)
  const iconRes2 = await page.evaluate(() =>
    fetch('/icon-lulu.png').then((r) => ({ ok: r.ok, ct: r.headers.get('content-type') })),
  )
  expect(iconRes2.ok).toBe(true)
  expect(iconRes2.ct).toContain('image')

  await context.setOffline(false)
})

test('P4: Inertia GET NetworkFirst — offline 后能看到 cached XHR(prod only)', async ({ context, page }) => {
  const swExists = await swServed(page)
  test.skip(!swExists, 'SW only in prod build')

  // P4 规则只对 X-Inertia: true 的 XHR 生效。`page.goto('/tours')` 是
  // document navigation,不带 X-Inertia 头,根本不写 inertia-pages。
  // `page.reload()` 同理是 document nav,加上 navigateFallback: null →
  // offline reload 必然失败。原版 reload + 看 anchor 文字的写法在 prod
  // 跑也不会通过,所以等于个 skip-only 死代码。
  // 重写:从 data-page 取 Inertia version → 显式 fetch 一次 Inertia XHR
  // 写 cache → offline 同样的 XHR 期望 NetworkFirst 兜 cache 200。

  await page.goto('/tours')
  await page.waitForLoadState('networkidle')

  const inertiaVersion = await page.evaluate(() => {
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
    }, inertiaVersion)

  // 在线先 warmup — 写 inertia-pages cache
  const warm = await fetchToursAsInertia()
  expect(warm.status).toBe(200)

  await expect.poll(
    async () => page.evaluate(async () => {
      const cache = await caches.open('inertia-pages')
      return (await cache.keys()).length
    }),
    { timeout: 5_000 },
  ).toBeGreaterThan(0)

  // offline — NetworkFirst 命中 cache,同样 XHR 仍 200
  await context.setOffline(true)
  const offline = await fetchToursAsInertia()
  expect(offline.status).toBe(200)

  await context.setOffline(false)
})

test('P5: NetworkOnly /login — offline 直接失败,不命中 stale cache(prod only)', async ({ context, page }) => {
  const swExists = await swServed(page)
  test.skip(!swExists, 'SW only in prod build')

  // 先在线访问 /login,让 SW 看到这个请求(NetworkOnly route 不应写 cache)
  await page.goto('/login')
  await page.waitForLoadState('networkidle')

  // offline 后用浏览器内 fetch(经过 SW)— NetworkOnly 不命中 stale cache,
  // 浏览器 fetch 会 throw TypeError(Failed to fetch);Node HTTP client
  // 不经 SW 路径,所以这里必须用 page.evaluate 才能真验证 SW 行为
  await context.setOffline(true)
  const failed = await page.evaluate(() =>
    fetch('/login').then(() => false).catch(() => true),
  )
  expect(failed).toBe(true)

  await context.setOffline(false)
})
