# Tranche D — 产品验收 + 后续 Backlog

**Status**: PM audit · 2026-04-16 (Tranche A/B/C 全部落地后)
**Scope**: 对照原始 wireframes 全量验收 12 屏，列出剩余 gap，优先级排序
**原型基准**: `docs/superpowers/specs/2026-04-15-tour-day-activity-remodel-wireframes.html`（12 screens）

---

## 0 · 执行摘要（高级 PM 视角）

**已交付进度（3 个 tranche）：**

Tranche A 修 critical 3 件（S6 activity 编辑、S9 宪法违反闭环、S10 成员）→
Tranche B 补 polish + S11 全程年表 + drag 可靠性 →
Tranche C 补 S3 "0→1" 首次体验 + 自动建 D1 + AI onboarding。

**wireframe 12 屏 coverage：9/12 基本完整，3/12 还有关键 gap。**

**核心剩余 gap 三类：**

1. **Screen 4 地图能力浅薄** — wireframe 原计划的 "按天着色 / 仅 backlog 视图切换 / D1→D2→D3 连线 / pin 上的 Dn 标签" 完全没做。当前 `PlannerMap.jsx` 只做 POI 标记，不看规划。**规划器的 "地图 +  Day 视图联动" 是 spec §产品目标 Step 4 的核心卖点之一，严重缺失。**
2. **Screen 5 drop validation + Undo toast** — wireframe 定义了 4 种拖拽失败态（A 超时预警/B buffer 确认/C 后端失败回滚/D Esc 取消）+ 5 秒 undo toast 机制。当前只有 C（Tranche B 乐观更新 + toast）。Undo 完全没做——AI 批量改了 20 个 POI 没法撤销。
3. **Screen 9 "帮我修正" 独立子屏** — Tranche A 明确标注 "走 chat-prompt 路径"，跳过了 wireframe 设计的 AI 给 3 个候选方案 + "看地图预览" + "应用此方案" 的子屏。当前硬违反的 "帮我修正" 只是自动发一条 prompt 给 AI chat，不是 wireframe 的结构化候选方案 UI。

**操作观察（dev QA 发现但非 wireframe 定义的问题）：**

4. **`useChat` 刷新丢 transcript** — 前端 `messages` state 从 `[]` 开始，不 fetch 历史。用户刷新后 Chat 显示 "还没有对话"，即便 DB 有消息。后端 replay 工作正常，只是 UI 体验断层。
5. **AMAP rate limit 导致 onboarding 尾部不完整** — AI 批量 `search_poi` 时触碰 `CUQPS_HAS_EXCEEDED_THE_LIMIT`，LLM 继续但可能提早终止流，用户看不到 "已加了 N 个 POI" 的确认总结。
6. **空 tour soft banner 噪音** — Tranche C 已记录为 known：新 Tour 打开 Planner 立即显示 "整程 0 个机动日" 警告，和 AI onboarding 开场抢焦点。
7. **Tour 列表缺 partner attribution** — wireframe 展示 "partner_a 编辑了 D3"，当前只有相对时间没有"谁"。
8. **Tour 列表不支持 archive** — wireframe 展示已归档行透明度 0.55、健康度列显 "—"。Schema 有 `archived` 字段但无 UI。

---

## 1 · 12 屏逐一验收

### ✅ Screen 0 · 图例/约定（文档性质，N/A）

### ⚠️ Screen 1 · Tour 列表

已交付：6 列（标题 / 日期+人数 / 进度 / 健康度 / 最近活动 / 角色）、"+ 新建 Tour"、相对时间 "59 分钟前"、健康度彩色 badge。

**Gap**：
- **G1-a**：`最近活动` 只有时间、没有 actor（wireframe: "partner_a 编辑了 D3 · 3 小时前"）—— 需要 `Tour.last_actor` 字段或者每次 activity/day 修改时记 audit log
- **G1-b**：归档 UI 未做——没有归档按钮、归档行无视觉降级（opacity 0.55 + 健康度 "—"）、列表未拆 active/archived tabs

**工作量**：G1-a 中等（加 last_actor_id 到 tours 或记 audit log + 小 UI），G1-b 小（schema OK，加 button + CSS）

### ✅ Screen 2 · 确认宪法（Constitution）

已交付：关键 3 条 + 高级 4 条、默认宪法快速开始、保存/恢复默认、已承认违反列表（Tranche A §2.5）、TourTabs（Tranche B）

**无 gap。**

