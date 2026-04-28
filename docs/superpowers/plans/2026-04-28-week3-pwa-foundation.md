# Week 3 PWA 基础 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 给 OneTour 装 vite-plugin-pwa,让 5 人能在 iOS Safari + Android Chrome 装到主屏,断网能读上次访问页面。

**Architecture:** Vite + vite-plugin-pwa(Workbox 7.x)注入 SW;Workbox 分级缓存(NetworkFirst Inertia GET / CacheFirst static + Active Storage / NetworkOnly auth);Rails 8 自带 manifest ERB 提供 PWA manifest;`autoUpdate + skipWaiting + clientsClaim` 静默升级。

**Tech Stack:** Vite 8 + vite-plugin-pwa ^1 + Workbox 7 + Inertia.js 2 + React 19 + Mantine v9 + Vitest 4.1 + Playwright 1.x

**Spec:** [docs/superpowers/specs/2026-04-28-week3-pwa-foundation-design.md](docs/superpowers/specs/2026-04-28-week3-pwa-foundation-design.md)

---

## File Structure

**新增文件:**

| 路径 | 责任 |
|---|---|
| `app/javascript/lib/pwa-register.js` | SW 注册胶水(调 `registerSW`,提供 update/error 钩子) |
| `app/javascript/lib/__tests__/pwa-register.test.js` | 4 vitest 用例(注册 / controllerchange / autoUpdate 静默 / SW 不支持环境) |
| `tests/e2e/pwa.spec.js` | 5 Playwright 用例(P1 manifest / P2 SW / P3 CacheFirst / P4 NetworkFirst offline / P5 NetworkOnly fail) |

**修改文件:**

| 路径 | 改动 |
|---|---|
| `vite.config.ts` | 加 `VitePWA(...)` plugin(Phase 1 最小,Phase 2 加 runtimeCaching) |
| `app/views/pwa/manifest.json.erb` | name/short_name 保持 OneTour,改 theme/background/description/lang |
| `config/routes.rb` | 加 `get "manifest", to: "rails/pwa#manifest", as: :pwa_manifest` |
| `app/views/layouts/application.html.erb` | 取消 manifest link tag commented |
| `app/javascript/entrypoints/inertia.jsx` | 加 `import './lib/pwa-register'`(单次注册,SW per-origin 全局) |
| `package.json` | `+vite-plugin-pwa` devDep |
| `docs/xinjiang-trip-architecture.md` | v1.4 → v1.5,Week 3 任务全 ✅ + 版本块更新 |

---

## Phase 1:vite-plugin-pwa + Manifest + SW 注册(最小骨架)

**Commit message(Phase 1 末):** `feat(pwa): vite-plugin-pwa + manifest + SW 注册`

### Task 1.1:安装 vite-plugin-pwa

**Files:**
- Modify: `package.json` + `package-lock.json`

- [ ] **Step 1:装依赖**

```bash
npm i -D vite-plugin-pwa
```

- [ ] **Step 2:验证 package.json 多了 devDep,且 transitive workbox-* 都装了**

```bash
grep "vite-plugin-pwa" package.json
ls node_modules/vite-plugin-pwa/dist/ 2>&1 | head -5
ls node_modules/workbox-window/build/ 2>&1 | head -5
```

期望:`"vite-plugin-pwa": "^1..."`,`workbox-window` 在 node_modules 里。

---

### Task 1.2:vite.config.ts 加 VitePWA 最小配置

**Files:**
- Modify: `vite.config.ts`

- [ ] **Step 1:加 import 行**

把 `vite.config.ts` 头部改为:

```ts
import inertia from '@inertiajs/vite'
import react from '@vitejs/plugin-react'
import { sentryVitePlugin } from '@sentry/vite-plugin'
import { defineConfig } from 'vite'
import RubyPlugin from 'vite-plugin-ruby'
import { VitePWA } from 'vite-plugin-pwa'
```

- [ ] **Step 2:在 `plugins: [...]` 数组末尾加 VitePWA(Phase 1 最小,无 runtimeCaching)**

把现有的:

```ts
  plugins: [
    inertia(),
    react(),
    RubyPlugin(),
    sentryVitePlugin({...}),
  ],
```

改为:

```ts
  plugins: [
    inertia(),
    react(),
    RubyPlugin(),
    sentryVitePlugin({
      org: process.env.SENTRY_ORG,
      project: process.env.SENTRY_PROJECT_FRONTEND,
      authToken: process.env.SENTRY_AUTH_TOKEN,
      disable: !process.env.SENTRY_AUTH_TOKEN,
    }),
    VitePWA({
      registerType: 'autoUpdate',
      // manifest 由 Rails ERB 提供,不让 plugin 自己生成 /manifest.webmanifest
      manifest: false,
      injectRegister: false,  // 我们在 pwa-register.js 手动调,不让 plugin auto-注入
      workbox: {
        skipWaiting: true,
        clientsClaim: true,
        // Phase 2 补 runtimeCaching;Phase 1 仅 precache 静态 assets(自动)
      },
      devOptions: {
        enabled: false,  // Vite Ruby + 多 entrypoint 在 dev 下与 plugin SW 易冲突,只在 prod build 启
      },
    }),
  ],
```

