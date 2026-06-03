# Onboarding 重构 实现计划（子项目① / P0）

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **提交策略（用户规则覆盖模板）**：本仓库「仅在用户明确要求时才 commit」。每个 Task 末尾的 "Commit" step **默认跳过**，攒到用户发话统一提交；执行时把它当"一个可提交单元"的标记。

**Goal:** 把新用户首次落地从"强制宪法墙"改为"可跳过设置 + AI 主动开场"，并给行程一个唯一默认名、把日期范围摊到每天。

**Architecture:** 就地改 `ConstitutionDrawer`（可关 + 「用推荐设置开始」express + 日期摊到每天）、`Show.jsx`（删锁死遮罩 + 抽屉恒可关 + AI 开场移到关闭时 + skip 写本地标记 + 删冲突 toast）、`Tour` 模型（空 title 兜底唯一名）。日期摊用现有 `DaysController`（create/update 均允许 `:date`），纯前端逐天 POST/PATCH。

**Tech Stack:** Rails（Tour 模型 + RSpec）；React + Mantine（ConstitutionDrawer/Show.jsx）；Vitest + @testing-library；`postJson`（fetch）+ Inertia `router`。

参考 spec：`docs/superpowers/specs/2026-06-02-onboarding-redesign-design.md`

---

## File Structure

- `app/models/tour.rb` — `before_validation :assign_default_title`（空 title → `未命名旅程 MM-DD [(N)]`，作者维度唯一）。
- `app/javascript/components/planner/tourSetupHelpers.js` — 新增纯函数 `dayDateISO(start, dayIndex)`。
- `app/javascript/components/planner/ConstitutionDrawer.jsx` — `canDismiss=true`；抽取 `persistStep1`（含日期摊）；`startWithDefaults` + 「用推荐设置开始」按钮；新增 `days` prop；删 accept 的冲突 toast。
- `app/javascript/pages/Tour/Show.jsx` — 删锁死遮罩；移动 `<Drawer>` 恒可关；`handleConstClose`（写本地标记 + 关闭 + 触发 AI）；`maybeStartOnboarding` + `aiOnboardingStartedRef`；两处 ConstitutionDrawer 传 `days` + `onClose={handleConstClose}`。
- 测试：`spec/models/tour_spec.rb`、`tourSetupHelpers.test.js`、`ConstitutionDrawer.test.jsx`、`Show.test.jsx`。

---

## Task 1: Tour 唯一默认程名（后端）

**Files:**
- Modify: `app/models/tour.rb:13-22`
- Test: `spec/models/tour_spec.rb`

- [ ] **Step 1: 写失败测试**

在 `spec/models/tour_spec.rb` 的 `RSpec.describe Tour do` 内、第一个 `describe` 之前（约第 3 行后）插入：

```ruby
  describe "default title (blank → unique per author)" do
    let(:author) { create(:user) }
    let(:mmdd) { Date.current.strftime("%m-%d") }

    it "assigns 未命名旅程 MM-DD when title is blank" do
      t = create(:tour, author: author, title: "")
      expect(t.title).to eq("未命名旅程 #{mmdd}")
    end

    it "suffixes (2), (3) for same-author same-day collisions" do
      create(:tour, author: author, title: "")
      t2 = create(:tour, author: author, title: "")
      t3 = create(:tour, author: author, title: "")
      expect(t2.title).to eq("未命名旅程 #{mmdd} (2)")
      expect(t3.title).to eq("未命名旅程 #{mmdd} (3)")
    end

    it "reuses the first free gap after a delete" do
      create(:tour, author: author, title: "")
      t2 = create(:tour, author: author, title: "")
      create(:tour, author: author, title: "")
      t2.destroy!
      t4 = create(:tour, author: author, title: "")
      expect(t4.title).to eq("未命名旅程 #{mmdd} (2)")
    end

    it "does not overwrite a provided title" do
      t = create(:tour, author: author, title: "新疆环线")
      expect(t.title).to eq("新疆环线")
    end

    it "is scoped per author (other authors don't bump the suffix)" do
      create(:tour, author: author, title: "")
      other = create(:tour, author: create(:user), title: "")
      expect(other.title).to eq("未命名旅程 #{mmdd}")
    end
  end
```

