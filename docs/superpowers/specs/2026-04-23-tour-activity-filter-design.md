# Tour 详情页 · 活动搜索与过滤 — 设计文档

**日期**: 2026-04-23
**作者视角**: 高级产品经理
**状态**: 设计已评审，待进入实施规划

---

## 1. 范围声明（MVP）

### Mission

让作者在活动 >20 条的 Tour 里，10 秒内找到目标活动（或一组同类活动），不打断当前 Planner 视觉结构。

### In-Scope

- **对象**: 仅 Activity
- **入口**: Planner 主视图 Header 右侧 —— `PlannerHeaderRight` 组的第一位（`IconFilter` ActionIcon，点击展开 Popover 包含所有控件）
- **过滤维度（3 个，AND 组合）**:
  1. **关键词** — 匹配 `activity.name` + `activity.details` 中所有字符串值
  2. **类型 `kind`** — `scenic` / `road` / `food` / `stay` / `fuel` / `other`（多选 OR）
  3. **参与人** — 多选 `user_id`（匹配 `activity_participants`；空参与人 = 全员）
- **结果呈现**: Backlog + DayPanel + Map 均 **Hide 未匹配**
- **过滤生效时**: 拖拽全局禁用
- **状态**: URL query params（`?q=&kind=&uids=`），刷新/分享保留

### Out-of-Scope（显式排除）

- **费用过滤** — ExpenseDrawer 已有完整过滤（付款人/分类/策略/金额/小票/文本），不重做
- **其他对象** — 成员 / 天 / 结算 / 图片 / 违规 均不过滤
- **全局 Cmd+K Overlay** — 后续考虑
- **AI 对话引用过滤结果** — 后续考虑
- **筛选预设保存** — 后续考虑
- **"Zoom to matching" 地图按钮** — 后续考虑
- **活动侧"按天过滤"** — DayPanel 已是按天切分，冗余
- **违规筛选** — ConstitutionBanner 已高亮，冗余
- **金额/日期范围、有无小票** — 长尾需求，不进 MVP
- **景点等级 `citizen_level`** — 作者自标自记，无过滤价值
- **费用的 scope 过滤** — 用户认知负担高

---

## 2. UI 规格

### 位置

收进现有 `AppShell.Header`（高度 56px），作为 `PlannerHeaderRight` 的第一个 ActionIcon（在宪法/总览/账单/成员/设置 前）。所有控件（搜索 / 类型 / 参与人 / 计数 / 重置）折叠进 Popover，点击 Filter icon 展开：

```
[Toggle] [Title] ←────flex────→ [🔍Filter][宪/览/账/员/设]
                                    ↑
                               蓝色 dot indicator 表激活态
                               点击展开 320px Popover
```

**历史注**：最初设计把 Search input + 计数 + 重置并列放在 title 右侧（左工具槽）。实装后 UX review 认为视觉过密；合并成单一 Filter icon 更克制，视觉权重与其他右侧抽屉图标一致。

### 组件清单

| 位置 | 组件 | 用法 |
|---|---|---|
| `PlannerHeaderRight` 首位 | `ActionIcon`（`IconFilter`）包在 `Indicator color="blue"` + `Tooltip "筛选"` 里 | 点击切换 Popover 开关；激活时蓝 dot 显现 |
| Popover（320px，`position="bottom-end"`） | 见下 | 所有控件聚合在此 |

### Filter Popover 内容（从上到下）

1. **搜索输入** — `TextInput size="xs"`，`data-autofocus`（打开即聚焦），`IconSearch` 左图标，`IconX` 清空（有值时）
2. **类型多选** — `Chip.Group multiple`，6 个 Chip：景点 / 路段 / 餐饮 / 住宿 / 加油 / 其他。每 Chip 前置图标（与 `ActivityCard.KIND_ICONS` 同源）
3. **参与人多选** — `Checkbox` 列表；作者 + 成员去重（作者显示"（作者）"后缀）；头像 + 姓名
4. **Divider**
5. **状态行** — `Badge "X / Y"`（激活时蓝色，否则灰色）+ 激活时显 `Button compact-xs "重置"`

### 交互规则

- **即时生效**：无 "应用" 按钮
- **文本搜索 200ms 防抖**；其他维度立即
- **纯前端过滤**：不调 API
- **任一维度激活**：`IconFilter` 红点 + 计数徽章 + 重置按钮（三重冗余信号）
- **拖拽禁用**：过滤激活时 `draggable={false}`；Backlog / DayPanel 容器顶部显示 `Alert color="blue"`：`"筛选中，清除后恢复拖拽"`
- **空状态**：Backlog / 各 Day 列 0 匹配 → 容器中央显 "无匹配的活动" + 内联"重置"按钮；Map 不显覆盖层