- [ ] **Step 3:验证 vitest config 没破**

```bash
npm test 2>&1 | tail -3
```

期望:`Tests 539 passed`(Phase 1 没改 source,只加 plugin 配置,不影响 unit test)。

---

### Task 1.3:更新 manifest.json.erb 内容

**Files:**
- Modify: `app/views/pwa/manifest.json.erb`

- [ ] **Step 1:整体替换文件内容**

```erb
{
  "name": "OneTour",
  "short_name": "OneTour",
  "description": "5 人小队出行规划 · 行程 / 开支 / 照片",
  "icons": [
    { "src": "/icon.png", "type": "image/png", "sizes": "512x512" },
    { "src": "/icon.png", "type": "image/png", "sizes": "512x512", "purpose": "maskable" }
  ],
  "start_url": "/",
  "scope": "/",
  "display": "standalone",
  "theme_color": "#1971c2",
  "background_color": "#ffffff",
  "lang": "zh-CN",
  "dir": "ltr"
}
```

差异 vs Rails 8 默认:`name`/`short_name` 保 OneTour;`description` 中文;`theme_color`/`background_color` 改 Mantine 蓝 + 白;新增 `lang`/`dir`。

---

### Task 1.4:加 PWA manifest 路由

**Files:**
- Modify: `config/routes.rb`

- [ ] **Step 1:打开 routes.rb 看现有结构**

```bash
head -10 config/routes.rb
```

- [ ] **Step 2:在 `Rails.application.routes.draw do` 内的 OAuth 块**之后**加 PWA 路由(顺序合理放,如紧跟 `/auth/email/verify` 之后)**

把:

```ruby
  post "/auth/email/send",   to: "sessions#send_code"
  post "/auth/email/verify", to: "sessions#verify_code"

  # ActionCable
  mount ActionCable.server => "/cable"
```

改为:

```ruby
  post "/auth/email/send",   to: "sessions#send_code"
  post "/auth/email/verify", to: "sessions#verify_code"

  # PWA manifest(Rails 8 自带 Rails::Pwa 控制器,view 在 app/views/pwa/manifest.json.erb)
  get "manifest", to: "rails/pwa#manifest", as: :pwa_manifest

  # ActionCable
  mount ActionCable.server => "/cable"
```

- [ ] **Step 3:验证路由生效**

```bash
PATH="$(mise where ruby)/bin:$PATH" bin/rails routes | grep manifest
```

期望:看到一行 `pwa_manifest GET    /manifest(.:format)    rails/pwa#manifest`

- [ ] **Step 4:通过 curl 验证 endpoint(需要 dev server 在跑,9000 端口)**

```bash
curl -s http://localhost:9000/manifest | python3 -m json.tool | head -20
```

期望:返回 manifest JSON,`name: "OneTour"` 等字段全。

---

### Task 1.5:Layout 取消 manifest link 注释

**Files:**
- Modify: `app/views/layouts/application.html.erb`

- [ ] **Step 1:找到 commented 的 manifest link tag**

文件第 13-14 行:

```erb
    <%# Enable PWA manifest for installable apps (make sure to enable in config/routes.rb too!) %>
    <%#= tag.link rel: "manifest", href: pwa_manifest_path(format: :json) %>
```

- [ ] **Step 2:整体替换为(去掉 ERB 注释 `%#=`,改为 `%=`)**

```erb
    <%# PWA manifest — Rails 8 controller serves app/views/pwa/manifest.json.erb %>
    <%= tag.link rel: "manifest", href: pwa_manifest_path(format: :json) %>
```

- [ ] **Step 3:curl 验证 layout 渲染时输出了 link tag**

```bash
curl -s http://localhost:9000/login | grep "rel=\"manifest\""
```

期望:看到 `<link rel="manifest" href="/manifest.json">`。

---

### Task 1.6:创建 pwa-register.js + 在 entrypoint 调用

**Files:**
- Create: `app/javascript/lib/pwa-register.js`
- Modify: `app/javascript/entrypoints/inertia.jsx`

- [ ] **Step 1:创建 pwa-register.js**

```js
// app/javascript/lib/pwa-register.js
//
// Service Worker 注册胶水。autoUpdate 模式 — vite-plugin-pwa 会自动调用
// updateSW(),用户感知完全静默(skipWaiting + clientsClaim 在 vite.config 里)。
// 不暴露 onNeedRefresh / onOfflineReady,因为我们不弹 toast。
//
// 不支持 Service Worker 的环境(老 iOS、微信特殊版本)gracefully no-op。

import { registerSW } from 'virtual:pwa-register'

export function setupPWA() {
  if (typeof window === 'undefined') return  // SSR safety(本项目无 SSR,但保险)
  if (!('serviceWorker' in navigator)) return  // 老浏览器 / 不支持环境

  registerSW({
    immediate: true,
    onRegisteredSW(swUrl) {
      // 仅 dev 时打印,prod 静默。Sentry 不上报(Q2 决策范围外)
      if (import.meta.env.DEV) console.log('[PWA] SW registered:', swUrl)
    },
    onRegisterError(err) {
      // 注册失败通常是浏览器拒绝(scope 问题、HTTPS 问题等),不是业务错误,
      // 不弹 UI 但 log 出来便于调试
      console.warn('[PWA] SW register failed:', err)
    },
    // 显式不传 onNeedRefresh / onOfflineReady — autoUpdate 模式不需要
  })
}

setupPWA()
```