### ✅ Screen 3 · 新建 Tour 首次打开

已交付（Tranche C）：自动建 D1、Backlog 空态三按钮、AI 多轮 onboarding（sentinel + 4 轮节奏 + 批量工具调用）

**无 gap。**

### ⚠️ Screen 4 · Planner 填充后

已交付：三栏布局、Backlog + filter、Days 横向滚动、Chat 可收起、ConstitutionBanner、+ 加一个按钮、地图 POI marker

**Gap（核心卖点缺失）**：
- **G4-a**：地图**无连线** —— wireframe 要求实时画 D1→D2→D3… 折线（AMAP polyline，前端懒请求，不缓存）
- **G4-b**：地图**无 Dn 标签 pin** —— wireframe 要求每个 pin 上标 "D2" "D3"
- **G4-c**：地图**无视图切换** —— wireframe 要求右上角 "视图：全部 / 按天着色 / 仅 backlog" 三选一 radio
- **G4-d**：地图**未分配的 activity 显示为灰色虚线 pin** —— 当前代码有基本区分（blue numbered vs grey），但视觉尚未贴合 wireframe

**工作量**：G4-a 大（AMAP polyline + 路径缓存策略），G4-b 中（LabelMarker），G4-c 中（前端 radio + filter 逻辑），G4-d 小

### ⚠️ Screen 5 · 拖拽中 + 失败态 + Undo toast

已交付（Tranche B）：DragOverlay ghost card、insert indicator（drop preview 线）、auto scroll、乐观更新 + 失败 toast（= wireframe 失败态 C）

**Gap**：
- **G5-a**：失败态 **A（拖到已超时 Day 的实时警告）** —— hover 时 Day column 立即变红 + 浮动警告"再加这条会到 8h"。需要 `onDragOver` 检测 + 临时 violation check
- **G5-b**：失败态 **B（拖到 buffer_day 的二次确认）** —— "继续放入会让 D6 不再是 buffer，取消/确认" modal，同时后端联动把 `buffer_day: false`
- **G5-c**：失败态 **D（Esc / 丢到空白处取消）** —— dnd-kit 的 `onDragCancel` 已连但没视觉确认（卡片自动回原位已经 OK；不过 Esc 没检验过）
- **G5-d**：**Undo toast 机制全缺** —— "已把赛里木湖加到 D2 · 撤销 · 4 秒" toast 没做。wireframe 把这个列为**贯穿机制**覆盖所有 CRUD（add/update/delete/move/批量 AI + acknowledge_violation）。前端 undo stack 最多 10 条、单步撤销（YAGNI 化的简化版）

**工作量**：G5-a 中（onDragOver hook），G5-b 中（modal + 后端自动改 buffer_day 的副作用），G5-c 小（验证），G5-d 大（跨所有变更链路 + server-side compensating transactions）

### ✅ Screen 6 · Activity 编辑面板

已交付（Tranche A）：Mantine Drawer、CommonFields、DetailsFields（kind 切换动态字段）、PoiSearchCombobox、保存/取消/移回 Backlog/删除

**无 gap。**

### ✅ Screen 7 · road activity 两种外观

已交付：`infrastructure` → italic + dashed border + 灰背景；`tier_one` → 黄底 + 实线 + 厚边框。两种都在 `ActivityCard.jsx`。

**无 gap。**

### ⚠️ Screen 8 · AI tool-calling UI

已交付：`ToolCallChip` 显示工具名 + 参数 + 结果、streaming badge、complete / error 状态

**Gap**：
- **G8-a**：wireframe 的 tool-call UI 更结构化 —— 工具名加颜色高亮（`<span class="fn">`）、结果用缩进 `↳` 前缀、区分 `search_poi` 返回数组 vs `add_activity` 返回单 object。当前 `ToolCallChip` 是 `JSON.stringify` 通吃。体验够用但不精致。
- **G8-b**：**整体对话 transcript 不加载历史** —— 刷新后 Chat 空（§0 观察 #4）。这不是 wireframe 明示的事但影响 Chat UX 完整性

**工作量**：G8-a 小（ToolCallChip 做 per-tool 定制），G8-b 中（后端加 `GET /tours/:id/conversation/messages` endpoint + useChat 初始化 fetch）

### ⚠️ Screen 9 · 宪法违反处理

已交付（Tranche A）：ConstitutionBanner 红/黄色 banner + "承认此违反" modal + 已承认列表 + Tour model `record_override!/revoke_override!` + ConstraintOverridesController

