# 去黑话 + tooltips 实现计划（子项目② / P1-3）

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

> **提交策略**：本仓库「仅在用户明确要求时才 commit」。每个 Task 末尾的 "Commit" step **默认跳过**。

**Goal:** 把 citizen_level 四级统一为友好词「必去/想去/备选/后勤」、编辑器字段改「重点层级」+ 加释义 hint、并给机动日/软硬违反/承认违反/景观公路加 tooltip。

**Architecture:** 纯前端。`detailsSchema` 常量收敛（删黑话 `CITIZEN_LEVEL_OPTIONS`、把 `CITIZEN_LEVEL_FILTER_OPTIONS` 改名为 `CITIZEN_LEVEL_OPTIONS` 并改标签）→ 编辑器/详情自动拿到友好标签（同名 import）；筛选两文件改 import 名；DayColumn 页脚字串；编辑器加条件 hint；3 处 Mantine `Tooltip`。无后端、无 schema、不改 citizen_level 枚举值。

**Tech Stack:** React + Mantine（Radio.Group / Tooltip / Text）；Vitest + @testing-library（含 `userEvent.hover` 测 tooltip）。

参考 spec：`docs/superpowers/specs/2026-06-02-dejargon-tooltips-design.md`

四级标签映射（值不变，仅 label）：tier_one `必去` · tier_two `想去` · tier_three `备选` · infrastructure `后勤`。

---

## File Structure
- `app/javascript/components/activity-editor/detailsSchema.js` — 删黑话 `CITIZEN_LEVEL_OPTIONS`；`CITIZEN_LEVEL_FILTER_OPTIONS` → `CITIZEN_LEVEL_OPTIONS`（标签必去/想去/备选/后勤）。
- `app/javascript/components/planner/ActivityFilterBar.jsx` + `app/javascript/hooks/useActivityFilter.js` — import 名 `CITIZEN_LEVEL_FILTER_OPTIONS` → `CITIZEN_LEVEL_OPTIONS`。
- `app/javascript/components/planner/DayColumn.jsx` — 页脚 metric label `今日重点`→`必去`；`机动` 加 Tooltip。
- `app/javascript/components/activity-editor/CommonFields.jsx` — 字段标签 `公民等级`→`重点层级` + 条件 hint。
- `app/javascript/components/planner/ConstitutionBanner.jsx` — 软硬 level icon tooltip + 承认按钮 tooltip。
- 测试：ActivityFilterBar / DayColumn / ActivityDrawer / ActivityDetailDrawer / ConstitutionBanner 各 .test。
- （`ActivityDetailDrawer.jsx` 无需改代码——它 import `CITIZEN_LEVEL_OPTIONS`，改名后自动拿友好标签。）

---

## Task 1: 四级标签统一（relabel + 常量收敛 + 重命名波及）

**Files:** detailsSchema.js, ActivityFilterBar.jsx, useActivityFilter.js, DayColumn.jsx；测试 ActivityFilterBar.test / DayColumn.test / ActivityDrawer.test / ActivityDetailDrawer.test

- [ ] **Step 1: 改测试断言到新标签（先红）**

ActivityFilterBar.test.jsx：
- 行 119 `screen.getByText('今日重点')` → `screen.getByText('必去')`
- 行 120 `screen.getByText('配角')` → `screen.getByText('想去')`
- 行 122 `screen.getByText('基础设施')` → `screen.getByText('后勤')`
- 行 142 `screen.getByText('今日重点')` → `screen.getByText('必去')`
- （行 121 `备选` 不变）

DayColumn.test.jsx：
- 行 150 测试名 `...今日重点 (not the 核心 jargon)` → `...必去 (not the 公民 jargon)`
- 行 152 `screen.getByText('今日重点')` → `screen.getByText('必去')`

ActivityDrawer.test.jsx（按 tier 映射；值不变）：
- 行 581 注释 `"一等公民（核心）" radio...` → `"必去" radio...`
- 行 583 `getByLabelText('一等公民（核心）')` → `getByLabelText('必去')`
- 行 592 `getByLabelText('二等公民（配角）')` → `getByLabelText('想去')`
- 行 593 `getByLabelText('三等公民（可删）')` → `getByLabelText('备选')`
- 行 594 `getByLabelText('基础设施（自动）')` → `getByLabelText('后勤')`
- 行 597 `getByLabelText('一等公民（核心）')` → `getByLabelText('必去')`

ActivityDetailDrawer.test.jsx：
- 行 105 `toHaveTextContent('二等公民（配角）')` → `toHaveTextContent('想去')`

