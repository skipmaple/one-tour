# 行程活动卡片重构设计（P0+P1+P2 + 统一宽度）

日期：2026-06-02
分支：claude/strange-noyce-4e5387

## 背景

规划器日列里的行程卡片（`ActivityCard`）当前为"自底向上从 schema 拼出、再塞进 `height:60px` 死高"的产物：显示了低价值的内部编码（`citizen_level` 信号格、截成 6 字的地址、2×2 十字表格），却把真正影响出行决策的信息（需预约、暂停开放、最佳光线、海拔、营业、人均）藏在 `details` jsonb 里没拿出来。目标：从用户视角重排信息 + 重建视觉系统，降低认知负担。

经 PM 视角 + UI 视角两轮评审，收敛为同一组动作。

## 锁定决策

1. **宽度统一**：缩略图改固定 48px 槽位（同列有图/无图卡正文恒等宽）；日列宽度 200px → 230px；候选池沿用同款卡片（面板仍可拉伸）。
2. **状态字段**：新增 `status` enum = `confirmed`(已定) / `pending`(待定) / `closed`(暂停开放)，默认 confirmed。
3. **老数据**：不 backfill。新字段默认"已定"，名字里现存的「未定」「暂停开放」保持原样，用户在编辑器手动迁移。

## 卡片新解剖

- **容器**：白底 `#fff`；`min-height:64px`（取代死高 60px，可长大）；`border-radius:8px`；`border:1px solid #e5e7eb`（中性恒定）；`box-shadow:0 1px 2px rgba(0,0,0,.06)`，hover 抬升 `.10`。
- **左色条**取代整片 pastel 填充：3px，颜色 = kind；tier_one = 4px 金条（#c89100）。
- **行1 身份**：Tabler kind 图标(16px/stroke1.75，kind 色) + 名字(13.5px/600，近墨 #1f2937，最多 2 行 clamp) + 右上 tier_one `IconStarFilled`(14px 金)。
- **行2 时间**：`[IconClock14] 14:30到 · 停留2h`，12px/500 中性 `#374151`。无时刻只显时长；都没有则隐藏。
- **行3 chips**：最多 2 个，11px/600，按优先级选取（见下）。

### chip 优先级（pickChips，最多 2）
1. 状态：`closed`→红 chip「暂停开放」(同时卡身降饱和)；`pending`→中性/虚线 chip「待定」；`confirmed`→无。
2. `need_reservation`（scenic）→ 琥珀 chip「需预约」。
3. kind 关键 detail（取一）：scenic `best_light`→「光线·{值}」否则 `altitude`→「海拔{n}m」；food `price_pp`→「人均¥{n}」；stay `price_pp`→「¥{n}/人」；fuel `h24`→「24h」。
4. 定位：从 address 提取的 市/县/区 → 中性 chip（`IconMapPin` + token）。
顺序 状态 > 预约 > detail > 定位，截断到 2。

### 格式化规则
- `formatDuration(min)`：null/0→''；<60→`{min}分`；%60==0→`{h}h`；%30==0→`{h}.5h`；else→`{(min/60).toFixed(1)}h`（265→`4.4h`）。
- `formatLocator(address)`：优先正则提取首个 `…(自治州|自治县|地区|市|州|县|区|镇|乡)` token；否则取末段，cap 8 字。
- 到达时刻：**不做四舍五入**（无法区分用户手设 vs 路由 ETA，避免篡改），只加「到」标签。

## 颜色与状态
- kind 决定左色条 + 图标色（复用现有 hue：scenic#db2777 food#ea580c road#2563eb stay#7c3aed fuel#0d9488 other#6b7280）。
- 饱和填充**只**留给 chip：closed=红、需预约=琥珀；其余中性。
- 状态视觉：closed → 卡身 `filter:saturate(.6)` 降饱和 + 红 chip；pending → 虚线边框 + 「待定」chip + 轻微降透明。
- 颜色抽成 CSS 变量便于主题化；**不**声称完整暗色模式（需先确认 app 是否有暗色模式才验证）。

## 删除项
CitizenSignal 信号格、2×2 网格的十字分隔线、`★` 字符徽章（→ IconStarFilled）、整片 pastel 填充、100px 渐变缩略图（→ 固定 48px 槽位，无图=极淡 kind 占位，正文恒等宽）。
hover 高亮改为 背景微染(`color-mix day-accent 4%`) + 投影抬升，去掉与左色条打架的 inset 日色条。

## 后端 status
- migration：`add_column :activities, :status, :integer, default:0, null:false` + `add_index :activities, :status`（主库，`bin/rails db:migrate`）。
- 模型 `activity.rb`：`enum :status, confirmed:0, pending:1, closed:2`；`clone_for_same_day!` 复制 status。
- `activities_controller.rb` strong params 加 `:status`；`ai_tools/update_activity.rb` UPDATABLE 加 `'status'`。
- `as_json` 自动输出字符串 status，无需改。

## 编辑器
- `detailsSchema.js` 加 `STATUS_OPTIONS`。
- `CommonFields.jsx`（公民等级 Radio 之后，约 :174）加「状态」Select（已定/待定/暂停开放，必选）。
- `ActivityDrawer.jsx`：`EMPTY_FORM_VALUES.status='confirmed'`；编辑加载 `status: activity.status||'confirmed'`；payload 带 status。

## 页脚
- `DayMetricBar.jsx`：超预算（value>max）时进度条下加红色小字 `超出 N{unit}`。
- `DayColumn.jsx`：`核心` label → `今日重点`。

## 宽度
- `DayColumn.jsx:161` Paper `flex:'0 0 200px'` → `'0 0 230px'`。
- 缩略图固定槽位（CSS）使同列卡正文恒等宽；候选池同款卡片。

## 刻意的范围控制
- 不扩 kind 枚举（机场/火车站仍归"其他"——taxonomy 改动单独一轮）。
- 不对到达时刻四舍五入。
- 地址用启发式提取行政区，失败回退末段。

## 受影响文件
前端：`activity-card.css`、`ActivityCard.jsx`、`DayColumn.jsx`、`DayMetricBar.jsx`、`CommonFields.jsx`、`ActivityDrawer.jsx`、`detailsSchema.js`、新建 meta 助手模块 + 其单测。
后端：`activity.rb`、新 migration、`activities_controller.rb`、`ai_tools/update_activity.rb`、`spec/factories/activities.rb`。
测试重写：`ActivityCard.test.jsx`、`DayMetricBar.test.jsx`、`DayColumn.test.jsx`、`ActivityDrawer.test.jsx`、`activity_spec.rb`、`activities_spec.rb`。

## 验证（CLAUDE.md 闸门）
`bundle exec rspec` + `npm test` + `bin/rubocop -f github` + `bin/brakeman --no-pager` + `npx vite build && bash scripts/verify-sw-rewrite-patterns.sh` + worktree dev server 实地预览前后对比。
