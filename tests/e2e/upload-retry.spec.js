// E2E: 上传 retry / progress / cancel 6 用例。
//
// 用 page.route 拦截真实请求模拟失败响应。

import { test, expect } from '@playwright/test'
import { loginAsDeveloper } from './helpers/auth'
import { seedTour } from './helpers/seed'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const FIX = path.resolve(__dirname, 'fixtures')

test.beforeEach(async ({ page }) => {
  await loginAsDeveloper(page)
})

test('R1: ActivityGallery 5MB,503 一次后 200,重试成功', async ({ page }) => {
  let attempt = 0
  await page.route(/\/activities\/\d+\/images$/, async (route) => {
    if (route.request().method() !== 'POST') return route.continue()
    attempt++
    if (attempt === 1) {
      return route.fulfill({ status: 503, body: '' })
    }
    return route.continue()
  })

  const { openActivityEditor } = await seedTour(page)
  const { uploadButton } = await openActivityEditor()

  const fileChooserPromise = page.waitForEvent('filechooser')
  await uploadButton.click()
  const fileChooser = await fileChooserPromise
  await fileChooser.setFiles(path.join(FIX, '5mb.jpg'))

  // 等 router.reload — 上传成功后会触发 partial reload activity_images
  // 我们简化:等 attempt >= 2 且 progress 不再显示
  await expect.poll(() => attempt, { timeout: 25_000 }).toBeGreaterThanOrEqual(2)
  // 等 batchProgress 隐藏(uploading false → 进度组件消失)
  await page.waitForTimeout(2_000)
  expect(attempt).toBe(2)
})

test('R2: ActivityGallery 持续 503,3 次后失败 toast', async ({ page }) => {
  let attempt = 0
  await page.route(/\/activities\/\d+\/images$/, async (route) => {
    if (route.request().method() !== 'POST') return route.continue()
    attempt++
    return route.fulfill({ status: 503, body: '' })
  })

  const { openActivityEditor } = await seedTour(page)
  const { uploadButton } = await openActivityEditor()

  const fileChooserPromise = page.waitForEvent('filechooser')
  await uploadButton.click()
  const fileChooser = await fileChooserPromise
  await fileChooser.setFiles(path.join(FIX, '5mb.jpg'))

  // 等失败 toast — useGalleryUploader 在 catch 里 notifications.show({ message: err.message || '上传失败' })
  // 默认 server 503 message;xhrRequest helper 抛 message 含 "503" 或 "失败"
  await expect(page.getByText(/失败|503|Service Unavailable/i).first())
    .toBeVisible({ timeout: 25_000 })

  // xhrRequest retry 总数 = 3(1 初次 + 2 retry)
  await page.waitForTimeout(2_000)
  expect(attempt).toBe(3)
})

test.skip('R3: ActivityGallery batch 上传中 navigation,后续请求不发出', async () => {
  // TODO: 需 setFiles 多文件 + 在第 1 张响应延迟 1s 期间 page.goto('/tours')。
  // useGalleryUploader unmountedRef 守卫 finally;abortRef.current.abort() 应取消后续。
  // selector 链已就绪,但 multi-file fixture 时序难精准 — 留待补完。
})

test.skip('R4: AddExpense edit 2 张 receipts,1 张 503-then-200,Progress 单调', async () => {
  // TODO: AddExpenseDialog 入口待 Preview 探索(case 5-8 同样 TODO)
})

test.skip('R5: AddExpense create+pending,Phase 1 503-then-200,Phase 2 正常', async () => {
  // TODO: AddExpenseDialog 入口待 Preview 探索
})

test('R6: ActivityGallery 422 immediate fail', async ({ page }) => {
  let attempt = 0
  await page.route(/\/activities\/\d+\/images$/, async (route) => {
    if (route.request().method() !== 'POST') return route.continue()
    attempt++
    return route.fulfill({
      status: 422,
      body: JSON.stringify({ errors: [ '文件类型不支持' ] }),
      headers: { 'Content-Type': 'application/json' },
    })
  })

  const { openActivityEditor } = await seedTour(page)
  const { uploadButton } = await openActivityEditor()

  const fileChooserPromise = page.waitForEvent('filechooser')
  await uploadButton.click()
  const fileChooser = await fileChooserPromise
  await fileChooser.setFiles(path.join(FIX, '5mb.jpg'))

  await expect(page.getByText('文件类型不支持')).toBeVisible({ timeout: 25_000 })

  // 422 不重试 → 只发 1 次
  await page.waitForTimeout(2_000)
  expect(attempt).toBe(1)
})
