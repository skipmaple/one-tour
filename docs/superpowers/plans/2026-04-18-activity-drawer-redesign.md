# Activity Drawer B-tier Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把活动编辑抽屉从扁平 text input 列表重做成三段式（位置 / 分类与时间 / 详情），把所有 text 输入该换控件的换成 `TimeInput` / `NumberInput+suffix` / `Select` / `Autocomplete`，合并 "描述 + 贴士" 为单一 "备注"（复用 `desc` 列），删掉 DB 里未用的 `tips` 列，顺带修前端 `description` 和后端 `desc` 列名不对的死 bug。

**Architecture:** 一个破坏性迁移（drop `tips`）+ 后端 permit/AI tool 清理 + 前端 detailsSchema 字段类型系统扩展 + 新增 `PresetChips` 原子 + 扩展 `DetailsFields` 渲染器 + 重写 `CommonFields` 三段式布局 + `ActivityDrawer` 字段 `description` → `desc`。

**Tech Stack:**
- Rails 8.0, PostgreSQL
- Mantine v9：`useForm` / `TimeInput`（来自 `@mantine/dates`）/ `NumberInput` / `Select` / `Autocomplete` / `Divider label` / `Textarea`
- React 19, Vitest + @testing-library/react

**Reference Spec:** [docs/superpowers/specs/2026-04-18-activity-drawer-redesign-design.md](../specs/2026-04-18-activity-drawer-redesign-design.md)

**关键前置事实（执行前必读）：**
- DB 列名是 `desc`（不是 `description`），见 `db/schema.rb` 的 `activities` 表定义
- `@mantine/dates` v9 已安装，可直接 `import { TimeInput } from '@mantine/dates'`
- 执行测试时用 `mise exec -- bundle exec rspec ...`（系统 ruby 版本问题，见 CLAUDE.md Gotchas）
- 当前 worktree 专用 DB 是 `one_tour_dev_nifty_curie_c7afb5`；主 worktree 在 9000，如需数据库命令用 `DATABASE_URL='postgres://postgres:postgres@localhost/one_tour_dev_nifty_curie_c7afb5' mise exec -- bundle exec rails ...`

---

## Task 1：Drop `tips` 列 + 后端 permit / AI tool 清理

**Files:**
- Create: `db/migrate/<timestamp>_drop_tips_from_activities.rb`
- Auto-update: `db/schema.rb`
- Modify: `app/controllers/activities_controller.rb:36-42`
- Modify: `app/ai_tools/update_activity.rb:5,7`

**Rationale:** 先做后端不可逆的变更（drop 列）。前端暂时还在向后端 POST `tips` 参数，Rails `permit(:tips)` 被移除后会被 strong params 安静吞掉，不会炸 —— 所以这一步对前端无破坏性。

- [ ] **Step 1: 创建 migration**

Run:
```bash
mise exec -- bundle exec rails g migration DropTipsFromActivities
```

这会生成 `db/migrate/<timestamp>_drop_tips_from_activities.rb`。打开并改为：

```ruby
class DropTipsFromActivities < ActiveRecord::Migration[8.0]
  def change
    remove_column :activities, :tips, :text
  end
end
```

- [ ] **Step 2: 执行迁移**

主 worktree DB：
```bash
mise exec -- bundle exec rails db:migrate
```

次 worktree DB：
```bash
DATABASE_URL='postgres://postgres:postgres@localhost/one_tour_dev_nifty_curie_c7afb5' mise exec -- bundle exec rails db:migrate
```

Expected: `== ... DropTipsFromActivities: migrated`，无错误。`db/schema.rb` 自动更新（`t.text "tips"` 行消失）。

- [ ] **Step 3: 从 permit 列表移除 `:tips`**

Edit `app/controllers/activities_controller.rb:36-42` 里的 `activity_params`。当前：

```ruby
def activity_params
  params.require(:activity).permit(
    :name, :kind, :citizen_level, :lat, :lng, :address,
    :planned_start_at, :planned_duration_min, :desc, :tips,
    details: {}
  )
end
```

改为：

```ruby
def activity_params
  params.require(:activity).permit(
    :name, :kind, :citizen_level, :lat, :lng, :address,
    :planned_start_at, :planned_duration_min, :desc,
    details: {}
  )
end
```

- [ ] **Step 4: 从 AI tool UPDATABLE 与 desc 文案移除 `tips`**

Edit `app/ai_tools/update_activity.rb:5,7`。当前：

```ruby
param :patch, type: :object, desc: "要更新的字段 hash（name/desc/tips/lat/lng/planned_start_at/planned_duration_min/details…）"
...
UPDATABLE = %w[name desc tips lat lng address planned_start_at planned_duration_min kind citizen_level details].freeze
```

改为：

```ruby
param :patch, type: :object, desc: "要更新的字段 hash（name/desc/lat/lng/planned_start_at/planned_duration_min/details…）"
...
UPDATABLE = %w[name desc lat lng address planned_start_at planned_duration_min kind citizen_level details].freeze
```

- [ ] **Step 5: 跑现有测试套件，确认无回归**

```bash
mise exec -- bundle exec rspec spec/requests/activities_spec.rb spec/ai_tools/
```

Expected: all green. 如果某个测试引用了 `activity.tips` 或 `tips:` 参数，删掉那些引用（无非就是老 fixture）。

- [ ] **Step 6: 追加一条 request spec 确认 desc 可写、tips 不存在**

