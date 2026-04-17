# Tranche D-1 — Planner 地图能力升级 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 `PlannerMap.jsx` 升级成"反映当前规划"的地图——按天着色 markers + 顺序连线 polyline + backlog 灰色虚线 pin + 视图切换 SegmentedControl。

**Architecture:** 单一组件升级，内部 4 个 pure helper（`DAY_COLOR` / `buildMarkerHTML` / `buildPolylineConfigs` / `filterActivitiesByViewMode`）+ 2 个 useEffect（markers / polylines）+ 1 个 ViewModeRadio 子组件。Pure helpers 全部 Vitest 单测；AMap SDK 集成沿用现有"在 Show.test.jsx 里 stub"策略不集成测试。

**Tech Stack:** React 19, Mantine 9 (SegmentedControl + theme colors), AMap JS SDK 2.0 (Marker custom HTML + Polyline), Vitest

**参考 spec:** `docs/superpowers/specs/2026-04-16-tranche-d1-map-design.md`

---

## 执行约定

- **TDD 严格：** 每个有行为的 task 按 "先写测试 → 验证失败 → 实现 → 验证通过 → commit" 节奏。
- **常用命令：**
  - JS 测试：`npm test`
  - JS 单文件：`npx vitest run <path>`
  - Ruby 测试（验证不破坏后端）：`mise exec -- bundle exec rspec`
- **commit 规范：** 短 subject + 可选 body；不要 `--amend`，失败后新 commit。
- **手动 QA：** 用 Tour #17 "伊犁环线 10 日（D-1 真实数据）"，登录 `d1-pm@example.com`。

---

## 文件结构

**修改：**
- `app/javascript/components/planner/PlannerMap.jsx` — 159 → ~280 行，新增 4 个 helper + 1 个子组件 + 1 个 useEffect

**新建：**
- `app/javascript/components/planner/__tests__/PlannerMap.test.jsx` — Vitest，仅测纯函数

**helper 接口契约（plan 内反复引用，必须一致）：**

```js
// Returns Mantine color name; cycles through 10-color palette by day_index
DAY_COLOR(day_index: number): string  // 'red' | 'pink' | 'grape' | 'violet' | 'indigo' | 'blue' | 'cyan' | 'teal' | 'green' | 'yellow'

// Returns HTML string for AMap.Marker content
buildMarkerHTML(activity: Activity, dayIndexById: Record<id, day_index>, theme: MantineTheme): string

// Returns array of AMap.Polyline config objects ready to construct
buildPolylineConfigs(activitiesGroupedByDay: Record<day_id, Activity[]>, days: Day[], theme: MantineTheme): Array<{ path: [[lng, lat], ...], strokeColor: string, strokeWeight: number, strokeOpacity: number, strokeStyle: 'solid' | 'dashed', showDir: boolean }>

// Returns filtered activities array based on view mode
filterActivitiesByViewMode(activities: Activity[], viewMode: 'all' | 'colored' | 'backlog'): Activity[]
```

---

## 路线图

| Task | 主题 | 结束后能做什么 |
|---|---|---|
| 1 | `DAY_COLOR` helper + Vitest 4 条 | 任意 day_index 拿到 Mantine 调色板颜色 |
| 2 | `filterActivitiesByViewMode` + Vitest 3 条 | 三种 view mode 的纯过滤逻辑可用 |
| 3 | `buildMarkerHTML` + Vitest 3 条 | day-assigned 与 backlog marker 的 HTML 字符串可生成 |
| 4 | `buildPolylineConfigs` + Vitest 6 条 | 同天连线 + 跨天虚线 + buffer 跳过 + 无坐标跳过 |
| 5 | `ViewModeRadio` 子组件 + 浮层定位 | UI 控件可见，但还没接到 markers/polylines |
| 6 | PlannerMap markers 改造（用 buildMarkerHTML 替换默认 icon） | 地图 markers 视觉升级，按天着色 + Dn 嵌入 + backlog 灰色虚线 |
| 7 | PlannerMap polylines + viewMode state 接线 | 完整 D-1 体验上线 |
| 8 | 最终验证 + 浏览器手动 QA | RSpec / Vitest 全绿 + 8 步手测 |

---

## Task 1: `DAY_COLOR` helper

**Files:**
- Modify: `app/javascript/components/planner/PlannerMap.jsx`
- Create: `app/javascript/components/planner/__tests__/PlannerMap.test.jsx`

- [ ] **Step 1: 创建 PlannerMap.test.jsx 框架 + DAY_COLOR 测试**

创建 `app/javascript/components/planner/__tests__/PlannerMap.test.jsx`：

