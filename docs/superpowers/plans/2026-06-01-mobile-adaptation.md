# 移动端适配 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让全站每个页面在 375px 手机上可用、好用（mobile-first），核心是规划器四栏→底部 Tab、所有表格→卡片、抽屉/弹窗全屏化。

**Architecture:** 统一断点 `< 768px`（`useIsMobile()`）= 手机态，与 AppShell 导航抽屉同线。页面/组件按 `useIsMobile()` **条件渲染**桌面/移动两套（不用 `hiddenFrom/visibleFrom` 双渲染，避免重复 DOM 与测试重复命中）。规划器手机态只渲染当前面板 + 底部 Tab；跨 Tab 移动用全屏 Day 选择弹窗（`Menu.Sub` 当前 Mantine 不可用）。

**Tech Stack:** React + Inertia + Mantine 9 + @tabler/icons-react；测试 Vitest + @testing-library/react（`app/javascript/test/setup.js` 把 `matchMedia` mock 成恒 `matches:false`，即测试默认桌面态）。

**交付：** 单个大 PR（分支 `claude/stoic-leakey-0906db`）；逐 Phase 提交，最后开 PR。**不自动合并**，由人工在 GitHub 合并。

**每页验收（375px）：** ① `documentElement.scrollWidth === clientWidth`（无横向溢出）；② 文本不逐字竖排、徽章/操作完整；③ 主操作可达。每个可视改动用 preview（serverId 见会话，端口 9100，已 seed `川西环线 5 日` tour id=3）真机 375px 截图为证。

---

## Phase A — 基建：统一断点 hook

### Task A1: `useIsMobile` hook + 测试

**Files:**
- Create: `app/javascript/hooks/useIsMobile.js`
- Test: `app/javascript/hooks/__tests__/useIsMobile.test.js`

- [ ] **Step 1: 写失败测试**

```js
// app/javascript/hooks/__tests__/useIsMobile.test.js
import { renderHook } from '@testing-library/react'
import { describe, it, expect, afterEach } from 'vitest'
import { useIsMobile, MOBILE_BREAKPOINT } from '../useIsMobile'

function setViewport(matches) {
  window.matchMedia = (query) => ({
    matches, media: query, onchange: null,
    addListener() {}, removeListener() {},
    addEventListener() {}, removeEventListener() {}, dispatchEvent() { return true },
  })
}

describe('useIsMobile', () => {
  afterEach(() => setViewport(false)) // restore the global setup.js default

  it('true when the mobile media query matches', () => {
    setViewport(true)
    const { result } = renderHook(() => useIsMobile())
    expect(result.current).toBe(true)
  })

  it('false on desktop', () => {
    setViewport(false)
    const { result } = renderHook(() => useIsMobile())
    expect(result.current).toBe(false)
  })

  it('breakpoint is 768', () => {
    expect(MOBILE_BREAKPOINT).toBe(768)
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npm test -- useIsMobile`
Expected: FAIL（模块不存在）

- [ ] **Step 3: 实现 hook**

```js
// app/javascript/hooks/useIsMobile.js
import { useMediaQuery } from '@mantine/hooks'

// 768px = 手机/平板分界，与 AppShell 导航抽屉折叠同线。
export const MOBILE_BREAKPOINT = 768

// getInitialValueInEffect:false → 首帧即按 matchMedia 取值，避免桌面→移动闪一下。
export function useIsMobile() {
  return useMediaQuery(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`, false, {
    getInitialValueInEffect: false,
  }) ?? false
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `npm test -- useIsMobile`
Expected: PASS（3 个用例）

- [ ] **Step 5: 提交**

```bash
git add app/javascript/hooks/useIsMobile.js app/javascript/hooks/__tests__/useIsMobile.test.js
git commit -m "feat(mobile): useIsMobile() 统一 768 断点 hook"
```

---

## Phase B — 表格 → 移动卡片

通用做法：页面顶部 `const isMobile = useIsMobile()`；`{isMobile ? <卡片列表> : <原 Table>}`。桌面分支保持原样，现有 Vitest 用例（matchMedia=false→桌面）继续命中。

### Task B1: 旅程列表 `pages/Tour/Index.jsx`

**Files:**
- Modify: `app/javascript/pages/Tour/Index.jsx`
- Test: `app/javascript/pages/Tour/__tests__/Index.test.jsx`

- [ ] **Step 1: 失败测试（移动卡片）** — 在 `describe('Tour Index')` 末尾追加：