Edit `spec/requests/activities_spec.rb`，在现有 describe 块内加：

```ruby
it "PATCH saves desc and ignores tips" do
  a = create(:activity, tour: tour, name: "旧", desc: "")
  login_as(author)
  patch activity_path(a), params: {
    activity: { desc: "新备注", tips: "should be ignored" }
  }
  a.reload
  expect(a.desc).to eq("新备注")
  expect(Activity.column_names).not_to include("tips")
end
```

Run:
```bash
mise exec -- bundle exec rspec spec/requests/activities_spec.rb -e "desc and ignores tips"
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add db/migrate db/schema.rb app/controllers/activities_controller.rb app/ai_tools/update_activity.rb spec/requests/activities_spec.rb
git commit -m "$(cat <<'EOF'
chore(activity): drop unused tips column + clean permit and ai tool

Activity.tips 历史上从未被 UI 写入过（前端 form 发 "description"，但
controller permit 只认 :desc，"description" 被安静丢弃）。tips 字段在
产品上也没定位——决定合并到"备注"（单字段映射 desc 列）并 drop 之。

用户明确授权不迁移 tips 数据。

- migration: remove_column :activities, :tips
- activities_controller.rb: 从 permit 移除 :tips
- update_activity.rb (AI tool): UPDATABLE 和 desc 同步更新
- spec: 新增 PATCH 接受 desc、忽略 tips 的回归用例

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 2：前端表单字段 `description` → `desc` + 移除 `tips`

**Files:**
- Modify: `app/javascript/components/activity-editor/ActivityDrawer.jsx:12-33, 44-58, 64`
- Modify: `app/javascript/components/activity-editor/CommonFields.jsx:60-77`
- Modify: `app/javascript/components/activity-editor/__tests__/ActivityDrawer.test.jsx` (update existing + add regression)

**Rationale:** 修 desc 列名不匹配的 bug，让"描述"字段真能存进 DB。先改字段名、删 tips，保留现有两个 textarea 外观不动（下一次合并到备注）—— 这样这个 task 的改动小、风险可控。

- [ ] **Step 1: 写失败的测试：保存描述后再次编辑能看到**

Edit `app/javascript/components/activity-editor/__tests__/ActivityDrawer.test.jsx`，在文件末尾（最后一个 test 前）加：

```jsx
test('描述 writes to desc column (not description) on save', async () => {
  const { router } = await import('@inertiajs/react')
  router.patch.mockImplementation((url, data, opts) => opts?.onSuccess?.())
  renderDrawer({
    mode: 'edit',
    activity: { id: 42, name: 'X', kind: 'scenic', citizen_level: 'tier_one', day_id: 5, details: {} },
  })
  const descInput = screen.getByLabelText('描述', { exact: false })
  fireEvent.change(descInput, { target: { value: '测试描述文本' } })
  fireEvent.click(screen.getByRole('button', { name: '保存' }))
  await waitFor(() => {
    expect(router.patch).toHaveBeenCalledWith(
      '/activities/42',
      expect.objectContaining({
        activity: expect.objectContaining({ desc: '测试描述文本' }),
      }),
      expect.anything(),
    )
  })
  // payload should NOT contain tips (schema dropped)
  const payload = router.patch.mock.calls[0][1]
  expect(payload.activity).not.toHaveProperty('tips')
  // payload should NOT contain "description" (wrong key)
  expect(payload.activity).not.toHaveProperty('description')
})
```

- [ ] **Step 2: Run test — should fail**

```bash
npx vitest run app/javascript/components/activity-editor/__tests__/ActivityDrawer.test.jsx -t 'desc column'
```

Expected: FAIL — payload contains `description` key instead of `desc`, and likely `tips: ''`.

- [ ] **Step 3: 修 ActivityDrawer form 字段名**

Edit `app/javascript/components/activity-editor/ActivityDrawer.jsx`。

修改 `EMPTY_FORM_VALUES` 常量（当前在 11-22 行）：

```jsx
const EMPTY_FORM_VALUES = {
  name: '',
  kind: 'scenic',
  citizen_level: 'tier_three',
  lat: '',
  lng: '',
  address: '',
  planned_start_at: '',
  planned_duration_min: '',
  desc: '',
  tips: '',         // ← 删这行
  description: '',  // ← 这行改名为 desc（如上）
}
```

目标状态：

```jsx
const EMPTY_FORM_VALUES = {
  name: '',
  kind: 'scenic',
  citizen_level: 'tier_three',
  lat: '',
  lng: '',
  address: '',
  planned_start_at: '',
  planned_duration_min: '',
  desc: '',
}
```

然后修改 `useEffect` 里 edit 模式的 `form.setValues(...)`（当前在 44-56 行）：

```jsx
form.setValues({
  name: activity.name || '',
  kind: activity.kind || 'scenic',
  citizen_level: activity.citizen_level || 'tier_three',
  lat: activity.lat ?? '',
  lng: activity.lng ?? '',
  address: activity.address || '',
  planned_start_at: activity.planned_start_at || '',
  planned_duration_min: activity.planned_duration_min ?? '',
  desc: activity.desc || '',   // ← 改：description → desc
  // 删除 tips 行
})
```

- [ ] **Step 4: 修 CommonFields 里两个 textarea 的绑定**

Edit `app/javascript/components/activity-editor/CommonFields.jsx` 里的 `更多设置` Collapse 块（当前含 `描述` 和 `贴士` 两个 Textarea，约 60-77 行）。

当前：
```jsx
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
```

改为（保留外观，只改字段名 + 删 tips textarea）：
```jsx
<Textarea
  label="描述"
  minRows={2}
  maxRows={4}
  autosize
  {...form.getInputProps('desc')}
