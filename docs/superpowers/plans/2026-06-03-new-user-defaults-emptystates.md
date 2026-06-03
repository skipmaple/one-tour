# 默认值 + 空状态 + 不劝退 + 富卡片提示 实现计划（子项目③ / P1-4·P2-6·P2-7）

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

> **提交策略**：本仓库「仅在用户明确要求时才 commit」。每个 Task 末尾的 "Commit" step **默认跳过**。

> **DB 路由（本 worktree 环境）**：dev DB 在 `localhost:5433`（容器 one-tour-postgres），test DB 在 `localhost:5432`（adam-postgres 上的 one_tour_test）。所有 Ruby 命令前缀 `LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8 PATH="$(mise where ruby)/bin:$PATH"`。dev 操作额外加 `DATABASE_URL=postgres://postgres:postgres@localhost:5433/one_tour_development`；test 操作（db:test:prepare / rspec）**不加** DATABASE_URL（走默认 5432）。若任何 rails 命令报 "could not find database"，STOP 上报，别自行建库。

**Goal:** 新活动默认层级 tier_three→tier_two（全来源）、空行程不报机动日违反、空白天给 CTA、编辑器加富卡片提示——降低新用户劝退/困惑。

**Architecture:** 一个非破坏性迁移（`change_column_default` citizen_level 2→1）+ `constitution_check` 空行程守卫 + 编辑器默认/hint + DayColumn 空状态文案。无枚举/存量数据变更。

**Tech Stack:** Rails（migration / 模型 / RSpec）；React + Mantine；Vitest。

参考 spec：`docs/superpowers/specs/2026-06-03-new-user-defaults-emptystates-design.md`

---

## File Structure
- `db/migrate/<ts>_change_activities_citizen_level_default.rb`（新）+ `db/schema.rb`（重生成，default 2→1）。
- `app/models/tour/constitution_check.rb` — `check_buffer_days` 空行程守卫。
- `app/javascript/components/activity-editor/ActivityDrawer.jsx` — EMPTY_FORM_VALUES + edit fallback tier_two。
- `app/javascript/components/activity-editor/CommonFields.jsx` — 富卡片 hint。
- `app/javascript/components/planner/DayColumn.jsx` — 空状态 CTA。
- 测试：`spec/models/activity_spec.rb`、constitution_check spec、`ActivityDrawer.test.jsx`、`DayColumn.test.jsx`。

---

## Task 1: DB 默认 citizen_level → tier_two（迁移）

**Files:** `db/migrate/<ts>_change_activities_citizen_level_default.rb`(新), `db/schema.rb`; Test: `spec/models/activity_spec.rb`

- [ ] **Step 1: 写失败测试**

在 `spec/models/activity_spec.rb` 加（放在合适的 describe 内；用 AR 读 schema 默认，无需 save）：
```ruby
  it "defaults citizen_level to tier_two for a new record" do
    expect(Activity.new.citizen_level).to eq("tier_two")
  end
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd /Users/drewlee/work/personal/one-tour/.claude/worktrees/strange-noyce-4e5387 && LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8 PATH="$(mise where ruby)/bin:$PATH" bundle exec rspec spec/models/activity_spec.rb -e "defaults citizen_level"`
Expected: FAIL（当前默认 tier_three）

- [ ] **Step 3: 生成并填写迁移**

生成（不碰 DB）：
`LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8 PATH="$(mise where ruby)/bin:$PATH" bin/rails g migration ChangeActivitiesCitizenLevelDefault`
把生成文件内容替换为：
```ruby
class ChangeActivitiesCitizenLevelDefault < ActiveRecord::Migration[8.0]
  def up
    change_column_default :activities, :citizen_level, from: 2, to: 1
  end

  def down
    change_column_default :activities, :citizen_level, from: 1, to: 2
  end
end
```
（class 名以生成文件实际为准；`[8.0]` 版本号对齐其它迁移文件。）

- [ ] **Step 4: 迁移 dev + 准备 test DB**

```
cd /Users/drewlee/work/personal/one-tour/.claude/worktrees/strange-noyce-4e5387
LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8 PATH="$(mise where ruby)/bin:$PATH" DATABASE_URL=postgres://postgres:postgres@localhost:5433/one_tour_development bin/rails db:migrate
LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8 PATH="$(mise where ruby)/bin:$PATH" bin/rails db:test:prepare
```
第一条迁移 dev（5433）并重生成 `db/schema.rb`（第 49 行 `citizen_level` 变 `default: 1`）。第二条把新 schema 载入 test DB（5432）。确认 `db/schema.rb` 的 citizen_level 现为 `default: 1`，且 schema version 行更新。

- [ ] **Step 5: 跑测试确认通过**