```jsx
it('renders a card (not a table) on mobile', () => {
  window.matchMedia = (q) => ({ matches: true, media: q, onchange: null, addListener(){}, removeListener(){}, addEventListener(){}, removeEventListener(){}, dispatchEvent(){return true} })
  renderWithMantine(<Index tours={[{ id: 9, title: '柴达木', date_range: '2026-08-01 → 08-05', team_size: 4, days_count: 3, activities_count: 12, my_role: 'author', health: { hard: 0, soft: 0 } }]} />)
  expect(screen.queryByRole('table')).toBeNull()
  expect(screen.getByText('柴达木')).toBeInTheDocument()
  expect(screen.getByRole('link', { name: /打开/ })).toHaveAttribute('href', '/tours/9')
  window.matchMedia = (q) => ({ matches: false, media: q, onchange: null, addListener(){}, removeListener(){}, addEventListener(){}, removeEventListener(){}, dispatchEvent(){return true} })
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npm test -- pages/Tour/__tests__/Index`
Expected: FAIL（移动端仍渲染 table，`queryByRole('table')` 非空）

- [ ] **Step 3: 实现** — `import { useIsMobile } from '../../hooks/useIsMobile'`；在组件内 `const isMobile = useIsMobile()`；把 `<Table>…</Table>` 包成 `{isMobile ? <TourCards tours={tours} /> : <Table…>…</Table>}`，并新增卡片子组件（同文件内）：

```jsx
function TourCards({ tours }) {
  return (
    <Stack gap="sm">
      {tours.map(t => (
        <Paper key={t.id} withBorder p="md" radius="md" style={{ opacity: t.archived ? 0.55 : 1 }}>
          <Group justify="space-between" wrap="nowrap" align="flex-start">
            <Stack gap={4} style={{ minWidth: 0 }}>
              <Text fw={600}>{t.title || '未命名旅程'}</Text>
              <Text size="sm" c="dimmed">{t.date_range || '—'}{t.team_size ? ` · ${t.team_size} 人` : ''}</Text>
              <Text size="sm">{(t.days_count ?? 0)} 天 · {(t.activities_count ?? 0)} 行 · {roleLabel(t.my_role)}</Text>
              <Group gap="xs">{formatHealth(t.health)}<Text size="xs" c="dimmed">{formatRelative(t.last_activity_at)}</Text></Group>
            </Stack>
            <Button component={Link} href={openHref(t)} size="xs" variant="light" style={{ flexShrink: 0 }}>打开 →</Button>
          </Group>
        </Paper>
      ))}
    </Stack>
  )
}

function roleLabel(r) { return r === 'author' ? '作者' : r === 'editor' ? '编辑' : r === 'reader' ? '只读' : r || '作者' }
```

（`roleLabel` 复用替换 Table 里那段三元；`formatHealth`/`formatRelative`/`openHref` 已在文件内。空状态保持不变。）

- [ ] **Step 4: 跑测试确认通过（含原有用例）**

Run: `npm test -- pages/Tour/__tests__/Index`
Expected: PASS（原 4 用例 + 新移动用例）

- [ ] **Step 5: 真机复核** — preview 导航 `/`，375px 截图；`scrollWidth===clientWidth`；卡片不逐字竖排、健康徽章文字可见。

- [ ] **Step 6: 提交** `git commit -m "feat(mobile): 旅程列表手机改卡片"`

### Task B2: 后台用户列表 `pages/Admin/UsersIndex.jsx`

**Files:** Modify `app/javascript/pages/Admin/UsersIndex.jsx`

- [ ] **Step 1: 读现状** — `Read` 该文件，记下 Table 列（编号/姓名/邮箱/角色/注册时间/旅程数…）与每列取值表达式、行点击进详情的 href（`/admin/users/:id`）、角色徽章渲染。
- [ ] **Step 2: 实现** — `import { useIsMobile } from '../../hooks/useIsMobile'`；`const isMobile = useIsMobile()`；`{isMobile ? <UserCards rows={...}/> : <Table…>}`。卡片每行一张 `Paper withBorder p="sm"`：`Group`(头像 `Avatar` + `Stack`(姓名 + 邮箱 `size=xs dimmed`) + 右侧角色徽章)，下方 `Text size=xs dimmed` 放注册时间 + 旅程数；整卡 `component={Link} href={`/admin/users/${u.id}`}`。复用文件内既有的角色 label/badge 逻辑（若是内联三元，抽成本地小函数复用，勿复制两份）。搜索框、分页保留在 Table/卡片之外不动。
- [ ] **Step 3: 真机复核** — `/admin/users` 375px：无溢出、姓名不竖排、角色徽章完整、可点进详情。
- [ ] **Step 4: 提交** `git commit -m "feat(mobile): 后台用户列表手机改卡片"`