/>
<DetailsFields kind={kind} details={details} onChange={onDetailsChange} />
```

- [ ] **Step 5: 还原 undo snapshot 里的 tips/description 引用**

Edit `app/javascript/components/activity-editor/ActivityDrawer.jsx` 里 `handleDelete` 的 undoFn（当前约 182-200 行）。当前：

```jsx
const payload = {
  activity: {
    name: savedAttrs.name,
    kind: savedAttrs.kind,
    citizen_level: savedAttrs.citizen_level,
    lat: savedAttrs.lat,
    lng: savedAttrs.lng,
    address: savedAttrs.address,
    planned_start_at: savedAttrs.planned_start_at,
    planned_duration_min: savedAttrs.planned_duration_min,
    details: savedAttrs.details || {}
  }
}
```

加一行 `desc`：

```jsx
const payload = {
  activity: {
    name: savedAttrs.name,
    kind: savedAttrs.kind,
    citizen_level: savedAttrs.citizen_level,
    lat: savedAttrs.lat,
    lng: savedAttrs.lng,
    address: savedAttrs.address,
    planned_start_at: savedAttrs.planned_start_at,
    planned_duration_min: savedAttrs.planned_duration_min,
    desc: savedAttrs.desc,
    details: savedAttrs.details || {}
  }
}
```

- [ ] **Step 6: Run test — should pass**

```bash
npx vitest run app/javascript/components/activity-editor/__tests__/ActivityDrawer.test.jsx -t 'desc column'
```

Expected: PASS.

- [ ] **Step 7: Run full drawer test suite — no regressions**

```bash
npx vitest run app/javascript/components/activity-editor/__tests__/
```

Expected: 11 tests pass (10 existing + 1 new).

- [ ] **Step 8: Commit**

```bash
git add app/javascript/components/activity-editor/
git commit -m "$(cat <<'EOF'
fix(activity-drawer): rename form field description → desc, drop tips

前端 form 一直用 'description'，但后端 column + permit 都是 'desc' ——
用户填的"描述"从没保存成功过。既然本次在合并 tips 和 description 到
"备注"，先把字段名对上，修掉这个死 bug。

tips textarea 彻底移除 (Task 1 已经 drop 了 DB 列，前端现在也收敛)。

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 3：新增 `PresetChips` 原子组件

**Files:**
- Create: `app/javascript/components/activity-editor/PresetChips.jsx`
- Create: `app/javascript/components/activity-editor/__tests__/PresetChips.test.jsx`

**Rationale:** 时长 / 建议停留 / 驾驶时长三个字段都要"下方一排预设芯片"。抽成单一组件保持 DRY + 可测。

- [ ] **Step 1: 写测试**

Create `app/javascript/components/activity-editor/__tests__/PresetChips.test.jsx`：

```jsx
import { render, screen, fireEvent } from '@testing-library/react'
import { MantineProvider } from '@mantine/core'
import { vi } from 'vitest'
import PresetChips from '../PresetChips'

function renderChips(props = {}) {
  return render(
    <MantineProvider>
      <PresetChips values={[30, 60, 90]} onPick={vi.fn()} {...props} />
    </MantineProvider>,
  )
}

test('renders a button for each preset value', () => {
  renderChips()
  expect(screen.getByRole('button', { name: '30' })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: '60' })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: '90' })).toBeInTheDocument()
})

test('calls onPick with the value when a chip is clicked', () => {
  const onPick = vi.fn()
  renderChips({ onPick })
  fireEvent.click(screen.getByRole('button', { name: '60' }))
  expect(onPick).toHaveBeenCalledWith(60)
})

test('renders nothing when values is empty', () => {
  const { container } = renderChips({ values: [] })
  expect(container.querySelectorAll('button')).toHaveLength(0)
})
```

- [ ] **Step 2: Run test — should fail (no component)**

```bash
npx vitest run app/javascript/components/activity-editor/__tests__/PresetChips.test.jsx
```

Expected: FAIL — `Cannot find module '../PresetChips'`.

- [ ] **Step 3: 写 PresetChips 组件**

Create `app/javascript/components/activity-editor/PresetChips.jsx`：

```jsx
import { Group, UnstyledButton } from '@mantine/core'

// 在 NumberInput 下方渲染一排快捷芯片，点击写入目标值。
export default function PresetChips({ values, onPick }) {
  if (!values || values.length === 0) return null
  return (
    <Group gap={4} mt={4}>
      {values.map(v => (
        <UnstyledButton
          key={v}
          type="button"
          onClick={() => onPick(v)}
          style={{
            fontSize: 11,
            padding: '2px 8px',
            border: '1px solid var(--mantine-color-gray-3)',
            borderRadius: 12,
            background: 'var(--mantine-color-gray-0)',
            color: 'var(--mantine-color-gray-7)',
            cursor: 'pointer',
          }}
        >
          {v}
        </UnstyledButton>
      ))}
    </Group>
  )
}
```

- [ ] **Step 4: Run test — should pass**

```bash
npx vitest run app/javascript/components/activity-editor/__tests__/PresetChips.test.jsx
```

Expected: 3 tests pass.

- [ ] **Step 5: Commit**