- [ ] **Step 2: 跑测试确认失败**

Run: `LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8 PATH="$(mise where ruby)/bin:$PATH" bundle exec rspec spec/models/tour_spec.rb -e "default title"`
Expected: FAIL（空 title 现在存为 `""`，不等于 `未命名旅程 MM-DD`）

- [ ] **Step 3: 实现**

`app/models/tour.rb`：把第 13-22 行（title 注释 + `validates` + 两个 callback）替换为：

```ruby
  # Title is auto-filled when blank: a fresh tour (created with empty title via
  # the onboarding flow) gets a unique-per-author default "未命名旅程 MM-DD"
  # (with a " (N)" suffix on same-day collisions) so the tour list never shows
  # a wall of identical "未命名旅程". `before_validation` runs before the
  # presence validation below, so accepted tours always have a real title.
  before_validation :assign_default_title, if: -> { title.blank? }
  validates :title, presence: true, if: :constitution_accepted?

  before_create :seed_constitution_defaults
  after_create_commit :seed_first_day
```

并在 `private`（约第 95 行 `private` 之后）加入方法：

```ruby
    def assign_default_title
      return if author.nil?
      d = (created_at || Time.current).to_date
      base = "未命名旅程 #{d.strftime('%m-%d')}"
      taken = author.tours.where.not(id: id)
                    .where("title LIKE ?", "#{base}%").pluck(:title)
      self.title =
        if taken.exclude?(base)
          base
        else
          n = 2
          n += 1 while taken.include?("#{base} (#{n})")
          "#{base} (#{n})"
        end
    end
```

- [ ] **Step 4: 跑测试确认通过**

Run: `LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8 PATH="$(mise where ruby)/bin:$PATH" bundle exec rspec spec/models/tour_spec.rb`
Expected: PASS（5 个新 case + 全部旧 case）

- [ ] **Step 5: Commit（默认跳过）**

```bash
git add app/models/tour.rb spec/models/tour_spec.rb
git commit -m "feat(tour): unique default title 未命名旅程 MM-DD when blank"
```

---

## Task 2: `dayDateISO` 纯函数（日期摊的计算）

**Files:**
- Modify: `app/javascript/components/planner/tourSetupHelpers.js`（文件末尾追加导出）
- Test: `app/javascript/components/planner/__tests__/tourSetupHelpers.test.js`

- [ ] **Step 1: 写失败测试**

在 `tourSetupHelpers.test.js` 末尾（最后一个 `})` 之前的顶层）追加：

```js
import { dayDateISO } from '../tourSetupHelpers'

describe('dayDateISO', () => {
  it('day 1 equals the start date', () => {
    expect(dayDateISO('2026-06-10', 1)).toBe('2026-06-10')
  })
  it('day N = start + (N-1) days', () => {
    expect(dayDateISO('2026-06-10', 3)).toBe('2026-06-12')
  })
  it('rolls over month boundaries', () => {
    expect(dayDateISO('2026-06-29', 3)).toBe('2026-07-01')
  })
  it('returns null for an unparseable start', () => {
    expect(dayDateISO(null, 1)).toBeNull()
  })
})
```

（若文件顶部已有 `import { … } from '../tourSetupHelpers'`，把 `dayDateISO` 并入那一行，删掉上面这条单独 import。）

- [ ] **Step 2: 跑测试确认失败**

Run: `cd /Users/drewlee/work/personal/one-tour/.claude/worktrees/strange-noyce-4e5387 && npx vitest run app/javascript/components/planner/__tests__/tourSetupHelpers.test.js -t dayDateISO`
Expected: FAIL（`dayDateISO is not a function`）

- [ ] **Step 3: 实现**