**Gap**：
- **G9-a**："帮我修正 →" **结构化候选方案子屏** —— wireframe 定义点击后弹独立 modal/页，AI 给 3 个候选 fix（① 拆 activity / ② 加一天 / ③ 降级等级），每个带 **原因 / 影响 / 应用按钮 / 看地图预览**。当前 Tranche A 走了 chat-prompt 路径（发一条 prompt 给 chat）。spec 里明确列为 "本 spec 不在范围" + "Tranche C 考虑（实际推到 Tranche D）"
- **G9-b**：涉及新 AI tool `AITools::SuggestFixes`（spec §1 line 503 列出）

**工作量**：大（新 AI tool + 新 modal + fix preview 交互 + 新 ActionCable channel for suggested fixes）—— 可能独立成一整个 tranche

### ✅ Screen 10 · Tour 成员管理

已交付（Tranche A + Tranche C reader fix）：MembershipDrawer、作者行 + badge、editor/reader role select、移除按钮、邀请 section、权限矩阵 accordion、reader 可看

**无 gap。**

### ✅ Screen 11 · Tour 全程年表

已交付（Tranche B）：SummaryBar 5 数字、RhythmBar 10 slot + 点击滚动、TimelineDayColumn 横向滚动、DayDetailPanel 小时网格 + 当日汇总、TourTabs 导航

**无 gap。**

### ⚠️ Screen 12 · 端到端用户流程（贯穿性要求）

已交付：Step 0-3、Step 5 年表化、宪法校验贯穿、拖拽乐观更新。

**Gap**：
- **G12-a**：Step 4 **地图连线 + Dn 标签** = Screen 4 缺失项（G4-a/b）
- **G12-b**：**Undo toast 贯穿机制** = Screen 5 缺失项（G5-d）
- **G12-c**："离开 Planner 的出口" —— 返回面包屑、Tour 归档按钮、"离开本程" (reader 自毁 membership)——均未做

**工作量**：G12-c 中（归档按钮 + leave tour 按钮）

---

## 2 · Dev QA 观察补充

### 📝 Ops-A · `useChat` 刷新丢 transcript

**现象**：`app/javascript/hooks/useChat.js` 初始化 `messages: []`，不从 server fetch 历史。刷新后 UI 显示 "还没有对话"。后端 `ChatStreamJob#replay_history` 正常 replay，所以 AI 对话是连续的——只是前端看不见过往。

**修复方案**：
- 后端加 `GET /tours/:id/conversation/messages` 返 JSON 历史
- `useChat` `useEffect` mount 时 fetch 填充初始 messages
- 或者通过 Inertia props 一次性 hydrate（简单，无需新 endpoint）

**工作量**：小-中

### 📝 Ops-B · AMAP rate limit 导致 onboarding 尾部不完整

**现象**：Tranche C QA 过程中 AI 批量 `search_poi` 触碰 AMAP `CUQPS_HAS_EXCEEDED_THE_LIMIT`，LLM 继续 tool 调用但最终 `assistant_text` 的 summary "已往 backlog 加了 N 个候选" 没出。用户看不到完成确认。

**修复方案**：
- `PoiSearch` 服务加 exponential backoff 重试 429 错误
- 或者 `AITools::SearchPoi` 捕获 rate-limit 错误后让 AI 等几秒再试（更慢但成功率高）
- 或者并发限制：`AITools::SearchPoi` 内部加 mutex/semaphore 每秒 ≤ 3 次

**工作量**：小（加重试逻辑）

### 📝 Ops-C · 空 tour soft banner 噪音（Tranche C known issue）

**现象**：新建 Tour 打开 Planner 立即显示 "整程 0 个机动日（建议 ≥ 1）" 软违反 banner，和 AI onboarding 开场抢焦点。

**修复方案** (Tranche C spec §4 列了 3 个选项)：
- (a) `ConstitutionCheck#check_buffer_days` 在 `activities.empty?` 时 skip
- (b) 前端 Banner 在 onboarding 未完成时抑制显示
- (c) auto-seed D1 时 `buffer_day: true`——但影响 AI onboarding 预期

**推荐 (a)**——最小副作用。

**工作量**：小

---

## 3 · Tranche D 提案（3 个子项）

基于优先级 + YAGNI 推荐把剩余 gap 切成 3 个相对独立 tranche：

### Tranche D-1 · 地图能力落地（S4 + S12 Step 4 核心）

