# Tranche D-1 — Planner 地图能力升级（polyline + 视图切换 + backlog 视觉）

**Status**: Design approved 2026-04-16 · awaiting implementation plan
**Source**: Tranche D backlog · Screen 4 G4-a/c/d
**Scope**: 单一组件 `PlannerMap.jsx` 升级，让地图反映当前规划
**参考原型**: `docs/superpowers/specs/2026-04-15-tour-day-activity-remodel-wireframes.html` Screen 4

---

## 背景

Tranche A/B/C 落地后用 Tour #17 "伊犁环线 10 日（37 个 activity，10 days）" 真实数据走查地图，发现 5 条问题：

1. **D1/D3/D5/D7/D10 标签挤在地图上但没连线** — 看不出顺序，看不出走向，看不出哪天去哪天
2. **Backlog 4 个备选 marker 与 day-assigned 视觉完全一样** — 分不出"待选"
3. **同位置多 activity 重叠**（D9 六星街 3 个 activity 全在同一坐标） — 渲染成单 marker
4. **D2/D3 长距离驾驶段**（独库公路 600+km）若用直线 polyline 会失真
5. **D6 buffer day 没视觉痕迹**

D-1 解决 #1、#2，部分缓解 #4（先用直线，留 polish），不解决 #3、#5（YAGNI）。

---

## 1 · 决策汇总

| 决策点 | 选择 | 理由 |
|---|---|---|
| Polyline 形状 | **直线**（lat/lng 直连） | YAGNI，先解决"看不出顺序"。Tranche C 已撞过 AMap rate limit，避免 Driving 服务的 QPS 风险。真实路径作为后续 polish |
| 调色板 | **Mantine 内置 10 色**（red/pink/grape/violet/indigo/blue/cyan/teal/green/yellow）| 与 app design system 一致，省决策。10 色循环（D11=red），通常不在视觉同区域不冲突 |
| Backlog pin | **灰色虚线圈** | wireframe 字面要求，最简单实现，意图清晰 |
| Marker 重叠 | **不处理** | YAGNI；点击单 marker 看 InfoWindow，重叠的 activity 走 BacklogList / DayColumn 编辑 |
| 视图切换 | **右上角 SegmentedControl，三选一**（全部 / 按天着色 / 仅 backlog），默认 "全部" | wireframe 字面要求；不持久化 viewMode 状态（刷新重置） |
| 跨天连线样式 | **虚线**（区别于同天实线） | 暗示"语义弱于同天连续"，避免误读为同天的连续路径 |
| Buffer day 在 polyline 中 | **跳过** | 无 activity 的 buffer day 直接被序列省略（D5→D7 直连，跳过 D6） |
| viewMode 切换动画 | **瞬切** | YAGNI |

---

## 2 · 三种视图模式行为

| viewMode | Day-assigned marker | Backlog marker | Polyline | fitView |
|---|---|---|---|---|
| `all` (默认) | 显示，按天着色，带 Dn 嵌入 | 显示，灰色虚线圈，无 label | 显示（同天实线 + 跨天虚线） | 缩到所有可见 markers 包围盒 |
| `colored` | 显示，按天着色，带 Dn 嵌入 | **隐藏** | 显示 | 缩到 day-assigned markers 包围盒 |
| `backlog` | **隐藏** | 显示，灰色虚线圈 | **隐藏** | 缩到 backlog markers 包围盒 |

**单点 / 零点 fallback**（保持现有 PlannerMap 行为）：
- 可见 marker 数 = 1 → `setZoomAndCenter(10, [lng, lat])`
- 可见 marker 数 = 0 → 不动地图（用户自己缩放查看），可叠加一个 overlay 提示"当前视图无 activity"

---

## 3 · Marker 视觉规格

`PlannerMap` marker 改用 `new AMap.Marker({ content: htmlString, anchor: 'center' })` 自定义 HTML，不依赖 AMap 默认水滴 icon。

### Day-assigned marker

```
直径 28px 圆形 · 背景 = DAY_COLOR(day_index) · 白色 2px 边 · 阴影 0 2px 4px rgba(0,0,0,0.3)
中心嵌 Dn 文字（白色，11px，粗体）
```

替代当前 `AMap.Marker({ label: { content: 'D2', direction: 'top' } })`——副标签嵌入主体更紧凑，避免 label 被 zoom 缩放问题。

### Backlog marker

```
直径 22px 圆形 · 白底 · 灰色（#999） 2px 虚线边 · 透明度 0.85
无文字、无 label
```

