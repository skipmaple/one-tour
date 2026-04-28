// tests/e2e/helpers/seed.js
//
// 通过 UI 流创建一个可用于上传测试的 fresh tour + activity。
// 流程:
//   1. POST /tours → 跳转 /tours/:id (空 onboarding)
//   2. 填程名 → 下一步
//   3. 同意宪法 → 进 planner
//   4. 点 D1 "+ 加一个" → 新建行 dialog
//   5. 填名 → 保存 → activity 出现
//
// 返回 { tourId, openActivityEditor }。openActivityEditor() 打开 ActivityDrawer
// 并切到 "图片" tab,准备上传(返回上传按钮的 locator)。

export async function seedTour(page, { name = 'E2E Test Tour' } = {}) {
  await page.goto('/tours')
  await page.getByRole('button', { name: /\+\s*新建旅程/ }).click()
  await page.waitForURL(/\/tours\/\d+/)
  const tourId = page.url().match(/\/tours\/(\d+)/)[1]

  // Onboarding step 1: 程名 → 下一步
  await page.getByRole('textbox', { name: '程名' }).fill(name)
  await page.getByRole('button', { name: /下一步/ }).click()

  // Onboarding step 2: 同意宪法 → 进 planner
  await page.getByRole('button', { name: /同意并开始规划/ }).click()
  // backdrop fades out when onboarding completes
  await page.locator('[data-testid="onboarding-backdrop"]').waitFor({ state: 'hidden' })

  return {
    tourId,
    openActivityEditor: () => openActivityEditor(page),
  }
}

// 创建 activity (D1) → 打开 detail drawer → 编辑 → 切到 图片 tab
// Returns: { uploadButton } locator pointing at the image upload trigger
//          ("上传第一张" or "上传"). Caller wires up `waitForEvent('filechooser')`.
async function openActivityEditor(page, { activityName = '测试行' } = {}) {
  // Step 1: 点 D1 "+ 加一个"
  await page.getByRole('button', { name: /\+\s*加一个/ }).first().click()

  // Step 2: dialog "新建行" → fill 名称 → 保存
  const dialog = page.getByRole('dialog', { name: '新建行' })
  await dialog.getByRole('textbox', { name: '名称' }).fill(activityName)
  await dialog.getByRole('button', { name: '保存' }).click()
  await dialog.waitFor({ state: 'hidden' })

  // Step 3: 点击新建的 activity 卡 → ActivityDetailDrawer 弹出
  await page.getByRole('button', { name: activityName }).first().click()
  const detailDrawer = page.getByRole('dialog', { name: activityName })
  await detailDrawer.waitFor()

  // Step 4: 详情 drawer "编辑" → ActivityDrawer (带 tabs)
  await detailDrawer.getByRole('button', { name: '编辑' }).click()
  const editDrawer = page.getByRole('dialog', { name: '编辑行' })
  await editDrawer.waitFor()

  // Step 5: 切到 "图片" tab
  await editDrawer.getByRole('tab', { name: '图片' }).click()

  // 第一次没图时按钮叫 "上传第一张";已有图时叫 "上传"
  const uploadButton = editDrawer.getByRole('button', {
    name: /上传(第一张)?/,
  })
  await uploadButton.waitFor()

  return { uploadButton, dialog: editDrawer }
}