**Scope**：
- G4-a · D1→D2→D3 连线（AMAP polyline）
- G4-b · pin 上的 Dn 标签
- G4-c · 视图切换：全部 / 按天着色 / 仅 backlog 三选一
- G4-d · 未分配 POI 灰色虚线 pin

**Why first**：这是 wireframe spec 产品目标 Step 4 的核心功能，直接影响产品价值认知。缺了这个 Planner 的 "地图反映当前规划" 卖点不成立。

**规模**：~1-1.5 天（中等）

### Tranche D-2 · Drag validation + Undo toast 贯穿

**Scope**：
- G5-a · 拖到超时 Day 的实时 hover 警告
- G5-b · 拖到 buffer_day 的二次确认 + 自动改 buffer_day
- G5-d · 全局 Undo toast（5 秒撤销，AI 批量视为一组）
- Ops-A · `useChat` 加载历史

**Why**：Undo 是 wireframe 贯穿机制，AI 批量改 20 个 POI 一旦用户说"不行" 现在只能手动一个个删。Drag 实时预警是安全网。useChat 历史载入是 Chat UX 的基本面。

**规模**：~2 天（大，尤其 undo stack 的后端联动）

### Tranche D-3 · 小 polish + 收尾

**Scope**：
- G1-a · Tour 列表 partner attribution（加 `last_actor_id` 或 audit log）
- G1-b · Tour 归档 UI（按钮 + 视觉降级 + 活跃/归档 tab 切分）
- G12-c · 离开 Planner 出口（返回面包屑、归档按钮、"离开本程" reader 自毁 membership）
- G8-a · ToolCallChip per-tool 定制显示
- Ops-B · AMAP rate limit 重试
- Ops-C · 空 tour soft banner 噪音抑制

**Why last**：纯 polish，非阻塞，可以和 D-1/D-2 同时并行开发。

**规模**：~1 天（小，多个 2-3 小时的独立项）

### Tranche D-4（可选） · "帮我修正" 结构化子屏

**Scope**：
- G9-a/b · AI 给 3 个候选 fix 的独立子屏 + `AITools::SuggestFixes` + fix preview

**Why 独立**：规模比其他 tranche D 项都大，属于 wireframe 本身标为 "复杂 AI 功能"。当前 chat-prompt 路径已经 workable，提升有限。

**规模**：~2-3 天（大，新 AI tool + 全新 modal 流程）

**建议**：D-4 优先级最低——除非产品决策认为结构化 fix UI 比 chat-prompt 体验显著更好。否则暂时停在 chat-prompt 路径，推给 Tranche E（如果有）。

---

## 4 · 建议的下一步

**推荐顺序**：D-1（地图）→ D-3（polish）→ D-2（validation + undo）→ D-4（可选，延迟）。

**替代顺序**：D-2 先行——如果产品更关心"用户不敢乱拖拽的风险"（undo 缺失是 AI 批量加了 20 个 POI 撤销不了的风险），则 D-2 > D-1。

**Tranche D-1 可以直接进入 brainstorming 阶段**——scope 清晰、wireframe 已定义、依赖前后端协议有 reference（AMAP JS SDK placeholder 已在 PlannerMap 内）。

---

## 5 · 附：与原 spec 边界的对照

原 spec `2026-04-15-tour-day-activity-remodel-design.md` 列的 "本 spec 不做的"：

| 项 | 状态 |
|---|---|
| POI 收藏夹 / 跨 tour 复用（Location 表）| 仍不做 |
| Tour 模板（宪法模板）| 仍不做 |
| 宪法硬阻止保存 | 仍不做（soft-validation) |
| 完整 undo/redo stack | 仍按 spec 做"80% 简化版"——D-2 候选 |
| 老 guidebook 数据迁移 | 已完成（Tranche A 一次性删光） |
| 移动端 / 响应式 | 仍不支持，继续按 ≥ 1280px 定位 |
| 分享导出 (markdown / GPX / 只读链接)| 仍属"产品下阶段"——非 Tranche D 范围 |

原 spec 的 Tranche A/B/C 已知后续列表中仍待办：

- ✅ Tranche B （年表、拖拽可靠性、Planner UX）—— 已完成
- ✅ Tranche C （onboarding、空态 CTA、自动 D1）—— 已完成
- ⏳ "帮我修正" 独立子屏 —— Tranche D-4 候选
- ⏳ 邀请邮件 —— 未列入 D，产品定位后再说
- ⏳ AMAP JS SDK 深度集成 —— Tranche D-1 的基础
