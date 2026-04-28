// @ts-check
import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 30_000,
  expect: { timeout: 10_000 },
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:9000',
    actionTimeout: 10_000,
    trace: 'on-first-retry',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
  webServer: {
    // bin/dev 默认 PORT=3000(原生 Rails 习惯),本仓库主 worktree 跑 9000;
    // reuseExistingServer 在已跑场景下复用,但 fresh checkout / CI 必须显式
    // 覆盖端口,否则 Playwright 启服后 wait 9000 会 timeout。
    command: 'PORT=9000 bin/dev',
    port: 9000,
    reuseExistingServer: true,
    timeout: 60_000,
  },
})
