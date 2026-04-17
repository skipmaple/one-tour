# 新建程体验优化 — 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 优化新建程体验——Step 1 加天数字段批量建 Day，重构新建行 Drawer 让搜索地点成为主入口。

**Architecture:** 两个独立模块。模块一改 Constitution.jsx 的 setup Step 1，加天数字段并在 proceedToReview 时循环 POST 建 Day。模块二重构 CommonFields.jsx 布局（搜索到顶部、经纬度只读、折叠区），调整 ActivityDrawer 的 PoiSearch 传递方式。

**Tech Stack:** React 19, Mantine 9 (NumberInput, Collapse, TextInput, Text), Vitest, 现有 DaysController JSON API。

**参考 spec:** `docs/superpowers/specs/2026-04-17-new-tour-ux-design.md`

---

## 执行约定

- **TDD 严格**：有行为的 task 按 "先写测试 → 验证失败 → 实现 → 验证通过 → commit" 节奏。
- **常用命令**：
  - JS 测试：`npm test` 或 `npx vitest run <path>`
  - Ruby 测试：`mise exec -- bundle exec rspec [<path>]`
- **commit 规范**：短 subject + 可选 body；不要 `--amend`，失败后新 commit。

---

## 文件结构

**新建：** 无

**修改（模块一）：**
- `app/javascript/pages/Tour/Constitution.jsx` — 加 `tourDays` 状态 + NumberInput + proceedToReview 循环建 Day
- `app/javascript/pages/Tour/__tests__/Constitution.test.jsx` — 加天数字段渲染测试

**修改（模块二）：**
- `app/javascript/components/activity-editor/CommonFields.jsx` — 重构布局：搜索到顶部、经纬度只读、折叠区
- `app/javascript/components/activity-editor/ActivityDrawer.jsx` — 把 PoiSearch + handlePoiPick 传入 CommonFields
- `app/javascript/components/activity-editor/__tests__/ActivityDrawer.test.jsx` — 适配新布局

**不改：**
- `app/javascript/components/activity-editor/PoiSearchCombobox.jsx` — 组件内部不变
- `app/javascript/components/activity-editor/DetailsFields.jsx` — 不变，只是被折叠包裹
- 后端 — DaysController#create 已支持 JSON + day_index + date，无需改

---

## 路线图

| Task | 主题 | 结束后能做什么 |
|---|---|---|
| 1 | 模块一：Constitution Step 1 加天数字段 + 批量建 Day | 新建程设天数 7 → 进规划页看到 D1-D7 |
| 2 | 模块二：CommonFields 重构（搜索到顶部 + 经纬度只读 + 折叠区）| 新建行时搜索地点是第一个字段，经纬度只读 |
| 3 | 全量验证 | 确认所有测试通过 + 浏览器 QA |

---

## Task 1: 模块一 — Constitution Step 1 加天数字段 + 批量建 Day

**Files:**
- Modify: `app/javascript/pages/Tour/Constitution.jsx`
- Modify: `app/javascript/pages/Tour/__tests__/Constitution.test.jsx`

### Step 1: 写失败测试

在 `app/javascript/pages/Tour/__tests__/Constitution.test.jsx` 末尾追加：

```jsx
test('setup step 1 shows 天数 field with default 1', () => {
  renderPage()
  const input = screen.getByLabelText('天数')
  expect(input).toBeInTheDocument()
  expect(input).toHaveValue(1)
})
```

- [ ] **Step 2: 运行测试验证失败**

Run: `npx vitest run app/javascript/pages/Tour/__tests__/Constitution.test.jsx`

Expected: FAIL — 找不到 label "天数" 的 input。

- [ ] **Step 3: 在 Constitution.jsx 加天数字段**

读 `app/javascript/pages/Tour/Constitution.jsx`。

**3a) 加状态**。在 `tourTeamSize` 状态之后加：

```jsx
const [tourDays, setTourDays] = useState(tour.days_count || 1)
```

