# 去黑话 + tooltips 设计（子项目② / P1-3）

日期：2026-06-02
分支：claude/strange-noyce-4e5387
来源：PM 新用户视角评估 P1-3（3 子项目中的第②个）

## 背景

新用户首会就撞上一堆内部黑话，定义只藏在没人细读的《本程宪法》里：

- **公民等级**：编辑器 citizen_level 控件标签「公民等级」+ 选项「一等公民（核心）/二等公民（配角）/三等公民（可删）/基础设施（自动）」——加第一个景点就直面这套"公民"黑话，无就地解释。
- 上一轮卡片/筛选改成的友好词 **「今日重点」** 也有问题：它是**活动级的层级**（与某一天无关），"今日"会被误读成"今天的"。
- **机动日 / 软提示·硬违反 / 承认此违反 / 景观公路强制为最高级**——均无 tooltip，用户看不懂。

## 锁定决策

1. **四级友好标签统一为：必去 / 想去 / 备选 / 后勤**（tier_one=必去、tier_two=想去、tier_three=备选、infrastructure=后勤）。替换两处历史标签：编辑器的「一/二/三等公民」黑话 **和** 上一轮的「今日重点/配角/基础设施」。全处一致（编辑器 / 筛选 chip / 详情抽屉 / 日页脚 metric / tooltip）。
2. **编辑器字段标签**：「公民等级」→「重点层级」+ 一行 hint。
3. **常量收敛**：`CITIZEN_LEVEL_FILTER_OPTIONS` 重命名为 `CITIZEN_LEVEL_OPTIONS`（成为唯一规范的用户可见标签集，标签=必去/想去/备选/后勤，值仍是 tier_one/two/three/infrastructure），**删除旧黑话 `CITIZEN_LEVEL_OPTIONS`**。
4. **4 条 tooltip**（措辞见 §3）。
5. 实现：就地改标签/常量 + 加 tooltip，**无新组件、无后端、无 schema、不改 citizen_level 枚举值**。

## 设计

### 1. 四级标签统一 + 常量收敛

`app/javascript/components/activity-editor/detailsSchema.js`：
- 把现有 `CITIZEN_LEVEL_FILTER_OPTIONS` **重命名为 `CITIZEN_LEVEL_OPTIONS`**，标签改为：
  ```js
  export const CITIZEN_LEVEL_OPTIONS = [
    { value: 'tier_one',       label: '必去' },
    { value: 'tier_two',       label: '想去' },
    { value: 'tier_three',     label: '备选' },
    { value: 'infrastructure', label: '后勤' },
  ]
  ```
- **删除旧的黑话 `CITIZEN_LEVEL_OPTIONS`**（一等公民…那份）。
- 更新 import 方（把 `CITIZEN_LEVEL_FILTER_OPTIONS` 改为 `CITIZEN_LEVEL_OPTIONS`，把旧黑话消费方改用新集）：
  - `ActivityFilterBar.jsx`（筛选 chip：现 import FILTER 版 → 改名；chip 文案随之变必去/想去/备选/后勤）
  - `useActivityFilter.js`（`VALID_LEVELS` 来源 import → 改名）
  - `CommonFields.jsx`（编辑器：现 import 黑话版 → 改用 `CITIZEN_LEVEL_OPTIONS` 新集）
  - `ActivityDetailDrawer.jsx`（详情显示：现 import 黑话版用于 label 查找 → 改用新集）

`app/javascript/components/planner/DayColumn.jsx`：
- 日页脚 `DayMetricBar` 的 label `今日重点` → **`必去`**（tier_one 的计数指标）。

### 2. 编辑器控件（`CommonFields.jsx`）

