# 规划页四列可调比例布局 — 候选 | 日卡 | 地图 | AI

**Date**: 2026-04-18
**Scope**: `app/javascript/pages/Tour/Show.jsx`、`app/javascript/components/planner/PlannerMap.jsx`、`app/javascript/components/planner/BacklogList.jsx`、`app/javascript/components/planner/ChatPanel.jsx`；新增 `app/javascript/components/planner/PanelLayout/` 目录

## 问题

当前规划页中段是 `gridTemplateRows: 'auto 1fr'` 上下分割：[PlannerMap](app/javascript/components/planner/PlannerMap.jsx:267) 占顶部 `height: 260` 写死，下方是横向滚动的日卡。两侧 `BacklogList` / `ChatPanel` 又压缩中段横向空间。结果地图同时被纵向（260px）和横向（两栏挤）双重压扁。

用户原话："看地图很难受，像是在眯缝着眼睛看"。

[`2026-04-18-planner-responsive-hardening`](docs/superpowers/specs/2026-04-18-planner-responsive-hardening-design.md) 引入了候选池可折叠 + 日卡 minWidth 120 + scroll-shadow，缓解了**横向**挤占；但地图本身仍被困在 260px 的"图腾"位置，没有真正成为编辑流的"实时反馈面板"。

## 非目标

- 不做地图 ↔ 日卡 的双向高亮 / hover 联动（另开 task）
- 不动 `PlannerMap` 的 AMAP SDK 集成、marker / polyline 构造逻辑
- 不动 `DayColumn` 内部（仍是竖排 ActivityCard 列表）
- 不动 `dnd-kit` 的命中判定 / autoScroll 配置 — 仅父容器从 grid 改 flex
- 不做触屏 / 移动端的拖拽手柄（desktop only，假设视口宽 ≥ 1024）
- 不做 panel 顺序拖拽（4 个固定顺序）
- 不持久化到后端 — 仅 localStorage（按 tour_id 隔离）

## 设计

### 总体拓扑：上下 → 左右

```
旧：                              新：
┌─────────────────────────┐       ┌──┬──────┬──────┬──┐
│ 候选 │ 地图 (260px)│ AI │       │候│ 日卡  │ 地图  │AI│
│      ├──────────────┤    │       │选│       │       │  │
│      │ 日卡横滚    │    │       │  │       │       │  │
└─────────────────────────┘       └──┴──────┴──────┴──┘
```

地图从"中段顶部 260px"提到"右半满高"。日卡从"中段底部"提到"地图左侧并列"。

### 比例模型（核心）

CSS flexbox，**flex-grow 比值**（不写死 px，自动适配屏宽）：

| Panel | 默认 grow | min-width | 折叠态 |
|---|---|---|---|
| 候选 | **2** | 64 | 40px rail |
| 日卡 | **5**（或 auto-fit） | 200 | 40px rail |
| 地图 | **5** | 240 | 40px rail |
| AI | **2** | 220 | 40px rail |

总和 14。对称：候选/AI 各 2，日卡/地图各 5。

**1920 屏渲染**：候选 ~274 / 日卡 ~686 / 地图 ~686 / AI ~274（扣除手柄 + padding）。

**min-width 是可读性下限**，不是布局比值的 floor —— 仅当窗口被压到极小时这些 min 才生效，正常使用下完全靠 grow 比例。

### 日卡 auto-fit 模式

默认开。规则：

- **auto-fit on**：`flex: 0 0 ${days.length * 200 + 32}px` — 日卡按 days 数自适应，地图吃掉差额
- **auto-fit off**（manual）：`flex: ${grow} 1 0` — 按用户拖出来的 grow 比例
- 用户**拖动 日卡 ↔ 地图 手柄**会自动把 auto-fit 切到 off
- 日卡 header 的 `📐` 按钮可在 on / off 之间切换

`200` 是 DayColumn 的"舒适宽度"（当前 [DayColumn.jsx:37](app/javascript/components/planner/DayColumn.jsx:37) `min-width: 120` 是压缩底线，200 是阅读舒适值）。

### 拖拽手柄

3 个手柄分别置于：候选↔日卡 / 日卡↔地图 / 地图↔AI。

