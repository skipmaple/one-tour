# 丰富行程筛选维度设计（状态 / 重点层级 / 需预约）

日期：2026-06-02
分支：claude/strange-noyce-4e5387

## 背景

规划器筛选面板（`ActivityFilterBar` + `useActivityFilter`）当前只有 3 个维度：搜索（`q`，匹配名字 + `details` 全文）、类型（`kind`）、参与人（`uids`）。

而本轮卡片重构后，卡片上已经在展示**状态**（待定 / 暂停开放）、**重点层级**（今日重点 / 可选）、**需预约**等信息——用户看得到却筛不了。这些字段都已序列化到前端（`activity.status`、`activity.citizen_level` 由 model 序列化；`need_reservation`、`place.rating` 在 `details` 里），所以**纯前端**即可补齐筛选，无需任何 Rails / 迁移改动。

经澄清，本次加 **3 个维度**：状态、重点层级、需预约。**不含评分**（`place.rating` 只对已富集的景点/酒店有值，太稀疏，会把未富集的全筛掉）。

## 锁定决策

1. **维度范围**：状态（`status`）、重点层级（`citizen_level`）、需预约（`details.need_reservation`）。
2. **重点层级用友好 4 档**：今日重点(tier_one) / 配角(tier_two) / 备选(tier_three) / 基础设施(infrastructure)。避开编辑器 `CITIZEN_LEVEL_OPTIONS` 的"一等公民（核心）"黑话——本轮已把卡片/页脚刻意改成友好词（有测试断言页脚是"今日重点"而非"核心 jargon"），筛选作为"看卡片"的工具应与之一致。
3. **匹配语义**：维度内 OR、维度间 AND——沿用现有 `kind` / `uids` 的既定行为，不引入新语义。
4. **默认值**：所有新维度默认空 / 关（即默认不筛、全显），与现状一致；不做"默认隐藏暂停开放"之类的行为变更。
5. **实现方式**：方案 A——就地扩展 `useActivityFilter` + `ActivityFilterBar`，与 `kind` 维度同构。否决了 B（声明式维度配置，YAGNI）与 C（服务端筛选，数据已在前端）。

## 设计

### 1. 维度与控件

| 维度 | 字段 | 控件 | 档位 / 标签 | URL 参数 |
|---|---|---|---|---|
| 状态 | `activity.status` | `Chip.Group` 多选 | 复用 `STATUS_OPTIONS`：已定 / 待定 / 暂停开放 | `status`（逗号） |
| 重点层级 | `activity.citizen_level` | `Chip.Group` 多选 | 新增 `CITIZEN_LEVEL_FILTER_OPTIONS`：今日重点 / 配角 / 备选 / 基础设施 | `levels`（逗号） |
| 需预约 | `details.need_reservation` | 单个 `Checkbox` | 「仅看需预约」布尔开关 | `reserve=1`（true 时存在） |

- 状态 / 层级 chip **不加图标**：`kind` chip 有图标是因为 kind 有既定 `KIND_ICONS`；状态/层级无既定图标，纯文字，避免自创装饰（遵守"图标只用 Tabler、不拿字符/emoji 当功能图标"）。
- 需预约用 `Checkbox`（语义是"仅看 X 的"过滤开关，比孤零零一个 Chip 更达意；也与同面板的"参与人"Checkbox 一致）。

### 2. 状态形状

`useActivityFilter` 的本地 state 与传入 `useActivityFilterCore` 的 `filter`：

```
{ q, kind, uids }  →  { q, kind, uids, status, levels, reserve }
```

- `status: string[]`（confirmed/pending/closed 的子集）
- `levels: string[]`（tier_one/tier_two/tier_three/infrastructure 的子集）
- `reserve: boolean`

### 3. URL 持久化（URL 为真相源，沿用现有机制）