```bash
git add app/javascript/components/activity-editor/PresetChips.jsx app/javascript/components/activity-editor/__tests__/PresetChips.test.jsx
git commit -m "$(cat <<'EOF'
feat(activity-drawer): add PresetChips atom for NumberInput quick values

后续 CommonFields 要在时长/建议停留/驾驶时长下方配统一的
30/60/90/120/180 预设芯片。先抽象出来单测了再用。

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 4：扩展 `DetailsFields` 渲染器支持新类型

**Files:**
- Modify: `app/javascript/components/activity-editor/DetailsFields.jsx`
- Create: `app/javascript/components/activity-editor/__tests__/DetailsFields.test.jsx`

**Rationale:** DetailsFields 现在只懂 `text / number / checkbox / select`。需要加：
- `number_with_suffix`（`suffix`: 米/km/元/分钟；可选 `presets` 数组）
- `autocomplete`（`suggestions` 数组，允许自由输入）
- `select_clearable`（同 select，但加 `clearable`；现在其实 select 已有 clearable，这里重命名以明确语义）

注意：旧的 `select` 行为默认也是 clearable（见现有代码），所以 `select_clearable` 和 `select` 在渲染上相同。改名只是语义一致，但为了避免改 schema 时改所有 `select` → `select_clearable`，**保留 `select` 名字不变**。原先计划里的 `select_clearable` 类型**去掉**，statement 用 `select` 即可。

最终新类型只有两个：`number_with_suffix` 和 `autocomplete`。

- [ ] **Step 1: 写测试**

Create `app/javascript/components/activity-editor/__tests__/DetailsFields.test.jsx`：

```jsx
import { render, screen, fireEvent } from '@testing-library/react'
import { MantineProvider } from '@mantine/core'
import { vi } from 'vitest'
import DetailsFields from '../DetailsFields'
import { KIND_SCHEMA } from '../detailsSchema'

function renderFields(kind, details = {}, onChange = vi.fn()) {
  return render(
    <MantineProvider>
      <DetailsFields kind={kind} details={details} onChange={onChange} />
    </MantineProvider>,
  )
}

test('renders nothing when kind has no schema entries', () => {
  const { container } = renderFields('other')
  expect(container.querySelectorAll('input')).toHaveLength(0)
})

test('renders number_with_suffix as NumberInput with suffix (海拔 米)', () => {
  const schema = [{ key: 'altitude', label: '海拔', type: 'number_with_suffix', suffix: '米' }]
  vi.spyOn(KIND_SCHEMA, 'scenic', 'get').mockReturnValue(schema)
  renderFields('scenic', { altitude: 2500 })
  expect(screen.getByLabelText('海拔', { exact: false })).toHaveValue(2500)
  expect(screen.getByText('米')).toBeInTheDocument()
})

test('number_with_suffix with presets renders PresetChips that call onChange', () => {
  const schema = [{
    key: 'planned_min',
    label: '建议停留',
    type: 'number_with_suffix',
    suffix: '分钟',
    presets: [30, 60, 90],
  }]
  vi.spyOn(KIND_SCHEMA, 'scenic', 'get').mockReturnValue(schema)
  const onChange = vi.fn()
  renderFields('scenic', {}, onChange)
  fireEvent.click(screen.getByRole('button', { name: '60' }))
  expect(onChange).toHaveBeenCalledWith({ planned_min: 60 })
})

test('renders autocomplete type with suggestions', () => {
  const schema = [{
    key: 'cuisine',
    label: '菜系',
    type: 'autocomplete',
    suggestions: ['甘肃菜', '川菜', '粤菜'],
  }]
  vi.spyOn(KIND_SCHEMA, 'food', 'get').mockReturnValue(schema)
  const onChange = vi.fn()
  renderFields('food', {}, onChange)
  const input = screen.getByLabelText('菜系', { exact: false })
  fireEvent.change(input, { target: { value: '湘菜' } })
  expect(onChange).toHaveBeenCalledWith({ cuisine: '湘菜' })
})

test('existing text/number/checkbox/select types still render (no regression)', () => {
  // food has text fields + number (people per price) in the real schema
  renderFields('food', {})
  // 随便取一个 label 确认文本输入仍存在
  expect(screen.getByLabelText('必吃', { exact: false })).toBeInTheDocument()
})
```

注意：`vi.spyOn(KIND_SCHEMA, ...)` 对 getter 的写法依赖 object 是 frozen/extensible 的情况。如果 spy 失败，改为：在测试里不 mock schema，直接给 DetailsFields 传一个 inline 的 kind-value（需要改组件 API 可选接受 schema prop），或者写一个辅助组件。更简单的做法：**直接在 detailsSchema.js 里加一个导出的 fixture**并在测试里 swap。

真正执行时如果 spy 不工作，改成这样：

```jsx
// mock the module
vi.mock('../detailsSchema', () => ({
  KIND_SCHEMA: {
    scenic: [/* test fixture */],
    food:   [/* test fixture */],
    other:  [],
  },
}))
```

**Actionable guidance:** 先试 `vi.spyOn`，失败就换 `vi.mock` 整个模块，fixture 内嵌。

- [ ] **Step 2: Run test — should fail**

```bash
npx vitest run app/javascript/components/activity-editor/__tests__/DetailsFields.test.jsx
```

Expected: FAIL — `number_with_suffix` 渲染 fallback 到 TextInput，断言不成立；`autocomplete` 同理。

- [ ] **Step 3: 扩展 DetailsFields 支持新类型**

Edit `app/javascript/components/activity-editor/DetailsFields.jsx`，整个文件替换为：

```jsx
import { TextInput, NumberInput, Checkbox, Select, Autocomplete, Stack, Title } from '@mantine/core'
import { KIND_SCHEMA } from './detailsSchema'
import PresetChips from './PresetChips'