Run: `LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8 PATH="$(mise where ruby)/bin:$PATH" bundle exec rspec spec/models/activity_spec.rb`
Expected: PASS（新默认 tier_two + 全部旧用例）。
（若旧用例里有断言 citizen_level 默认 tier_three 的，按新默认更新；road 强制 tier_one 的用例不受影响。）

- [ ] **Step 6: Commit（默认跳过）** `git commit -m "feat(db): default citizen_level to tier_two (想去)"`

---

## Task 2: 空行程不报机动日违反

**Files:** `app/models/tour/constitution_check.rb`; Test: constitution_check spec

- [ ] **Step 1: 写失败测试**

先定位现有 constitution check 的 spec（`grep -rln 'min_buffer_days\|check_buffer_days\|机动' spec/` —— 很可能是 `spec/models/tour/constitution_check_spec.rb` 或 `spec/models/concerns/constitution_spec.rb`）。在其中加（用既有 factory；min_buffer_days 默认 ≥1）：
```ruby
    it "does not flag min_buffer_days on an empty tour (no activities)" do
      tour = create(:tour)  # 全新空行程，0 活动，默认 min_buffer_days >= 1
      results = tour.constitution_violations  # ← 用该 spec 既有的"取违反列表"入口
      expect(results.map(&:rule)).not_to include(:min_buffer_days)
    end

    it "flags min_buffer_days once the tour has an activity but too few buffer days" do
      tour = create(:tour)
      day = tour.days.first
      create(:activity, tour: tour, day: day)
      results = tour.constitution_violations
      expect(results.map(&:rule)).to include(:min_buffer_days)
    end
```
（`constitution_violations` 的真实入口名以该 spec 既有调用为准——可能是 `tour.constitution_check`/`ConstitutionCheck.new(tour).violations` 等；对齐文件里现有写法。`Violation#rule` 是 symbol。）

- [ ] **Step 2: 跑测试确认失败**

Run: `LANG=... PATH="$(mise where ruby)/bin:$PATH" bundle exec rspec <该 spec 路径> -e "min_buffer_days"`
Expected: 第一条 FAIL（空行程仍报 min_buffer_days）。

- [ ] **Step 3: 实现守卫**

`app/models/tour/constitution_check.rb` 的 `check_buffer_days`（约 53 行）开头加一行：
```ruby
    def check_buffer_days
      return nil if @tour.activities.empty?
      limit = @rules[:min_buffer_days]
      actual = @tour.buffer_days_count
      return nil if actual >= limit
      Violation.new(
        level: :soft,
        rule: :min_buffer_days,
        scope: {},
        message: "整程 #{actual} 个机动日（建议 ≥ #{limit}）",
        suggestion: "新增一个 buffer_day=true 的 Day"
      )
    end
```

- [ ] **Step 4: 跑测试确认通过**

Run: `LANG=... PATH="$(mise where ruby)/bin:$PATH" bundle exec rspec <该 spec 路径>`
Expected: PASS（空行程无 min_buffer_days；加活动后恢复 + 全部旧用例）。

- [ ] **Step 5: Commit（默认跳过）** `git commit -m "feat(constitution): don't flag min_buffer_days on an empty tour"`

---

## Task 3: 编辑器默认 tier_two + 富卡片 hint

**Files:** `ActivityDrawer.jsx`, `CommonFields.jsx`; Test: `ActivityDrawer.test.jsx`

- [ ] **Step 1: 写失败测试**

在 `ActivityDrawer.test.jsx` 加（match 既有 renderDrawer/props）：
```js
  it('new-activity create defaults 重点层级 to 想去 (tier_two)', async () => {
    renderDrawer({})   // create mode (no activity) — match the file's create-mode render
    // the 想去 radio is selected by default
    expect(await screen.findByRole('radio', { name: '想去' })).toBeChecked()
  })

  it('shows the 高德选点 rich-card hint in the location section', async () => {
    renderDrawer({})
    expect(await screen.findByText(/用高德搜索选点/)).toBeInTheDocument()
  })
```
（create-mode render：用该文件打开"新建"抽屉的既有方式；若 create 默认不在基础 tab，确保 CommonFields 渲染。`getByRole('radio', {name:'想去'})` 依赖 ②已把 tier_two 标签改为「想去」。）

- [ ] **Step 2: 跑测试确认失败**

Run: `npx vitest run app/javascript/components/activity-editor/__tests__/ActivityDrawer.test.jsx -t "想去\|高德选点"`
Expected: FAIL（默认仍 tier_three「备选」；无 hint）。

- [ ] **Step 3: 实现**

(a) `ActivityDrawer.jsx`：
- 第 17 行 `citizen_level: 'tier_three',` → `citizen_level: 'tier_two',`
- 第 62 行 `citizen_level: activity.citizen_level || 'tier_three',` → `|| 'tier_two',`