### 响应式

- **≥ 768px**: 如上
- **640–768px**: Search 缩至 140px
- **< 640px**: Search 折叠为 `ActionIcon`（点击弹输入框）；Filter Popover 容纳全部控件（含搜索 + 计数 + 重置）

### 项目规范

- 图标来自 `@tabler/icons-react`（无 emoji）
- 中文标签纯中文（无混合 English 或 emoji）
- 不暴露字段名到 UI（如 `kind=food` 不显示）

---

## 3. PlannerMap 联动

### 标记点

- **未匹配 → Hide**，与 Backlog / DayPanel 一致

### 路线连线（route_legs）

- **两端都匹配 → 保留**
- **任一端不匹配 → 隐藏**（避免悬空残段）

### 视口

- **不自动 fit**，保留用户当前 zoom / center
- "Zoom to matching" 按钮 **不进 MVP**

### Hover 联动

- 既有 `hoveredActivityIds` 机制天然兼容——未匹配卡片已 hide，没有触发源；无需额外代码

---

## 4. 状态模型

### URL 作唯一权威

| 参数 | 形式 | 示例 | 缺省 |
|---|---|---|---|
| `q` | string（URL-encoded） | `?q=%E9%A4%90%E5%8E%85` | 无 = 不过滤 |
| `kind` | 逗号分隔 enum | `?kind=food,stay` | 无 = 所有类型 |
| `uids` | 逗号分隔 user_id | `?uids=3,7` | 无 = 所有人 |

### 更新策略

- **`router.replace`**（不是 push）——避免打字历史污染
- 200ms debounce 后才 replace 文本
- 重置 → 单次 replace 清三参数
- 单控件清空 → URL 剔除对应参数，不保留空串

### 生命周期

| 场景 | 行为 |
|---|---|
| 刷新 | URL 参数重建筛选态 |
| 从列表进入 Tour | URL 无筛选参数 → 默认无筛选 |
| 切 Tour | 新 URL 无参数 → 自然清空 |
| 分享 URL | 收到方同样筛选结果 |
| 浏览器后退 | 因 `replace` 不生成中间历史，直接回上一页 |

### Inertia

所有参数纯前端过滤：`router.replace(newUrl, { preserveState: true, preserveScroll: true, only: [] })`，不触发后端 reload。

### 边界容错

- `q` 超长：UI 截断展示，过滤正常跑
- `uids` 含已退团用户：ignore
- `kind` 含未知值：ignore 该值，其他维度正常

---

## 5. 匹配逻辑

### 组合

- **维度之间**：AND
- **`kind` / `uids` 维度内部**：OR（多选取并集）

### 关键词 `q`

- **匹配范围**: `name` + `details` 所有**字符串**型值（递归深入；数值/布尔/null 不参与）
- **算法**: 大小写不敏感 + 子串匹配（`toLowerCase().includes()`）
- **不做** fuzzy / 分词
- **trim 后空串**视为不过滤
- **优化**: `useMemo` 预计算 `searchableText[activityId] = (name + 所有字符串值).toLowerCase()`

### `kind`

- `activity.kind ∈ 选中集合`

### `uids`（参与人，最微妙）

**语义**（与后端 `Activity#effective_participant_ids` 对齐）：`activity_participants` 为空 = "全员参与"

- 活动有显式 `participant_user_ids` → 与 `uids` 交集非空 = 匹配
- 活动 `participant_user_ids` 为空 → 视为全员参与 → `uids` 含本 Tour 任一成员即匹配

前端用现有 `participant_user_ids` + `tour.author_id` + `members[].user_id` 即可推导，不需后端扩展 payload。

### 空判定

- `q === ''` → 不参与
- `kind = []` → 不参与
- `uids = []` → 不参与
- 全空 = "无筛选激活"，UI 隐藏计数/重置

### 性能预算

- n ≤ 100 活动覆盖 95% 用户；details 总字节 ≤ 10_000
- 每次输入变更总 work < 1ms
- 无需 Web Worker / IndexedDB 索引

---

## 6. 架构与组件改动

### 先决：清理既有局部过滤

`BacklogList.jsx` 现在本地有 `kindFilter` + `levelFilter` 两个 Select，仅作用于 Backlog 自身。

**MVP 的一部分是拆掉 BacklogList 内部过滤**：
- `kindFilter` → 由新全局 Filter Bar 的 Kind 维度取代
- `levelFilter`（`citizen_level`）→ **删除**（已在第 1 节明确排除）