- **样式**：常态 6px 灰色（`#cfcfd3`），hover 10px 蓝色（`#0071e3`），`cursor: col-resize`
- **拖动**：改变两侧 panel 的 grow 值，**总和守恒**（`a + b = oldA + oldB`）
- **min 卡位**：当任一侧达到 min-width 对应的 grow，手柄拒绝继续向那个方向移动（不会触发折叠）
- **隐藏**：相邻 panel 折叠时该手柄不渲染（不能拖一个 rail）
- **tooltip**：拖动中跟随鼠标显示 `${leftPx}px / ${rightPx}px`

实现：`onMouseDown` 在手柄上注册 `window` 级别的 `mousemove` / `mouseup`；用 `containerRef.current.getBoundingClientRect()` + `event.clientX - startX` 计算 delta，按当前可用宽度反推新 grow 值。

### 折叠 / 展开

每个 panel header 右上有 `‹` 按钮 → 折叠成 40px rail。Rail 渲染：图标 + 竖排 label（`writingMode: 'vertical-rl'`），点击或点 `›` 展开回原 grow 值。

复用现有 [BacklogList.jsx:24-32](app/javascript/components/planner/BacklogList.jsx:24) 和 [ChatPanel.jsx:14-34](app/javascript/components/planner/ChatPanel.jsx:14) 的 `open` / `onToggle` 协议，扩展到 PlannerMap + 日卡容器。

### "至少一个开"约束

派生状态：`openCount = panels.filter(p => p.open).length`。当 `openCount === 1`，那一个 panel 的折叠按钮 `disabled = true`，`cursor: not-allowed`，hover 出 tooltip "至少保留一个面板打开"。

不允许"全折"是因为 4 个全 rail 的页面无任何主内容可见，是无意义状态。

### 持久化

localStorage key：`planner-layout-v1-${tourId}`

```ts
type PanelState = {
  candidates: { open: boolean; grow: number }
  days:       { open: boolean; grow: number; autoFit: boolean }
  map:        { open: boolean; grow: number }
  ai:         { open: boolean; grow: number }
}
```

默认值：

```ts
const DEFAULT_LAYOUT: PanelState = {
  candidates: { open: true, grow: 2 },
  days:       { open: true, grow: 5, autoFit: true },
  map:        { open: true, grow: 5 },
  ai:         { open: true, grow: 2 },
}
```

读：mount 时尝试读 localStorage，失败用 default。写：每次 toggle / 拖完手柄 / 切 autoFit 都写入。Schema 变化时 `v1` 版本号 → 新 key（旧数据自动失效）。

### 文件改动清单

#### 新增

`app/javascript/hooks/usePlannerLayout.js`
- 单参 `tourId`，返回 `{ panels, openCount, togglePanel(id), toggleAutoFit(), resizeBetween(leftId, rightId, deltaPx, totalPx), handleVisible(leftId, rightId), flexStyle(id, opts?) }`
- 内部管理 localStorage 读写、"至少一个开"约束、 grow 守恒计算
- `handleVisible(a, b)` = `panels[a].open && panels[b].open`（两侧都开才显示手柄）

`app/javascript/components/planner/PanelLayout/PanelShell.jsx`
- `<PanelShell title icon open onToggle canToggle headerExtra>{children}</PanelShell>`
- 渲染 panel header（标题 + extra slot 给 📐 / 视图切换 + ‹/› 按钮）
- 折叠态渲染 40px rail（图标 + 竖排 label + ›）
- `canToggle === false` → ‹ 按钮 disabled + tooltip

`app/javascript/components/planner/PanelLayout/ResizeHandle.jsx`
- props: `onResize(deltaPx)`、`disabled`
- 6px 灰条；hover 10px + 蓝；`onMouseDown` 启动全局拖拽
- 拖拽中显示 tooltip（用 portal，避免被父 overflow 截断）
- `disabled` → 不渲染（相邻 panel 折叠时）

#### 修改

[`app/javascript/pages/Tour/Show.jsx`](app/javascript/pages/Tour/Show.jsx) — 替换现有 grid 为 flex 4 列：

