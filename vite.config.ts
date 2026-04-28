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
