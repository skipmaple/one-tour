import inertia from '@inertiajs/vite'
import react from '@vitejs/plugin-react'
import { sentryVitePlugin } from '@sentry/vite-plugin'
import { defineConfig } from 'vite'
import RubyPlugin from 'vite-plugin-ruby'
import { VitePWA } from 'vite-plugin-pwa'

// NOTE: No top-level SW helpers here intentionally.
// Workbox generateSW serializes only the direct arrow-function body of each
// runtimeCaching handler / urlPattern — named references to outer-scope
// functions are NOT included in the generated sw.js and cause ReferenceError
// at SW runtime. All outbox logic must be inlined into each entry below.

export default defineConfig({
  build: {
    sourcemap: true,
  },
  // Prevent duplicate copies of React / Mantine when a new dep (e.g.
  // @mantine/charts) triggers Vite to re-bundle and produces a second
  // Mantine bundle — symptom: "MantineProvider was not found" +
  // "Invalid hook call" from charts at runtime.
  resolve: {
    dedupe: ['react', 'react-dom', '@mantine/core', '@mantine/hooks'],
  },
  optimizeDeps: {
    include: [
      '@mantine/core',
      '@mantine/hooks',
      '@mantine/charts',
      '@mantine/dates',
      '@mantine/notifications',
      '@mantine/modals',
      'recharts',
    ],
  },
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
      // registerType 不显式设置 — injectRegister: false 后,我们手动从
      // pwa-register.js 调 navigator.serviceWorker.register('/sw.js'),
      // VitePWA 的 register 流程整个没参与,registerType 设了反而误导。
      // 自动更新走 sw.js 内 skipWaiting + clientsClaim,加上 pwa-register
      // 用 updateViaCache: 'none' 让浏览器 SW 检查不被 HTTP cache 拖。
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
          // method 默认就是 'GET',Workbox 不为非 GET 自动注册 route,所以
          // POST/PATCH/DELETE 已经天然不缓存,无需显式 method 字段
          {
            urlPattern: ({ url }) =>
              /^\/auth\//.test(url.pathname) ||
              /^\/login(_test)?$/.test(url.pathname) ||
              /^\/logout$/.test(url.pathname) ||
              /^\/up$/.test(url.pathname),
            handler: 'NetworkOnly',
          },
          // === CacheFirst:PWA 图标 ===
          // RegExp urlPattern 在 Workbox 里是 test `request.url` 整个,不是
          // pathname。`^/icon...$` 永远不命中(URL 首字符是 `h`)。函数式
          // 显式拿 url.pathname 才对。
          {
            urlPattern: ({ url }) => /^\/icon\.(svg|png)$/.test(url.pathname),
            handler: 'CacheFirst',
            options: {
              cacheName: 'pwa-icons',
              expiration: { maxEntries: 5, maxAgeSeconds: 90 * 24 * 60 * 60 },
              // 只缓存 200。Workbox 默认所有响应都缓存(包括 4xx/5xx),
              // 错误响应被缓存会一直返错给离线用户,加 statuses filter 防御。
              cacheableResponse: { statuses: [ 200 ] },
            },
          },
          // === CacheFirst:Active Storage blob proxy / redirect / variant ===
          // URL 里带 blob digest,变更即新 URL,适合长期 cache。
          // production.rb 配 resolve_model_to_route = :rails_storage_proxy,
          // 真实 URL 是 /rails/active_storage/blobs/proxy/...(不是 redirect),
          // representations 同理。两路径都覆盖以防 storage backend 切回 redirect。
          {
            urlPattern: ({ url }) =>
              /^\/rails\/active_storage\/(blobs|representations)\/(proxy|redirect)\//.test(url.pathname),
            handler: 'CacheFirst',
            options: {
              cacheName: 'active-storage-blobs',
              expiration: { maxEntries: 100, maxAgeSeconds: 30 * 24 * 60 * 60 },
              // 0 是 opaque(no-cors cross-origin),200 是 same-origin success。
              // 当前 prod 走 proxy 模式 → 同源 200;但 routes 同时匹配 redirect
              // (storage backend 切回 redirect 时的兼容),那个路径跟随到跨域 OSS
              // 会拿 opaque,只 [200] 会让 redirect 路径永远不进 cache。两个 status
              // 都允许,401/403/404 仍被排除(用户无权限/blob 删除不兜错)。
              cacheableResponse: { statuses: [ 0, 200 ] },
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
              // 关键:不缓存 409。deploy 期 Inertia version mismatch 服务返
              // 409,如果被缓存,后续离线访问拿到的是错误页而不是 stale
              // 内容,"离线读"目标失效。架构师 review SC-3 列的 Week 4 前必修。
              cacheableResponse: { statuses: [ 200 ] },
            },
          },
          // === Outbox:4 个 JSON mutation 失败入 IDB 队列 ===
          // 整个 handler body 必须 inline — Workbox generateSW 只 serialize
          // 直接 inline 的 arrow function body,不跟 named reference。
          // urlPattern 同理。Workbox 每条 runtimeCaching 只支持单 method,
          // 所以 POST + PATCH 各注册一份(handler body 完整复制,无 DRY 捷径)。
          // schema 必须与 app/javascript/lib/outbox/queue.js 同步:
          //   DB 'one-tour-outbox' v1, store 'mutations'
          //   indexes: 'enqueued_at', 'status'
          {
            urlPattern: ({ url }) => {
              const p = url.pathname
              return /^\/tours\/\d+\/expenses$/.test(p) ||
                     /^\/expenses\/\d+$/.test(p) ||
                     /^\/activities\/\d+$/.test(p) ||
                     /^\/tours\/\d+\/settlements$/.test(p) ||
                     /^\/tours\/\d+\/days\/\d+$/.test(p)
            },
            method: 'POST',
            handler: async ({ request }) => {
              try {
                const res = await fetch(request.clone())
                if (res.status >= 500) throw new Error(`5xx queue ${res.status}`)
                return res
              } catch {
                // === Inline IDB enqueue — 不能 import lib,Workbox 不跟 reference ===
                const body = await request.clone().text()
                let parsedBody
                try { parsedBody = JSON.parse(body) } catch { parsedBody = body }

                const headers = {}
                request.headers.forEach((v, k) => {
                  if (k.toLowerCase() === 'cookie' || k.toLowerCase() === 'authorization') return
                  headers[k] = v
                })

                const url = new URL(request.url)
                let kind = 'unknown'
                if (/\/expenses(\/\d+)?$/.test(url.pathname)) kind = 'expense'
                else if (/\/activities\/\d+$/.test(url.pathname)) kind = 'activity_edit'
                else if (/\/settlements$/.test(url.pathname)) kind = 'settlement'
                else if (/\/days\/\d+$/.test(url.pathname)) kind = 'note'

                const id = await new Promise((resolve, reject) => {
                  const req = indexedDB.open('one-tour-outbox', 1)
                  req.onupgradeneeded = (e) => {
                    const db = e.target.result
                    const store = db.createObjectStore('mutations', { keyPath: 'id', autoIncrement: true })
                    store.createIndex('enqueued_at', 'enqueued_at')
                    store.createIndex('status', 'status')
                  }
                  req.onsuccess = () => {
                    const db = req.result
                    const tx = db.transaction('mutations', 'readwrite')
                    const store = tx.objectStore('mutations')
                    const addReq = store.add({
                      path: url.pathname,
                      method: request.method,
                      body: parsedBody,
                      headers,
                      enqueued_at: Date.now(),
                      attempts: 0,
                      last_error: '',
                      status: 'pending',
                      resource_kind: kind,
                      display_label: '',
                    })
                    let newId
                    addReq.onsuccess = () => { newId = addReq.result }
                    addReq.onerror = () => reject(addReq.error)
                    tx.oncomplete = () => resolve(newId)
                    tx.onerror = () => reject(tx.error)
                    tx.onabort = () => reject(tx.error || new DOMException('Transaction aborted', 'AbortError'))
                  }
                  req.onerror = () => reject(req.error)
                })

                return new Response(
                  JSON.stringify({ queued: true, id }),
                  { status: 202, headers: { 'Content-Type': 'application/json' } }
                )
              }
            },
          },
          {
            urlPattern: ({ url }) => {
              const p = url.pathname
              return /^\/tours\/\d+\/expenses$/.test(p) ||
                     /^\/expenses\/\d+$/.test(p) ||
                     /^\/activities\/\d+$/.test(p) ||
                     /^\/tours\/\d+\/settlements$/.test(p) ||
                     /^\/tours\/\d+\/days\/\d+$/.test(p)
            },
            method: 'PATCH',
            handler: async ({ request }) => {
              try {
                const res = await fetch(request.clone())
                if (res.status >= 500) throw new Error(`5xx queue ${res.status}`)
                return res
              } catch {
                // === Inline IDB enqueue — 不能 import lib,Workbox 不跟 reference ===
                const body = await request.clone().text()
                let parsedBody
                try { parsedBody = JSON.parse(body) } catch { parsedBody = body }

                const headers = {}
                request.headers.forEach((v, k) => {
                  if (k.toLowerCase() === 'cookie' || k.toLowerCase() === 'authorization') return
                  headers[k] = v
                })

                const url = new URL(request.url)
                let kind = 'unknown'
                if (/\/expenses(\/\d+)?$/.test(url.pathname)) kind = 'expense'
                else if (/\/activities\/\d+$/.test(url.pathname)) kind = 'activity_edit'
                else if (/\/settlements$/.test(url.pathname)) kind = 'settlement'
                else if (/\/days\/\d+$/.test(url.pathname)) kind = 'note'

                const id = await new Promise((resolve, reject) => {
                  const req = indexedDB.open('one-tour-outbox', 1)
                  req.onupgradeneeded = (e) => {
                    const db = e.target.result
                    const store = db.createObjectStore('mutations', { keyPath: 'id', autoIncrement: true })
                    store.createIndex('enqueued_at', 'enqueued_at')
                    store.createIndex('status', 'status')
                  }
                  req.onsuccess = () => {
                    const db = req.result
                    const tx = db.transaction('mutations', 'readwrite')
                    const store = tx.objectStore('mutations')
                    const addReq = store.add({
                      path: url.pathname,
                      method: request.method,
                      body: parsedBody,
                      headers,
                      enqueued_at: Date.now(),
                      attempts: 0,
                      last_error: '',
                      status: 'pending',
                      resource_kind: kind,
                      display_label: '',
                    })
                    let newId
                    addReq.onsuccess = () => { newId = addReq.result }
                    addReq.onerror = () => reject(addReq.error)
                    tx.oncomplete = () => resolve(newId)
                    tx.onerror = () => reject(tx.error)
                    tx.onabort = () => reject(tx.error || new DOMException('Transaction aborted', 'AbortError'))
                  }
                  req.onerror = () => reject(req.error)
                })

                return new Response(
                  JSON.stringify({ queued: true, id }),
                  { status: 202, headers: { 'Content-Type': 'application/json' } }
                )
              }
            },
          },
        ],
      },
      // dev 不测 SW 行为,prod build 验证;开启可能与 Vite-Ruby HMR 路径相互拦截
      devOptions: {
        enabled: false,
      },
    }),
  ],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./test/setup.js'],
  },
})