```jsx
const layout = usePlannerLayout(tour.id)
const containerRef = useRef(null)

const handleResize = (leftId, rightId) => (deltaPx) => {
  const total = containerRef.current?.getBoundingClientRect().width
  layout.resizeBetween(leftId, rightId, deltaPx, total)
}

return (
  <DndContext ...>
    <div style={{ padding: 10 }}>
      <TourTabs ... />
      {/* title + members + ConstitutionBanner 不变 */}
    </div>

    <div ref={containerRef} style={{
      display: 'flex',
      gap: 0,
      padding: 10,
      height: 'calc(100vh - 200px)',  // header + tabs + title + banner ≈ 200
      alignItems: 'stretch',
    }}>
      <BacklogList
        activities={backlog}
        {...handlers}
        open={layout.panels.candidates.open}
        onToggle={() => layout.togglePanel('candidates')}
        canToggle={layout.openCount > 1 || !layout.panels.candidates.open}
        flexStyle={layout.flexStyle('candidates')}
      />
      <ResizeHandle disabled={!handleVisible('candidates','days')} onResize={handleResize('candidates','days')} />

      <DayPanel
        days={days} byDay={byDay} tour={tour} {...handlers}
        open={layout.panels.days.open}
        onToggle={() => layout.togglePanel('days')}
        canToggle={layout.openCount > 1 || !layout.panels.days.open}
        autoFit={layout.panels.days.autoFit}
        onToggleAutoFit={layout.toggleAutoFit}
        flexStyle={layout.flexStyle('days', { autoFitWidth: days.length * 200 + 32 })}
      />
      <ResizeHandle
        disabled={!layout.handleVisible('days', 'map')}
        onResize={handleResize('days', 'map')}
      />

      <MapPanel
        activities={activities} days={days}
        open={layout.panels.map.open}
        onToggle={() => layout.togglePanel('map')}
        canToggle={layout.openCount > 1 || !layout.panels.map.open}
        flexStyle={layout.flexStyle('map')}
      />
      <ResizeHandle
        disabled={!layout.handleVisible('map', 'ai')}
        onResize={handleResize('map', 'ai')}
      />

      <ChatPanel
        tour={tour}
        open={layout.panels.ai.open}
        onToggle={() => layout.togglePanel('ai')}
        canToggle={layout.openCount > 1 || !layout.panels.ai.open}
        flexStyle={layout.flexStyle('ai')}
        {...chatProps}
      />
    </div>

    <DragOverlay>{activeActivity && <ActivityCardOverlay activity={activeActivity} />}</DragOverlay>
  </DndContext>
)
```

`flexStyle(id, opts?)` 返回 `{ flex: '0 0 40px' }`（折叠）/ `{ flex: '0 0 ${autoFitWidth}px' }`（日卡 auto-fit）/ `{ flex: '${grow} 1 0', minWidth: ... }`（manual）。

[`app/javascript/components/planner/PlannerMap.jsx`](app/javascript/components/planner/PlannerMap.jsx) — 包一层 `PanelShell` + 移除 `height: 260`：

```diff
- return (
-   <Paper withBorder style={{ height: 260, position: 'relative', ... }}>
-     <div ref={containerRef} style={{ position: 'absolute', inset: 0 }} />
-     ...
-   </Paper>
- )
+ // 旧组件改名为 PlannerMapInner，仅渲染地图 + 视图切换 + overlays，不再设 height
+ // 新 PlannerMap = PanelShell + PlannerMapInner，传入 flexStyle / open / onToggle
+ // 父容器（DayPanel/MapPanel）通过 flex 控制宽度，地图通过 height: 100% 撑满父高
```

视图切换 SegmentedControl 仍 absolute 定位在 inner 容器右上。

[`BacklogList.jsx`](app/javascript/components/planner/BacklogList.jsx) / [`ChatPanel.jsx`](app/javascript/components/planner/ChatPanel.jsx) — 把 `open=false` 分支提取到 `PanelShell`，组件本体只关心展开内容。新增 `flexStyle` / `canToggle` props 透传。

新 `app/javascript/components/planner/DayPanel.jsx` — 包 `PanelShell` + 现有日卡 strip（保留 scroll-shadow）+ AddDayButton + auto-fit 按钮。DayColumn 内部不动。