- 新增 `status` / `levels`（逗号连接）、`reserve=1`（true 存在、false 省略）。
- `filterFromParams`：解析时**丢弃未知值**（与 `kind` 一致——防 stale / typo 的 URL 把维度激活成 0 匹配、把所有活动隐藏）。校验集合：
  - `VALID_STATUSES = new Set(STATUS_OPTIONS.map(o => o.value))`
  - `VALID_LEVELS = new Set(CITIZEN_LEVEL_FILTER_OPTIONS.map(o => o.value))`
  - `reserve = params.get('reserve') === '1'`
- `buildUrl`：仅在 `status.length` / `levels.length` / `reserve === true` 时写入对应参数。
- 三个新参数都参与 `urlKey`（切换 tour 时重置本地 state，避免在 `preserveState` 导航下串状态）。

### 4. `matches` 谓词（`useActivityFilterCore`）

在现有 q / kind / uids 分支后追加（维度内 OR、维度间 AND）：

```js
if (status.length > 0 && !status.includes(activity.status)) return false
if (levels.length > 0 && !levels.includes(activity.citizen_level)) return false
if (reserve && !activity.details?.need_reservation) return false
```

`active` 增补：`... || status.length > 0 || levels.length > 0 || reserve`。

→ 连带生效、无需额外改动的两处：拖拽禁用（`filterActive` = `active`，DayColumn 据此 `draggable=false`）、计数徽标（`activeCount/totalCount`）。

### 5. 设置器与重置

- 新增 `setStatus` / `setLevels` / `setReserve`，镜像 `setKind`：立即 `pushUrl`、清 q 的 debounce timer。
- `reset` 的空值改为 `{ q:'', kind:[], uids:[], status:[], levels:[], reserve:false }`。

### 6. UI 顺序（320px popover）

搜索 → 类型 → 重点层级 → 状态 → 需预约 → 参与人 → 分隔线 → 计数徽标 + 重置。

section 变多，给 `Popover.Dropdown` 内容 `Stack` 加 `maxHeight`（如 `min(70vh, 520px)`）+ `overflowY:auto`，超高可滚（移动端已有的 `width` 覆盖保留）。

### 7. 触达文件

- `app/javascript/components/activity-editor/detailsSchema.js`：新增导出 `CITIZEN_LEVEL_FILTER_OPTIONS`（友好标签），附注释说明为何与 `CITIZEN_LEVEL_OPTIONS` 不同。
- `app/javascript/hooks/useActivityFilter.js`：state / URL（`filterFromParams`、`buildUrl`、`urlKey`）/ `matches` / `active` / setters / `reset`。
- `app/javascript/components/planner/ActivityFilterBar.jsx`：3 个新 section + 新 setter props；dropdown 滚动。
- `app/javascript/pages/Tour/Show.jsx`：从 hook 多解构 `setStatus/setLevels/setReserve` 并透传；补 `headerRight` 的 `useMemo` 依赖。

### 8. 测试（TDD）

- `app/javascript/hooks/__tests__/useActivityFilter.test.js`：
  - `matches`：status 单选/多选（OR）、levels、reserve（含无 details）、跨维度 AND。
  - `active`：任一新维度非空 → true。
  - URL 往返：`filterFromParams`/`buildUrl` 对 status/levels/reserve 正确序列化；未知 status/level 值被丢弃。
  - `reset`：清空全部 6 项。
- `app/javascript/components/planner/__tests__/ActivityFilterBar.test.jsx`：
  - 渲染状态/层级/需预约三个 section（友好标签文案）。
  - 切换 chip / checkbox 调用对应 setter。
  - 计数徽标随 active 变化。

## 边界与非目标

- **不含评分维度**（稀疏，会误筛未富集项）。
- **不改默认行为**：默认不筛、全显；不做"默认隐藏暂停开放"。
- **无后端改动**：所有字段已序列化到前端；不引入服务端查询、不加迁移。
- `reserve` 开启时，无 `details` 或 `need_reservation` 非真的活动一律不匹配。
- `infrastructure` 档位罕见但保留，保证 4 个枚举值都可被隔离。
- 新维度全部进 URL：分享链接、刷新、浏览器后退均可还原筛选态。