export default function DetailsFields({ kind, details, onChange }) {
  const schema = KIND_SCHEMA[kind] || []
  if (schema.length === 0) return null

  const set = (key, value) => onChange({ ...details, [key]: value })

  return (
    <Stack gap="sm">
      <Title order={6} c="dimmed">类型细节</Title>
      {schema.map(field => {
        const value = details[field.key]
        if (field.type === 'checkbox') {
          return (
            <Checkbox
              key={field.key}
              label={field.label}
              checked={!!value}
              onChange={e => set(field.key, e.currentTarget.checked)}
            />
          )
        }
        if (field.type === 'select') {
          return (
            <Select
              key={field.key}
              label={field.label}
              data={field.options}
              value={value || null}
              onChange={v => set(field.key, v)}
              clearable
            />
          )
        }
        if (field.type === 'autocomplete') {
          return (
            <Autocomplete
              key={field.key}
              label={field.label}
              data={field.suggestions || []}
              value={value || ''}
              onChange={v => set(field.key, v)}
            />
          )
        }
        if (field.type === 'number_with_suffix') {
          return (
            <div key={field.key}>
              <NumberInput
                label={field.label}
                min={0}
                hideControls={false}
                value={value ?? ''}
                onChange={v => set(field.key, v === '' ? null : Number(v))}
                rightSection={field.suffix ? <span style={{ fontSize: 12, color: 'var(--mantine-color-gray-6)', paddingRight: 8 }}>{field.suffix}</span> : null}
                rightSectionWidth={field.suffix ? 36 : undefined}
              />
              {Array.isArray(field.presets) && field.presets.length > 0 && (
                <PresetChips values={field.presets} onPick={v => set(field.key, v)} />
              )}
            </div>
          )
        }
        if (field.type === 'number') {
          return (
            <TextInput
              key={field.key}
              label={field.label}
              type="number"
              value={value ?? ''}
              onChange={e => set(field.key, e.currentTarget.value === '' ? null : Number(e.currentTarget.value))}
            />
          )
        }
        // default: text
        return (
          <TextInput
            key={field.key}
            label={field.label}
            value={value || ''}
            onChange={e => set(field.key, e.currentTarget.value)}
          />
        )
      })}
    </Stack>
  )
}
```

- [ ] **Step 4: Run test — should pass**

```bash
npx vitest run app/javascript/components/activity-editor/__tests__/DetailsFields.test.jsx
```

Expected: 5 tests pass. 如果 `vi.spyOn` 失败，改成 `vi.mock` 路线见 Step 1 末尾说明。

- [ ] **Step 5: 跑全量 vitest 确认无回归**

```bash
npx vitest run
```

Expected: all pass（现有的 ActivityDrawer 测试不触发新类型，仍保持绿）。

- [ ] **Step 6: Commit**

```bash
git add app/javascript/components/activity-editor/DetailsFields.jsx app/javascript/components/activity-editor/__tests__/DetailsFields.test.jsx
git commit -m "$(cat <<'EOF'
feat(activity-drawer): extend DetailsFields renderer for number+suffix + autocomplete

两个新 field type 用于 detailsSchema:
- number_with_suffix: NumberInput + suffix (米/km/元/分钟) + 可选 presets
- autocomplete: 推荐 suggestions 但允许自由输入

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 5：更新 `detailsSchema` 用新类型 + 重新排序

**Files:**
- Modify: `app/javascript/components/activity-editor/detailsSchema.js`

**Rationale:** DetailsFields 已经懂 `number_with_suffix` 和 `autocomplete`，现在让 schema 真正开始用它们。scenic 里 `need_reservation` 置顶（决策性字段）。

- [ ] **Step 1: 改写 detailsSchema.js**

Edit `app/javascript/components/activity-editor/detailsSchema.js`。整个 `KIND_SCHEMA` 替换为：