### usePlannerLayout 关键算法

**grow 守恒拖拽**（`resizeBetween`）：

```js
function resizeBetween(leftId, rightId, deltaPx, totalPx) {
  const left = panels[leftId], right = panels[rightId]
  // 只对 manual 模式生效；若 leftId === 'days' && autoFit，先关 autoFit 再拖
  if (leftId === 'days' && panels.days.autoFit) {
    setAutoFit(false)
  }
  const totalGrow = left.grow + right.grow
  const totalSpace = totalPx * (totalGrow / sumOfOpenGrows)  // 两侧合计的实际像素
  const deltaGrow = (deltaPx / totalSpace) * totalGrow
  const newLeft = clamp(left.grow + deltaGrow, leftMinGrow, totalGrow - rightMinGrow)
  setGrow(leftId, newLeft)
  setGrow(rightId, totalGrow - newLeft)
}
```

`leftMinGrow` 由 `minWidth(leftId)` 反推：grow 至少要让面板 ≥ minWidth。这步保证拖到 min 时手柄"卡住"。

**"至少一个开"约束**（`togglePanel`）：

```js
function togglePanel(id) {
  const next = !panels[id].open
  if (!next && openCount === 1) return  // 拒绝
  setPanels(prev => ({ ...prev, [id]: { ...prev[id], open: next } }))
}
```

## 不改（显式）

- 4 panel 顺序固定（候选 | 日卡 | 地图 | AI），不能拖序
- DayColumn 内部布局（活动竖排 + ActivityCard 渲染）
- PlannerMap 的 SDK 加载 / marker 构造 / `useAmap` hook
- DndContext 配置（`closestCenter`、`autoScroll`、`onDragStart/End/Over`）
- BacklogList / ChatPanel 的业务逻辑（filter、droppable、useChat）
- ConstitutionBanner / TourTabs / 顶部 title 区
- `<1024` 视口的响应式（assume 现代桌面）

## 测试

### 单元测试

`app/javascript/hooks/__tests__/usePlannerLayout.test.js`（新）：
- 默认值正确（`2:5:5:2`、`autoFit: true`、4 panel 全 open）
- `togglePanel('candidates')` → open false；再调用 → open true
- 仅剩 1 个 open 时，`togglePanel` 那个 id 拒绝（panels 不变）
- `resizeBetween('days', 'map', +50, 1000)` → days.grow 增加、map.grow 减少、总和不变
- `resizeBetween('days', 'map', ...)` 自动把 `autoFit` 切到 false
- localStorage：mount 读、setter 写、key 含 tourId
- 损坏 localStorage（JSON 解析失败）→ 静默回 default

`app/javascript/components/planner/PanelLayout/__tests__/ResizeHandle.test.jsx`（新）：
- mousedown → mousemove → mouseup 触发 onResize 一次（带累计 delta）
- `disabled` → 不渲染

`app/javascript/components/planner/PanelLayout/__tests__/PanelShell.test.jsx`（新）：
- `open=true` 渲染 children + header
- `open=false` 渲染 rail（图标 + 竖排 label）
- `canToggle=false` → ‹ 按钮 disabled，hover tooltip

### 组件测试

[`app/javascript/components/planner/__tests__/`](app/javascript/components/planner/__tests__) 下现有 BacklogList / ChatPanel 测试 — 验证 `open=false` 分支已迁到 PanelShell 后，仍通过（断言 rail 存在、点击触发 onToggle）。

### 手测脚本

`bin/worktree-dev up`，访问 `/tours/<id>` 规划页：

1. **默认**：4 panel 全开，地图占右半（明显比 260px 大），日卡 auto-fit 不滚动
2. **折叠候选**：候选变 40px rail，地图/日卡按 5:5 重新分配
3. **折叠到剩 1 个**：地图的 ‹ 按钮变灰，hover 出 "至少保留一个面板打开" tooltip
4. **拖手柄**：拖 日卡 ↔ 地图 → 日卡 header 的 `📐 auto` 变成 `📐 恢复` 按钮；点击恢复 auto-fit
5. **持久化**：刷新页面，所有 panel 状态保留
6. **多 tour**：切换到另一个 tour，layout 独立（不互相覆盖）
7. **DnD**：从候选拖到日卡，从一日拖到另一日 — 与现状一致
8. **窗口缩放**：从 1920 缩到 1280，4 panel 等比变窄（min-width 生效前不会出现横滚）