### Task B3: 后台旅程列表 `pages/Admin/ToursIndex.jsx`

**Files:** Modify `app/javascript/pages/Admin/ToursIndex.jsx`

- [ ] **Step 1: 读现状** — 记下列（编号/标题/作者/成员数/天数/行数/创建时间）与取值、行 href `/admin/tours/:id`。
- [ ] **Step 2: 实现** — 同 B2 模式：`{isMobile ? <TourCards/> : <Table>}`。卡片：标题（粗体，`component={Link}`）+ 作者（名 + 邮箱 dimmed）+ 一行 `成员 N · N 天 · N 行 · 创建 日期`。
- [ ] **Step 3: 真机复核** `/admin/tours` 375px。
- [ ] **Step 4: 提交** `git commit -m "feat(mobile): 后台旅程列表手机改卡片"`

### Task B4: 后台详情内嵌表 `UsersShow.jsx` / `ToursShow.jsx`

**Files:** Modify `app/javascript/pages/Admin/UsersShow.jsx`、`app/javascript/pages/Admin/ToursShow.jsx`

资料卡 + `SimpleGrid cols={{base:2,sm:4}}` 已响应式，**不动**。只处理内嵌 `<Table>`。

- [ ] **Step 1: UsersShow** — `const isMobile = useIsMobile()`：
  - `TourList`（标题/角色/天数/更新）：`{isMobile ? 竖向卡片行 : <Table>}`。卡片行：`Paper withBorder p="xs"`，标题 `Anchor`，下方 `Text size=xs dimmed` 放 `角色 · N 天 · 更新时间`。
  - 「最近 20 条消息」表：移动端改竖堆——每条 `Paper withBorder p="xs"`：顶行 `Group`(角色 Badge + 时间 dimmed + 花费)，整段内容 `Text size=sm`（自然换行，不挤格子），底行用量 dimmed。
- [ ] **Step 2: ToursShow** — 成员表（姓名/邮箱/角色/加入）+ 天数表（第几天/日期/行数/更新）同样 `{isMobile ? 卡片行 : <Table>}`。
- [ ] **Step 3: 真机复核** `/admin/users/1`、`/admin/tours/3` 375px：内容不溢出、消息内容整段可读。
- [ ] **Step 4: 提交** `git commit -m "feat(mobile): 后台详情内嵌表手机改卡片堆叠"`

### Task B5: 后台概览图表核对 `Dashboard.jsx`

**Files:** Modify（按需）`app/javascript/pages/Admin/Dashboard.jsx`

- [ ] **Step 1: 真机复核** `/admin` 375px（有数据时）：确认 `@mantine/charts` 趋势图不横向溢出。
- [ ] **Step 2: 若溢出** — 给图表容器 `style={{ overflowX: 'auto' }}` 或图表设最小高度 + `<div style={{minWidth:480}}>` 包裹横滑；无溢出则跳过。
- [ ] **Step 3: 提交（若有改动）** `git commit -m "fix(mobile): 后台概览图表窄屏不溢出"`

---

## Phase C — 抽屉/弹窗统一全屏

统一范式：组件内 `const isMobile = useIsMobile()`；**Drawer** 加 `size={isMobile ? '100%' : <原值>}`；**Modal** 加 `fullScreen={isMobile}`（桌面保留原 `size`）。已用 `useMediaQuery('(max-width: 640px)')` 的 4 个改成 `useIsMobile()`。范本：`AddExpenseDialog.jsx:514`（`size={isMobile ? '100%' : 'md'} fullScreen={isMobile}`）。

### Task C1: 对齐已有 `isMobile` 的 4 个（仅换 hook）

**Files:** `ExpenseDrawer.jsx`、`AddExpenseDialog.jsx`、`BudgetModal.jsx`、`ManualSettlementDialog.jsx`

- [ ] **Step 1:** 各文件把 `const isMobile = useMediaQuery('(max-width: 640px)')` 改为 `import { useIsMobile } from '../../hooks/useIsMobile'` + `const isMobile = useIsMobile()`；删除不再使用的 `useMediaQuery` import（若该文件别处仍用则保留）。
- [ ] **Step 2:** `ExpenseDrawer.jsx:209` 的 `<Drawer position="right">` 增加 `size={isMobile ? '100%' : <原 size，若无则 'xl'>}`。
- [ ] **Step 3: 真机复核** — 打开账单抽屉 375px：全屏、可滚动、可关。
- [ ] **Step 4: 提交** `git commit -m "refactor(mobile): 费用相关抽屉对齐 useIsMobile"`

