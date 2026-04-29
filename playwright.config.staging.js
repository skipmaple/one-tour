// @ts-check
// Playwright config for staging.tour.skipmaple.com PWA E2E。
//
// 跟 playwright.config.js 的关键区别:
// - 不启 webServer(staging 是远程 prod-build,不本地启)
// - baseURL 走 STAGING_URL env(默认 https://staging.tour.skipmaple.com)
// - 多 device profile:Pixel 5(Android Chrome 模拟)+ iPhone 15(WebKit 模拟)
//   覆盖 PWA 在两端的 SW + cache + offline 行为
// - SW + cache + offline assertion 在两个 profile 下都跑(并行)
//
// 用:`npx playwright test --config playwright.config.staging.js`

import { defineConfig, devices } from '@playwright/test'

const STAGING_URL = process.env.STAGING_URL || 'https://staging.tour.skipmaple.com'

export default defineConfig({
  testDir: './tests/e2e',
  testMatch: /pwa-staging\.spec\.js/,
  timeout: 60_000,
  expect: { timeout: 15_000 },
  reporter: [['list']],
  use: {
    baseURL: STAGING_URL,
    actionTimeout: 15_000,
    trace: 'on-first-retry',
    // 移动 PWA 一般在 HTTPS prod 部署上跑,trust 自签证书无需(Let's Encrypt)
    ignoreHTTPSErrors: false,
  },
  projects: [
    {
      name: 'mobile-chrome-pixel5',
      use: { ...devices['Pixel 5'] },
    },
    {
      name: 'mobile-safari-iphone15',
      use: { ...devices['iPhone 15'] },
    },
  ],
  // 不启 webServer —— staging 是远程,Playwright 直接访问。
})