## 风险 / 权衡

- **拖拽实现的边界条件**：mouseup 在 panel 外（漂移到地图上、tooltip 上）必须正确收到事件 — 用 `window` 级别监听 + 在 mouseup 里 `removeEventListener`。`pointerEvents` 在拖动中要禁用 iframe / map canvas 的命中（避免 AMAP 抢事件）— 拖动期间在 `<body>` 上 append 一层 `position: fixed; inset: 0; cursor: col-resize; z-index: 9999` 的透明 div，mouseup 时移除。
- **AMAP 在 flex 容器中重 size**：地图 SDK 有 `resizeEnable: true`，但 flex 重排时是否触发 ResizeObserver 待验证。若不触发，需要在 layout 变化后手动调 `mapRef.current?.resize?.()`。
- **DnD 跨 panel 的 autoScroll**：`autoScroll: { acceleration: 10, threshold: { x: 0.15, y: 0.15 } }` — 现在 4 panel 各有独立滚动容器，autoScroll 应该自然适应。需手测确认拖到边缘正确滚动目标 panel。
- **DayColumn min-width 与 auto-fit 的张力**：[DayColumn.jsx:37](app/javascript/components/planner/DayColumn.jsx:37) 现有 `minWidth: 120`，auto-fit 用 200/列。当用户 manual 拖窄日卡 panel 到 5 列 × 120 = 600px 时，DayColumn 用 120 渲染（不会强行 200）。auto-fit on 时 panel 宽度 = 200/列，DayColumn 自然展开到 ~200。两者相容。
- **"持久化按 tour_id"** 在用户有许多 tour 时会让 localStorage 变大。每个 tour 的 PanelState 序列化 ~120 字节，10000 tour 也才 ~1.2MB，远低于 5MB 限额。无需清理策略。
- **窗口宽度 < 4 panel min-width 之和**（720 + 手柄 + padding ≈ 770px）：body 出现横向滚动，体验不佳但不破。1024 是假设下限；OOS 处理 < 1024 的情况。

## 验收

- 1920 屏，8 天 tour，默认状态下：地图区域宽度 ≥ 600px（之前 ~400px），高度 ≥ 500px（之前 260px）
- 4 panel 各自可独立折叠 / 展开；折叠态是 40px rail
- 仅剩 1 个 open 时，那个 panel 的 ‹ 按钮 disabled，hover 出文字提示
- 拖动 3 个手柄都能改变两侧 panel 比例；拖到 min 卡位
- 拖 日卡 ↔ 地图 → auto-fit 自动关，可点 `📐` 恢复
- 刷新页面所有 panel 状态保留（per tour）
- 现有 DnD 行为不变（候选 → 日卡、日卡 → 日卡、跨日 buffer 提示）

## 落地

- 新增 [usePlannerLayout.js](app/javascript/hooks/usePlannerLayout.js)、[PanelShell.jsx](app/javascript/components/planner/PanelLayout/PanelShell.jsx)、[ResizeHandle.jsx](app/javascript/components/planner/PanelLayout/ResizeHandle.jsx)、[DayPanel.jsx](app/javascript/components/planner/DayPanel.jsx)
- 修改 [Show.jsx](app/javascript/pages/Tour/Show.jsx)、[PlannerMap.jsx](app/javascript/components/planner/PlannerMap.jsx)、[BacklogList.jsx](app/javascript/components/planner/BacklogList.jsx)、[ChatPanel.jsx](app/javascript/components/planner/ChatPanel.jsx)
- 新测试：3 个 `__tests__/` 文件如上；现有 BacklogList / ChatPanel 测试微调以适配 `open=false` 分支迁移
- 跑 `mise exec -- bundle exec rspec`、`npm test`、`bin/rubocop -f github`、`bin/brakeman --no-pager`、`npm audit`