### Task C2: 未处理的 Drawer 全屏化

**Files:** `MembershipDrawer.jsx`(24)、`ActivityDetailDrawer.jsx`(342)、`activity-editor/ActivityDrawer.jsx`(400)、`components/OutboxDrawer.jsx`(141)

- [ ] **Step 1:** 每个文件加 `useIsMobile()`，`<Drawer>` 加 `size={isMobile ? '100%' : <原值>}`（原无 size 则桌面用 `'md'`/`'lg'` 视内容）。
- [ ] **Step 2:** 修固定宽度：`MembershipDrawer` 两处 `w={100}`（78、154）→ `w={isMobile ? undefined : 100}` 或外层 `Group` 在窄屏换行；行内别再撑出横向滚动。
- [ ] **Step 3: 真机复核** — 成员抽屉、活动详情抽屉、活动编辑抽屉 375px 全屏可用。
- [ ] **Step 4: 提交** `git commit -m "feat(mobile): 成员/详情/编辑抽屉全屏化"`

### Task C3: 未处理的 Modal 全屏化

**Files:** `TimelineOverlay.jsx`(30)、`DayEditModal.jsx`(79)、`TourSettingsModal.jsx`(61)、`RouteLegEditModal.jsx`(84)、`AcknowledgeModal.jsx`(38)、`components/ProfileSettingsModal.jsx`(49)、`activity-editor/ActivityGalleryLightbox.jsx`(31)

- [ ] **Step 1:** 各 `<Modal>` 加 `fullScreen={isMobile}`（保留桌面 `size`/`centered`）。`AcknowledgeModal`/`RouteLegEditModal` 是小确认框——若 375px 下本就不溢出可只加 `fullScreen={isMobile}` 保统一（先 preview 看，确无必要可跳过并在提交信息注明）。`ActivityGalleryLightbox` 图片灯箱确认 375px 图片不溢出。
- [ ] **Step 2:** 修 `ParameterEditor.jsx`：`<Text style={{ width: 220 }}>`(38) + `w={130}`(43) 合计 350 > 375 边距——改为 label `style={{ width: isMobile ? '100%' : 220 }}` 且容器 `fl-wrap`，输入 `w={isMobile ? '100%' : 130}`（该组件用于 ConstitutionDrawer/设置，读文件确认 import 与 isMobile 来源）。
- [ ] **Step 3: 真机复核** — 总览、改天、程设置、参数编辑 375px。
- [ ] **Step 4: 提交** `git commit -m "feat(mobile): 总览/设置等弹窗全屏化 + 参数行不溢出"`

---

## Phase D — 规划器手机态（底部 Tab）

### Task D1: `PanelShell` 加 `hideToggle`

**Files:** Modify `app/javascript/components/planner/PanelLayout/PanelShell.jsx`

- [ ] **Step 1:** props 增 `hideToggle = false`。`open=true` 分支里，把渲染折叠按钮处改为 `{!hideToggle && (canToggle ? collapseButton : <Tooltip…>)}`。`open=false` 分支（竖向 rail）移动端不会用到（移动恒 open），不改。
- [ ] **Step 2: 提交** `git commit -m "feat(mobile): PanelShell 支持 hideToggle"`

### Task D2: `DayColumn` / `DayPanel` 竖向堆叠

**Files:** Modify `DayColumn.jsx`、`DayPanel.jsx`

- [ ] **Step 1: DayColumn** — 增 `vertical = false` prop；外层 `Paper`(163) `style` 的 `flex: '0 0 200px'` 改 `flex: vertical ? '1 1 auto' : '0 0 200px'`，并 `width: vertical ? '100%' : undefined`；内部活动列表 `flex:1, overflowY:'auto'`(212) 在 `vertical` 时改 `overflowY:'visible'`（让整页滚动，不做列内独立滚动）。
- [ ] **Step 2: DayPanel** — 增 `vertical = false`，透传给每个 `DayColumn`；外层 strip `<div>`(73) 在 `vertical` 时 `flexDirection:'column'`、去掉 `overflowX:'auto'`/strip 背景、`gap:12`。`AddDayButton` 的 `minWidth` 在竖排时设 `width:'100%'`。
- [ ] **Step 3:** `Show.jsx` 桌面分支调用不传 `vertical`（默认 false，行为不变）；移动分支传 `vertical`（见 D4）。
- [ ] **Step 4: 真机复核** 留到 D4 整体验证。
- [ ] **Step 5: 提交** `git commit -m "feat(mobile): 日程面板支持竖向堆叠天数"`

