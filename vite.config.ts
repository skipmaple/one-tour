import inertia from '@inertiajs/vite'
import react from '@vitejs/plugin-react'
import { sentryVitePlugin } from '@sentry/vite-plugin'
import { defineConfig } from 'vite'
import RubyPlugin from 'vite-plugin-ruby'
import { VitePWA } from 'vite-plugin-pwa'

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
              // 401/403/404 不缓存(用户没权限或 blob 删除时不该兜错给离线用户)
              cacheableResponse: { statuses: [ 200 ] },
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