在 `tourSetupHelpers.js` 末尾追加（紧接 `parseTourDateRange` 之后）：

```js
// Date of day N (1-based) given a range start (ISO string or Date):
// start + (dayIndex - 1) days, formatted "YYYY-MM-DD". null if start invalid.
export function dayDateISO(start, dayIndex) {
  const base = (typeof start === 'string') ? new Date(start) : start
  if (!base || isNaN(base)) return null
  const d = new Date(base.getTime())
  d.setDate(d.getDate() + (dayIndex - 1))
  return formatDateISO(d)
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `npx vitest run app/javascript/components/planner/__tests__/tourSetupHelpers.test.js`
Expected: PASS

- [ ] **Step 5: Commit（默认跳过）**

```bash
git add app/javascript/components/planner/tourSetupHelpers.js app/javascript/components/planner/__tests__/tourSetupHelpers.test.js
git commit -m "feat(setup): dayDateISO helper for spreading date range over days"
```

---

## Task 3: 宪法抽屉可关（去墙）

**Files:**
- Modify: `app/javascript/components/planner/ConstitutionDrawer.jsx:47-50`
- Modify: `app/javascript/pages/Tour/Show.jsx:489`、`:531-546`
- Test: `app/javascript/components/planner/__tests__/ConstitutionDrawer.test.jsx`、`app/javascript/pages/Tour/__tests__/Show.test.jsx`

- [ ] **Step 1: 写失败测试（ConstitutionDrawer 可关 + Show 无遮罩）**

`ConstitutionDrawer.test.jsx` 末尾（最后一个顶层 `})` 之前）追加（`renderDrawer` 等既有 helper 名以该文件实际为准；若没有统一 helper，用 `render(<MantineProvider><ModalsProvider><DatesProvider><ConstitutionDrawer {...props}/></DatesProvider></ModalsProvider></MantineProvider>)` 包裹）：

```js
describe('dismissible in onboarding (skippable gate)', () => {
  const onboardingTour = {
    id: 1, title: '', constitution: { max_daily_driving_minutes: 420 },
    constitution_accepted: false, date_range: null, team_size: null,
  }
  function renderOnboarding(extra = {}) {
    const onClose = vi.fn()
    render(
      <MantineProvider><ModalsProvider><DatesProvider>
        <ConstitutionDrawer
          tour={onboardingTour} violations={[]} defaults={{ max_daily_driving_minutes: 420 }}
          initialDaysCount={1} canEdit days={[{ id: 10, day_index: 1 }]}
          width={400} onWidthChange={() => {}} onClose={onClose}
          onFix={() => {}} onAcknowledge={() => {}} {...extra}
        />
      </DatesProvider></ModalsProvider></MantineProvider>
    )
    return { onClose }
  }

  it('shows the × close button even before accepting', () => {
    renderOnboarding()
    expect(screen.getByLabelText('关闭')).toBeInTheDocument()
  })

  it('× click calls onClose', async () => {
    const { onClose } = renderOnboarding()
    await userEvent.click(screen.getByLabelText('关闭'))
    expect(onClose).toHaveBeenCalled()
  })
})
```

在 `Show.test.jsx` 末尾追加（沿用该文件的 `renderShow`/props 构造方式；fresh tour = constitution_accepted false、空 days/activities）：

```js
test('no locking onboarding backdrop (gate is skippable)', () => {
  renderShow({ tour: freshTour(), days: [], activities: [] })
  expect(screen.queryByTestId('onboarding-backdrop')).toBeNull()
})
```

（`freshTour()` / `renderShow()`：若 Show.test 已有工厂就复用；否则按文件现有 props 形状构造一个 `constitution_accepted: false` 的 tour。）

- [ ] **Step 2: 跑测试确认失败**

Run: `npx vitest run app/javascript/components/planner/__tests__/ConstitutionDrawer.test.jsx -t "dismissible" && npx vitest run app/javascript/pages/Tour/__tests__/Show.test.jsx -t "backdrop"`
Expected: FAIL（当前 onboarding 下无 × 按钮；Show 渲染出 `onboarding-backdrop`）

- [ ] **Step 3: 实现**

(a) `ConstitutionDrawer.jsx` 第 47-50 行（`canDismiss` 定义）替换为：

```js
  // Gate is skippable: the drawer is always dismissible (× / ESC / click-out),
  // even before "同意". `onboarded` still drives the title/content branching
  // below, but no longer locks interaction.
  const canDismiss = true