```jsx
import { describe, test, expect } from 'vitest'
import { DAY_COLOR } from '../PlannerMap'

describe('DAY_COLOR', () => {
  test('day 1 returns first color (red)', () => {
    expect(DAY_COLOR(1)).toBe('red')
  })

  test('day 10 returns last color (yellow)', () => {
    expect(DAY_COLOR(10)).toBe('yellow')
  })

  test('day 11 cycles back to first color (red)', () => {
    expect(DAY_COLOR(11)).toBe('red')
  })

  test('day 0 or negative falls back gracefully (returns first color, no crash)', () => {
    expect(DAY_COLOR(0)).toBe('yellow')   // (0 - 1) % 10 = -1, then we want defined behavior
    // Confirm no throw on negative input
    expect(() => DAY_COLOR(-1)).not.toThrow()
  })
})
```

**Note**：上面的 day 0 期望 `'yellow'` 是因为 JS 的 `(-1) % 10 = -1`，实现里需要 `((day_index - 1) % 10 + 10) % 10` 这种处理负数的写法。如果实现选了不同 fallback（比如默认 `'gray'`），把测试改对应。

- [ ] **Step 2: 运行测试验证失败**

Run: `npx vitest run app/javascript/components/planner/__tests__/PlannerMap.test.jsx`

Expected: FAIL — `DAY_COLOR` not exported from PlannerMap.

- [ ] **Step 3: 在 PlannerMap.jsx 加 PALETTE 常量 + DAY_COLOR 导出**

在 `app/javascript/components/planner/PlannerMap.jsx` 顶部 imports 之后、`export default function PlannerMap` 之前，添加：

```jsx
// 10-color palette using Mantine theme color names. Cycles when day_index > 10.
// Used by buildMarkerHTML and buildPolylineConfigs to color markers/lines per day.
export const DAY_PALETTE = [
  'red', 'pink', 'grape', 'violet', 'indigo',
  'blue', 'cyan', 'teal', 'green', 'yellow'
]

export function DAY_COLOR(day_index) {
  // Handle negative / zero gracefully via positive modulo
  const idx = ((day_index - 1) % DAY_PALETTE.length + DAY_PALETTE.length) % DAY_PALETTE.length
  return DAY_PALETTE[idx]
}
```

- [ ] **Step 4: 运行测试验证通过**

Run: `npx vitest run app/javascript/components/planner/__tests__/PlannerMap.test.jsx`

Expected: 4 PASS

- [ ] **Step 5: Commit**

```bash
git add app/javascript/components/planner/PlannerMap.jsx app/javascript/components/planner/__tests__/PlannerMap.test.jsx
git commit -m "map: DAY_COLOR helper for per-day Mantine palette"
```

---

## Task 2: `filterActivitiesByViewMode`

**Files:**
- Modify: `app/javascript/components/planner/PlannerMap.jsx`
- Modify: `app/javascript/components/planner/__tests__/PlannerMap.test.jsx`

- [ ] **Step 1: 加测试**

在 `app/javascript/components/planner/__tests__/PlannerMap.test.jsx` 末尾追加：

```jsx
import { filterActivitiesByViewMode } from '../PlannerMap'

describe('filterActivitiesByViewMode', () => {
  const fixtures = [
    { id: 1, name: 'A', day_id: 10 },
    { id: 2, name: 'B', day_id: 11 },
    { id: 3, name: 'C', day_id: null },
    { id: 4, name: 'D', day_id: null },
  ]

  test('all returns everything', () => {
    expect(filterActivitiesByViewMode(fixtures, 'all').map(a => a.id)).toEqual([1, 2, 3, 4])
  })

  test('colored returns only day-assigned', () => {
    expect(filterActivitiesByViewMode(fixtures, 'colored').map(a => a.id)).toEqual([1, 2])
  })

  test('backlog returns only day_id=null', () => {
    expect(filterActivitiesByViewMode(fixtures, 'backlog').map(a => a.id)).toEqual([3, 4])
  })
})
```

- [ ] **Step 2: 运行测试验证失败**

Run: `npx vitest run app/javascript/components/planner/__tests__/PlannerMap.test.jsx`

Expected: 3 new tests FAIL — `filterActivitiesByViewMode` not exported.

- [ ] **Step 3: 实现并 export**

在 `PlannerMap.jsx` 的 `DAY_COLOR` 之后追加：

```jsx
// Filter activities by current view mode.
// 'all'     — every activity
// 'colored' — only day-assigned (day_id != null)
// 'backlog' — only backlog (day_id == null)
export function filterActivitiesByViewMode(activities, viewMode) {
  if (viewMode === 'colored') return activities.filter(a => a.day_id != null)
  if (viewMode === 'backlog') return activities.filter(a => a.day_id == null)
  return activities
}
```

