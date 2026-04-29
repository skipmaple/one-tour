// Playwright setup project —— staging E2E 跑前登入一次,session cookie 存到
// tests/e2e/.auth/staging-user.json,所有真测试共享 storageState 复用 cookie。
// 这样 /login_test 整个 suite 只调 1 次,不会撞 PR #60 加的 5/min/IP rate limit。

import { test as setup, expect } from '@playwright/test'
import { existsSync, mkdirSync } from 'fs'
import { dirname } from 'path'

const STAGING_LOGIN_SECRET = process.env.STAGING_LOGIN_SECRET
const STAGING_TEST_USER_ID = process.env.STAGING_TEST_USER_ID
const AUTH_FILE = 'tests/e2e/.auth/staging-user.json'

setup('login via /login_test, save storageState', async ({ page }) => {
  if (!STAGING_LOGIN_SECRET || !STAGING_TEST_USER_ID) {
    setup.skip(
      true,
      'Need STAGING_LOGIN_SECRET + STAGING_TEST_USER_ID env (see scripts/pwa-e2e-staging.sh)',
    )
  }

  if (!existsSync(dirname(AUTH_FILE))) {
    mkdirSync(dirname(AUTH_FILE), { recursive: true })
  }

  // 直接 POST /login_test 拿 session cookie。比 page.goto + form fill 快,
  // 也不依赖 Login.jsx UI(可被改)
  const res = await page.request.post('/login_test', {
    headers: { 'X-Staging-Login-Secret': STAGING_LOGIN_SECRET },
    form: { user_id: STAGING_TEST_USER_ID },
  })
  if (!res.ok()) {
    const body = await res.text()
    throw new Error(
      `login_test failed during setup: status=${res.status()} body=${body.slice(0, 200)}`,
    )
  }

  // 保存浏览器 context 状态(含 _one_tour_session cookie),后续真测试 reuse
  await page.context().storageState({ path: AUTH_FILE })
})