- [ ] **Step 2:在 entrypoint 里 import**

`app/javascript/entrypoints/inertia.jsx` 顶部 import 区(在所有 Sentry / Mantine import 之后,但在 `createInertiaApp` 调用之前)加一行:

把:

```js
import 'dayjs/locale/zh-cn'
import '@mantine/core/styles.css'
```

改为:

```js
import 'dayjs/locale/zh-cn'
import '@mantine/core/styles.css'
import '../lib/pwa-register'  // 注册 SW(SW per-origin 全局生效,只调一次)
```

- [ ] **Step 3:跑 dev build 验证无 import error**

```bash
# 看 vite-dev tmp 目录是否能解析
curl -s http://localhost:9000/ 2>&1 | head -3
# 浏览器 DevTools 打开 9000,看 Application → Service Workers 是否 activated
```

(Dev mode 下 `devOptions.enabled: false` 让 SW 不在 dev 注册;**真验证要在 prod build 后**,见 Task 1.8)

---

### Task 1.7:Build prod assets 验证 SW 生成

**Files:** 无修改,只跑命令

- [ ] **Step 1:跑 prod build**

```bash
PATH="$(mise where ruby)/bin:$PATH" RAILS_ENV=production bin/vite build 2>&1 | tail -20
```

期望末尾看到:
- `vite v6.x building for production...`
- `dist/sw.js` 之类的 SW 输出(具体 path 由 vite-plugin-ruby 的 `publicOutputDir` 决定)
- `PWA precache manifest entries: N` 之类的 vite-plugin-pwa 输出

- [ ] **Step 2:确认输出目录有 sw.js**

```bash
find public/vite -name "sw*.js" -o -name "workbox-*.js" 2>&1 | head -5
```

期望:看到 `sw.js` 和 `workbox-*.js`(Workbox runtime,vite-plugin-pwa 注入)。

如果 sw.js 没生成 → vite-plugin-pwa 配置有问题,**STOP 报告**,排查。

---

### Task 1.8:Phase 1 收尾 — vitest + lint + commit

- [ ] **Step 1:跑 vitest 确认无 regression**

```bash
npm test 2>&1 | tail -3
```

期望:`Tests 539 passed`。

- [ ] **Step 2:rubocop**

```bash
bin/rubocop -f github 2>&1 | tail -3
```

期望:0 offense(只动了 routes.rb,内容是标准 Rails route 语法)。

- [ ] **Step 3:Commit**