- `Radio.Group` 的 `label` 由 `公民等级` → **`重点层级`**；选项 map 改用 `CITIZEN_LEVEL_OPTIONS`（必去/想去/备选/后勤）。
- 控件下方加一行灰字 hint（`Text size="xs" c="dimmed"`），**条件文案**：
  - 普通（kind ≠ 景观公路）：**「必去=核心、不可错过 · 想去=锦上添花 · 备选=时间紧可删 · 后勤=加油/休息等自动归类」**
  - kind=景观公路（此时其他层级被禁用、强制必去）：**「景观公路本身就是核心体验，自动归为『必去』」**（即 §3 的 tooltip #4 以这行就地说明实现，不用单独 info icon）

### 3. 4 条 tooltip

用 Mantine `Tooltip`（`multiline`，`w` 适中）包裹既有元素；触发图标用 Tabler `IconInfoCircle`（size 13、`c="dimmed"`、`vertical-align`），或直接包裹既有文本/按钮。**纯中文文案、Tabler 图标，符合项目约定**。

| # | 位置 | 包裹对象 | 文案 |
|---|---|---|---|
| 1 | `DayColumn.jsx` 页脚 | 「机动」文字（`day.buffer_day` 时） | 弹性/缓冲日——应对天气、疲劳或突发，不排硬行程 |
| 2 | `ConstitutionBanner.jsx` | 违反级别标记（硬/软的图标或文字） | 软提示=建议，可忽略；硬违反=超出硬约束，需修正或明确承认 |
| 3 | `ConstitutionBanner.jsx` | 「承认此违反」按钮 | 记录一条豁免：我知道这超了约束，但坚持当前安排 |
| 4 | `CommonFields.jsx` | kind=景观公路 时，§2 的 hint 行切换成这句（就地说明，非单独 tooltip 组件） | 景观公路本身就是核心体验，自动归为「必去」 |

### 4. 触达文件

- `detailsSchema.js`：常量改名 + 四标签 + 删黑话常量。
- `CommonFields.jsx`：字段标签「重点层级」+ 友好选项 + hint + 景观公路 tooltip(#4)。
- `ActivityDetailDrawer.jsx`：层级显示改用新集。
- `ActivityFilterBar.jsx` + `useActivityFilter.js`：import 改名（chip/校验随之变）。
- `DayColumn.jsx`：页脚 metric label `今日重点`→`必去` + 机动 tooltip(#1)。
- `ConstitutionBanner.jsx`：软硬级别 tooltip(#2) + 承认按钮 tooltip(#3)。

### 5. 测试

- `ActivityFilterBar.test.jsx`：层级 chip 断言 `今日重点/配角/基础设施` → `必去/想去/后勤`（`备选` 不变）。
- `DayColumn.test.jsx`：页脚 metric 断言 `今日重点` → `必去`（注意区分 hint 里也可能出现「必去」——用更精确的选择器或断 metric 区域）。
- `CommonFields`/`ActivityDrawer.test.jsx`：字段标签 `公民等级`→`重点层级`；选项里的黑话 `一等公民（核心）` 等断言 → 友好词；road→tier_one 相关测试改断友好词。
- `ActivityDetailDrawer.test.jsx`：层级显示文案断言更新。
- 新增：4 条 tooltip 的存在性/可访问性断言（`Tooltip` 的 label 文案；按需用 `findByText`/aria）。
- `useActivityFilter.test.js`：用的是 values（tier_one 等）不是 labels，**应不受影响**；跑一遍确认。

## 边界与非目标

- **不动《本程宪法》正文**（`ConstitutionFullText` 保留正式"公民等级/一等公民"措辞——那是刻意的正式文书）。
- **不动 timeline 组件**（`RhythmBar`/`TourSummaryBar`/`TimelineDayColumn` 里的"机动"等措辞）——本轮聚焦规划器主路径触点。
- **不改 citizen_level 后端枚举/值**（tier_one/two/three/infrastructure 不变）。
- 不动 tier_three 默认值（属子项目③）。
- 不新增图标库（仅 Tabler）；tooltip 不堆叠出现于同一行造成噪音。