- [ ] **Step 4: 运行测试验证通过**

Run: `npx vitest run app/javascript/components/planner/__tests__/PlannerMap.test.jsx`

Expected: 7 PASS (4 + 3 new)

- [ ] **Step 5: Commit**

```bash
git add app/javascript/components/planner/PlannerMap.jsx app/javascript/components/planner/__tests__/PlannerMap.test.jsx
git commit -m "map: filterActivitiesByViewMode helper for 3-mode view switcher"
```

---

## Task 3: `buildMarkerHTML`

**Files:**
- Modify: `app/javascript/components/planner/PlannerMap.jsx`
- Modify: `app/javascript/components/planner/__tests__/PlannerMap.test.jsx`

- [ ] **Step 1: 加测试**

在 `PlannerMap.test.jsx` 末尾追加：

```jsx
import { buildMarkerHTML } from '../PlannerMap'

describe('buildMarkerHTML', () => {
  // Mock Mantine theme — only need colors[name][6] lookup
  const theme = {
    colors: {
      red:    [, , , , , , '#fa5252'],
      pink:   [, , , , , , '#e64980'],
      grape:  [, , , , , , '#be4bdb'],
      violet: [, , , , , , '#7950f2'],
      indigo: [, , , , , , '#4c6ef5'],
      blue:   [, , , , , , '#228be6'],
      cyan:   [, , , , , , '#15aabf'],
      teal:   [, , , , , , '#12b886'],
      green:  [, , , , , , '#40c057'],
      yellow: [, , , , , , '#fab005'],
    }
  }

  test('day-assigned activity returns HTML with day color and Dn label', () => {
    const html = buildMarkerHTML({ day_id: 10 }, { 10: 2 }, theme)
    expect(html).toContain('#e64980') // pink (day 2)
    expect(html).toContain('D2')
    expect(html).toContain('border-radius: 50%')
  })

  test('backlog activity returns grey-dashed circle without label', () => {
    const html = buildMarkerHTML({ day_id: null }, {}, theme)
    expect(html).toContain('dashed')
    expect(html).toContain('#999')
    expect(html).not.toContain('D')  // no Dn label
    expect(html).not.toMatch(/<[^>]+>D\d/)  // doubly sure no day number
  })

  test('day-assigned activity uses cycled color when day_index > 10', () => {
    const html = buildMarkerHTML({ day_id: 99 }, { 99: 11 }, theme)
    expect(html).toContain('#fa5252') // red (D11 cycles to D1's color)
    expect(html).toContain('D11')
  })
})
```

- [ ] **Step 2: 运行测试验证失败**

Run: `npx vitest run app/javascript/components/planner/__tests__/PlannerMap.test.jsx`

Expected: 3 new tests FAIL — `buildMarkerHTML` not exported.

- [ ] **Step 3: 实现 buildMarkerHTML**

在 `PlannerMap.jsx` 的 `filterActivitiesByViewMode` 之后追加：

```jsx
// Build the HTML content string for an AMap.Marker.
//
// Day-assigned: 28px solid circle with day color background and "Dn" label embedded.
// Backlog (day_id=null): 22px white circle with 2px grey dashed border, no label.
//
// `theme` is the Mantine theme object (use useMantineTheme() in component).
// We pull colors[name][6] (the 600-shade) for solid markers — high contrast on
// AMap's white tile background.
export function buildMarkerHTML(activity, dayIndexById, theme) {
  if (activity.day_id == null) {
    // Backlog marker — grey dashed circle, no label
    return `<div style="
      width: 22px; height: 22px;
      background: white;
      border: 2px dashed #999;
      border-radius: 50%;
      opacity: 0.85;
      box-sizing: border-box;
    "></div>`
  }

  const day_index = dayIndexById[activity.day_id]
  const colorName = DAY_COLOR(day_index)
  const hex = theme.colors[colorName][6]

  return `<div style="
    width: 28px; height: 28px;
    background: ${hex};
    border: 2px solid white;
    border-radius: 50%;
    box-shadow: 0 2px 4px rgba(0,0,0,0.3);
    display: flex; align-items: center; justify-content: center;
    color: white; font-size: 11px; font-weight: bold;
    box-sizing: border-box;
  ">D${day_index}</div>`
}
```

- [ ] **Step 4: 运行测试验证通过**

Run: `npx vitest run app/javascript/components/planner/__tests__/PlannerMap.test.jsx`

Expected: 10 PASS (7 + 3 new)

- [ ] **Step 5: Commit**

```bash
git add app/javascript/components/planner/PlannerMap.jsx app/javascript/components/planner/__tests__/PlannerMap.test.jsx
git commit -m "map: buildMarkerHTML for day-colored circles + grey backlog pins"
```

---

## Task 4: `buildPolylineConfigs`

**Files:**
- Modify: `app/javascript/components/planner/PlannerMap.jsx`
- Modify: `app/javascript/components/planner/__tests__/PlannerMap.test.jsx`

- [ ] **Step 1: 加测试**

在 `PlannerMap.test.jsx` 末尾追加：

```jsx
import { buildPolylineConfigs } from '../PlannerMap'