```

(b) `Show.jsx` 第 489 行移动端 `<Drawer …>`：把 `withCloseButton={!inOnboarding} closeOnEscape={!inOnboarding} closeOnClickOutside={!inOnboarding}` 改为 `withCloseButton closeOnEscape closeOnClickOutside`（三者恒真；`title={inOnboarding ? '设置这次旅程' : '出行宪法'}` 保留不变）。

(c) `Show.jsx` 第 531-546 行的锁死遮罩整块删除：

```jsx
          {inOnboarding && (
            <div
              style={{ /* …cursor:not-allowed… */ }}
              data-testid="onboarding-backdrop"
            />
          )}
```

（`inOnboarding`（第 393 行）保留——仍被第 489 行的标题用到。）

- [ ] **Step 4: 跑测试确认通过**

Run: `npx vitest run app/javascript/components/planner/__tests__/ConstitutionDrawer.test.jsx app/javascript/pages/Tour/__tests__/Show.test.jsx`
Expected: PASS

- [ ] **Step 5: Commit（默认跳过）**

```bash
git add app/javascript/components/planner/ConstitutionDrawer.jsx app/javascript/pages/Tour/Show.jsx app/javascript/components/planner/__tests__/ConstitutionDrawer.test.jsx app/javascript/pages/Tour/__tests__/Show.test.jsx
git commit -m "feat(onboarding): make constitution gate dismissible (remove lock)"
```

---

## Task 4: 「用推荐设置开始」express + 日期摊到每天

**Files:**
- Modify: `app/javascript/components/planner/ConstitutionDrawer.jsx`（import、props、`persistStep1`/`saveStep1`/`startWithDefaults`、Step1 footer）
- Modify: `app/javascript/pages/Tour/Show.jsx`（两处 ConstitutionDrawer 传 `days`）
- Test: `app/javascript/components/planner/__tests__/ConstitutionDrawer.test.jsx`

- [ ] **Step 1: 写失败测试**

`ConstitutionDrawer.test.jsx` 顶部 mock 区**部分 mock** `tourSetupHelpers`（保留真实纯函数，仅替换 `postJson`）：

```js
const postJsonMock = vi.fn(() => Promise.resolve({ ok: true }))
vi.mock('../tourSetupHelpers', async (orig) => ({
  ...(await orig()),
  postJson: (...a) => postJsonMock(...a),
}))
```

新增 describe（复用上面的 `renderOnboarding`，但带日期范围与多天）：

```js
describe('express + date spread', () => {
  beforeEach(() => { postJsonMock.mockClear(); postMock.mockClear() })

  it('renders 用推荐设置开始 button in step 1', () => {
    renderOnboarding()
    expect(screen.getByText('用推荐设置开始')).toBeInTheDocument()
  })

  it('用推荐设置开始 persists then accepts (router.post to accept)', async () => {
    renderOnboarding()
    await userEvent.click(screen.getByText('用推荐设置开始'))
    // persistStep1 PATCHes the tour (no 程名 required)
    expect(postJsonMock).toHaveBeenCalledWith('/tours/1', 'PATCH', expect.anything())
    // then acceptConstitution → Inertia router.post to accept endpoint
    expect(postMock).toHaveBeenCalledWith('/tours/1/constitution/accept', {}, expect.anything())
  })

  it('下一步 spreads the date range onto existing days (PATCH date)', async () => {
    // tourDays=2 implied by a 2-day range; existing day 10 = D1
    renderOnboarding({
      tour: { ...onboardingTour, date_range: '2026-06-10 ~ 2026-06-11' },
      initialDaysCount: 1, days: [{ id: 10, day_index: 1 }],
    })
    // give it a title so 下一步 passes its required-title check
    await userEvent.type(screen.getByLabelText('程名'), '测试程')
    await userEvent.click(screen.getByText('下一步 →'))
    // existing D1 gets PATCHed with its date
    expect(postJsonMock).toHaveBeenCalledWith('/tours/1/days/10', 'PATCH', { day: { date: '2026-06-10' } })
    // the 2nd day is created WITH a date
    expect(postJsonMock).toHaveBeenCalledWith('/tours/1/days', 'POST', { day: { day_index: 2, date: '2026-06-11' } })
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npx vitest run app/javascript/components/planner/__tests__/ConstitutionDrawer.test.jsx -t "express + date spread"`
Expected: FAIL（无「用推荐设置开始」按钮；saveStep1 不摊日期）

- [ ] **Step 3: 实现**

(a) `ConstitutionDrawer.jsx` 第 16-18 行 import 加入 `dayDateISO`：

```js
import {
  postJson, formatDateISO, todayLocal, detectDateDaysConflict, parseTourDateRange, dayDateISO,
} from './tourSetupHelpers'
```

(b) 组件签名（第 37-42 行）加 `days = []` prop：

```js
export default function ConstitutionDrawer({
  tour, violations, defaults, overrides = [], initialDaysCount = 1,
  canEdit = true,
  mobile = false,
  days = [],
  width, onWidthChange, onClose, onFix, onAcknowledge,
}) {
```

(c) 抽取 `persistStep1`（含日期摊），改写 `saveStep1`，新增 `startWithDefaults`。把现有 `saveStep1`（第 196-240 行）整体替换为：

```js
  // Persist step-1 metadata + constitution + days. No title guard (express path
  // allows blank → backend fills a unique default). Spreads the date range onto
  // every day when a start date is present.
  const persistStep1 = async () => {
    const [startDate, endDate] = tourDateRange
    const s = formatDateISO(startDate)
    const e = formatDateISO(endDate)
    const dateRangeStr = (s && e) ? `${s} ~ ${e}` : null
    const newTitle = tourTitle.trim()

    await postJson(`/tours/${tour.id}`, 'PATCH', {
      tour: { title: newTitle, date_range: dateRangeStr, team_size: tourTeamSize || null },
    })
    await postJson(`/tours/${tour.id}/constitution`, 'PATCH', { constitution: c })

    const currentDayCount = initialDaysCount || 1
    const targetDayCount = tourDays || 1
    for (let i = currentDayCount + 1; i <= targetDayCount; i++) {
      const day = { day_index: i }
      if (s) day.date = dayDateISO(s, i)
      await postJson(`/tours/${tour.id}/days`, 'POST', { day })
    }
    if (s) {
      for (const d of days) {
        await postJson(`/tours/${tour.id}/days/${d.id}`, 'PATCH', { day: { date: dayDateISO(s, d.day_index) } })
      }
    }

    // saveStep1 uses fetch (not Inertia) so tour props don't reload; sync the
    // browser title for the AppShell header observer.
    if (typeof document !== 'undefined' && newTitle) document.title = newTitle
  }

  const saveStep1 = async () => {
    if (!tourTitle.trim()) {
      notifications.show({ message: '请先填写程名', color: 'red' })
      return
    }
    if (isSaving) return
    setIsSaving(true)
    try {
      await persistStep1()
      setSetupStep(2)
    } catch (err) {
      notifications.show({ message: `保存失败：${err.message}`, color: 'red' })
      Sentry.captureException(err, { tags: { area: 'tour_setup', op: 'save_params' }, extra: { tour_id: tour.id } })
    } finally {
      setIsSaving(false)
    }
  }

  // Express: accept defaults (blank fields OK) and start planning immediately.
  const startWithDefaults = async () => {
    if (isSaving || isAccepting) return
    setIsSaving(true)
    try {
      await persistStep1()
    } catch (err) {
      notifications.show({ message: `保存失败：${err.message}`, color: 'red' })
      Sentry.captureException(err, { tags: { area: 'tour_setup', op: 'express' }, extra: { tour_id: tour.id } })
      setIsSaving(false)
      return
    }
    setIsSaving(false)
    acceptConstitution()
  }
```

(d) Step1 footer（第 459-466 行 `} else if (setupStep === 1) { … }`）替换为：

```js
  } else if (setupStep === 1) {
    footerCta = (
      <Group justify="space-between">
        <Button variant="subtle" onClick={startWithDefaults} loading={isSaving} disabled={isSaving || isAccepting}>
          用推荐设置开始
        </Button>
        <Button onClick={saveStep1} loading={isSaving} disabled={isSaving} fullWidth={mobile} size={mobile ? 'md' : undefined}>
          {isSaving ? '保存中…' : '下一步 →'}
        </Button>
      </Group>
    )
```

(e) `Show.jsx`：两处 `<ConstitutionDrawer …>`（移动端约第 490 行、桌面约第 517 行）各加一行 `days={days}`（`days` 在 Show.jsx 作用域已有，第 522 行 `initialDaysCount={days.length || 1}` 即用它）。

- [ ] **Step 4: 跑测试确认通过**

Run: `npx vitest run app/javascript/components/planner/__tests__/ConstitutionDrawer.test.jsx`
Expected: PASS（新 3 case + 全部旧 case）

- [ ] **Step 5: Commit（默认跳过）**

```bash
git add app/javascript/components/planner/ConstitutionDrawer.jsx app/javascript/pages/Tour/Show.jsx app/javascript/components/planner/__tests__/ConstitutionDrawer.test.jsx
git commit -m "feat(onboarding): 用推荐设置开始 express + spread date range onto days"
```

---

## Task 5: AI 主动开场 + 去 toast + skip 写标记

**Files:**
- Modify: `app/javascript/components/planner/ConstitutionDrawer.jsx:242-257`（删 toast）
- Modify: `app/javascript/pages/Tour/Show.jsx`（`maybeStartOnboarding` + `aiOnboardingStartedRef` + `handleConstClose`；Effect B 改调用；两处/三处 onClose 改 `handleConstClose`）
- Test: `app/javascript/components/planner/__tests__/ConstitutionDrawer.test.jsx`、`app/javascript/pages/Tour/__tests__/Show.test.jsx`

- [ ] **Step 1: 写失败测试**

`ConstitutionDrawer.test.jsx`：在 express describe 内追加：

```js
  it('accept does NOT show the old 从候选池加点 toast', async () => {
    const { notifications } = await import('@mantine/notifications')
    renderOnboarding()
    await userEvent.click(screen.getByText('用推荐设置开始'))
    // acceptConstitution onSuccess runs via the mocked router; assert no manual-add toast text ever shown
    const calls = notifications.show.mock.calls.map(c => c[0]?.message || '')
    expect(calls.some(m => m.includes('从左侧候选池'))).toBe(false)
  })
```

`Show.test.jsx`：增强 ConstitutionDrawer stub 以暴露 onClose，并加两个触发用例。把第 48-50 行的 stub 替换为：

```js
vi.mock('../../../components/planner/ConstitutionDrawer', () => ({
  default: (props) => (
    <button data-testid="const-close" onClick={props.onClose}>close</button>
  ),
}))
```

追加用例（`freshTour()` = `constitution_accepted:false`；`onboardedTour()` = `constitution_accepted:true`；空 activities/空对话）：

```js
test('AI onboarding fires on mount for an already-onboarded empty tour', () => {
  chatPanelProps.pendingPrompt = undefined
  renderShow({ tour: onboardedTour(), days: [], activities: [], conversation_empty: true })
  expect(chatPanelProps.pendingPrompt).toBe(ONBOARDING_SENTINEL)
})

test('AI onboarding fires after closing the gate on a fresh empty tour', async () => {
  chatPanelProps.pendingPrompt = undefined
  renderShow({ tour: freshTour(), days: [], activities: [], conversation_empty: true })
  // fresh tour: not fired yet on mount (not onboarded)
  expect(chatPanelProps.pendingPrompt).toBeUndefined()
  await userEvent.click(screen.getByTestId('const-close'))
  expect(chatPanelProps.pendingPrompt).toBe(ONBOARDING_SENTINEL)
})
```

在 `Show.test.jsx` 顶部 import 加 `import { ONBOARDING_SENTINEL } from '../../../lib/onboarding'` 和 `import userEvent from '@testing-library/user-event'`（若未导入）。

- [ ] **Step 2: 跑测试确认失败**

Run: `npx vitest run app/javascript/pages/Tour/__tests__/Show.test.jsx -t "AI onboarding" && npx vitest run app/javascript/components/planner/__tests__/ConstitutionDrawer.test.jsx -t "toast"`
Expected: FAIL（fresh tour 关闭后未触发；旧 toast 仍可能出现）

- [ ] **Step 3: 实现**

(a) `ConstitutionDrawer.jsx` `acceptConstitution`（第 242-257 行）删掉 toast，保留 localStorage + onClose：

```js
  const acceptConstitution = () => {
    setIsAccepting(true)
    router.post(`/tours/${tour.id}/constitution/accept`, {}, {
      preserveScroll: true,
      onSuccess: () => {
        localStorage.setItem(onboardedKey(tour.id), '1')
        onClose()
      },
      onFinish: () => setIsAccepting(false),
    })
  }
```

（`notifications` 若变为未使用会触发 lint：它在 `saveStep1`/`startWithDefaults` 错误分支仍用到，保留 import。）

(b) `Show.jsx`：在 `constOpen` 的 `useDisclosure` 之后（约第 152 行）+ 现有 effects 之前，加：

```js
  const aiOnboardingStartedRef = useRef(false)
  const maybeStartOnboarding = useCallback(() => {
    if (!canEdit) return
    if (aiOnboardingStartedRef.current) return
    if (activities.length === 0 && conversation_empty) {
      aiOnboardingStartedRef.current = true
      setPendingChatPrompt(ONBOARDING_SENTINEL)
    }
  }, [canEdit, activities.length, conversation_empty])

  const handleConstClose = useCallback(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem(`onboarded:tour:${tour.id}`, '1')
    }
    closeConst()
    maybeStartOnboarding()
  }, [closeConst, maybeStartOnboarding, tour.id])
```

（确保 `useRef`、`useCallback` 已在第 1 行 React import 内。）

(c) 把 mount 时的 AI 触发（Effect B，第 337-344 行）改为复用 `maybeStartOnboarding`（带 ref 守卫，避免与关闭触发重复）：

```js
  useEffect(() => {
    const alreadyOnboardedLocally = typeof window !== 'undefined'
      && localStorage.getItem(`onboarded:tour:${tour.id}`) === '1'
    const constitutionDone = tour.constitution_accepted || alreadyOnboardedLocally
    if (constitutionDone) maybeStartOnboarding()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
```

(d) 把传给 ConstitutionDrawer 的 `onClose`、以及移动端 `<Drawer onClose=…>` 全部从 `closeConst` 改为 `handleConstClose`：
- 第 489 行 `<Drawer opened onClose={closeConst} …>` → `onClose={handleConstClose}`
- 第 499 行（移动端 ConstitutionDrawer）`onClose={closeConst}` → `onClose={handleConstClose}`
- 第 526 行（桌面 ConstitutionDrawer）`onClose={closeConst}` → `onClose={handleConstClose}`

（header 上的「宪法」按钮 `onOpenConst={openConst}` 不变——重开宪法用于事后查看/修宪，不应触发 AI 开场；它走 openConst，关闭走 handleConstClose 时已 onboarded，maybeStartOnboarding 的 ref/条件会自然不重复触发。）

- [ ] **Step 4: 跑测试确认通过**

Run: `npx vitest run app/javascript/pages/Tour/__tests__/Show.test.jsx app/javascript/components/planner/__tests__/ConstitutionDrawer.test.jsx`
Expected: PASS

- [ ] **Step 5: Commit（默认跳过）**

```bash
git add app/javascript/pages/Tour/Show.jsx app/javascript/components/planner/ConstitutionDrawer.jsx app/javascript/pages/Tour/__tests__/Show.test.jsx app/javascript/components/planner/__tests__/ConstitutionDrawer.test.jsx
git commit -m "feat(onboarding): AI auto-greet on gate close, drop conflicting toast"
```

---

## Task 6: 全量验证 + 实地自测

- [ ] **Step 1: 后端**

Run: `LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8 PATH="$(mise where ruby)/bin:$PATH" bundle exec rspec spec/models/tour_spec.rb && PATH="$(mise where ruby)/bin:$PATH" bin/rubocop -f github app/models/tour.rb`
Expected: rspec 绿 + rubocop 干净

- [ ] **Step 2: 全量 vitest + 构建门禁**

Run: `npm test && npx vite build && bash scripts/verify-sw-rewrite-patterns.sh`
Expected: vitest 全绿（在 693 基础上新增本计划用例）+ build OK + SW 校验 exit 0

- [ ] **Step 3: 实地自测（:9000，DB→5433）**

新建一个全新行程：
- 落地不再锁死，宪法抽屉可 ×/ESC/点外关闭。
- 点「用推荐设置开始」→ 直接进 planner、AI 主动开场、无「从候选池加点」toast。
- 不填程名也能开始；列表里显示「未命名旅程 06-02」，再建一个显示「(2)」。
- 走「下一步」并填日期范围 → 每天带上日期（D1=起点、D2=+1…）。

- [ ] **Step 4: Commit（默认跳过；最终由用户统一提交/开 PR）**

---

## Self-Review

**1. Spec coverage（逐条对 spec）：**
- §1 宪法可关 → Task 3（canDismiss=true + 删遮罩 + 移动 Drawer 恒可关）✓
- §2 express → Task 4（persistStep1 抽取 + startWithDefaults + 按钮 + 直接 accept）✓
- §3 关闭语义 + AI 开场 + 删 toast → Task 5（handleConstClose 写本地标记、maybeStartOnboarding+ref、Effect B 复用、删 toast、三处 onClose 改线）✓
- §4 日期摊到每天 → Task 2（dayDateISO）+ Task 4（persistStep1 内 POST/PATCH date）✓
- §5 唯一默认程名 → Task 1（Tour#assign_default_title）✓
- 非目标（不动宪法正文/违反显示/范围→天数联动）→ 计划未触及 ✓

**2. Placeholder scan：** 每个代码 step 给了完整代码与行号锚点。两处显式标注"以该文件实际 helper/工厂为准"（ConstitutionDrawer.test 的 render 包裹、Show.test 的 freshTour/renderShow）——这是因测试文件已有各自约定，执行者需对齐既有 helper；非占位逻辑，附了可直接用的兜底写法。

**3. Type/名称一致性：**
- `dayDateISO` 在 Task 2 定义、Task 4 import 使用，签名一致 ✓
- `days` prop：Task 4 在 ConstitutionDrawer 接收、Show 传入、test 传入，一致 ✓
- `persistStep1`/`startWithDefaults`/`handleConstClose`/`maybeStartOnboarding`/`aiOnboardingStartedRef` 命名跨 step 一致 ✓
- localStorage key `onboarded:tour:${tour.id}` 与既有 `onboardedKey`（ConstitutionDrawer）一致 ✓
- `ONBOARDING_SENTINEL` from `lib/onboarding`，Show.jsx 已有 import（第 33 行），test 需补 import ✓