### 新增文件

| 文件 | 职责 |
|---|---|
| `app/javascript/components/planner/ActivityFilterBar.jsx` | 渲染 Filter Bar UI |
| `app/javascript/hooks/useActivityFilter.js` | URL 同步 + 匹配谓词；导出 `{ q, kind, uids, setQ, setKind, setUids, reset, matches, active, activeCount, totalCount }` |
| `app/javascript/components/planner/__tests__/ActivityFilterBar.test.jsx` | 组件单测 |
| `app/javascript/hooks/__tests__/useActivityFilter.test.js` | 谓词 + URL 同步单测 |

### 修改文件

| 文件 | 改动 |
|---|---|
| `app/javascript/layouts/HeaderSlot.jsx` | 新增 `useInjectHeaderLeftTools` / `useHeaderLeftToolsSlot`（对称现有 Right slot） |
| `app/javascript/layouts/AppShell.jsx` | Header 内 title 后渲染 left tools slot |
| `app/javascript/pages/Tour/Show.jsx` | 调用 `useActivityFilter`；注入 Filter Bar 到 header 左槽；把过滤后列表传下；Map 拿全量 + 谓词 |
| `app/javascript/components/planner/BacklogList.jsx` | 拆掉本地 `kindFilter + levelFilter + Select` UI；接收上层过滤后的 activities；`Alert` 禁拖 banner；空状态内联文案 |
| `app/javascript/components/planner/DayPanel.jsx` / `DayColumn.jsx` | 接收上层过滤后的 activities；空状态文案 |
| `app/javascript/components/planner/PlannerMap.jsx` | 接收 `matches` 谓词；标记点按谓词 hide；route_legs 仅两端都匹配时渲染 |
| `app/javascript/components/planner/ActivityCard.jsx` | 接受 prop `draggable`（默认 true），过滤激活时传 false |

### 数据流

```
Tour/Show
  └ useActivityFilter(activities, authorId, memberIds)
      ├ reads/writes URL (router.replace, 200ms debounced on q)
      └ returns { q, kind, uids, setQ, setKind, setUids, reset, matches, active, activeCount, totalCount }

  ├ useInjectHeaderLeftTools(<ActivityFilterBar {...filterState} />)
  │
  ├ filteredActivities = displayActivities.filter(matches)
  │
  ├ <BacklogList activities={filteredActivities.filter(a => !a.day_id)} draggable={!active} />
  ├ <DayPanel activities={filteredActivities.filter(a => a.day_id)} draggable={!active} />
  └ <PlannerMap activities={displayActivities} matches={matches} />
      ↑ 全量 + 谓词（route_legs 需两端 id→match 映射）
```

### 性能与渲染

- `useActivityFilter.matches` 用 `useMemo` 稳定引用；依赖 `[q, kind, uids, authorId, memberIds, activities]`
- `filteredActivities` 一处计算共用
- 重渲仅在过滤参数或底层数据变化时触发

### 分层动机

- **`useActivityFilter` 独立 UI**：URL 同步 + 匹配逻辑全在 hook；单测不碰 DOM；未来 AI Chat 可复用
- **Show.jsx 单一数据源**：三视图看到一致的过滤结果
- **Map 拿全量 + 谓词**：route_legs 需要全量 id→match 映射

---

## 7. 验收标准

### 功能验收

**基础可见性**
- [ ] Header 右侧首位显示 Filter icon（无筛选态下不显示 indicator dot；控件在 Popover 内）
- [ ] Header 右侧既有 5 个 ActionIcon 位置不变
- [ ] BacklogList 顶部不再显示本地类型/等级 Select

**搜索匹配**
- [ ] 输入"餐"→ 仅 name 或 details 含"餐"的活动留下；三视图联动
- [ ] 大小写不敏感
- [ ] details 中数值/null 不崩
- [ ] 清空 → 恢复

**Kind 过滤**
- [ ] 选"吃饭"→ 仅 `kind=food` 留下
- [ ] 多选"吃饭 + 住宿"→ 两类都留（OR）
- [ ] 取消全部 → 恢复

**参与人过滤**
- [ ] 选张三 → 张三显式 + 空参与人（全员）的活动都留
- [ ] 多选张三+李四 → 任一参与都留（OR）
- [ ] URL 含已退团 user_id → 不崩

**多维度 AND**
- [ ] q="餐" + kind=食 + uid=张三 三维同时作用于交集

**URL 持久化**
- [ ] 筛选后 URL 含参数；刷新保留
- [ ] 连敲 10 字母浏览器历史只多 1 条
- [ ] 切 Tour → 自然清空
- [ ] 分享 URL → 收到方同结果