describe('buildPolylineConfigs', () => {
  const theme = {
    colors: {
      red:    [, , , , , , '#fa5252'],
      pink:   [, , , , , , '#e64980'],
      grape:  [, , , , , , '#be4bdb'],
      violet: [, , , , , , '#7950f2'],
      indigo: [, , , , , , '#4c6ef5'],
      blue:   [, , , , , , '#228be6'],
      cyan:   [, , , , , , '#15aabf'],
      teal:   [, , , , , , '#12b886'],
      green:  [, , , , , , '#40c057'],
      yellow: [, , , , , , '#fab005'],
    }
  }

  test('returns empty when no days', () => {
    const configs = buildPolylineConfigs({}, [], theme)
    expect(configs).toEqual([])
  })

  test('single day with multiple activities — one solid same-day polyline', () => {
    const days = [{ id: 10, day_index: 1, buffer_day: false }]
    const grouped = {
      10: [
        { id: 1, lat: 44.6, lng: 81.3, position: 1 },
        { id: 2, lat: 44.7, lng: 81.4, position: 2 },
        { id: 3, lat: 44.8, lng: 81.5, position: 3 },
      ]
    }
    const configs = buildPolylineConfigs(grouped, days, theme)
    expect(configs).toHaveLength(1)
    expect(configs[0].strokeStyle).toBe('solid')
    expect(configs[0].strokeColor).toBe('#fa5252') // D1 = red
    expect(configs[0].path).toEqual([[81.3, 44.6], [81.4, 44.7], [81.5, 44.8]])
  })

  test('two consecutive days — solid same-day + dashed cross-day', () => {
    const days = [
      { id: 10, day_index: 1, buffer_day: false },
      { id: 11, day_index: 2, buffer_day: false },
    ]
    const grouped = {
      10: [{ id: 1, lat: 44.6, lng: 81.3, position: 1 }, { id: 2, lat: 44.7, lng: 81.4, position: 2 }],
      11: [{ id: 3, lat: 43.0, lng: 84.0, position: 1 }],
    }
    const configs = buildPolylineConfigs(grouped, days, theme)
    // Same-day D1 (a1→a2) + cross-day D1→D2 (a2→a3); D2 only has 1 act so no same-day line
    expect(configs).toHaveLength(2)
    const sameDayD1 = configs.find(c => c.strokeStyle === 'solid')
    expect(sameDayD1.strokeColor).toBe('#fa5252') // D1 red
    expect(sameDayD1.path).toEqual([[81.3, 44.6], [81.4, 44.7]])
    const crossDay = configs.find(c => c.strokeStyle === 'dashed')
    expect(crossDay.strokeColor).toBe('#fa5252') // origin day color
    expect(crossDay.path).toEqual([[81.4, 44.7], [84.0, 43.0]])
  })

  test('skips buffer_day with no activities — D5 → D7 connect directly', () => {
    const days = [
      { id: 50, day_index: 5, buffer_day: false },
      { id: 60, day_index: 6, buffer_day: true  },
      { id: 70, day_index: 7, buffer_day: false },
    ]
    const grouped = {
      50: [{ id: 1, lat: 43.3, lng: 84.0, position: 1 }],
      60: [],
      70: [{ id: 2, lat: 43.1, lng: 81.1, position: 1 }],
    }
    const configs = buildPolylineConfigs(grouped, days, theme)
    // No same-day for D5/D7 (1 act each), 1 cross-day D5→D7 dashed
    expect(configs).toHaveLength(1)
    expect(configs[0].strokeStyle).toBe('dashed')
    expect(configs[0].strokeColor).toBe('#4c6ef5') // D5 = indigo
    expect(configs[0].path).toEqual([[84.0, 43.3], [81.1, 43.1]])
  })

  test('skips activities with invalid lat/lng', () => {
    const days = [{ id: 10, day_index: 1, buffer_day: false }]
    const grouped = {
      10: [
        { id: 1, lat: 44.6, lng: 81.3, position: 1 },
        { id: 2, lat: null, lng: null, position: 2 },  // skipped
        { id: 3, lat: 44.8, lng: 81.5, position: 3 },
      ]
    }
    const configs = buildPolylineConfigs(grouped, days, theme)
    expect(configs).toHaveLength(1)
    expect(configs[0].path).toEqual([[81.3, 44.6], [81.5, 44.8]])
  })

  test('coerces string lat/lng to numbers (Rails decimal serialization)', () => {
    const days = [{ id: 10, day_index: 1, buffer_day: false }]
    const grouped = {
      10: [
        { id: 1, lat: '44.6', lng: '81.3', position: 1 },
        { id: 2, lat: '44.7', lng: '81.4', position: 2 },
      ]
    }
    const configs = buildPolylineConfigs(grouped, days, theme)
    expect(configs[0].path).toEqual([[81.3, 44.6], [81.4, 44.7]])
  })
})
```

- [ ] **Step 2: 运行测试验证失败**

Run: `npx vitest run app/javascript/components/planner/__tests__/PlannerMap.test.jsx`

Expected: 6 new tests FAIL — `buildPolylineConfigs` not exported.

- [ ] **Step 3: 实现 buildPolylineConfigs**

在 `PlannerMap.jsx` 的 `buildMarkerHTML` 之后追加：

```jsx
// Build polyline configs for AMap.Polyline construction.
//
// Returns an array of { path, strokeColor, strokeWeight, strokeOpacity, strokeStyle, showDir }.
// `path` is [[lng, lat], [lng, lat], ...] (AMap's coord order).
//
// Rules:
// - Same-day lines: solid, day color, weight 3, opacity 0.7. Connects activities
//   within a day in `position` order (NOT planned_start_at — matches Timeline).
// - Cross-day lines: dashed, origin-day color, weight 2, opacity 0.5. Connects
//   the last activity of D{n} to the first of D{n+visible}, skipping any day
//   with zero activities (e.g., buffer_day with no activity).
// - Activities with invalid lat/lng are skipped.
// - Single-activity days produce no same-day line (1 point can't form a line).
export function buildPolylineConfigs(activitiesGroupedByDay, days, theme) {
  const configs = []

  // Sort days by day_index ascending; build a list of "day with valid coords"
  const orderedDays = [ ...days ].sort((a, b) => a.day_index - b.day_index)

  // For each day, extract the list of [lng, lat] pairs in position order
  const dayPaths = orderedDays.map(day => {
    const acts = (activitiesGroupedByDay[day.id] || [])
      .slice()
      .sort((a, b) => a.position - b.position)
      .map(a => [ parseFloat(a.lng), parseFloat(a.lat) ])
      .filter(([ lng, lat ]) => Number.isFinite(lng) && Number.isFinite(lat))
    return { day, path: acts }
  })

  // Same-day lines (solid)
  dayPaths.forEach(({ day, path }) => {
    if (path.length < 2) return
    configs.push({
      path,
      strokeColor: theme.colors[DAY_COLOR(day.day_index)][6],
      strokeWeight: 3,
      strokeOpacity: 0.7,
      strokeStyle: 'solid',
      showDir: false
    })
  })

  // Cross-day lines (dashed): pair adjacent days with non-empty paths
  const daysWithCoords = dayPaths.filter(d => d.path.length > 0)
  for (let i = 0; i < daysWithCoords.length - 1; i++) {
    const from = daysWithCoords[i]
    const to   = daysWithCoords[i + 1]
    const lastOfFrom  = from.path[from.path.length - 1]
    const firstOfTo   = to.path[0]
    configs.push({
      path: [ lastOfFrom, firstOfTo ],
      strokeColor: theme.colors[DAY_COLOR(from.day.day_index)][6],
      strokeWeight: 2,
      strokeOpacity: 0.5,
      strokeStyle: 'dashed',
      showDir: false
    })
  }

  return configs
}
```

- [ ] **Step 4: 运行测试验证通过**

Run: `npx vitest run app/javascript/components/planner/__tests__/PlannerMap.test.jsx`

Expected: 16 PASS (10 + 6 new)

- [ ] **Step 5: Commit**

```bash
git add app/javascript/components/planner/PlannerMap.jsx app/javascript/components/planner/__tests__/PlannerMap.test.jsx
git commit -m "map: buildPolylineConfigs with same-day solid + cross-day dashed"
```

---

## Task 5: `ViewModeRadio` 子组件

**Files:**
- Modify: `app/javascript/components/planner/PlannerMap.jsx`

**Note:** SegmentedControl 不是 pure function 难单测；视觉/交互通过手动 QA 验证。这一步只把 UI 控件加上，**不**接到 markers/polylines（Task 7 才接）。

- [ ] **Step 1: 加 import + ViewModeRadio 子组件**

在 `app/javascript/components/planner/PlannerMap.jsx` 顶部 imports 修改为：

```jsx
import { useEffect, useRef, useMemo, useState } from 'react'
import { usePage } from '@inertiajs/react'
import { Paper, Text, SegmentedControl, useMantineTheme } from '@mantine/core'
import useAmap from '../../hooks/useAmap'
```

在文件末尾（紧接 `escapeHtml` 函数之前或之后均可），加 `ViewModeRadio` 子组件：

```jsx
// Floating SegmentedControl in the top-right corner of the map.
// Three modes:
//   all     — every marker + polylines
//   colored — only day-assigned markers + polylines
//   backlog — only backlog markers, no polylines
function ViewModeRadio({ value, onChange }) {
  return (
    <div style={{
      position: 'absolute',
      top: 8,
      right: 8,
      zIndex: 2,
      background: 'white',
      borderRadius: 4,
      padding: 2,
      boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
    }}>
      <SegmentedControl
        value={value}
        onChange={onChange}
        data={[
          { value: 'all',     label: '全部' },
          { value: 'colored', label: '按天着色' },
          { value: 'backlog', label: '仅 backlog' },
        ]}
        size="xs"
      />
    </div>
  )
}
```

- [ ] **Step 2: 在 PlannerMap 函数体内加 viewMode state + 渲染 ViewModeRadio**

在 `PlannerMap` 函数内、`const [authFailed, setAuthFailed] = useState(false)` 之后添加：

```jsx
  // View mode controls which activities show + whether polylines render.
  // Not persisted (resets on refresh, like Backlog filter).
  const [ viewMode, setViewMode ] = useState('all')