### InfoWindow（保持现有）

点击任一 marker 弹气泡：
- `<strong>{name}</strong>`
- `已排入 D{n}` / `尚未排入（backlog）`

---

## 4 · Polyline 视觉规格

### 同天连线（一条 polyline / day）

按 `position` 顺序连接同一 day 的所有 activity（与 Timeline DayDetailPanel 一致 — 编辑顺序为权威，**不**按 `planned_start_at`）。

```
strokeColor = DAY_COLOR(day_index) Mantine theme [6]
strokeWeight = 3
strokeOpacity = 0.7
strokeStyle = 'solid'
showDir = false
```

### 跨天连线（一条 polyline / 相邻有 activity 天对）

D{n} 的最后 activity → D{n+1} 的第一个 activity。Buffer day 跳过：D5 最后 → D7 第一个（D6 buffer 不在序列）。

```
strokeColor = DAY_COLOR(D{n}_index)（起点天颜色）
strokeWeight = 2
strokeOpacity = 0.5
strokeStyle = 'dashed'
showDir = false
```

### Edge cases

- 同天只有 1 个 activity：无同天 polyline（1 个点连不起来）
- 同天 0 个 activity：跳过这天（buffer_day 或纯空 day）
- activity 没坐标（`lat/lng` null/缺失/非数字）：跳过此 activity（不影响其它点的连线）
- 整 tour 0 activity：无 polyline

### 性能

10 day × ≤30 activity 量级 ≈ 最多 ~20 条 polyline / tour。AMap 性能足够。每次 `useEffect [activities, days, viewMode]` 触发"清空旧 polyline + 重画"，与现有 marker 处理同构。

---

## 5 · ViewModeRadio 子组件

Mantine `<SegmentedControl>` 浮在地图右上角 8/8 位置：

```jsx
<SegmentedControl
  value={viewMode}
  onChange={setViewMode}
  data={[
    { value: 'all',     label: '全部' },
    { value: 'colored', label: '按天着色' },
    { value: 'backlog', label: '仅 backlog' },
  ]}
  size="xs"
/>
```

包一层 `<div style={{ position: 'absolute', top: 8, right: 8, zIndex: 2, background: 'white', borderRadius: 4, padding: 2, boxShadow: '0 2px 4px rgba(0,0,0,0.1)' }}>` 让它浮在 AMap canvas 之上。

---

## 6 · 实现结构（不拆新组件）

`PlannerMap.jsx` 从 159 行 → ~280 行。内部分 4 个 effect / helper：

```
PlannerMap.jsx
├─ const PALETTE = [...]
├─ DAY_COLOR(day_index) — 取 PALETTE[(day_index - 1) % 10]
├─ buildMarkerHTML(activity, dayMap) — 返回自定义 HTML 字符串
├─ buildPolylineConfigs(byDay, days) — 返回 [{ path, strokeColor, strokeStyle, ... }]
├─ filterActivitiesByViewMode(activities, viewMode) — 返回过滤后数组
├─ useEffect 1 [SDK ready] — 创建 AMap.Map（不变）
├─ useEffect 2 [activities, days, viewMode, sdkState] — 同步 markers
├─ useEffect 3 [activities, days, viewMode, sdkState] — 同步 polylines（新）
├─ <ViewModeRadio> 子组件 — 右上角 SegmentedControl
└─ Mantine theme 取色：useMantineTheme().colors[name][6]
```

**为何不拆**：marker / polyline / viewMode 共享同一个 `mapRef.current` + `markersRef.current` + 同一组 useEffect deps；强行拆出 `MapMarkerLayer.jsx` / `MapPolylineLayer.jsx` 会让 ref 跨组件传递、effect 依赖隐藏、state 同步复杂。一个 280 行文件比 4 个 80 行文件更容易理解。

---

## 7 · 文件清单

**修改**：
- `app/javascript/components/planner/PlannerMap.jsx` — 全部新逻辑（~120 行）

**新建**：
- `app/javascript/components/planner/__tests__/PlannerMap.test.jsx` — Vitest，仅测纯函数（DAY_COLOR / buildPolylineConfigs / filterActivitiesByViewMode），不集成测 AMap SDK

---

## 8 · 测试策略

### Vitest（pure function unit tests）