注意：`tour.days_count` 需要后端传。当前 `tour.as_json` 可能不含 `days_count`。如果不含，用默认值 1。Constitution 的 props 里 `tour` 来自 `@tour.as_json`，检查是否已有 `days_count`。如果没有，在 constitutions_controller.rb 的 show action 里 merge：

```ruby
tour: @tour.as_json.merge("days_count" => @tour.days.count),
```

**3b) 加 UI**。找到当前的 `<Group grow>` 包含日期范围和人数的那块（约 line 85-100），把它改为三列：

```jsx
<Group grow>
  <TextInput
    label="日期范围"
    placeholder="例如：2026年6月10日-19日"
    value={tourDateRange}
    onChange={e => setTourDateRange(e.currentTarget.value)}
  />
  <NumberInput
    label="人数"
    placeholder="例如：5"
    value={tourTeamSize}
    onChange={setTourTeamSize}
    min={1}
    max={50}
  />
  <NumberInput
    label="天数"
    placeholder="例如：7"
    value={tourDays}
    onChange={setTourDays}
    min={1}
    max={30}
  />
</Group>
```

**3c) 修改 `proceedToReview`**。在保存 constitution params 之后、`setSetupStep(2)` 之前，加批量建 Day 逻辑：

```jsx
const proceedToReview = async () => {
  if (!tourTitle.trim()) return
  const token = document.querySelector('meta[name=csrf-token]')?.getAttribute('content') || ''
  // Save tour metadata
  await fetch(`/tours/${tour.id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', 'Accept': 'application/json', 'X-CSRF-Token': token },
    body: JSON.stringify({ tour: { title: tourTitle.trim(), date_range: tourDateRange, team_size: tourTeamSize || null } })
  })
  // Save constitution params
  await fetch(`/tours/${tour.id}/constitution`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', 'Accept': 'application/json', 'X-CSRF-Token': token },
    body: JSON.stringify({ constitution: c })
  })
  // Batch create Days if needed (current tour has 1 Day from seed_first_day)
  const currentDayCount = tour.days_count || 1
  const targetDayCount = tourDays || 1
  if (targetDayCount > currentDayCount) {
    for (let i = currentDayCount + 1; i <= targetDayCount; i++) {
      await fetch(`/tours/${tour.id}/days`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json', 'X-CSRF-Token': token },
        body: JSON.stringify({ day: { day_index: i } })
      })
    }
  }
  setSetupStep(2)
  window.scrollTo(0, 0)
}
```

- [ ] **Step 4: 修改后端传 days_count（如需要）**

检查 `app/controllers/tours/constitutions_controller.rb` 的 show action。如果 `tour.as_json` 不含 `days_count`，改为：

```ruby
tour: @tour.as_json.merge("days_count" => @tour.days.count),
```

- [ ] **Step 5: 运行测试验证通过**

Run: `npx vitest run app/javascript/pages/Tour/__tests__/Constitution.test.jsx`

Expected: 4 PASS（含新加的天数测试）

- [ ] **Step 6: 全量 Vitest 确认无回归**

Run: `npm test`

Expected: ALL PASS

- [ ] **Step 7: Commit**

```bash
git add app/javascript/pages/Tour/Constitution.jsx app/javascript/pages/Tour/__tests__/Constitution.test.jsx app/controllers/tours/constitutions_controller.rb
git commit -m "constitution: add 天数 field in setup step 1 + batch Day creation"
```

---

## Task 2: 模块二 — CommonFields 重构

**Files:**
- Modify: `app/javascript/components/activity-editor/CommonFields.jsx`
- Modify: `app/javascript/components/activity-editor/ActivityDrawer.jsx`
- Modify: `app/javascript/components/activity-editor/__tests__/ActivityDrawer.test.jsx`

### Step 1: 读现有文件

读以下文件理解当前结构：
- `app/javascript/components/activity-editor/CommonFields.jsx`
- `app/javascript/components/activity-editor/ActivityDrawer.jsx`
- `app/javascript/components/activity-editor/PoiSearchCombobox.jsx`

### Step 2: 重构 CommonFields.jsx

当前 CommonFields 接收 `form` prop。重构后需要额外接收：
- `onPoiPick` — POI 选中回调（从 ActivityDrawer 传入）
- `details` + `onDetailsChange` + `kind` — 用于折叠区域内的 DetailsFields

**完整重写 CommonFields.jsx：**

```jsx
import { useState } from 'react'
import { TextInput, Textarea, Select, Radio, Group, Stack, Text, Button, Collapse } from '@mantine/core'
import { KIND_OPTIONS, CITIZEN_LEVEL_OPTIONS } from './detailsSchema'
import PoiSearchCombobox from './PoiSearchCombobox'
import DetailsFields from './DetailsFields'