```

在 `return` 的 JSX 中，在 `<div ref={containerRef} ...>` 之后、`{sdkState === 'loading' && ...}` 之前插入：

```jsx
      {sdkState === 'ready' && !authFailed && (
        <ViewModeRadio value={viewMode} onChange={setViewMode} />
      )}
```

（条件渲染：地图 SDK 未就绪或 auth 失败时不显示控件，避免地图加载错误时浮一个无用按钮。）

- [ ] **Step 3: 运行 vitest 确保已有测试不破**

Run: `npm test`

Expected: 16 + 现有所有 = 全 PASS（PlannerMap 内部行为未改，只多了一个未连接的子组件 + state）

- [ ] **Step 4: Commit**

```bash
git add app/javascript/components/planner/PlannerMap.jsx
git commit -m "map: ViewModeRadio floating control (not yet wired to layers)"
```

---

## Task 6: PlannerMap markers 重写

**Files:**
- Modify: `app/javascript/components/planner/PlannerMap.jsx`

把现有 `useEffect [activities, dayIndexById, sdkState]` 内的 marker 创建逻辑改成：使用 `buildMarkerHTML` + `filterActivitiesByViewMode` + Mantine theme。

- [ ] **Step 1: 取 Mantine theme + 改写 marker effect**

在 `PlannerMap` 函数内、`const [viewMode, setViewMode] = useState('all')` 之后添加：

```jsx
  const theme = useMantineTheme()