```bash
git add package.json package-lock.json \
        vite.config.ts \
        app/views/pwa/manifest.json.erb \
        config/routes.rb \
        app/views/layouts/application.html.erb \
        app/javascript/lib/pwa-register.js \
        app/javascript/entrypoints/inertia.jsx
git commit -m "$(cat <<'EOF'
feat(pwa): vite-plugin-pwa + manifest + SW 注册

Week 3 PWA Phase 1 — 最小骨架打通:
- 装 vite-plugin-pwa devDep
- vite.config.ts 加 VitePWA({registerType: 'autoUpdate', manifest: false,
  injectRegister: false, workbox: {skipWaiting, clientsClaim}})
- manifest.json.erb 内容:OneTour 品牌 + Mantine 蓝主题 + 中文描述
- config/routes.rb 加 PWA manifest 路由(rails/pwa#manifest)
- layout 取消 manifest link tag 注释,激活 PWA install
- 新增 app/javascript/lib/pwa-register.js,gracefully no-op 不支持 SW
  的环境;主 entrypoint inertia.jsx 调一次 import(SW per-origin 全局)
- workbox.runtimeCaching 留空,Phase 2 补分级缓存

verify: npm test 539 passed, prod build 生成 sw.js + workbox-*.js
manifest endpoint /manifest 返回正确 JSON

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 4:验证 commit**

```bash
git log --oneline -1
```

期望:看到 `feat(pwa): vite-plugin-pwa + manifest + SW 注册` 一行。

---

## Phase 2:Workbox 分级缓存 + 4 vitest

**Commit message:** `feat(pwa): Workbox 分级缓存 + pwa-register 4 vitest`

### Task 2.1:写 vitest mock SW 骨架

**Files:**
- Create: `app/javascript/lib/__tests__/pwa-register.test.js`

- [ ] **Step 1:写测试文件骨架**

```js
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
    vi.resetModules()  // 让 import 重新触发 setupPWA()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  // 4 个用例从这里开始
})
```

- [ ] **Step 2:跑测试验证骨架可加载**

```bash
npm test -- pwa-register
```

期望:`Test Files: 1 passed`,0 case(骨架可加载,无失败)。

---

### Task 2.2:Test #1 — registerSW 被调用,onRegisteredSW callback 接 swUrl

**Files:**
- Modify: `app/javascript/lib/__tests__/pwa-register.test.js`

- [ ] **Step 1:在 describe 内加测试**

```js
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
```

- [ ] **Step 2:跑测试看通过**

```bash
npm test -- pwa-register
```

期望:1 passed。(实现已在 Task 1.6 完成,Test 现在是验证而非驱动)

---

### Task 2.3:Test #2 — onRegisteredSW callback 在 dev mode 打印,prod 静默

**Files:**
- Modify: `app/javascript/lib/__tests__/pwa-register.test.js`

- [ ] **Step 1:加测试**

```js
it('onRegisteredSW logs only in DEV', async () => {
  vi.stubGlobal('navigator', { serviceWorker: { register: vi.fn() } })
  vi.stubGlobal('console', { log: vi.fn(), warn: vi.fn() })
  // import.meta.env.DEV 在 vitest 下默认 true,等价于 dev mode
  await import('../pwa-register')

  const opts = registerSWMock.mock.calls[0][0]
  opts.onRegisteredSW('http://localhost:9000/sw.js')

  expect(console.log).toHaveBeenCalledWith('[PWA] SW registered:', 'http://localhost:9000/sw.js')
})
```

- [ ] **Step 2:跑测试看通过**

```bash
npm test -- pwa-register
```

期望:2 passed。

---

### Task 2.4:Test #3 — onRegisterError warn 出来

**Files:**
- Modify: `app/javascript/lib/__tests__/pwa-register.test.js`

- [ ] **Step 1:加测试**

```js
it('onRegisterError warns to console (not throw)', async () => {
  vi.stubGlobal('navigator', { serviceWorker: { register: vi.fn() } })
  vi.stubGlobal('console', { log: vi.fn(), warn: vi.fn() })
  await import('../pwa-register')

  const opts = registerSWMock.mock.calls[0][0]
  const err = new Error('scope mismatch')
  expect(() => opts.onRegisterError(err)).not.toThrow()
  expect(console.warn).toHaveBeenCalledWith('[PWA] SW register failed:', err)
})
```

- [ ] **Step 2:跑测试看通过**

```bash
npm test -- pwa-register
```

期望:3 passed。

---

### Task 2.5:Test #4 — 不支持 SW 的环境 gracefully no-op

**Files:**
- Modify: `app/javascript/lib/__tests__/pwa-register.test.js`

- [ ] **Step 1:加测试**

```js
it('skips registration when serviceWorker not in navigator (老 iOS / 微信特殊环境)', async () => {
  vi.stubGlobal('navigator', {})  // 没有 serviceWorker key
  await import('../pwa-register')

  expect(registerSWMock).not.toHaveBeenCalled()
})
```

- [ ] **Step 2:跑测试看通过**

```bash
npm test -- pwa-register
```

期望:4 passed。

---

### Task 2.6:Phase 2 Workbox runtimeCaching 加全集

**Files:**
- Modify: `vite.config.ts`

- [ ] **Step 1:在 VitePWA 的 workbox 配置里加 runtimeCaching**

把现有的:

```ts
    VitePWA({
      registerType: 'autoUpdate',
      manifest: false,
      injectRegister: false,
      workbox: {
        skipWaiting: true,
        clientsClaim: true,
      },
      devOptions: {
        enabled: false,
      },
    }),
```

替换为:

```ts
    VitePWA({
      registerType: 'autoUpdate',
      manifest: false,
      injectRegister: false,
      workbox: {
        skipWaiting: true,
        clientsClaim: true,
        // 全局 navigation fallback 关掉(我们不缓存 root HTML — Inertia
        // version mismatch 会触发 full reload,缓存的老 HTML 会迷惑用户)
        navigateFallback: null,
        runtimeCaching: [
          // === NetworkOnly:auth / login / up ===
          {
            urlPattern: ({ url }) =>
              /^\/auth\//.test(url.pathname) ||
              /^\/login(_test)?$/.test(url.pathname) ||
              /^\/logout$/.test(url.pathname) ||
              /^\/profile\/sign_in_links\//.test(url.pathname) ||
              /^\/up$/.test(url.pathname),
            handler: 'NetworkOnly',
            method: 'GET',
          },
          // === CacheFirst:PWA 图标 ===
          {
            urlPattern: /^\/icon\.(svg|png)$/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'pwa-icons',
              expiration: { maxEntries: 5, maxAgeSeconds: 90 * 24 * 60 * 60 },
            },
          },
          // === CacheFirst:Active Storage blob redirect / variant ===
          // URL 里带 blob digest,变更即新 URL,适合长期 cache
          {
            urlPattern: /^\/rails\/active_storage\/(blobs\/redirect|representations)\//,
            handler: 'CacheFirst',
            options: {
              cacheName: 'active-storage-blobs',
              expiration: { maxEntries: 100, maxAgeSeconds: 30 * 24 * 60 * 60 },
            },
          },
          // === NetworkFirst:Inertia GETs(X-Inertia: true header)===
          // Inertia 路由覆盖整 app,X-Inertia header 是稳定 contract marker
          {
            urlPattern: ({ request }) =>
              request.method === 'GET' &&
              request.headers.get('X-Inertia') === 'true',
            handler: 'NetworkFirst',
            options: {
              cacheName: 'inertia-pages',
              expiration: { maxEntries: 50, maxAgeSeconds: 7 * 24 * 60 * 60 },
              networkTimeoutSeconds: 10,
            },
          },
        ],
      },
      devOptions: {
        enabled: false,
      },
    }),
