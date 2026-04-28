// E2E: 客户端压缩 12 用例。
//
// 重点 selector / 流程已通过 Preview 实测确认(Activity Image 入口)。
// Expense / Avatar 入口暂未深挖 selector,先 test.skip 标 TODO,后续补完。

import { test, expect } from '@playwright/test'
import { loginAsDeveloper } from './helpers/auth'
import { seedTour } from './helpers/seed'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const FIX = path.resolve(__dirname, 'fixtures')

// chromium 对 multipart/form-data 上传:
//  - waitForRequest + req.postDataBuffer() / sizes() 都拿不到 body size(streamed)
//  - page.route handler 内,如果 continue() 让浏览器实际发出,buffer 也只有 boundary header
//  - 但如果 fulfill(),浏览器先把 entire body staged,buffer 就完整可拿
//
// 所以 happy-path case 在 E2E 拿压缩后字节大小:fulfill 200 自己模拟服务端响应,
// 拿 buffer.length。语义上仍验证了"压缩生效":真正发出去的字节就是这么多。
//
// 接受可选 fulfillResponse 让 happy/error path 共用同一拦截器。
function captureUploadSize(page, urlPattern, { fulfillResponse } = {}) {
  return new Promise((resolve, reject) => {
    let resolved = false
    page.route(urlPattern, async (route) => {
      if (route.request().method() !== 'POST') return route.continue()
      const buf = route.request().postDataBuffer()
      if (!resolved) {
        resolved = true
        resolve({ len: buf?.length ?? 0, body: buf })
      }
      // fulfillResponse:{ status, body, headers } — staged 模式让 buffer 完整可拿。
      // 不提供则 continue(retry / abort 用例自己控制 route)。
      if (fulfillResponse) {
        return route.fulfill({
          status: fulfillResponse.status ?? 200,
          contentType: fulfillResponse.contentType ?? 'application/json',
          body: fulfillResponse.body ?? '{}',
        })
      }
      return route.continue()
    }).catch(reject)
  })
}

import { ACTIVITY_IMAGE_OK } from './helpers/responses'

test.beforeEach(async ({ page }) => {
  await loginAsDeveloper(page)
})

test.describe('Activity Image compression', () => {
  test('case 1: 5MB JPEG → 压缩 ≤1.5MB WebP 上传成功', async ({ page }) => {
    const { tourId, openActivityEditor } = await seedTour(page)
    expect(tourId).toMatch(/^\d+$/)

    const { uploadButton } = await openActivityEditor()

    // fulfill 200 → 让 chromium staging buffer,handler 内可拿压缩后真实字节大小
    const captured = captureUploadSize(
      page,
      /\/activities\/\d+\/images$/,
      { fulfillResponse: ACTIVITY_IMAGE_OK },
    )

    const fileChooserPromise = page.waitForEvent('filechooser')
    await uploadButton.click()
    const fileChooser = await fileChooserPromise
    await fileChooser.setFiles(path.join(FIX, '5mb.jpg'))

    const { len, body } = await captured
    // 5MB JPEG 压缩 maxSizeMB=1.5 → multipart body 应远小于 2MB
    // multipart 包装额外几 KB,1.6 MB 是宽容上限
    expect(len).toBeLessThan(1.6 * 1024 * 1024)
    // sanity: 至少几十 KB,确保不是空 form
    expect(len).toBeGreaterThan(50_000)
    // 压缩后是 webp(image-compression.js:fileType: 'image/webp')
    expect(body.toString('utf8')).toContain('image/webp')
  })

  test('case 2: 200KB 小图 → 不压缩直接上传', async ({ page }) => {
    // chromium DevTools 不暴露小型 multipart upload 的 body buffer
    // (大于 ~1MB 的请求会 stage,小请求直接 streamed)。
    // 只验证"上传请求发出"和"shouldCompress=false 路径不抛错"。
    // body size / mime 断言留给 vitest unit test(已覆盖 image-compression.test.js)。

    const { openActivityEditor } = await seedTour(page)
    const { uploadButton } = await openActivityEditor()

    let posted = false
    await page.route(/\/activities\/\d+\/images$/, async (route) => {
      if (route.request().method() !== 'POST') return route.continue()
      posted = true
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: ACTIVITY_IMAGE_OK.body,
      })
    })

    const fileChooserPromise = page.waitForEvent('filechooser')
    await uploadButton.click()
    const fileChooser = await fileChooserPromise
    await fileChooser.setFiles(path.join(FIX, '200kb.jpg'))

    await expect.poll(() => posted, { timeout: 15_000 }).toBe(true)
  })

  test('case 3: 动画 GIF → 不压缩(保持动画)', async ({ page }) => {
    // 同 case 2,小文件 multipart body 在 chromium 不被 stage —
    // 仅验证"上传请求成功发出"和 client 走 shouldCompress=false 分支(不抛错)。

    const { openActivityEditor } = await seedTour(page)
    const { uploadButton } = await openActivityEditor()

    let posted = false
    await page.route(/\/activities\/\d+\/images$/, async (route) => {
      if (route.request().method() !== 'POST') return route.continue()
      posted = true
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: ACTIVITY_IMAGE_OK.body,
      })
    })

    const fileChooserPromise = page.waitForEvent('filechooser')
    await uploadButton.click()
    const fileChooser = await fileChooserPromise
    await fileChooser.setFiles(path.join(FIX, 'animated.gif'))

    await expect.poll(() => posted, { timeout: 15_000 }).toBe(true)
  })

  test('case 4: 60MB 大图 → 不发请求,提示"超过 50 MB 已跳过"', async ({ page }) => {
    const { openActivityEditor } = await seedTour(page)
    const { uploadButton } = await openActivityEditor()

    let uploadAttempted = false
    page.on('request', (req) => {
      if (/\/activities\/\d+\/images$/.test(req.url()) && req.method() === 'POST') {
        uploadAttempted = true
      }
    })

    const fileChooserPromise = page.waitForEvent('filechooser')
    await uploadButton.click()
    const fileChooser = await fileChooserPromise
    await fileChooser.setFiles(path.join(FIX, '60mb.jpg'))

    // 等 toast(Mantine notifications role="alert")
    const toast = page.getByText(/超过 50 MB.*已跳过/)
    await expect(toast).toBeVisible({ timeout: 10_000 })

    // 给 client 充分时间;若有发出会在 1-2s 内拦截
    await page.waitForTimeout(2_000)
    expect(uploadAttempted).toBe(false)
  })
})

test.describe('Expense Receipt compression', () => {
  test.skip(true, 'TODO: AddExpenseDialog selector 链待 Preview 探索:tour Show → 详情drawer "记一笔" → AddExpenseDialog → 选 receipt 文件。')

  test('case 5: EDIT 模式 5MB JPEG → 压缩并上传', async () => {})
  test('case 6: CREATE 模式 5MB JPEG → 压缩并暂存', async () => {})
  test('case 7: 6MB JPEG(原 5MB 限制)→ 压缩后通过', async () => {})
  test('case 8: 100MB 假大文件 → 拒绝,无 HTTP 请求', async () => {})
})

test.describe('Avatar compression', () => {
  test.skip(true, 'TODO: Avatar 入口未定位 — 用户菜单 → 个人设置 → 上传头像;sidebar 用户 dropdown selector 待人工补完。')

  test('case 9: 5MB JPEG → 压缩到 ≤300KB / 512px', async () => {})
  test('case 10: PNG → WebP 输出', async () => {})
  test('case 11: 取消选择 → form.avatar reset 为 null', async () => {})
  test('case 12: 50MB 超大头像 → 压缩成功', async () => {})
})