- `DAY_COLOR(1)` 返回 `'red'`
- `DAY_COLOR(10)` 返回 `'yellow'`
- `DAY_COLOR(11)` 返回 `'red'`（循环）
- `DAY_COLOR(0)` 边界（理论上不会出现，但断言不崩）
- `buildPolylineConfigs({1: [a1, a2, a3], 2: [a4]}, days)` 返回 3 个 config：D1 同天 (a1→a2→a3 实线) + D1→D2 跨天 (a3→a4 虚线) + D2 同天... 不，D2 只有 1 个 activity 不画同天线
- `buildPolylineConfigs` 跳过 buffer_day 无 activity 的天（D5→D7 跨天）
- `buildPolylineConfigs` 跳过 lat/lng 无效的 activity
- `filterActivitiesByViewMode(activities, 'backlog')` 只返 day_id=null
- `filterActivitiesByViewMode(activities, 'colored')` 只返 day_id 非 null
- `filterActivitiesByViewMode(activities, 'all')` 返全部

### 集成测试不做

AMap SDK 加载需要真实浏览器 + key + DOM canvas。沿用现有"PlannerMap 在 Show.test.jsx 里被 stub"策略——PlannerMap 内部 effects 不做集成测试，覆盖靠手动 QA。

### 手动 QA 清单（plan 阶段写明）

1. **Tour #17 默认 `all` 视图**：看到 5 个 day 颜色 markers + polyline 串起所有天，4 个灰色虚线 backlog markers 散在边上
2. **切到 `colored`**：4 个 backlog markers 消失，polyline 保留
3. **切到 `backlog`**：只剩 4 个灰色虚线 markers，无 polyline，地图 fitView 缩到 4 个备选 POI 包围盒
4. **fitView 在切换后正确缩放**
5. **D6 buffer day 在 polyline 中被跳过**（D5 最后一个 → D7 第一个直连虚线）
6. **同坐标多 marker 视觉重叠**（已知不处理，确认是这样，点击只能弹一个 InfoWindow）
7. **0 activity 切到 backlog**：无 marker，不崩
8. **ViewModeRadio 浮在地图上不被 marker 遮挡**

---

## 9 · 共用约束 / 边界

- 不引入新 npm 依赖（Mantine SegmentedControl + AMap.Polyline 都是现有的）
- 不引入新 Ruby gem
- 不改后端（activities 序列化已包含 lat/lng/day_id/position 字段）
- Reader 模式不区分（地图 view-only 本就一致）
- **不做的**：
  - 真实路径 polyline（AMap Driving 服务）—— 留 polish
  - Marker cluster（AMap.MarkerClusterer）—— 同坐标重叠不处理
  - Polyline 点击事件 / hover —— 视觉指示，无交互
  - viewMode URL 持久化 / localStorage —— 刷新重置
  - Marker 拖拽（要拖拽走 BacklogList/DayColumn 卡片）
  - Buffer day 在 polyline 上以单独 segment 标 "buffer" —— 直接跳过
  - 同天内按 `planned_start_at` 排序后再连线 —— 按 `position` 排（与 Timeline 一致）
  - 移动端响应式 —— ≥ 1280px 桌面定位

---

## 10 · 数字预估

| | 数量 |
|---|---|
| 新文件 | 1（PlannerMap.test.jsx）|
| 修改文件 | 1（PlannerMap.jsx，~120 行新增）|
| Vitest 新增 | ~10 examples（DAY_COLOR ×4 + buildPolylineConfigs ×4 + filterActivitiesByViewMode ×3）|
| RSpec 新增 | 0（无后端改动）|
| 工作量 | ~8h（一个工作日）|

---

## 11 · 交付顺序建议

按依赖顺序拆 5 个 commit：

1. **DAY_COLOR helper + Mantine theme 取色** + Vitest
2. **buildPolylineConfigs pure function** + Vitest（含 buffer skip / 无坐标跳过 / 跨天虚线）
3. **filterActivitiesByViewMode** + Vitest
4. **PlannerMap.jsx markers 重写** — 用 buildMarkerHTML 替换默认 icon + label，加 viewMode state
5. **PlannerMap.jsx polylines + ViewModeRadio** — 加第二个 useEffect + 浮层组件

每段独立 commit、独立可发布。Step 4 没 step 5 时，view switcher 不渲染但 markers 已用新视觉。

---

## 附：已知后续（不在本 spec）

- 真实路径 polyline（AMap Driving + 缓存策略 + QPS 限制）—— 单独 polish
- Marker cluster（同坐标聚合）—— wireframe 未提，等用户反馈
- Buffer day 在 timeline / map 的统一视觉语言 —— 设计 polish
- 地图与 Day column hover 联动（hover Day → 高亮该天 markers + polyline）—— 加分项
