# 规划地图初始中心改为中国全景

**Date**: 2026-04-18
**Scope**: `app/javascript/components/planner/PlannerMap.jsx`

## 问题

新建旅程（0 POI）进入"规划"标签时，AMap 默认中心为乌鲁木齐一带（硬编码 `[87.5, 43.5]` zoom 5），与旅程内容严重不符。例如创建"川西 5 日"后，地图锁定在新疆，用户添加第一个 POI 后才触发 refit，中间体验误导。

**根因**：`PlannerMap.jsx:189` 构造 `AMap.Map` 时把 `center` 硬编码为新疆中心（注释自述 "新疆大致中心 — 默认视图"），来自早期"新疆路书"项目背景没清理。

**现场证据**：
- 代码：`center: [ 87.5, 43.5 ]`（[PlannerMap.jsx:189](../../../app/javascript/components/planner/PlannerMap.jsx)）
- 运行时（新建空旅程实测）：`{ lng: 87.5, lat: 43.5, zoom: 5 }`
- 截图：屏幕中央显著可见"乌鲁木齐"标签

## 非目标

- **不**做标题关键词 → 地理解析（"川西" → 成都）。静态字典维护成本高、覆盖率差（"西藏 N 日"、"国庆自驾"、"探店"），LLM 调用有延迟和成本，投入产出比低。
- **不**做 IP geo 定位。用户在家规划明天行程是主场景，IP 位置和目的地无相关性，引入一个外部依赖 + 隐私面 + 错误路径都不划算。
- **不**动 [PlannerMap.jsx:242](../../../app/javascript/components/planner/PlannerMap.jsx) 的 `visible.length === 0` 跳过 refit 逻辑。该逻辑防止用户手动平移后被自动拉回，是正确行为，和本 bug 正交。

## 设计

单点改动，[PlannerMap.jsx:187-192](../../../app/javascript/components/planner/PlannerMap.jsx)：

```jsx
mapRef.current = new window.AMap.Map(containerRef.current, {
  zoom: 4,
  center: [ 104, 35 ], // 中国大致中心 — 空态默认视图
  viewMode: '2D',
  resizeEnable: true
})
```

`[104, 35]` 是中国地理中心（甘肃兰州一带）。zoom 4 覆盖全国加周边，用户能看到从北京到拉萨、从哈尔滨到海南的整体图景。

### 行为对照

| 场景 | 改前 | 改后 |
|------|------|------|
| 新建旅程，0 POI | 显示新疆 | 显示中国全景 |
| 加 1 个 POI | `setZoomAndCenter` 跳到该点（[240](../../../app/javascript/components/planner/PlannerMap.jsx)） | 同上 ✓ |
| 加 2+ POI | `setFitView` 框选（[238](../../../app/javascript/components/planner/PlannerMap.jsx)） | 同上 ✓ |
| 删光所有 POI 回到 0 | 保留当前视图（[242](../../../app/javascript/components/planner/PlannerMap.jsx)） | 同上 ✓ |

## 验证

手动 E2E（浏览器）：
1. 登录 → 新建旅程 → 切到"规划"标签
2. 预期：看到中国全景，能同时看到北京/成都/乌鲁木齐标签，无单一城市聚焦
3. 添加一个 POI（任意地点，如"春熙路"）：地图应跳到该点
4. 删除该 POI：地图停在刚才 POI 附近（不回 `[104, 35]`）

运行时 JS eval 核对 `mapRef.current.getCenter()` 应返回 `{ lng: 104, lat: 35 }`，zoom 应为 4。

无单测（整个组件依赖 AMap SDK，已有 specs 也未覆盖）。