### Task D3: 底部 Tab 栏组件

**Files:** Create `app/javascript/components/planner/MobilePlannerTabs.jsx`；Test `app/javascript/components/planner/__tests__/MobilePlannerTabs.test.jsx`

- [ ] **Step 1: 失败测试**

```jsx
import { render, screen, fireEvent } from '@testing-library/react'
import { MantineProvider } from '@mantine/core'
import { describe, it, expect, vi } from 'vitest'
import MobilePlannerTabs from '../MobilePlannerTabs'

const r = (ui) => render(<MantineProvider>{ui}</MantineProvider>)

describe('MobilePlannerTabs', () => {
  it('renders four labelled tabs', () => {
    r(<MobilePlannerTabs active="days" onChange={() => {}} />)
    ;['候选', '日程', '地图', 'AI'].forEach(l => expect(screen.getByRole('button', { name: l })).toBeInTheDocument())
  })
  it('fires onChange with the tab id', () => {
    const onChange = vi.fn()
    r(<MobilePlannerTabs active="days" onChange={onChange} />)
    fireEvent.click(screen.getByRole('button', { name: '地图' }))
    expect(onChange).toHaveBeenCalledWith('map')
  })
})
```

- [ ] **Step 2: 跑测试确认失败** — Run: `npm test -- MobilePlannerTabs` → FAIL（模块不存在）

- [ ] **Step 3: 实现**

```jsx
// app/javascript/components/planner/MobilePlannerTabs.jsx
import { UnstyledButton, Text } from '@mantine/core'
import { IconInbox, IconCalendarEvent, IconMap2, IconSparkles } from '@tabler/icons-react'

export const PLANNER_TABS = [
  { id: 'candidates', label: '候选', Icon: IconInbox },
  { id: 'days', label: '日程', Icon: IconCalendarEvent },
  { id: 'map', label: '地图', Icon: IconMap2 },
  { id: 'ai', label: 'AI', Icon: IconSparkles },
]

export default function MobilePlannerTabs({ active, onChange }) {
  return (
    <nav aria-label="规划器面板切换" style={{ display: 'flex', flexShrink: 0, background: '#fff', borderTop: '1px solid var(--mantine-color-default-border)' }}>
      {PLANNER_TABS.map(({ id, label, Icon }) => {
        const on = active === id
        return (
          <UnstyledButton key={id} onClick={() => onChange(id)} aria-label={label} aria-current={on ? 'page' : undefined}
            style={{ flex: 1, minHeight: 52, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 2,
                     color: on ? 'var(--mantine-color-blue-6)' : 'var(--mantine-color-gray-6)' }}>
            <Icon size={22} stroke={on ? 2 : 1.6} />
            <Text fz={10} fw={on ? 600 : 400}>{label}</Text>
          </UnstyledButton>
        )
      })}
    </nav>
  )
}
```

- [ ] **Step 4: 跑测试确认通过** — Run: `npm test -- MobilePlannerTabs` → PASS
- [ ] **Step 5: 提交** `git commit -m "feat(mobile): 规划器底部 Tab 栏组件"`

### Task D4: `Show.jsx` 接入移动单面板布局

**Files:** Modify `app/javascript/pages/Tour/Show.jsx`

- [ ] **Step 1:** 顶部加 `import { useIsMobile } from '../../hooks/useIsMobile'`、`import MobilePlannerTabs from '../../components/planner/MobilePlannerTabs'`、`import MoveToDayDialog from '../../components/planner/MoveToDayDialog'`（D6 创建）。组件内：`const isMobile = useIsMobile()`、`const [activePanel, setActivePanel] = useState('days')`、`const [movingActivityId, setMovingActivityId] = useState(null)`。
- [ ] **Step 2:** 把当前 `<div ref={containerRef} style={{ display:'flex', … height:'calc(100vh - 56px - 20px)' }}>…四面板…</div>` 整段用三元分桌面/移动：

