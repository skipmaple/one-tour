# 移动端适配设计（全站 mobile-first，下限 375px）

日期：2026-06-01 · 分支：`claude/stoic-leakey-0906db`

## 目标

对全站每个页面做移动端适配，标准为「全部移动优先」：核心用户页与后台页都按手机交互重新打磨，最窄测试基准 **375px**（iPhone 主流宽度）。

## 已定决策

| 项 | 决策 |
|---|---|
| 适配水准 | 全部移动优先（含后台） |
| 设备下限 | 375px |
| 统一断点 | **768px**（`< sm`）= 手机态；与导航抽屉同线 |
| 规划器布局 | 单面板全屏 + **底部 Tab**（候选/日程/地图/AI） |
| 规划器跨 Tab 移动 | 扩展现有**长按快捷菜单**（选天选位），不做跨 Tab 拖拽 |
| 交付 | 单个大 PR（不自动合并，由人工在 GitHub 合并） |

## 审计结论（真机 375px 实测）

- ✅ **已良好**：登录页（卡片居中无溢出）、后台·概览（`SimpleGrid base:2` 已响应式）。外壳导航在 `sm` 已折叠为抽屉。
- ❌ **硬伤①——规划器**：四栏横向 flex 溢出 467px，地图/AI 栏在屏外。
- ❌ **硬伤②——所有 `<Table>`**：旅程列表、后台用户/旅程列表（7 列逐字竖排、徽章被裁、右列溢出）；后台详情页内嵌表（成员/天数/消息）压缩。
- ⚠️ **抽屉/弹窗**：ExpenseDrawer / AddExpenseDialog / BudgetModal / ManualSettlementDialog 已有 `useMediaQuery('(max-width: 640px)')`；其余约 8 个（ActivityDrawer / ActivityDetailDrawer / MembershipDrawer / ConstitutionDrawer / TourSettingsModal / TimelineOverlay / DayEditModal / RouteLegEditModal）未处理。

## 设计

### 0. 基建：统一断点 hook

- 新增 `app/javascript/hooks/useIsMobile.js`：`useMediaQuery('(max-width: 767px)')`（`< 768`）。
- 现有 4 个抽屉的 `640px` 阈值改为此 hook，全站「手机态」一致。
- 提供 `MOBILE_BREAKPOINT = 768` 常量复用。

### 1. 所有表格 → 移动卡片

策略：mobile-first 卡片（非横向滚动容器）。`< 768` 渲染卡片列表，`≥ 768` 保留原 `<Table>`，用 `hiddenFrom/visibleFrom` 或按 `useIsMobile()` 分支。

- **旅程列表** `pages/Tour/Index.jsx`：每个 tour 一张卡（标题、日期/人数、进度、健康徽章、角色、打开按钮）。空状态已 OK，保留。
- **后台·用户列表** `pages/Admin/UsersIndex.jsx`：卡片（头像/姓名/邮箱/角色徽章/注册时间/旅程数 + 点击进详情）。搜索框、分页保留。
- **后台·旅程列表** `pages/Admin/ToursIndex.jsx`：卡片（标题/作者/成员数/天数/行数/创建时间）。
- **后台·用户详情** `pages/Admin/UsersShow.jsx`：内嵌 `TourList` 表 + 「最近 20 条消息」表 → 手机上改竖向卡片/堆叠行；消息内容列在窄屏整段换行而非挤在格子里。
- **后台·旅程详情** `pages/Admin/ToursShow.jsx`：成员表、天数表 → 手机卡片/堆叠行。
- **后台·概览** `pages/Admin/Dashboard.jsx`：布局已 OK；确认图表在 375px 不溢出（必要时设最小高度/横滑）。

### 2. 规划器 — 底部 Tab（重头戏）

`pages/Tour/Show.jsx` 在 `< 768` 走移动布局：