```js
// Single source of truth for kind-specific detail fields.
// field.type ∈ text | number | number_with_suffix | checkbox | select | autocomplete
//   number_with_suffix: { suffix, presets? }
//   autocomplete:       { suggestions }
//   select:             { options }
const DURATION_PRESETS = [30, 60, 90, 120, 180]

export const KIND_SCHEMA = {
  scenic: [
    { key: 'need_reservation',   label: '需要预约',   type: 'checkbox' },
    { key: 'best_light',         label: '最佳光线',   type: 'select',
      options: ['日出', '上午', '正午', '下午', '黄昏', '夜景', '全天'] },
    { key: 'altitude',           label: '海拔',       type: 'number_with_suffix', suffix: '米' },
    { key: 'ticket_info',        label: '门票',       type: 'number_with_suffix', suffix: '元' },
    { key: 'recommend_stay_min', label: '建议停留',   type: 'number_with_suffix', suffix: '分钟', presets: DURATION_PRESETS },
  ],
  road: [
    { key: 'from_name', label: '起点',           type: 'text' },
    { key: 'to_name',   label: '终点',           type: 'text' },
    { key: 'km',        label: '里程',           type: 'number_with_suffix', suffix: 'km' },
    { key: 'drive_min', label: '驾驶时长',       type: 'number_with_suffix', suffix: '分钟', presets: DURATION_PRESETS },
    { key: 'road_type', label: '路型',           type: 'select',
      options: ['高速', '国道', '省道', '山路', '城市'] },
    { key: 'day_only',  label: '仅白天通行',     type: 'checkbox' },
  ],
  food: [
    { key: 'cuisine',    label: '菜系',      type: 'autocomplete',
      suggestions: ['甘肃菜', '川菜', '粤菜', '湘菜', '东北菜', '清真', '西餐', '其他'] },
    { key: 'must_eat',   label: '必吃',      type: 'text' },
    { key: 'open_hours', label: '营业时间',   type: 'text' },
    { key: 'price_pp',   label: '人均',       type: 'number_with_suffix', suffix: '元' },
  ],
  stay: [
    { key: 'sanitation',       label: '卫生等级', type: 'select',
      options: ['基础', '标准', '豪华'] },
    { key: 'price_pp',         label: '人均',     type: 'number_with_suffix', suffix: '元' },
    { key: 'has_private_bath', label: '独立卫浴', type: 'checkbox' },
  ],
  fuel: [
    { key: 'brand',           label: '品牌',           type: 'autocomplete',
      suggestions: ['中石化', '中石油', '壳牌', '中海油', '其他'] },
    { key: 'h24',             label: '24 小时',         type: 'checkbox' },
    { key: 'next_station_km', label: '到下加油站',      type: 'number_with_suffix', suffix: 'km' },
  ],
  other: [],
}

// Valid kind values for the kind Select
export const KIND_OPTIONS = [
  { value: 'scenic', label: '景点' },
  { value: 'road',   label: '路段' },
  { value: 'food',   label: '餐饮' },
  { value: 'stay',   label: '住宿' },
  { value: 'fuel',   label: '加油' },
  { value: 'other',  label: '其他' },
]

export const CITIZEN_LEVEL_OPTIONS = [
  { value: 'tier_one',       label: '一等公民（核心）' },
  { value: 'tier_two',       label: '二等公民（配角）' },
  { value: 'tier_three',     label: '三等公民（可删）' },
  { value: 'infrastructure', label: '基础设施（自动）' },
]

// Common field presets (for CommonFields Task 6)
export const DURATION_PRESET_CHIPS = DURATION_PRESETS
```

注意：在 placeholder 之外**不加** `营业时间` 的 placeholder（placeholder 不走 schema，走 UI 组件的 prop）；schema 保持纯数据模型。

- [ ] **Step 2: 验证浏览器里渲染正常**

启动 preview，打开任一 activity 的编辑抽屉，检查 `详情` 折叠里：
- scenic: 需要预约放最上；门票、建议停留、海拔、最佳光线有单位/select
- food: 菜系是 Autocomplete 下拉
- fuel: 品牌是 Autocomplete

```bash
mcp preview_eval ...
```

Expected: 所有字段可正常输入并进 details。

- [ ] **Step 3: 跑所有测试**

```bash
npx vitest run
```

Expected: all pass.

- [ ] **Step 4: Commit**

```bash
git add app/javascript/components/activity-editor/detailsSchema.js
git commit -m "$(cat <<'EOF'
feat(activity-drawer): detailsSchema uses number_with_suffix + autocomplete

- scenic: need_reservation 置顶；门票 → 数字+元、海拔 → 数字+米、
  建议停留 → 数字+分钟+预设芯片；最佳光线 → Select 枚举
- road: 里程 km 后缀、驾驶时长 分钟+预设芯片
- food: 菜系 → Autocomplete 推荐；人均 → 数字+元
- stay: 人均 → 数字+元
- fuel: 品牌 → Autocomplete 推荐；到下加油站 → 数字+km

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 6：重写 `CommonFields` 为三段式布局

**Files:**
- Modify: `app/javascript/components/activity-editor/CommonFields.jsx` (整文件重写)
- Modify: `app/javascript/components/activity-editor/__tests__/ActivityDrawer.test.jsx` (加集成断言)
- 可能 Modify: `app/javascript/components/activity-editor/ActivityDrawer.jsx` 如果 Textarea minRows 之类的从外部传入

**Rationale:** 整合三段式 + TimeInput + NumberInput + 备注单字段 + 删 `更多设置` 折叠。

- [ ] **Step 1: 写集成测试：三段 Divider + TimeInput + NumberInput + 备注**

Edit `app/javascript/components/activity-editor/__tests__/ActivityDrawer.test.jsx`，在末尾加：

```jsx
test('三段式结构：位置 / 分类与时间 / 详情', () => {
  renderDrawer({ mode: 'create', targetDayId: 5 })
  expect(screen.getByText('位置')).toBeInTheDocument()
  expect(screen.getByText('分类与时间')).toBeInTheDocument()
  expect(screen.getByText('详情')).toBeInTheDocument()
  // "更多设置" 折叠按钮不应再存在
  expect(screen.queryByRole('button', { name: /更多设置/ })).not.toBeInTheDocument()
})

test('开始时间 是 TimeInput（type=time）', () => {
  renderDrawer({ mode: 'create', targetDayId: 5 })
  const input = screen.getByLabelText('开始时间', { exact: false })
  expect(input).toHaveAttribute('type', 'time')
})