```

替换现有的 marker `useEffect`（当前在 `app/javascript/components/planner/PlannerMap.jsx` 大约第 69-108 行）整个块为：

```jsx
  // Sync markers with activities + viewMode + theme. Clear + re-draw on every change.
  // Cheap enough for typical 0-50 POI scale.
  useEffect(() => {
    const map = mapRef.current
    if (!map || !window.AMap) return

    markersRef.current.forEach(m => m.setMap(null))
    markersRef.current = []

    // Coerce Rails-serialized lat/lng strings to numbers, drop invalid
    const visible = filterActivitiesByViewMode(activities, viewMode)
      .map(a => ({ ...a, lat: parseFloat(a.lat), lng: parseFloat(a.lng) }))
      .filter(a => Number.isFinite(a.lat) && Number.isFinite(a.lng))

    visible.forEach(a => {
      const inDay = a.day_id && dayIndexById[a.day_id]
      const marker = new window.AMap.Marker({
        position: [ a.lng, a.lat ],
        title: a.name,
        content: buildMarkerHTML(a, dayIndexById, theme),
        anchor: 'center'
      })
      const info = new window.AMap.InfoWindow({
        content: `<div style="padding:6px 10px;font-size:12px;line-height:1.5">
          <strong>${escapeHtml(a.name)}</strong><br/>
          <span style="color:#888">${inDay ? `已排入 D${inDay}` : '尚未排入（backlog）'}</span>
        </div>`,
        offset: new window.AMap.Pixel(0, -20)
      })
      marker.on('click', () => info.open(map, marker.getPosition()))
      marker.setMap(map)
      markersRef.current.push(marker)
    })

    // Frame view to fit visible markers; fallbacks for 0/1 markers
    if (visible.length > 1) {
      map.setFitView(markersRef.current, false, [ 40, 40, 40, 40 ], 12)
    } else if (visible.length === 1) {
      map.setZoomAndCenter(10, [ visible[0].lng, visible[0].lat ])
    }
    // visible.length === 0: don't move map (user keeps current view)
  }, [ activities, dayIndexById, viewMode, theme, sdkState ])