```jsx
const MOBILE_PANEL = { flex: 1, minWidth: 0, width: '100%', height: '100%' }
…
{isMobile ? (
  <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100dvh - 56px)' }}>
    <div style={{ flex: 1, minHeight: 0, display: 'flex', padding: activePanel === 'map' ? 0 : 8 }}>
      {activePanel === 'candidates' && (
        <BacklogList {/* 同桌面同名 props */} open mobile flexStyle={MOBILE_PANEL} canToggle={false} … />
      )}
      {activePanel === 'days' && (
        <DayPanel open mobile vertical flexStyle={MOBILE_PANEL} canToggle={false} … />
      )}
      {activePanel === 'map' && (
        <PlannerMap open mobile flexStyle={MOBILE_PANEL} canToggle={false} … />
      )}
      {activePanel === 'ai' && (
        <ChatPanel open mobile flexStyle={MOBILE_PANEL} canToggle={false} … />
      )}
    </div>
    <MobilePlannerTabs active={activePanel} onChange={setActivePanel} />
  </div>
) : (
  <div ref={containerRef} style={{ /* 原桌面 flex 行，含 ConstitutionDrawer/backdrop/ResizeHandle，原样保留 */ }}>
    …原四面板…
  </div>
)}
```

> 实现注意：移动分支里每个面板的业务 props（activities/days/onEditActivity/onCardContextMenu/hover… ）与桌面分支**完全一致**，只是 `open=true / canToggle=false / 加 mobile / DayPanel 加 vertical / flexStyle=MOBILE_PANEL`。把 `mobile` prop 在各面板里透传给 `PanelShell hideToggle`（D5 一并接）。`DragOverlay`、其后所有 Drawer/Modal **不动**。

- [ ] **Step 3:** 给 `BacklogList`/`PlannerMap`/`ChatPanel`/`DayPanel` 增加并透传 `mobile` → `PanelShell hideToggle={mobile}`（各文件找到 `<PanelShell …>` 加 `hideToggle={mobile}`，props 解构加 `mobile`）。
- [ ] **Step 4:** ConstitutionDrawer 移动适配（见 D7）。先让本步在 `!isMobile` 时维持原内嵌渲染。
- [ ] **Step 5:** 接 `MoveToDayDialog`（D6）：在尾部 Drawer 群里加
```jsx
<MoveToDayDialog
  opened={movingActivityId != null}
  onClose={() => setMovingActivityId(null)}
  days={days}
  byDay={byDay}
  onPick={(dayId, position) => performMove(movingActivityId, dayId, position)}
/>
```
- [ ] **Step 6: 真机复核** — `/tours/3` 375px：默认「日程」全屏、天数竖排；点底部 Tab 切到候选/地图/AI 都满屏；`scrollWidth===clientWidth`；同天/跨天拖拽排序可用（用 preview_eval 触发 pointer 或人工说明）。
- [ ] **Step 7: 提交** `git commit -m "feat(mobile): 规划器手机单面板 + 底部 Tab 布局"`

### Task D5: 顶栏右侧收纳为「更多」菜单

**Files:** Modify `app/javascript/components/planner/PlannerHeaderRight.jsx`、`app/javascript/components/planner/ActivityFilterBar.jsx`

- [ ] **Step 1: PlannerHeaderRight** — 加 `useIsMobile()`；`if (isMobile)` 返回单个 `Menu`（target 是带违规 `Indicator` 的 `IconDotsVertical` `ActionIcon size="lg" aria-label="更多"`），`Menu.Dropdown` 内 5 项（宪法/总览/账单/成员/设置，含各自 Tabler 图标 + onClick）。桌面分支保留原 `Group`。
```jsx
import { Menu } from '@mantine/core'
import { IconDotsVertical } from '@tabler/icons-react'
import { useIsMobile } from '../../hooks/useIsMobile'
// …在 return 前：
if (useIsMobile()) {
  return (
    <Menu position="bottom-end" withinPortal shadow="md" width={180}>
      <Menu.Target>
        <Indicator color={color || 'gray'} label={violations.length} size={16} offset={4} disabled={!color}>
          <ActionIcon variant="subtle" size="lg" aria-label="更多"><IconDotsVertical size={20} /></ActionIcon>
        </Indicator>
      </Menu.Target>
      <Menu.Dropdown>
        <Menu.Item leftSection={<IconBook2 size={16} />} onClick={onOpenConst}>宪法{color ? ` · ${violations.length}` : ''}</Menu.Item>
        <Menu.Item leftSection={<IconListDetails size={16} />} onClick={onOpenTimeline}>总览</Menu.Item>
        <Menu.Item leftSection={<IconCoin size={16} />} onClick={onOpenExpense}>账单</Menu.Item>
        <Menu.Item leftSection={<IconUsers size={16} />} onClick={onOpenMembers}>成员</Menu.Item>
        {onOpenSettings && <Menu.Item leftSection={<IconSettings size={16} />} onClick={onOpenSettings}>旅程设置</Menu.Item>}
      </Menu.Dropdown>
    </Menu>
  )
}
```
> hooks 顺序：把 `const isMobile = useIsMobile()` 放组件顶部（不要写成 `if (useIsMobile())` 内联，避免条件 hook lint）。上面示例改为先取值再 `if (isMobile)`。
- [ ] **Step 2: ActivityFilterBar** — 读文件确认是 `Popover`（约 34 行 `position="bottom-end"`）。加 `useIsMobile()`，把 `Popover` 的 `width` 在移动端设 `width={isMobile ? 'target' : <原值>}` 或固定 `min(viewport-32)`；确保展开面板 375px 不溢出。若内部有固定宽行同样收敛。
- [ ] **Step 3: 真机复核** — 规划器顶栏 375px：logo+标题+筛选+「更多」一行不挤；菜单各项可开对应抽屉；筛选面板不溢出。
- [ ] **Step 4: 提交** `git commit -m "feat(mobile): 规划器顶栏收纳为更多菜单 + 筛选面板适配"`