```

- [ ] **Step 2:跑 prod build 验证 SW 生成无错**

```bash
PATH="$(mise where ruby)/bin:$PATH" RAILS_ENV=production bin/vite build 2>&1 | tail -10
```

期望:build 成功,看到 vite-plugin-pwa 的 precache 输出 + workbox-* runtime files。

如果报错(常见:`urlPattern` 函数序列化失败 / handler 名拼错),**STOP 报告**。

- [ ] **Step 3:跑 vitest 全集**

```bash
npm test 2>&1 | tail -3
```

期望:`Tests 543 passed`(539 baseline + 4 pwa-register 新)。

---

### Task 2.7:Phase 2 收尾 — commit

- [ ] **Step 1:lint + 测试 final check**

```bash
bin/rubocop -f github 2>&1 | tail -3
npm test 2>&1 | tail -3
```

- [ ] **Step 2:Commit**

```bash
git add vite.config.ts \
        app/javascript/lib/__tests__/pwa-register.test.js
git commit -m "$(cat <<'EOF'
feat(pwa): Workbox 分级缓存 + pwa-register 4 vitest

Week 3 PWA Phase 2 — 缓存策略落地 + 测试:

vite.config.ts workbox.runtimeCaching 加 4 类 routing(顺序匹配):
- NetworkOnly:/auth/* /login(_test)? /logout /profile/sign_in_links/*
  /up — auth 流不缓存
- CacheFirst:/icon.{svg,png} (5 entry, 90d) — PWA 图标
- CacheFirst:/rails/active_storage/{blobs/redirect,representations}/
  (100 entry, 30d) — blob digest 在 URL 里,长期 cache 安全
- NetworkFirst:Inertia GETs (X-Inertia: true header) (50 entry, 7d,
  network timeout 10s) — 离线时 fallback 上次访问页面

navigateFallback: null —— 不缓存 root HTML,避免 Inertia version
mismatch 时缓存的老 HTML 迷惑用户。

vitest 4 个用例:registerSW 调用契约 / onRegisteredSW dev 打印 /
onRegisterError warn / 不支持 SW 环境 gracefully no-op。

verify: npm test 543 passed,prod build sw.js 含 workbox runtime
caching 配置

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Phase 3:Playwright PWA 5 用例

**Commit message:** `test(e2e): Playwright PWA 5 用例(manifest / SW / 缓存 / offline)`

### Task 3.1:创建 pwa.spec.js + auth/seed 共享 import

**Files:**
- Create: `tests/e2e/pwa.spec.js`

- [ ] **Step 1:写文件骨架**

```js
// tests/e2e/pwa.spec.js
//
// PWA 集成 E2E:验证 manifest / SW 注册 / 三类缓存策略命中 / 离线 fallback。
//
// 注意:这些测试需要 prod build 才能完整跑(devOptions.enabled: false)。
// 本地手跑前先 `RAILS_ENV=production bin/vite build && bin/rails s -e production`,
// 或在 dev 9000 端口(SW 不会真注册,P2 会 skip,P3-P5 退化为 NetworkOnly 行为)。

import { test, expect } from '@playwright/test'
import { loginAsDeveloper } from './helpers/auth'

test.beforeEach(async ({ page }) => {
  await loginAsDeveloper(page)
})
```

- [ ] **Step 2:跑确认 file 加载**

```bash
npm run e2e -- pwa.spec --list
```

期望:文件列出 0 tests(只有 beforeEach)。

---

### Task 3.2:P1 — manifest 字段正确

**Files:**
- Modify: `tests/e2e/pwa.spec.js`

- [ ] **Step 1:加测试**

```js
test('P1: /manifest 返回 OneTour 配置 + standalone display + Mantine 蓝主题', async ({ page }) => {
  const res = await page.request.get('/manifest', { headers: { 'Accept': 'application/json' } })
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
```

- [ ] **Step 2:跑测试**

```bash
npm run e2e -- pwa.spec --grep "P1"
```

期望:1 passed。

---

### Task 3.3:P2 — SW 注册成功(prod build only,dev skip)

**Files:**
- Modify: `tests/e2e/pwa.spec.js`

- [ ] **Step 1:加测试**

```js
test('P2: SW registers with scope /', async ({ page }) => {
  // dev mode 下 vite-plugin-pwa devOptions.enabled: false → SW 不注册
  // 检测 prod 标志(部署后 sw.js 在根),dev 直接 skip
  const swExists = await page.request.get('/sw.js').then((r) => r.ok()).catch(() => false)
  test.skip(!swExists, 'SW only in prod build (devOptions.enabled: false)')

  await page.goto('/')
  // 等 SW activate(navigator.serviceWorker.ready 是 Promise<ServiceWorkerRegistration>)
  const result = await page.evaluate(async () => {
    const reg = await navigator.serviceWorker.ready
    return { scope: reg.scope, active: reg.active?.state ?? null }
  })
  expect(result.scope).toMatch(/\/$/)  // scope = http://host/
  expect(result.active).toBe('activated')
})
```

- [ ] **Step 2:跑测试**

```bash
npm run e2e -- pwa.spec --grep "P2"
```

期望:dev 下 1 skipped(test.skip 触发),prod 下 1 passed。

---

### Task 3.4:P3 — static asset CacheFirst 命中(图标)

**Files:**
- Modify: `tests/e2e/pwa.spec.js`

- [ ] **Step 1:加测试**

```js
test('P3: /icon.png CacheFirst — offline 仍可加载(prod only)', async ({ context, page }) => {
  const swExists = await page.request.get('/sw.js').then((r) => r.ok()).catch(() => false)
  test.skip(!swExists, 'SW only in prod build')

  // 在线访问一次 → SW 缓存进 pwa-icons cache
  await page.goto('/')
  const iconRes1 = await page.request.get('/icon.png')
  expect(iconRes1.ok()).toBe(true)

  // 等待 SW 完成 cache write(给点缓冲)
  await page.waitForTimeout(500)

  // 切到 offline,重新访问 — CacheFirst 应该直接给缓存
  await context.setOffline(true)
  const iconRes2 = await page.request.get('/icon.png')
  expect(iconRes2.ok()).toBe(true)
  expect(iconRes2.headers()['content-type']).toContain('image')

  await context.setOffline(false)
})
```

- [ ] **Step 2:跑测试**

```bash
npm run e2e -- pwa.spec --grep "P3"
```

期望:dev skipped,prod 1 passed。

---

### Task 3.5:P4 — Inertia GET NetworkFirst offline fallback

**Files:**
- Modify: `tests/e2e/pwa.spec.js`

- [ ] **Step 1:加测试**

```js
test('P4: Inertia GET NetworkFirst — offline 后能看到 cached(prod only)', async ({ context, page }) => {
  const swExists = await page.request.get('/sw.js').then((r) => r.ok()).catch(() => false)
  test.skip(!swExists, 'SW only in prod build')

  // 在线访问 /tours(本身就是 Inertia 路由)
  await page.goto('/tours')
  await page.waitForLoadState('networkidle')

  // 切 offline 后通过 SPA 内导航(强制走 Inertia XHR + X-Inertia: true header)
  await context.setOffline(true)
  // 用 page.reload() 触发 Inertia 重新加载;NetworkFirst 命中 cache
  await page.reload({ waitUntil: 'domcontentloaded' })

  // 不应该看到 Inertia 的 "request failed" modal — 看到 cached 内容
  // 用一个稳定的 anchor:登录后的 /tours 列表 / 候选池区域
  await expect(page.locator('text=/全部旅程|候选池|我的旅程/').first()).toBeVisible({ timeout: 10_000 })

  await context.setOffline(false)
})
```

- [ ] **Step 2:跑测试**

```bash
npm run e2e -- pwa.spec --grep "P4"
```

期望:dev skipped,prod 1 passed。

> **执行者注**:实际 prod 跑时 `text=/.../` 的 anchor 可能要根据真实 UI 调整;先用 `page.locator('body').waitFor()` 兜底,再细化。

---

### Task 3.6:P5 — NetworkOnly /login 离线 fail

**Files:**
- Modify: `tests/e2e/pwa.spec.js`

- [ ] **Step 1:加测试**

```js
test('P5: NetworkOnly /login — offline 直接失败,不命中 stale cache(prod only)', async ({ context, page }) => {
  const swExists = await page.request.get('/sw.js').then((r) => r.ok()).catch(() => false)
  test.skip(!swExists, 'SW only in prod build')

  // 先在线访问一次 /login(让 SW 看到这个请求,确认 NetworkOnly 不缓存)
  await page.goto('/login')
  await page.waitForLoadState('networkidle')

  // 切 offline 直接 request /login
  await context.setOffline(true)
  const res = await page.request.get('/login').catch((e) => ({ ok: () => false, error: e }))
  expect(res.ok()).toBe(false)  // NetworkOnly 离线时直接失败,不返回 stale cache

  await context.setOffline(false)
})
```

- [ ] **Step 2:跑测试**

```bash
npm run e2e -- pwa.spec --grep "P5"
```

期望:dev skipped,prod 1 passed。

---

### Task 3.7:Phase 3 收尾 — 全跑 + commit

- [ ] **Step 1:跑全部 e2e**

```bash
npm run e2e 2>&1 | tail -10
```

期望:dev mode 下 `7 passed / 11 skipped / 5 PWA skipped (prod only)` —— P1 真过(不依赖 SW),P2-P5 dev 下 skip。**总计 8 真过 + 16 skipped**。

- [ ] **Step 2:Commit**

```bash
git add tests/e2e/pwa.spec.js
git commit -m "$(cat <<'EOF'
test(e2e): Playwright PWA 5 用例(manifest / SW / 缓存 / offline)

Week 3 PWA Phase 3 — E2E 验证:

P1 /manifest 返回 OneTour 配置 + standalone display + Mantine 蓝主题
   (dev + prod 都跑,因为是纯 HTTP fetch 不依赖 SW)
P2 SW 注册到 / scope,active 状态(prod only,dev skip)
P3 /icon.png CacheFirst,offline 仍能加载(prod only)
P4 Inertia GET NetworkFirst,offline 后 reload 看到 cached(prod only)
P5 NetworkOnly /login,offline 直接 fail 不命中 stale cache(prod only)

devOptions.enabled: false 让 dev 不注册 SW,P2-P5 skip 优雅退化。
真验证靠 prod build:RAILS_ENV=production bin/vite build && bin/rails s

verify: npm run e2e dev 模式 8 passed / 16 skipped(原 7+11 + PWA 1+4)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Phase 4:架构文档 v1.5

**Commit message:** `docs: 架构方案 v1.5 反映 Week 3 PWA 落地`

### Task 4.1:更新 architecture.md

**Files:**
- Modify: `docs/xinjiang-trip-architecture.md`

- [ ] **Step 1:Week 3 任务列表全打 ✅**

定位 `### Week 3(5/9 – 5/15)— PWA 基础` 段落(line 145+),把:

```markdown
- [ ] Vite 接入 `vite-plugin-pwa`(基于 Workbox)
- [ ] manifest.json + icons + "添加到主屏幕"配置
- [ ] **分级缓存策略**(避免登录用户私有数据被 CacheFirst 缓存):
  - `CacheFirst`:仅指纹化静态资源(`/assets/*-[hash].js|css`,字体,图标)
  - `NetworkFirst`:HTML 导航 + 业务 JSON GET(`/guidebooks/*` 等),离线时返回缓存,在线优先取新
  - 排除:登录态接口(`/me`,`/login` 等)和敏感数据,可在 SW 路由里按路径黑名单跳过缓存
- [ ] iOS Safari + Android Chrome 真机测试 PWA 安装
- [ ] 飞行模式下能打开 App 看上次内容
```

替换为:

```markdown
- [x] Vite 接入 `vite-plugin-pwa`(基于 Workbox 7.x),autoUpdate + skipWaiting + clientsClaim 静默升级
- [x] Rails 8 自带 manifest endpoint /manifest 启用,内容改 OneTour + Mantine 蓝主题 + 中文描述
- [x] **分级缓存策略**:
  - `NetworkOnly`:auth / login / logout / sign_in_links / up
  - `CacheFirst`:/icon.{svg,png}(5 entry, 90d)+ /rails/active_storage/{blobs,representations}/(100 entry, 30d)+ Vite precache 自动 hashed assets
  - `NetworkFirst`:Inertia GETs(X-Inertia: true header,50 entry, 7d, 10s timeout)
  - 不缓存 root HTML(navigateFallback: null),避免 Inertia version mismatch 时迷惑用户
- [x] Vitest 4 用例(pwa-register)+ Playwright 5 用例(manifest / SW / CacheFirst / NetworkFirst offline / NetworkOnly fail)
- [ ] iOS Safari + Android Chrome 真机测试 PWA 安装(deploy 后做)
- [ ] 飞行模式下能打开 App 看上次内容(真机测试一并完成)

**实施细节**:[docs/superpowers/specs/2026-04-28-week3-pwa-foundation-design.md](docs/superpowers/specs/2026-04-28-week3-pwa-foundation-design.md)

**交付物**:5 人手机能装上 PWA,断网能读上次访问的页面 — 代码已落地,真机验证 deploy 后做。
```

- [ ] **Step 2:风险登记新增**

定位 `## 风险登记` 段落,在 `xhrRequest` 风险一行之后追加:

```markdown
| `vite-plugin-pwa` 是新引入,Vite Ruby 多 entrypoint 下 SW 注入可能踩冷僻坑 | 中 | 中 | Phase 1 最小骨架先打通(只跑 SW 注册,无 routing);Phase 2-3 渐进加策略 + Lighthouse + Playwright + 真机三道防御 |
```

- [ ] **Step 3:底部版本块升 v1.5**

定位文件末尾 `**版本**:v1.4(2026-04-28 · Vultr 销毁 + 视频上传 cut + DNS Auto)` 段,改为:

```markdown
**版本**:v1.5(2026-04-28 · Week 3 PWA 基础落地)
**作者**:架构评审收敛后产物
**状态**:已批准实施 · Week 1-2 完成 · Week 3 主体完成(代码已 commit,待 deploy + 真机验证)· 切换收尾 100%

**v1.5 变更**:
- Week 3 任务表 5 项打 ✅(2 项真机测试 deploy 后做)
- 风险登记新增:vite-plugin-pwa 新引入风险 + 三道防御(Phase 渐进 + Lighthouse + Playwright + 真机)
- 实施细节链到 docs/superpowers/specs/2026-04-28-week3-pwa-foundation-design.md

**v1.4 变更**(2026-04-28):
- 切换收尾完成:Vultr NJ 销毁 ✓ Cloudflare DNS TTL Auto ✓ Sentry 二检无新增 error ✓
- 视频上传(50-500 MB)cut:proxy mode 性价比低,出行用相机/微信传更顺手
- 不在范围内新增条目记录决策原因
```

(其他 v1.x 历史变更说明保持原样)

---

### Task 4.2:Phase 4 commit

- [ ] **Step 1:diff 验证只动了那 3 处**

```bash
git diff --stat docs/xinjiang-trip-architecture.md
```

期望:1 file changed,~30 lines insertions,~10 deletions。

- [ ] **Step 2:Commit**

```bash
git add docs/xinjiang-trip-architecture.md
git commit -m "$(cat <<'EOF'
docs: 架构方案 v1.5 反映 Week 3 PWA 落地

Week 3 PWA 基础全部代码 commit 后入档:

- Week 3 任务列表 5 项打 ✅:vite-plugin-pwa 接入 / manifest 启用 /
  分级缓存(NetworkOnly + CacheFirst + NetworkFirst)/ Vitest + Playwright
  共 9 用例 / 真机测试 deploy 后做
- 缓存策略表格化:routing 顺序、cache name、maxEntries、maxAge 全列清楚
- 风险登记新增:vite-plugin-pwa 新引入风险 + 三道防御
- 顶部版本 1.4 → 1.5,加 v1.5 变更说明

链到 docs/superpowers/specs/2026-04-28-week3-pwa-foundation-design.md
作为实施细节单一信息源。

不动:7 周路线图 / 降级预案 / Pre-flight / Week 4-7 任务表。

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 3:看 final git log**

```bash
git log --oneline -5
```

期望:看到 4 个 PWA 相关 commit + 1 个 brand rename(Phase 0 在 brainstorming 期间已 commit)。

---

## Self-Review

**Spec coverage:** 对照 [spec § 1-7](docs/superpowers/specs/2026-04-28-week3-pwa-foundation-design.md):

| Spec 段 | Plan 覆盖 |
|---|---|
| § 架构总览 + 单一信息源 | Phase 1 Tasks 1.1-1.6(install + config + manifest + register) |
| § 缓存路由矩阵(NetworkOnly + CacheFirst + NetworkFirst) | Phase 2 Task 2.6 完整 runtimeCaching |
| § SW 更新生命周期(autoUpdate + skipWaiting + clientsClaim) | Phase 1 Task 1.2(vite.config workbox 配置) |
| § Manifest 配置 | Phase 1 Tasks 1.3-1.5(content + route + layout link) |
| § Vitest 4 用例 | Phase 2 Tasks 2.1-2.5 |
| § Playwright 5 用例 | Phase 3 Tasks 3.1-3.6 |
| § Lighthouse | 不进 plan(spec 标 "manual after deploy",不是 commit-able) |
| § 真机手动测试 | 不进 plan(deploy 后做) |
| § 构建顺序(4 commit) | Phase 1-4 一一对应 |
| § 文档 v1.5 | Phase 4 |
| § 范围边界 / 不做 | Plan 中所有"不做"段对齐 |

✅ 全部覆盖。

**Placeholder 扫描**:

- 唯一 inline note:Task 3.5 P4 的 `text=/全部旅程|候选池|我的旅程/` anchor + "执行者注:实际 prod 跑时可能要根据真实 UI 调整" —— 这是有意保留的 hint,因为离线 fallback 后看到的具体 DOM 文本由 cache 命中的具体页面决定,不能 plan 阶段 100% 钉死。**不算 placeholder failure**(给执行者明确路径 + 兜底建议)。
- 其他无 TBD / "fill in details" 红旗。

**Type consistency**:

- `setupPWA()` 在 Task 1.6 创建,Task 2.1-2.5 import 和断言都对齐
- `registerSW` mock 命名(`registerSWMock`)4 个 vitest 用例一致
- `urlPattern` / `handler` 用 Workbox 标准命名(`NetworkOnly` / `CacheFirst` / `NetworkFirst`),Phase 2 Task 2.6 内部 + commit message + spec 全一致
- Cache name(`pwa-icons` / `active-storage-blobs` / `inertia-pages`)Phase 2 Task 2.6 + spec 一致

✅ 通过。

---

**Plan 完成。保存于** [docs/superpowers/plans/2026-04-28-week3-pwa-foundation.md](docs/superpowers/plans/2026-04-28-week3-pwa-foundation.md)。