```

**变更要点**：
- `viewMode` 加入 deps，切换 viewMode 触发 marker 重画
- `theme` 加入 deps（虽不会变，但便于将来 dark mode）
- `filterActivitiesByViewMode(activities, viewMode)` 替换原全量 activities
- `content: buildMarkerHTML(...)` 替换原 `label: { content: 'D2' }`（自定义 HTML 而非 AMap 副标签）
- `anchor: 'center'` 替换 `'bottom-center'`（圆形 center 锚定更直观）
- InfoWindow offset 从 `-30` 改为 `-20`（marker 高度变了）

- [ ] **Step 2: 验证 vitest 没破**

Run: `npm test`

Expected: 全 PASS（内部逻辑变了但纯函数测试不依赖此处）

- [ ] **Step 3: 浏览器手动验证 markers**

启动 dev server（如未起），登录 `d1-pm@example.com`，访问 `/tours/17`。

期望视觉：
- 5 个 day 颜色 marker（D1 红 / D2 粉 / D3 紫罗兰 / D4 紫 / D5 靛蓝...）
- 4 个灰色虚线 backlog marker
- 切换 viewMode → marker 增减
- markers 还没有连线（polyline 是 Task 7）

- [ ] **Step 4: Commit**

```bash
git add app/javascript/components/planner/PlannerMap.jsx
git commit -m "map: per-day colored markers + grey backlog pins + viewMode filter"
```

---

## Task 7: Polyline 渲染 + ViewMode 完整接线

**Files:**
- Modify: `app/javascript/components/planner/PlannerMap.jsx`

加第二个 useEffect 同步 polyline 配置；只在 viewMode='all' 或 'colored' 时画。

- [ ] **Step 1: 加 polylinesRef + days 分组 useMemo + polyline useEffect**

在 `PlannerMap` 函数内、`const markersRef = useRef([])` 之后添加：

```jsx
  const polylinesRef = useRef([])
```

在 `const dayIndexById = useMemo(...)` 之后添加：

```jsx
  // Group activities by day_id (skip backlog) for polyline construction.
  const activitiesByDay = useMemo(() => {
    const grouped = {}
    for (const a of activities) {
      if (a.day_id == null) continue
      if (!grouped[a.day_id]) grouped[a.day_id] = []
      grouped[a.day_id].push(a)
    }
    return grouped
  }, [ activities ])
```

在现有 marker `useEffect` 之后（即 Task 6 修改后那个 useEffect 之后），追加新的 polyline `useEffect`：

```jsx
  // Sync polylines with activities + days + viewMode + theme.
  // 'backlog' mode hides polylines entirely.
  useEffect(() => {
    const map = mapRef.current
    if (!map || !window.AMap) return

    polylinesRef.current.forEach(p => p.setMap(null))
    polylinesRef.current = []

    if (viewMode === 'backlog') return  // no polylines in backlog mode

    const configs = buildPolylineConfigs(activitiesByDay, days, theme)
    configs.forEach(cfg => {
      const polyline = new window.AMap.Polyline(cfg)
      polyline.setMap(map)
      polylinesRef.current.push(polyline)
    })
  }, [ activitiesByDay, days, viewMode, theme, sdkState ])
```

- [ ] **Step 2: 在 cleanup（unmount）时清理 polylines**

修改 SDK ready effect 的 cleanup（当前 destroy map 那段），把 polylines 也一并清理。在 `return () => {...}` 块里 `mapRef.current?.destroy?.()` 之前加：

```jsx
      polylinesRef.current.forEach(p => p.setMap(null))
      polylinesRef.current = []
```

完整 cleanup 块应该是：

```jsx
    return () => {
      polylinesRef.current.forEach(p => p.setMap(null))
      polylinesRef.current = []
      mapRef.current?.destroy?.()
      mapRef.current = null
      console.error = origConsoleError
    }
