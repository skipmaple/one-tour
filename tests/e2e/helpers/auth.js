// tests/e2e/helpers/auth.js
//
// Developer Login(OmniAuth developer strategy)走 GET /auth/developer 返回的
// 内置表单。dev_login_enabled 必须为 true(dev 环境默认开)。

export async function loginAsDeveloper(page, { name = 'E2E', email = 'e2e@test.local' } = {}) {
  await page.goto('/auth/developer')
  await page.locator('input[name="name"]').fill(name)
  await page.locator('input[name="email"]').fill(email)
  await page.locator('button[type="submit"], input[type="submit"]').click()
  await page.waitForURL((url) => !url.pathname.startsWith('/auth/'))
}
