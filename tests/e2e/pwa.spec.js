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
  expect(json.icons.length).toBeGreaterThanOrEqual(1)
  expect(json.icons[0]).toMatchObject({ src: '/icon.png', sizes: '512x512' })
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

test('P3: /icon.png CacheFirst — offline 仍可加载(prod only)', async ({ context, page }) => {
  const swExists = await swServed(page)
  test.skip(!swExists, 'SW only in prod build')

  // 在线访问一次 → SW 缓存进 pwa-icons cache
  await page.goto('/')
  const iconRes1 = await page.request.get('/icon.png')
  expect(iconRes1.ok()).toBe(true)

  // 等 SW 完成 cache write
  await page.waitForTimeout(500)

  // 切到 offline,重新访问 — CacheFirst 应该直接给缓存
  await context.setOffline(true)
  const iconRes2 = await page.request.get('/icon.png')
  expect(iconRes2.ok()).toBe(true)
  expect(iconRes2.headers()['content-type']).toContain('image')

  await context.setOffline(false)
})

test('P4: Inertia GET NetworkFirst — offline 后能看到 cached(prod only)', async ({ context, page }) => {
  const swExists = await swServed(page)
  test.skip(!swExists, 'SW only in prod build')

  // 在线访问 /tours
  await page.goto('/tours')
  await page.waitForLoadState('networkidle')

  // 切 offline 后 reload(NetworkFirst 命中 cache)
  await context.setOffline(true)
  await page.reload({ waitUntil: 'domcontentloaded' })

  // 不应该看到 Inertia "request failed" modal — 看到 cached 内容
  // 用 /tours 列表页常见 anchor:实际 prod 跑时如不命中需调整
  await expect(page.locator('text=/全部旅程|候选池|我的旅程/').first()).toBeVisible({ timeout: 10_000 })

  await context.setOffline(false)
})

test('P5: NetworkOnly /login — offline 直接失败,不命中 stale cache(prod only)', async ({ context, page }) => {
  const swExists = await swServed(page)
  test.skip(!swExists, 'SW only in prod build')

  // 先在线访问 /login(让 SW 看到这个请求,确认 NetworkOnly 不缓存)
  await page.goto('/login')
  await page.waitForLoadState('networkidle')

  // 切 offline 直接 request /login — NetworkOnly 没缓存,应失败
  await context.setOffline(true)
  const res = await page.request.get('/login').catch((e) => ({ ok: () => false, error: e }))
  expect(res.ok()).toBe(false)

  await context.setOffline(false)
})