```

- [ ] **Step 3: 验证 vitest 不破**

Run: `npm test`

Expected: 全 PASS

- [ ] **Step 4: 浏览器手动验证完整 D-1**

访问 `/tours/17`：
- **默认 'all'**：5 个 day color markers + 4 个灰 backlog markers + 4 条同天实线（D2/D3/D4/D5/D7/D8/D9 有 ≥2 act）+ 跨天虚线连接相邻天
- **'colored'**：4 个 backlog marker 消失；polyline 保留
- **'backlog'**：所有 day marker 消失，polyline 全消失，只剩 4 个灰 marker；fitView 自动缩到这 4 个的包围盒

- [ ] **Step 5: Commit**

```bash
git add app/javascript/components/planner/PlannerMap.jsx
git commit -m "map: polylines per-day + cross-day, hidden in backlog mode"
```

---

## Task 8: 最终验证

- [ ] **Step 1: 运行全量 Vitest**

Run: `npm test`

Expected: ALL PASS（含 16 条 PlannerMap.test.jsx + 现有所有测试）

- [ ] **Step 2: 运行全量 RSpec（确保后端无变化时不破）**

Run: `mise exec -- bundle exec rspec --format progress`

Expected: ALL PASS（D-1 不改后端）

- [ ] **Step 3: 浏览器手动 QA — Tour #17**

登录 `d1-pm@example.com`，访问 `/tours/17`，按下表逐项确认：

| # | 期望 |
|---|---|
| 1 | 默认 viewMode='all' 状态：地图右上角浮 SegmentedControl `[全部 \| 按天着色 \| 仅 backlog]`，"全部" 高亮 |
| 2 | 5 day 颜色 markers（D1 红 / D2 粉 / D3 紫 / D4 紫罗兰 / D5 靛蓝，圆形 + Dn 嵌入）|
| 3 | 4 个 backlog markers（霍尔果斯 / 可克达拉 / 夜市 / 薰衣草庄园）灰色虚线圆 |
| 4 | 同天实线 polyline 串起活动（D2 4 act 实线，D3 4 act 实线，D4 4 act 实线...）|
| 5 | 跨天虚线 polyline（D1→D2、D2→D3、...，跳过 D6 buffer 直接 D5→D7）|
| 6 | 切到 'colored'：4 个 backlog marker 消失，polyline 保留 |
| 7 | 切到 'backlog'：所有 day marker + polyline 消失，只剩 4 个灰 marker，地图自动缩到包围盒 |
| 8 | 切回 'all'：所有元素回归 |
| 9 | 同坐标重叠的 marker（D9 六星街 3 个全在 43.91, 81.33）渲染成单 marker（已知不处理）|
| 10 | 控制台无 error（除已知 `Canvas2D willReadFrequently` 警告）|

- [ ] **Step 4: 控制台 error 检查**

打开 DevTools Console，刷新 `/tours/17`，确认除 AMap canvas 警告外无 error / warning。

- [ ] **Step 5: 若有 fixes 最后 commit**

```bash
git add -A
git commit -m "chore: D-1 final fixes"
```

---

## 附：实施注意事项

- **Mantine `useMantineTheme`** 必须在 `MantineProvider` 内调用——`PlannerMap` 在 `Show.jsx` 内，已经在 `MantineProvider` 包裹下，可直接用。Vitest 测试中调用 `buildMarkerHTML` 用 mock theme 不依赖 hook（已在 Task 3 的测试中传 mock theme）。
- **AMap.Polyline `strokeStyle: 'dashed'`** 是 AMap JS API 2.0 文档化的取值。如果实际看到虚线没渲染，检查 SDK 版本（项目 `useAmap` hook 加载的 v2 应支持）。
- **`buildMarkerHTML` 返回的 HTML 字符串通过 AMap.Marker `content` prop 注入** —— 这是 AMap 2.0 文档支持的方式。注意 marker 内部的 `<div>` 不能有 `pointer-events: none`，否则 click handler 不响应。
- **`anchor: 'center'`** 让圆形 marker 中心对齐 lat/lng，与原 `'bottom-center'` 不同。InfoWindow offset 也要改成 `-20` 适应新 marker 高度（已在 Task 6 处理）。
- **dev server**：访问 `/tours/17` 前确保 dev server 在 `:9000`（用 `mise exec -- bundle exec rails server -p 9000` + `bin/vite dev`）。Tour 已在 dev DB 种好。
- **回滚策略**：D-1 全在前端，commit 粒度细。任何 step 失败可单独 `git revert <sha>` 回到上一步状态，不影响后端。
