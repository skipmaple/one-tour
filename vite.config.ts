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