- [ ] **Step 2: 跑测试确认失败**

Run: `cd /Users/drewlee/work/personal/one-tour/.claude/worktrees/strange-noyce-4e5387 && npx vitest run app/javascript/components/planner/__tests__/ActivityFilterBar.test.jsx app/javascript/components/planner/__tests__/DayColumn.test.jsx app/javascript/components/activity-editor/__tests__/ActivityDrawer.test.jsx app/javascript/components/planner/__tests__/ActivityDetailDrawer.test.jsx`
Expected: FAIL（旧 label 仍在源码）

- [ ] **Step 3: 源码改标签 + 常量收敛 + import 改名 + 页脚字串**

(a) `detailsSchema.js`：删除黑话 `CITIZEN_LEVEL_OPTIONS`（`{ value: 'tier_one', label: '一等公民（核心）' }…` 那份数组，约 91-96 行整段删除），并把 `CITIZEN_LEVEL_FILTER_OPTIONS`（约 98-107）改名 + 改标签为：
```js
// citizen_level → 用户可见标签（唯一一份）。值是 Rails enum key，标签是友好词。
// 旧的「公民」黑话与上一轮的「今日重点」均已弃用。
export const CITIZEN_LEVEL_OPTIONS = [
  { value: 'tier_one',       label: '必去' },
  { value: 'tier_two',       label: '想去' },
  { value: 'tier_three',     label: '备选' },
  { value: 'infrastructure', label: '后勤' },
]
```
（确保文件里只剩这一个 `CITIZEN_LEVEL_OPTIONS` 导出；`STATUS_OPTIONS` 等其它导出不动。）

(b) `ActivityFilterBar.jsx`：
- 第 4 行 import：`CITIZEN_LEVEL_FILTER_OPTIONS` → `CITIZEN_LEVEL_OPTIONS`
- 第 93 行 `CITIZEN_LEVEL_FILTER_OPTIONS.map(...)` → `CITIZEN_LEVEL_OPTIONS.map(...)`

(c) `useActivityFilter.js`：
- 第 3 行 import：`CITIZEN_LEVEL_FILTER_OPTIONS` → `CITIZEN_LEVEL_OPTIONS`
- 第 7 行 `const VALID_LEVELS = new Set(CITIZEN_LEVEL_FILTER_OPTIONS.map(o => o.value))` → `...CITIZEN_LEVEL_OPTIONS.map(...)`

(d) `DayColumn.jsx` 第 265 行：`<DayMetricBar label="今日重点" ... />` → `label="必去"`

- [ ] **Step 4: 跑测试确认通过**

Run: `npx vitest run app/javascript/components/planner/__tests__/ActivityFilterBar.test.jsx app/javascript/components/planner/__tests__/DayColumn.test.jsx app/javascript/components/activity-editor/__tests__/ActivityDrawer.test.jsx app/javascript/components/planner/__tests__/ActivityDetailDrawer.test.jsx app/javascript/hooks/__tests__/useActivityFilter.test.js`
Expected: PASS（useActivityFilter 用值不受影响，一并确认）

- [ ] **Step 5: Commit（默认跳过）** `git commit -m "refactor(label): citizen_level → 必去/想去/备选/后勤; consolidate constant"`

---

## Task 2: 编辑器 重点层级 + 条件 hint（CommonFields）

**Files:** CommonFields.jsx；Test: ActivityDrawer.test.jsx

- [ ] **Step 1: 写失败测试**

在 `ActivityDrawer.test.jsx` 增（render 既有方式；一个普通 scenic、一个 road）：
```js
  it('citizen_level field is labeled 重点层级 with a tier hint', async () => {
    renderDrawer({ activity: { id: 1, name: 'X', kind: 'scenic', citizen_level: 'tier_three', day_id: 5, details: {} } })
    expect(await screen.findByText('重点层级')).toBeInTheDocument()
    expect(screen.queryByText('公民等级')).not.toBeInTheDocument()
    expect(screen.getByText(/必去=核心/)).toBeInTheDocument()
  })

  it('road kind shows the 景观公路→必去 explanation instead of the tier hint', async () => {
    renderDrawer({ activity: { id: 2, name: 'R', kind: 'road', citizen_level: 'tier_one', day_id: 5, details: {} } })
    expect(await screen.findByText(/景观公路本身就是核心体验/)).toBeInTheDocument()
  })
```
（`renderDrawer` 用该文件既有 helper/props 形状；若名称不同就对齐。kind=road 的活动应使第 4 条 tooltip 文案出现。）