test('时长 下方出现预设芯片（30/60/90/120/180），点击写入', () => {
  renderDrawer({ mode: 'create', targetDayId: 5 })
  const durationInput = screen.getByLabelText('时长', { exact: false })
  // 芯片存在
  expect(screen.getByRole('button', { name: '60' })).toBeInTheDocument()
  // 点击写入
  fireEvent.click(screen.getByRole('button', { name: '120' }))
  expect(durationInput).toHaveValue(120)
})

test('时长 NumberInput 显示 "分钟" 后缀', () => {
  renderDrawer({ mode: 'create', targetDayId: 5 })
  const durationField = screen.getByLabelText('时长', { exact: false }).closest('[class*="NumberInput-root"]') ||
                        screen.getByLabelText('时长', { exact: false }).parentElement
  // 更稳：整个 drawer 里有 "分钟" 文本
  expect(screen.getAllByText('分钟').length).toBeGreaterThanOrEqual(1)
})

test('备注 字段绑定 desc（原描述+贴士合并）', async () => {
  const { router } = await import('@inertiajs/react')
  router.patch.mockImplementation((url, data, opts) => opts?.onSuccess?.())
  renderDrawer({
    mode: 'edit',
    activity: { id: 42, name: 'X', kind: 'scenic', citizen_level: 'tier_one', day_id: 5, details: {} },
  })
  const note = screen.getByLabelText('备注', { exact: false })
  fireEvent.change(note, { target: { value: '合并后的备注' } })
  fireEvent.click(screen.getByRole('button', { name: '保存' }))
  await waitFor(() => {
    expect(router.patch).toHaveBeenCalledWith(
      '/activities/42',
      expect.objectContaining({ activity: expect.objectContaining({ desc: '合并后的备注' }) }),
      expect.anything(),
    )
  })
})
```

注意：第 2 个测试（`开始时间 是 TimeInput`）假设 Mantine 的 TimeInput 最终渲染为 `<input type="time">`。如果结果 DOM 不是 `type="time"`，改为断言容器 class（`class*="TimeInput"`）或 placeholder。

- [ ] **Step 2: Run tests — should fail**

```bash
npx vitest run app/javascript/components/activity-editor/__tests__/ActivityDrawer.test.jsx -t '三段式'
```

Expected: FAIL — 目前没有 "位置" / "分类与时间" / "详情" 文本；没有 "备注" label；时长 NumberInput 下也没有芯片。

- [ ] **Step 3: 重写 CommonFields.jsx**

Replace `app/javascript/components/activity-editor/CommonFields.jsx` 整个文件：

```jsx
import { TextInput, Textarea, Select, Radio, Group, Stack, Text, NumberInput, Divider } from '@mantine/core'
import { TimeInput } from '@mantine/dates'
import { KIND_OPTIONS, CITIZEN_LEVEL_OPTIONS, DURATION_PRESET_CHIPS } from './detailsSchema'
import PoiSearchCombobox from './PoiSearchCombobox'
import PresetChips from './PresetChips'
import DetailsFields from './DetailsFields'