(b) `CommonFields.jsx`：在 `LocationPicker` 块（约 110-139，`{... && (<LocationPicker … />)}`）之后、名称 `<TextInput label="名称" …>`（约 140）之前，插入一行 hint：
```jsx
      <Text size="xs" c="dimmed">用高德搜索选点，可自动带评分、营业时间、照片</Text>
```
（`Text` 已在第 1 行 import。）

- [ ] **Step 4: 跑测试确认通过**

Run: `npx vitest run app/javascript/components/activity-editor/__tests__/ActivityDrawer.test.jsx`
Expected: PASS（2 新 + 旧；注意若旧用例断言 create 默认 tier_three/备选，按 tier_two/想去 更新——create payload 默认值的旧测试同理）。

- [ ] **Step 5: Commit（默认跳过）** `git commit -m "feat(editor): default 想去 + 高德选点 rich-card hint"`

---

## Task 4: 空白天 CTA

**Files:** `DayColumn.jsx`; Test: `DayColumn.test.jsx`

- [ ] **Step 1: 写失败测试**

在 `DayColumn.test.jsx` 加：
```js
test('empty day (not filtering) shows a drag/add CTA, not bare 空', () => {
  renderDayColumn({ day: { id: 1, day_index: 1, intensity_derived: 'green' }, activities: [], filterActive: false })
  expect(screen.getByText(/把候选拖到这里/)).toBeInTheDocument()
})
```
（用既有 renderDayColumn helper。）

- [ ] **Step 2: 跑测试确认失败**

Run: `npx vitest run app/javascript/components/planner/__tests__/DayColumn.test.jsx -t "drag/add CTA"`
Expected: FAIL（当前只显「空」）。

- [ ] **Step 3: 实现**

`DayColumn.jsx` 空状态（约 252-254）：
```jsx
        {activities.length === 0 && !filterActive && (
          <Text size="xs" c="dimmed" ta="center" mt="md">空</Text>
        )}
```
→
```jsx
        {activities.length === 0 && !filterActive && (
          <Text size="xs" c="dimmed" ta="center" mt="md" px="xs">把候选拖到这里，或用下方「+ 加一个」</Text>
        )}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `npx vitest run app/javascript/components/planner/__tests__/DayColumn.test.jsx`
Expected: PASS（新 + 旧；若旧用例断言空状态文本是「空」，更新为新文案或断 `把候选拖到这里`）。

- [ ] **Step 5: Commit（默认跳过）** `git commit -m "feat(planner): inviting CTA for an empty day column"`

---

## Task 5: 全量验证

- [ ] **Step 1: 后端**

Run: `cd /Users/drewlee/work/personal/one-tour/.claude/worktrees/strange-noyce-4e5387 && LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8 PATH="$(mise where ruby)/bin:$PATH" bundle exec rspec && PATH="$(mise where ruby)/bin:$PATH" bin/rubocop -f github db/migrate app/models/tour/constitution_check.rb db/schema.rb`
Expected: rspec 全绿（含新默认/违反用例）；rubocop 干净（schema.rb 若报数组括号空格用 `bin/rubocop -A db/schema.rb` 按仓库约定修）。

- [ ] **Step 2: 前端 + 构建门禁**

Run: `npm test && npx vite build && bash scripts/verify-sw-rewrite-patterns.sh`
Expected: vitest 全绿 + build OK + SW exit 0。

- [ ] **Step 3: 实地自测（:9000，dev=5433）**

- 新建活动：默认层级是「想去」+ 看到「用高德搜索选点…」hint。
- 全新空行程：不再报黄色「机动日」软提示。
- 空白天列显「把候选拖到这里…」而非「空」。
- AI/手动加的点默认「想去」，卡片中性不挂标签。

- [ ] **Step 4: Commit（默认跳过；最终由用户统一提交/开 PR）**

---

## Self-Review

**1. Spec coverage：** §1 默认 tier_two 全来源 → T1（DB 迁移）+ T3（编辑器默认+fallback）✓；§2 空行程违反 → T2 ✓；§3 空白天 CTA → T4 ✓；§4 富卡片 hint → T3 ✓。非目标（不 backfill、不动 pickMeta 可选、不自动富集）未触及 ✓。

**2. Placeholder scan：** 各 step 有完整代码/命令。两处标注"以 spec 既有调用/helper 为准"（constitution_violations 入口名、renderDrawer create 方式）——因测试文件有既有约定，附了对齐指引；非占位。

**3. 一致性：** citizen_level 默认 tier_two 在 DB(schema default 1)/编辑器(EMPTY_FORM_VALUES)/fallback 三处一致；「想去」标签来自 ②（CITIZEN_LEVEL_OPTIONS tier_two=想去），T3 测试的 `想去` radio 名依赖 ②已落地（②已完成）✓；迁移 up/down 对称。