- [ ] **Step 2: 跑测试确认失败**

Run: `npx vitest run app/javascript/components/activity-editor/__tests__/ActivityDrawer.test.jsx -t "重点层级"`
Expected: FAIL（仍是「公民等级」，无 hint）

- [ ] **Step 3: 实现**

`CommonFields.jsx`：把 citizen_level 的 `Radio.Group`（约 195-202 行）整段替换为：
```jsx
      <Radio.Group label="重点层级" {...form.getInputProps('citizen_level')}>
        <SimpleGrid cols={2} spacing="xs" mt={4}>
          {CITIZEN_LEVEL_OPTIONS.map(o => (
            <Radio key={o.value} value={o.value} label={o.label}
                   disabled={form.values.kind === 'road' && o.value !== 'tier_one'} />
          ))}
        </SimpleGrid>
        <Text size="xs" c="dimmed" mt={6}>
          {form.values.kind === 'road'
            ? '景观公路本身就是核心体验，自动归为「必去」'
            : '必去=核心、不可错过 · 想去=锦上添花 · 备选=时间紧可删 · 后勤=加油/休息等自动归类'}
        </Text>
      </Radio.Group>
```
（`Text` 已在第 1 行 import；`CITIZEN_LEVEL_OPTIONS` 第 4 行已 import，Task 1 后为友好集。）

- [ ] **Step 4: 跑测试确认通过**

Run: `npx vitest run app/javascript/components/activity-editor/__tests__/ActivityDrawer.test.jsx`
Expected: PASS

- [ ] **Step 5: Commit（默认跳过）** `git commit -m "feat(editor): 重点层级 label + tier hint (incl. road→必去)"`

---

## Task 3: DayColumn 机动 tooltip

**Files:** DayColumn.jsx；Test: DayColumn.test.jsx

- [ ] **Step 1: 写失败测试**

在 `DayColumn.test.jsx` 增（render 一个 `day.buffer_day = true` 的天，hover「机动」断 tooltip 文案）：
```js
test('buffer-day 机动 has an explanatory tooltip', async () => {
  const user = userEvent.setup()
  renderDayColumn({ day: { id: 1, day_index: 1, buffer_day: true }, activities: [] })
  await user.hover(screen.getByText('机动'))
  expect(await screen.findByText(/弹性\/缓冲日/)).toBeInTheDocument()
})
```
（用该文件既有 `renderDayColumn`/`renderIt` helper；确保 `userEvent` 已 import；buffer_day=true 才渲染「机动」。）

- [ ] **Step 2: 跑测试确认失败**

Run: `npx vitest run app/javascript/components/planner/__tests__/DayColumn.test.jsx -t "机动"`
Expected: FAIL（无 tooltip 文案）

- [ ] **Step 3: 实现**

`DayColumn.jsx`：第 5 行从 `@tabler/icons-react` 之外，确认 `Tooltip` 已从 `@mantine/core` import（第 3 行 `import { Alert, Paper, Text, Stack, Group, Button } from '@mantine/core'` → 加 `Tooltip`）。第 266 行：
```jsx
        {day.buffer_day && <Text size="xs" c="dimmed">机动</Text>}
```
改为：
```jsx
        {day.buffer_day && (
          <Tooltip label="弹性/缓冲日——应对天气、疲劳或突发，不排硬行程" multiline w={220} withArrow>
            <Text size="xs" c="dimmed" style={{ cursor: 'help', width: 'fit-content' }}>机动</Text>
          </Tooltip>
        )}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `npx vitest run app/javascript/components/planner/__tests__/DayColumn.test.jsx`
Expected: PASS

- [ ] **Step 5: Commit（默认跳过）** `git commit -m "feat(planner): tooltip explaining 机动 (buffer day)"`

---

## Task 4: ConstitutionBanner 软硬 + 承认 tooltip

**Files:** ConstitutionBanner.jsx；Test: ConstitutionBanner.test.jsx

- [ ] **Step 1: 写失败测试**

在 `ConstitutionBanner.test.jsx` 增（render 一个 hard violation，hover level 图标 + 承认按钮，断 tooltip 文案）：
```js
test('hard violation: level icon + 承认 button have explanatory tooltips', async () => {
  const user = userEvent.setup()
  renderBanner({ violations: [{ level: 'hard', rule: 'x', message: '超了' }] })
  // 承认按钮 tooltip
  await user.hover(screen.getByRole('button', { name: '承认此违反' }))
  expect(await screen.findByText(/记录一条豁免/)).toBeInTheDocument()
})
```
（用该文件既有 render helper；`userEvent` import；若无 helper 用 `render(<MantineProvider><ConstitutionBanner violations={[...]} /></MantineProvider>)`。level-icon tooltip 较难定位 trigger，本测试聚焦承认按钮这条；level-icon tooltip 由实现保证。）

- [ ] **Step 2: 跑测试确认失败**

Run: `npx vitest run app/javascript/components/planner/__tests__/ConstitutionBanner.test.jsx -t "tooltip"`
Expected: FAIL

- [ ] **Step 3: 实现**

`ConstitutionBanner.jsx`：
(a) 第 1 行 import 加 `Tooltip`：`import { Stack, Paper, Group, Text, Button, Tooltip } from '@mantine/core'`
(b) level 图标（第 47-49 行）包 Tooltip：
```jsx
                <Tooltip label="软提示=建议，可忽略；硬违反=超出硬约束，需修正或明确承认" multiline w={240} withArrow>
                  {v.level === 'hard'
                    ? <IconAlertOctagonFilled size={16} style={{ flexShrink: 0, cursor: 'help' }} />
                    : <IconAlertTriangleFilled size={16} style={{ flexShrink: 0, cursor: 'help' }} />}
                </Tooltip>