export default function CommonFields({ form, onPoiPick, kind, details, onDetailsChange }) {
  const lat = form.values.lat
  const lng = form.values.lng

  return (
    <Stack gap="md">
      {/* 段 1：位置 */}
      <Divider label="位置" labelPosition="left" />
      <PoiSearchCombobox onPick={onPoiPick} />
      <TextInput
        label="名称"
        required
        maxLength={80}
        {...form.getInputProps('name')}
      />
      {form.values.address && (
        <Text size="xs" c="dimmed">地址：{form.values.address}</Text>
      )}

      {/* 段 2：分类与时间 */}
      <Divider label="分类与时间" labelPosition="left" />
      <Select
        label="类型"
        data={KIND_OPTIONS}
        allowDeselect={false}
        {...form.getInputProps('kind')}
      />
      <Radio.Group label="公民等级" {...form.getInputProps('citizen_level')}>
        <Group mt={4} gap="md">
          {CITIZEN_LEVEL_OPTIONS.map(o => (
            <Radio key={o.value} value={o.value} label={o.label} />
          ))}
        </Group>
      </Radio.Group>
      <Group grow align="flex-end">
        <TimeInput
          label="开始时间"
          {...form.getInputProps('planned_start_at')}
        />
        <div>
          <NumberInput
            label="时长"
            min={0}
            hideControls={false}
            value={form.values.planned_duration_min === '' ? '' : Number(form.values.planned_duration_min)}
            onChange={v => form.setFieldValue('planned_duration_min', v === '' ? '' : Number(v))}
            rightSection={<span style={{ fontSize: 12, color: 'var(--mantine-color-gray-6)', paddingRight: 8 }}>分钟</span>}
            rightSectionWidth={46}
          />
          <PresetChips
            values={DURATION_PRESET_CHIPS}
            onPick={v => form.setFieldValue('planned_duration_min', v)}
          />
        </div>
      </Group>

      {/* 段 3：详情 */}
      <Divider label="详情" labelPosition="left" />
      <Textarea
        label="备注"
        minRows={2}
        maxRows={5}
        autosize
        {...form.getInputProps('desc')}
      />
      <DetailsFields kind={kind} details={details} onChange={onDetailsChange} />
    </Stack>
  )
}
```

**重点**：
- 删除 `useState(moreOpen)` 和 `Collapse` 包裹
- 删除了旧的"更多设置"按钮
- `lat`/`lng` 变量不再需要（地址显示已独立，坐标根据决策 D 不显示）—— 代码里 `const lat = form.values.lat` 一行可以删，为语义清晰保留也行（未被使用会被 eslint 警告，建议删）

最终 CommonFields.jsx 起始几行应该不再声明 `lat`/`lng`：

```jsx
export default function CommonFields({ form, onPoiPick, kind, details, onDetailsChange }) {
  return (
    <Stack gap="md">
      ...
```

- [ ] **Step 4: Run tests — integration should pass**

```bash
npx vitest run app/javascript/components/activity-editor/__tests__/ActivityDrawer.test.jsx
```

Expected: all drawer tests pass（11 + 5 new = 16）。

- [ ] **Step 5: 浏览器手测**

启动 worktree dev 并在 /tours/:id 页面打开抽屉：
- 看到 3 个 Divider `位置 / 分类与时间 / 详情`
- `开始时间` 点击弹出 time picker
- `时长` 右侧显示 "分钟"，下方一排 `30 60 90 120 180` 芯片，点击后数字自动填入
- `备注` 是单个 textarea，无"描述"和"贴士"分别存在
- 创建 / 编辑切换后 form 不残留脏数据（之前的 bug 已在 ActivityDrawer 修复）

```bash
# 截图作为验证
```

- [ ] **Step 6: 跑所有前端测试**

```bash
npx vitest run
```

Expected: all pass.

- [ ] **Step 7: Commit**

```bash
git add app/javascript/components/activity-editor/CommonFields.jsx app/javascript/components/activity-editor/__tests__/ActivityDrawer.test.jsx
git commit -m "$(cat <<'EOF'
feat(activity-drawer): three-section layout with TimeInput + preset chips

- Divider: 位置 / 分类与时间 / 详情 (纯中文，无 emoji/icon)
- 开始时间: TextInput("HH:MM") -> @mantine/dates TimeInput
- 时长: NumberInput + 分钟 后缀 + 30/60/90/120/180 预设芯片
- 备注: 单个 Textarea（描述+贴士合并），绑定 desc 列
- 删除 "更多设置" 折叠，详情默认展开
- 删除坐标显示（地图面板已有点位）

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 7：端到端验证 + lint/brakeman/测试

**Files:**
- 无新文件；仅运行命令。

**Rationale:** CI 只跑 rubocop / brakeman / npm audit，不跑测试。上线前手动跑测试 + 浏览器走完 golden path。

- [ ] **Step 1: 跑全量测试**

```bash
mise exec -- bundle exec rspec
npx vitest run
```

Expected: all green.

- [ ] **Step 2: Lint & security**

```bash
mise exec -- bundle exec rubocop -f github
mise exec -- bundle exec brakeman --no-pager
npm audit --omit=dev 2>&1 | tail
```

Expected: no new offenses，brakeman 0 warnings。

- [ ] **Step 3: 浏览器 golden path**

1. 登录后打开 /tours/:id
2. 点击任一 activity，确认编辑抽屉：
   - 三段 Divider
   - 开始时间打开 picker
   - 时长数字右侧有"分钟"后缀、下面有预设芯片，点击 120 → 数字变 120
   - 详情段「备注」单字段
   - kind 细节（如 scenic 的 `最佳光线` Select、`门票 元`、`需要预约` 在顶）
3. 填 POI 搜索 → 选一个地点 → 名称、地址自动填（无 `📍`）
4. 保存 → 列表看到新 activity → 再次编辑 → 备注字段保留内容
5. 创建新行 → form 为空，无残留

所有步骤无 console error 且 Sentry 无新 issue（MCP 查 `search_issues environment=development`）。

- [ ] **Step 4: Commit（如有最后手动修）**

如果手测发现小问题（比如段标题颜色不够清晰），直接修完 commit：

```bash
git add -p
git commit -m "polish(activity-drawer): <fix details>"
```

否则直接进入 PR 阶段。

- [ ] **Step 5: 推分支 + 开 PR**

```bash
git push -u origin <branch>
gh pr create --title "feat(activity-drawer): B-tier redesign — three sections, proper controls, drop tips" \
  --body "<refer to spec 2026-04-18-activity-drawer-redesign-design.md and tasks in this plan>"
```

---

## Self-Review（plan 自检）

- ✅ Spec coverage：
  - 三段式结构 → Task 6
  - TimeInput → Task 6
  - NumberInput + 后缀 → Task 4 + Task 6
  - 预设芯片 → Task 3 + Task 6（common）+ Task 5（details）
  - Select/Autocomplete 新 kind 选项 → Task 4 + Task 5
  - 合并描述+贴士 → Task 2 + Task 6
  - Drop tips 列 + desc 修复 → Task 1 + Task 2
  - 纯中文无 emoji → 已在 spec 和每个 task 中的文案明示
  - scenic `need_reservation` 置顶 → Task 5
- ✅ 无 TODO / TBD / "etc" 占位
- ✅ 类型一致：`number_with_suffix` / `autocomplete` 在 Task 4 渲染器和 Task 5 schema 两处一致；`DURATION_PRESETS` 在 Task 5 导出为 `DURATION_PRESET_CHIPS`，Task 6 直接 import
- ✅ 验收条件（spec 里的 checklist）都在 Task 7 Step 3 golden path 覆盖

## Execution Handoff

Plan saved to `docs/superpowers/plans/2026-04-18-activity-drawer-redesign.md`.

Two execution options:

**1. Subagent-Driven (recommended)** — dispatch a fresh subagent per task, review between tasks, fast iteration.

**2. Inline Execution** — execute tasks in this session using executing-plans, batch execution with checkpoints.