**地图联动**
- [ ] 未匹配标记 hide
- [ ] 两端匹配 route_leg 保留；一端或两端不匹配则隐藏
- [ ] 视口不自动缩放

**拖拽禁用**
- [ ] 任一维度激活 → 卡片不可拖；容器顶部 banner 出现
- [ ] 重置 → 拖拽恢复；banner 消失

**空结果态**
- [ ] Backlog 0 匹配 → 容器中央显"无匹配" + 内联重置
- [ ] DayPanel 某天 0 匹配 → 该列同样提示
- [ ] 全空 → 三视图各自空状态

**响应式**
- [ ] < 640px：Search 变 Icon，Filter Popover 包含搜索 + 类型 + 参与人 + 计数 + 重置

### 单元测试

`useActivityFilter.test.js`：
- [ ] 无参数 URL → 所有活动 match
- [ ] `?q=餐` → 只匹配含"餐"
- [ ] `?kind=food,stay` → 两类 OR
- [ ] `?uids=3` + 某活动无 `participant_user_ids` → 匹配（空=全员）
- [ ] `?uids=999`（不存在）→ ignore 不崩
- [ ] 三维 AND 组合
- [ ] `setQ('餐')` → URL 200ms 后更新
- [ ] `reset()` → URL 清空

`ActivityFilterBar.test.jsx`：
- [ ] 无筛选：不显示计数、不显示重置
- [ ] 有筛选：显示"X / Y"；显示重置
- [ ] 点重置 → 回调
- [ ] `IconFilter` 红点 indicator 与 `active` prop 同步
- [ ] Popover 内 Kind Chip / 参与人 MultiSelect 渲染正确选项

### CI 门槛（项目规范 CLAUDE.md）

- [ ] `bin/rubocop -f github` 绿
- [ ] `bin/brakeman --no-pager` 绿
- [ ] `npm audit` 绿
- [ ] `npm test` 绿（含新增单测）
- [ ] `mise exec -- bundle exec rspec` 绿

### 人工 E2E（memory 规则：UI 改动必须 Playwright）

1. 登录 → 进入 20+ 活动的 Tour
2. Search "餐"；三视图联动
3. 勾 Kind "吃饭"；AND 收窄
4. 加参与人；进一步收窄
5. 尝试拖拽失败；banner 出现
6. 重置；全量恢复；拖拽可用
7. 刷新页面；URL 状态前后对比

---

## 附录 A · 决策记录

| 决策 | 选项 | 选择 | 理由 |
|---|---|---|---|
| 触发信号 | A 用户反馈 / B 数据观察 / C 能力铺路 / D PM 判断 | D → 默认 A+B | 用户让 PM 判断；真实规模压力 |
| 范围 | 活动 / 费用 / 成员 / 天 / 结算 / 图片 / 违规 | 活动 + 费用 | 数量级大的才值得搜 |
| 费用侧 | 重做 / 不动 | 不动 | ExpenseDrawer 已有完整过滤 |
| 维度数量 | 3 / 5 / 10 | 活动侧 3 个 | MVP 克制；长尾后置 |
| 入口形态 | A 就地 / B Cmd+K / C 混合 | A | Planner 是空间视图，"隐藏" > "跳转" |
| Header 位置 | 新增一行 / 收进现有 | 收进现有 | 保持 AppShell 统一；语义分组 |
| 结果渲染 | 1 Hide 全部 / 2 Dim 全部 / 3 Hybrid | 1 Hide 全部 | 三视图一致；最简心智 |
| 拖拽处理 | 禁用 / 允许（仅匹配项） | 禁用 + banner | 意图歧义大；简单清晰 |
| 地图视口 | Auto-fit / 保留 / 按需按钮 | 保留（不做按钮） | 不打断空间记忆 |
| 状态持久化 | URL / 本地 state / 本地 storage | URL | 单一真实源；可分享 |
| Router 模式 | push / replace | replace | 避免打字历史污染 |
| 匹配算法 | 子串 / fuzzy / 分词 | 子串 + case-insensitive | 中文 fuzzy 不划算；可预期 |
| 参与人空集语义 | 全员 / 无人 | 全员（沿用后端） | 与 `effective_participant_ids` 对齐 |
| 删除 `levelFilter` | 保留 / 删 | 删 | 已排除，存量清理 |
| HeaderSlot 扩展 | 新增 Left slot / Planner 内写死 | 新增对称 Left slot | 保持解耦 |
| Map 数据 | 全量 + 谓词 / 已过滤 | 全量 + 谓词 | route_legs 需全量映射 |