### Task D6: `MoveToDayDialog` + 长按菜单「加入某天」

**Files:** Create `app/javascript/components/planner/MoveToDayDialog.jsx`；Modify `ActivityContextMenu.jsx`；Test `__tests__/MoveToDayDialog.test.jsx`

- [ ] **Step 1: 失败测试**

```jsx
import { render, screen, fireEvent } from '@testing-library/react'
import { MantineProvider } from '@mantine/core'
import { describe, it, expect, vi } from 'vitest'
import MoveToDayDialog from '../MoveToDayDialog'

const r = (ui) => render(<MantineProvider>{ui}</MantineProvider>)

describe('MoveToDayDialog', () => {
  it('lists days and picks one with end position', () => {
    const onPick = vi.fn(); const onClose = vi.fn()
    r(<MoveToDayDialog opened onClose={onClose} days={[{ id: 5, day_index: 1, title: '都江堰' }, { id: 6, day_index: 2, title: '' }]} byDay={{ 5: [{}, {}], 6: [] }} onPick={onPick} />)
    fireEvent.click(screen.getByRole('button', { name: /D1.*都江堰/ }))
    expect(onPick).toHaveBeenCalledWith(5, 3) // 2 existing → end pos 3
  })
})
```

- [ ] **Step 2: 跑测试确认失败** — Run: `npm test -- MoveToDayDialog` → FAIL
- [ ] **Step 3: 实现**

```jsx
// app/javascript/components/planner/MoveToDayDialog.jsx
import { Modal, Stack, Button, Text } from '@mantine/core'
import { useIsMobile } from '../../hooks/useIsMobile'

// 底部 Tab 规划器里候选与日程在不同 Tab，无法拖拽过去；长按菜单经此弹窗选目标天。
export default function MoveToDayDialog({ opened, onClose, days, byDay, onPick }) {
  const isMobile = useIsMobile()
  return (
    <Modal opened={opened} onClose={onClose} title="加入哪一天？" size="sm" centered fullScreen={isMobile}>
      <Stack gap="xs">
        {(!days || days.length === 0) && <Text c="dimmed" size="sm">还没有日程，先在「日程」里新建一天。</Text>}
        {(days || []).map((d) => {
          const count = (byDay?.[d.id] || []).length
          return (
            <Button key={d.id} variant="light" fullWidth justify="space-between"
              rightSection={<Text size="xs" c="dimmed">{count} 行</Text>}
              onClick={() => { onPick(d.id, count + 1); onClose() }}>
              D{d.day_index}{d.title ? ` · ${d.title}` : ''}
            </Button>
          )
        })}
      </Stack>
    </Modal>
  )
}
```

- [ ] **Step 4: 跑测试确认通过** — Run: `npm test -- MoveToDayDialog` → PASS
- [ ] **Step 5: ActivityContextMenu** — props 加 `onMoveToDay`；引入 `IconCalendarPlus`；在「克隆」后、Divider 前插入：`<Menu.Item leftSection={<IconCalendarPlus size={15} />} onClick={run(onMoveToDay)}>{inDay ? '移到其他天' : '加入日程'}</Menu.Item>`。`Show.jsx` 给 `<ActivityContextMenu>` 传 `onMoveToDay={(id) => setMovingActivityId(id)}`。
- [ ] **Step 6: 真机复核** — `/tours/3` 375px「候选」Tab：长按候选卡 → 「加入日程」→ 弹窗选 D1 → 卡片进入 D1（切到「日程」Tab 确认）。
- [ ] **Step 7: 提交** `git commit -m "feat(mobile): 长按菜单加入某天 + MoveToDayDialog"`