- **单面板 + 底部 Tab 栏**：新增 `components/planner/MobilePlannerTabs.jsx`（Tabler 图标 + 纯中文：候选/日程/地图/AI）。复用现有 `BacklogList / DayPanel / PlannerMap / ChatPanel`，只渲染当前 Tab，去掉 `ResizeHandle` 与 `flexStyle`；当前面板撑满 `calc(100dvh - 头 - Tab栏)`。默认停「日程」。
- **DayPanel 竖堆**：`components/planner/DayPanel.jsx` 在手机上天数由横向列改**竖向堆叠**段落；同 Tab 内拖拽排序 / 跨天移动仍走现有 DnD（都在一个竖向滚动里）。
- **跨 Tab 移动（候选→某天）**：扩展 `components/planner/ActivityContextMenu.jsx`（长按），加「加入日程 / 移到某天」二级选择（选天 + 选位置），复用 `performMove`。候选卡也可加「+加入某天」入口。
- **顶栏右侧收纳**：`components/planner/PlannerHeaderRight.jsx` 那串入口（筛选 + 多抽屉 + Outbox）在窄屏收进单个「更多」`Menu`；筛选 `ActivityFilterBar` 改全屏 sheet。
- **ConstitutionDrawer**：现为内嵌左栏 + 拖拽宽度，手机上改全屏抽屉（`Drawer size="100%"`）。
- 地图 Tab：AMap 撑满面板，确认触控手势可用。

### 3. 抽屉/弹窗统一全屏

手机上 Mantine `Drawer`/`Modal` → 全屏（`size="100%"` 或 `position="bottom"` + 大圆角），统一用 `useIsMobile()`。逐个过：ActivityDrawer、ActivityDetailDrawer、MembershipDrawer、ConstitutionDrawer、TourSettingsModal、TimelineOverlay、DayEditModal、RouteLegEditModal、AddExpenseDialog、ExpenseDrawer、BudgetModal、ManualSettlementDialog（后 4 个对齐 hook）。修固定宽度：`ParameterEditor`（label 220 + input 130）、`MembershipDrawer`（`w={100}` 列）、`ExpenseDrawer`（`w={150}`）等改为响应式/换行。

### 4. 横切约定

- 触控目标 ≥ 44px（图标按钮 `ActionIcon` 在手机上放大）。
- 纯中文标签、`@tabler/icons-react` 图标，不用 emoji 作功能图标。
- 不在 UI（Toast/Overlay/错误）暴露环境变量名。
- 高度优先用 `100dvh`（移动浏览器地址栏收放）替代 `100vh`。

## 各页验收标准（375px）

1. 无横向溢出（`documentElement.scrollWidth == clientWidth`）。
2. 文本不逐字竖排；徽章/操作完整可见。
3. 主操作触达：列表能进详情、规划器四面板都可达、抽屉能开能关能提交。
4. 规划器：候选卡可经长按菜单加入某天；同天/跨天拖拽排序可用。

## 非目标

- 不改桌面端（`≥ 768`）布局与交互。
- 不重做业务逻辑/数据（仅 UI 层、展示层）。
- 不引入新 UI 库；沿用 Mantine + Tabler。
- 不碰费用/结算口径等后端计算。

## 验证

- 每个工作流改完即在 preview 真机 375px 复核：截图 + `scrollWidth==clientWidth` 断言 + 关键交互（preview_click/fill）。
- 合并前本地跑：`bundle exec rspec`、`npm test`、`bin/rubocop -f github`、`bin/brakeman --no-pager`、PWA SW 校验。
- 既有 Vitest（`pages/Tour/__tests__`）保持绿；为新卡片/Tab 视图补单测。

## 受影响文件（预估）

- 新增：`hooks/useIsMobile.js`、`components/planner/MobilePlannerTabs.jsx`、可能的 `components/common/ResponsiveTable` 或各页卡片子组件。
- 改动：`pages/Tour/{Index,Show}.jsx`、`pages/Admin/{UsersIndex,ToursIndex,UsersShow,ToursShow,Dashboard}.jsx`、`components/planner/{DayPanel,ActivityContextMenu,PlannerHeaderRight,ActivityFilterBar,ConstitutionDrawer,各抽屉}.jsx`、`ParameterEditor.jsx`、`MembershipDrawer.jsx`。

## 风险

- 规划器 DnD 在竖堆 + 单 Tab 下的碰撞检测需重测（现有 `hybridCollisionDetection` 针对横向列调过）。
- 顶栏注入（`useInjectHeaderRight` + memo）改菜单收纳时注意不要触发无限重渲染（见 Show.jsx 现有注释）。
- 单个大 PR diff 巨大，需分模块自测到位再合。