export default function CommonFields({ form, onPoiPick, kind, details, onDetailsChange }) {
  const [moreOpen, setMoreOpen] = useState(false)
  const lat = form.values.lat
  const lng = form.values.lng

  return (
    <Stack gap="sm">
      {/* 第一段：地点定位 + 核心字段 */}
      <PoiSearchCombobox onPick={onPoiPick} />
      <TextInput
        label="名称"
        required
        maxLength={80}
        {...form.getInputProps('name')}
      />
      {(lat && lng) && (
        <Text size="xs" c="dimmed">📍 {Number(lat).toFixed(2)}, {Number(lng).toFixed(2)}</Text>
      )}
      <Group grow>
        <Select
          label="类型"
          data={KIND_OPTIONS}
          allowDeselect={false}
          {...form.getInputProps('kind')}
        />
      </Group>
      <Radio.Group
        label="公民等级"
        {...form.getInputProps('citizen_level')}
      >
        <Group mt={4}>
          {CITIZEN_LEVEL_OPTIONS.map(o => (
            <Radio key={o.value} value={o.value} label={o.label} />
          ))}
        </Group>
      </Radio.Group>
      <Group grow>
        <TextInput
          label="开始时间"
          placeholder="HH:MM"
          {...form.getInputProps('planned_start_at')}
        />
        <TextInput
          label="时长 (分钟)"
          type="number"
          {...form.getInputProps('planned_duration_min')}
        />
      </Group>

      {/* 第二段：折叠区域 */}
      <Button variant="subtle" size="sm" onClick={() => setMoreOpen(o => !o)}>
        {moreOpen ? '▴ 收起' : '▾ 更多设置'}
      </Button>
      <Collapse in={moreOpen}>
        <Stack gap="sm">
          <Textarea
            label="描述"
            minRows={2}
            maxRows={4}
            autosize
            {...form.getInputProps('description')}
          />
          <Textarea
            label="贴士"
            minRows={1}
            maxRows={3}
            autosize
            {...form.getInputProps('tips')}
          />
          <DetailsFields kind={kind} details={details} onChange={onDetailsChange} />
        </Stack>
      </Collapse>
    </Stack>
  )
}
```

**关键变化：**
- PoiSearchCombobox 移到最顶部（从 ActivityDrawer 移入）
- 经纬度从 `<TextInput type="number">` 改为只读 `<Text>` 展示
- 描述/贴士/DetailsFields 包在 `<Collapse>` 折叠区内
- 新增 props: `onPoiPick`, `kind`, `details`, `onDetailsChange`

### Step 3: 修改 ActivityDrawer.jsx

ActivityDrawer 当前在 JSX 中直接渲染 `<PoiSearchCombobox>` 和 `<DetailsFields>`。重构后这两个都移入 CommonFields 内部。

找到 ActivityDrawer.jsx 的 return JSX 部分（约 line 246-265），改为：

```jsx
<Stack gap="md">
  <CommonFields
    form={formWithKindHook}
    onPoiPick={handlePoiPick}
    kind={form.values.kind}
    details={details}
    onDetailsChange={setDetails}
  />

  <Group justify="space-between" mt="md" pt="md" style={{ borderTop: '1px solid #eee' }}>
    <Group>
      <Button onClick={handleSave} loading={saving}>保存</Button>
      <Button variant="default" onClick={handleClose}>取消</Button>
    </Group>
    {isEdit && (
      <Group>
        {activity?.day_id && (
          <Button variant="subtle" size="xs" onClick={handleMoveToBacklog}>移回候选池</Button>
        )}
        <Button variant="subtle" color="red" size="xs" onClick={handleDelete}>删除</Button>
      </Group>
    )}
  </Group>