### Task D7: ConstitutionDrawer 移动全屏

**Files:** Modify `app/javascript/components/planner/ConstitutionDrawer.jsx`、`Show.jsx`

- [ ] **Step 1: 读 ConstitutionDrawer** — 确认其 props（`width`/`onWidthChange`/`onClose`…）与是否自带拖拽宽度手柄、close 按钮。
- [ ] **Step 2: 适配** — 给组件加 `mobile = false` prop：`mobile` 时容器 `width:'100%'`、不渲染宽度拖拽手柄、保留 `onClose`。`Show.jsx` 移动分支单独渲染（在面板切换容器之外，覆盖式）：
```jsx
{isMobile && constOpen && (
  <Drawer opened onClose={closeConst} size="100%" position="left" withCloseButton title="出行宪法">
    <ConstitutionDrawer mobile tour={tour} violations={violations} defaults={defaults} overrides={overrides}
      initialDaysCount={days.length || 1} canEdit={canEdit} width="100%"
      onClose={closeConst} onFix={(v) => setPendingChatPrompt(fixPromptFor(v))} onAcknowledge={(v) => setAcknowledgingViolation(v)} />
  </Drawer>
)}
```
（桌面分支内嵌渲染保持原样；`import { Drawer } from '@mantine/core'`。）
- [ ] **Step 3: 真机复核** — 新 tour 首访 375px 宪法抽屉全屏可读可关；违规修复入口可点。
- [ ] **Step 4: 提交** `git commit -m "feat(mobile): 出行宪法抽屉手机全屏"`

---

## Phase E — 收尾与验证

### Task E1: 全量真机回归（375px）

- [ ] 逐页 preview 375px 截图 + `scrollWidth===clientWidth` 断言：`/login`、`/`、`/tours/3`（四 Tab）、`/admin`、`/admin/users`、`/admin/users/1`、`/admin/tours`、`/admin/tours/3`，以及主要抽屉/弹窗各开一次。
- [ ] 逐项确认无逐字竖排、无被裁徽章、主操作可达。

### Task E2: 测试 + 静态检查（合并门槛）

- [ ] `npm test` → 全绿（含新增用例）。Run: `npm test`
- [ ] `bundle exec rspec` → 全绿（本次纯前端，应不受影响）。Run: `mise exec -- bundle exec rspec`
- [ ] `bin/rubocop -f github` → 0（若仅前端改动，应无 Ruby 变更）。
- [ ] `bin/brakeman --no-pager` → 无新增告警。
- [ ] `npm audit --audit-level=high` → 通过。
- [ ] `npx vite build && bash scripts/verify-sw-rewrite-patterns.sh` → 通过（PWA SW 模式）。

### Task E3: 清理 + 开 PR

- [ ] 还原 `.claude/launch.json` 为原始 `rails-dev/9000` 配置；删除 `tmp/seed_mobile_audit.rb`（tmp 已 gitignore，确认不在改动里）。
- [ ] `git status` 确认无杂项；`git push -u origin claude/stoic-leakey-0906db`。
- [ ] `gh pr create` —— 标题 `feat(mobile): 全站移动端适配(mobile-first / 768 断点 / 规划器底部 Tab)`，正文附：审计前后对比要点、各 Phase 摘要、375px 截图、验证命令结果。**不合并**，交人工。

---

## Self-Review 覆盖核对

- 断点统一(A1) ✓ / 表格→卡片：旅程列表(B1)、后台列表(B2/B3)、后台详情内嵌表(B4)、概览图表(B5) ✓ / 抽屉弹窗全屏(C1-C3，含固定宽度 ParameterEditor/MembershipDrawer) ✓ / 规划器底部 Tab(D1-D7：PanelShell hideToggle、DayPanel 竖排、Tab 栏、Show 接入、顶栏菜单、加入某天、宪法全屏) ✓ / 验证(E1-E3) ✓。
- 命名一致：`useIsMobile`/`MOBILE_BREAKPOINT`、`mobile` prop→`PanelShell hideToggle`、`vertical` prop(DayPanel/DayColumn)、`MoveToDayDialog.onPick(dayId, position)`、`onMoveToDay`、`activePanel`/`MobilePlannerTabs`。
- 登录页/概览布局已良好 → 仅核对不改（B5 仅图表按需）。
- 风险：规划器 DnD 在竖排/单 Tab 下需真机重测（`hybridCollisionDetection` 原为横向调）；顶栏注入 memo 改菜单时 hooks 取值置顶避免条件 hook；单 PR diff 大，逐 Phase 提交+自测。