```
(c) 承认/知道了 按钮（第 58-70 行）：仅当文案为「承认此违反」时包 Tooltip。把那个 `<Button>…</Button>` 改为：
```jsx
                {(() => {
                  const isAck = v.level === 'hard' && !readOnly
                  const btn = (
                    <Button
                      size="compact-xs"
                      variant="default"
                      onClick={() => { isAck ? onAcknowledge(v) : handleDismiss(i, v) }}
                    >
                      {isAck ? '承认此违反' : '知道了'}
                    </Button>
                  )
                  return isAck
                    ? <Tooltip label="记录一条豁免：我知道这超了约束，但坚持当前安排" multiline w={240} withArrow>{btn}</Tooltip>
                    : btn
                })()}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `npx vitest run app/javascript/components/planner/__tests__/ConstitutionBanner.test.jsx`
Expected: PASS

- [ ] **Step 5: Commit（默认跳过）** `git commit -m "feat(planner): tooltips for soft/hard violation + 承认此违反"`

---

## Task 5: 全量验证

- [ ] **Step 1: 全量 vitest**

Run: `cd /Users/drewlee/work/personal/one-tour/.claude/worktrees/strange-noyce-4e5387 && npm test`
Expected: 全绿（在 707 基础上，新增 tooltip/hint 测试，relabel 测试更新）。

- [ ] **Step 2: 构建门禁**

Run: `npx vite build && bash scripts/verify-sw-rewrite-patterns.sh`
Expected: build OK + SW exit 0。

- [ ] **Step 3: 实地自测（:9000）**

- 编辑器加/改活动：字段是「重点层级」+ 必去/想去/备选/后勤 + hint;切 kind=景观公路 hint 变「自动归为必去」。
- 筛选 popover 重点层级 chip 是 必去/想去/备选/后勤。
- 日页脚显示「必去 N/M」;hover 某天「机动」出 tooltip。
- ConstitutionBanner hover 级别图标/「承认此违反」出 tooltip。
- 详情抽屉层级显示友好词。

- [ ] **Step 4: Commit（默认跳过；最终由用户统一提交/开 PR）**

---

## Self-Review

**1. Spec coverage：** §1 四标签统一+常量收敛 → T1 ✓；§2 编辑器 重点层级+hint → T2 ✓；§3 四 tooltip → 机动(T3) / 软硬+承认(T4) / 景观公路(T2 的条件 hint) ✓；日页脚 今日重点→必去 → T1 (d) ✓。非目标（宪法正文/timeline/枚举/tier_three 默认）未触及 ✓。

**2. Placeholder scan：** 各 step 有完整代码 + 行号锚点。测试 helper 名标注「以文件实际为准」——因各 test 有既有约定，附了兜底写法；非占位。

**3. 一致性：** 常量名 `CITIZEN_LEVEL_OPTIONS`（删黑话后唯一）跨 detailsSchema/ActivityFilterBar/useActivityFilter/CommonFields/ActivityDetailDrawer 一致；四标签 必去/想去/备选/后勤 在源码与测试断言一致；tier 值（tier_one 等）不变。`Tooltip` import 在 DayColumn/ConstitutionBanner 各自补齐。