</Stack>
```

**同时删除** ActivityDrawer 中不再需要的 import 和直接渲染：
- 删除 `import PoiSearchCombobox from './PoiSearchCombobox'` — 已移入 CommonFields
- 删除 `import DetailsFields from './DetailsFields'` — 已移入 CommonFields
- 删除 JSX 中的 `<PoiSearchCombobox onPick={handlePoiPick} />`
- 删除 JSX 中的 `<DetailsFields kind={form.values.kind} details={details} onChange={setDetails} />`

### Step 4: 更新 ActivityDrawer.test.jsx

现有测试断言 `screen.getByLabelText('名称')` 等 — 这些仍然在新布局中存在，应该继续通过。

但需要检查：
- `screen.getByText('新建行')` → 仍有 ✓
- `screen.getByLabelText('名称')` → 仍有（在 CommonFields 内）✓
- `screen.getByRole('button', { name: '保存' })` → 仍有 ✓

主要风险：PoiSearchCombobox 渲染时可能调用 fetch（虽然当前不会——它只在用户输入时搜索）。已有 `global.fetch = vi.fn()` mock，应该安全。

不需要加新测试——现有测试覆盖了核心行为。只需确认全部通过。

- [ ] **Step 5: 运行 ActivityDrawer 测试**

Run: `npx vitest run app/javascript/components/activity-editor/__tests__/ActivityDrawer.test.jsx`

Expected: ALL PASS（6 tests）

- [ ] **Step 6: 全量 Vitest**

Run: `npm test`

Expected: ALL PASS

- [ ] **Step 7: Commit**

```bash
git add app/javascript/components/activity-editor/CommonFields.jsx app/javascript/components/activity-editor/ActivityDrawer.jsx app/javascript/components/activity-editor/__tests__/ActivityDrawer.test.jsx
git commit -m "drawer: restructure layout — POI search to top, lat/lng read-only, collapsible details"
```

---

## Task 3: 全量验证

- [ ] **Step 1: 全量 Vitest**

Run: `npm test`

Expected: ALL PASS

- [ ] **Step 2: 全量 RSpec**

Run: `mise exec -- bundle exec rspec --format progress`

Expected: ALL PASS

- [ ] **Step 3: RuboCop**

Run: `mise exec -- bundle exec rubocop -f github`

Expected: 没有新 offense

- [ ] **Step 4: 浏览器 QA**

在 dev 环境：

| # | 操作 | 期望 |
|---|---|---|
| 1 | 新建程 → Step 1 设天数 7 → 下一步 → 同意 → 进规划页 | 看到 D1-D7 |
| 2 | 规划页 D1 点 "+ 加一个" | Drawer 打开，搜索地点是第一个字段 |
| 3 | 搜索"成都" → 选中 | 名称自动填充，经纬度显示为 "📍 30.57, 104.07" 只读文本 |
| 4 | 经纬度区域 | 不可编辑，无 input 框 |
| 5 | "更多设置" | 点击展开：描述、贴士、类型细节可见 |
| 6 | 编辑已有行（Tour #17） | 所有字段正确填充，经纬度只读展示 |
| 7 | 控制台 | 无 error |

---

## 数字预估

| | 数量 |
|---|---|
| 新文件 | 0 |
| 修改文件 | 4-5 |
| Vitest 新增 | ~1 |
| Commits | 2-3 |
| **工作量** | **~2-3h** |
