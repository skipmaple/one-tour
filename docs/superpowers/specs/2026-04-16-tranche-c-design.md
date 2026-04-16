# Tranche C — 新建 Tour 首次体验（自动建 D1 + AI 多轮 onboarding + Backlog 空态 CTA）

**Status**: Design approved 2026-04-16 · awaiting implementation plan
**Source**: Tranche A spec line 502 列出的 "Tranche C" 子项 · 接 Tranche A/B 落地后
**Scope**: 3 个子块——自动建 D1、AI 多轮 onboarding、Backlog 空态三按钮
**参考原型**: `docs/superpowers/specs/2026-04-15-tour-day-activity-remodel-wireframes.html` Screen 3（"新建 Tour 首次打开 —— 空白起点"）

---

## 背景

Tranche A/B 把 Planner 完整 MVP 做完——但**新用户从 0 走到 1 的那一步**还没设计：

- 新建 Tour 后落到 Constitution 页 → 用户继续点 "使用默认宪法" → 跳到 Planner
- Planner 是空的：Backlog 0 个 activity、Days 0 天、Chat 等用户先开口
- 当前 Backlog 空态文案 "尚无候选。可手动添加或让 AI 帮忙"——只是个提示，没引导
- Days 空态需要用户主动点 "+ 新建 Day 1"
- AI Chat 等用户主动说话，没有"我来帮你起步" 的姿态

Wireframes Screen 3 给出了完整设计：自动有 D1 骨架、Backlog 空态有显式双 CTA、Chat 自动按 4 轮节奏对话填 backlog。

Tranche C 把这条 "0→1" 路径做出来。

不在本 spec：年表 / Membership UI / drag-drop 细节（前面 tranche 已做）；"小 polish" 跳过；onboarding 中断恢复 UI。

---

## 0 · 子块依赖关系

```
Section 1 (自动建 D1) — 独立
    └── Section 2 (AI onboarding) — 复用 Section 1 的 D1 + Tranche A 的 pendingChatPrompt 机制

Section 3 (Backlog 空态三按钮) — 复用 pendingChatPrompt 机制；与 Section 2 互补
```

交付顺序：1 → 2 → 3。每个独立 commit、独立可发布（Section 2/3 即使没 1 也能跑，只是 D1 缺席）。

---

## 1 · 自动建 D1

### 1.1 行为

新建 Tour 后立即在该 Tour 下创建 1 个 Day，`day_index = 1`，其他字段保持 schema 默认值（date=nil, title=nil, theme=nil, intensity=nil, buffer_day=false）。

### 1.2 实现

`Tour` model 加 `after_create_commit` callback：

```ruby
class Tour < ApplicationRecord
  ...
  after_create_commit :seed_first_day

  private
    def seed_first_day
      days.find_or_create_by!(day_index: 1)
    end
end
```

**为何 `find_or_create_by!`** 而不是 `create!`：幂等，避免:
1. Test fixture 里手动 `create(:day, tour: tour, day_index: 1)` 与 callback 冲突（unique index）
2. 任何意外的 callback 重入

### 1.3 与 AI onboarding 的协调

Onboarding 第 ② 轮用户答 "10 天" 时，AI 调 `create_day` 时不会再创建 day_index=1（已存在），只补 day_index=2..10。这个由 system prompt 注入"当前 Tour 已有 N 个 Day"提示，AI 自然处理（见 §2.5）。如果 AI 真的尝试创建 day_index=1，`AITools::CreateDay` 内部应已处理 unique constraint 错误（验证：检查现有实现，必要时加 `find_or_create_by!`）。

### 1.4 影响面 / Test fixtures

**潜在影响**：现有 spec 里 `create(:tour)` 之后再 `create(:day, tour: tour, day_index: 1)` 会因 unique constraint 报错。

**审查范围**：所有 `spec/**/*.rb` 中匹配 `create(:day` 的位置——评估改成下面之一：
- `tour.days.first` 直接拿 callback 创建的 D1
- `tour.days.find_or_create_by!(day_index: 1)`
- 用更高 `day_index`（2、3…）创建额外 day

**不**做的：在 Tour factory 加 `skip_seed_first_day` opt-out flag——污染模型 API。

**Day factory** 用 `sequence(:day_index)` 起步是 1，全局递增——多 tour 测试不会冲突，但**单 tour 多 day** 时若调用 `create(:day, tour: tour)` 第一次会拿到 day_index=2（因为 callback 已经占了 1）。需要在 plan 里明确处理。

### 1.5 文件清单

**修改**：
- `app/models/tour.rb` — 加 callback + private method
- `spec/models/tour_spec.rb` — 加 `after_create_commit` 测试
- 任何 `create(:day, tour: ..., day_index: 1)` 的现有 spec（plan 阶段逐个审）

**新建**：无

### 1.6 测试

```ruby
describe "after_create_commit :seed_first_day" do
  it "creates a Day with day_index=1 automatically" do
    tour = create(:tour)
    expect(tour.days.size).to eq(1)
    expect(tour.days.first.day_index).to eq(1)
  end

  it "is idempotent (find_or_create_by) when D1 already exists" do
    tour = create(:tour)
    expect { tour.send(:seed_first_day) }.not_to change(Day, :count)
  end
end
```

---

## 2 · AI 多轮 onboarding（纯 prompt）

### 2.1 触发判定

`Show.jsx` mount 时 `useEffect`：

```jsx
useEffect(() => {
  if (
    canEdit &&
    activities.length === 0 &&
    conversation_empty
  ) {
    setPendingChatPrompt(ONBOARDING_SENTINEL)
  }
}, []) // mount only — eslint-disable-next-line react-hooks/exhaustive-deps
```

- `canEdit`：reader 不触发（onboarding 会修改 tour 数据）
- `activities.length === 0`：用户已经手动加过 activity 就不再启动
- `conversation_empty`：避免重复触发（用户上次启动到一半关页面，下次再开应保留 conversation 不重启）

### 2.2 `conversation_empty` prop

`ToursController#show` props 加：

```ruby
conv = @tour.conversations.find_by(user: current_user)
render inertia: "Tour/Show", props: {
  ...
  conversation_empty: !conv || !conv.messages.exists?
}
```

`!conv` → 没创建过对话 → 空。`conv.messages.exists?` 是布尔，false 即空。

### 2.3 Sentinel 机制

定义前端 + 后端共享常量：

```jsx
// 前端 app/javascript/lib/onboarding.js
export const ONBOARDING_SENTINEL = '__onboarding_start__'
```

```ruby
# 后端 app/jobs/chat_stream_job.rb
ONBOARDING_SENTINEL = "__onboarding_start__".freeze
```

**前端持久化**：sentinel 通过 `useChat.send()` 发送 → ChatStreamJob → 写入 messages 表（user role）。**前端展示时跳过**：

```jsx
// ChatPanel.jsx 的 MessageBubble (or messages.map filter)
function MessageBubble({ message }) {
  if (message.role === 'user' && message.content === '__onboarding_start__') {
    return null
  }
  ...
}
```

后端 system prompt 识别 sentinel 时回复欢迎语 + 第 ① 问。

### 2.4 启动流（复用 Tranche A 的 pendingChatPrompt）

时序：

1. Show.jsx mount → 触发条件成立 → `setPendingChatPrompt(ONBOARDING_SENTINEL)`
2. `<ChatPanel pendingPrompt={pendingChatPrompt} ... />` 接到新 prop
3. ChatPanel 内 `useEffect` 看到 pendingPrompt 变化 → 自动 expand panel + `useChat.send(pendingPrompt)` + 调 `onPromptConsumed()` 清空
4. `useChat.send` → POST 到 `/tours/:id/conversations/:cid/messages` → 入队 ChatStreamJob
5. ChatStreamJob 用 system prompt（含 onboarding 段）调 LLM → 流式回复 "欢迎 👋 这次想去哪？"
6. 回复通过 ActionCable broadcast → 前端 useChat 接收 → MessageBubble 渲染（sentinel 这条 user message 不显示，AI 回复正常显示）

### 2.5 System prompt 改造

`ChatStreamJob#system_prompt(tour)` 末尾追加：

```text
## 当前 Tour 状态
- Days: #{tour.days.count}
- Activities: #{tour.activities.count}

## Onboarding 模式

如果用户消息是 "__onboarding_start__"，按以下节奏开始 4 轮对话：

① "欢迎 👋 我先问几个问题，搞清楚方向再开始。\n这次想去哪？（例如：伊犁环线、川西、河西走廊）"
② 用户答完 ① 后："几天？我会据此建 Day 骨架。"
③ 用户答完 ② 后："几个人、什么车？"
④ 用户答完 ③ 后："主要想看什么？（景观 / 人文 / 带娃 / 徒步…）"

一次只问一件事，不要一口气问 4 个。

收到第 ④ 个回答后，开始批量执行：
- 当前 Tour 已有 Days：#{tour.days.count}。如果用户说 N 天，调用 create_day 创建 day_index = (当前+1)..N，跳过已存在的天。
- 调 search_poi 搜索用户提到的地点，从候选里挑 add_activity 到 backlog（不指定 day_id，让用户自己拖）。
- 添加 ~20-30 个 POI 即可，太多用户处理不过来。
- 添加完毕回一句简短总结："已往 backlog 加了 N 个候选 + N 个 Day 骨架，往左拖到对应 Day 即可。"

如果用户首条消息**不是** sentinel（例如直接说 "我想去伊犁"），跳过欢迎语，直接确认+进入第 ② 个问题。
```

注意：Days/Activities 计数是请求时的快照——AI 自己批量调 create_day 时已修改状态，下次工具调用看到的是新状态（每次 LLM 轮回都重读），所以不会冲突。

### 2.6 Reader 模式

reader 不触发（前端 `canEdit` 守门）。即使 reader 通过 URL 强进 + 手动调 send，`AITools` 内部已校验 `tour.editable_by?(user)`，会失败。Onboarding 流程不会走完。

### 2.7 中断恢复

不做。一旦 conversation 有任何消息（包括 sentinel），下次进 Tour 不再触发——用户在 Chat 里继续聊，AI 看 conversation history 自己延续。如果用户当时只答到第 ②，下次 AI 看历史会问第 ③。这是纯 prompt 方案的天然好处。

### 2.8 文件清单

**修改**：
- `app/controllers/tours_controller.rb` — show props 加 `conversation_empty`
- `app/jobs/chat_stream_job.rb` — system_prompt 加 onboarding 段、当前状态段、sentinel 常量
- `app/javascript/pages/Tour/Show.jsx` — mount useEffect 触发；接收 `conversation_empty` prop
- `app/javascript/components/planner/ChatPanel.jsx` — `MessageBubble` 跳过 sentinel
- `app/javascript/components/planner/__tests__/ChatPanel.test.jsx` — 加 sentinel 跳过测试
- `spec/requests/tours_spec.rb` — 加 conversation_empty 在 show props 的断言

**新建**：
- `app/javascript/lib/onboarding.js` — 导出 `ONBOARDING_SENTINEL` 常量

### 2.9 测试

**Vitest**：
- ChatPanel `MessageBubble` 不渲染 sentinel user message
- ChatPanel 渲染其他正常 user message
- Show.jsx mount 时若条件满足，`setPendingChatPrompt(SENTINEL)` 被调（mock useChat send 验证）
- Show.jsx mount 时若 `canEdit=false` / `activities.length>0` / `conversation_empty=false` 任一假，**不**触发

**RSpec**：
- `ToursController#show` props 含 `conversation_empty`（用 inertia helper 或解析响应 body）
- 新 conversation 时 `conversation_empty=true`；有 messages 时 false

**手动 QA**（plan 阶段写明）：
- 新建 Tour → Planner → 自动看到 AI "欢迎 👋 这次想去哪？"
- 答 "伊犁环线" → AI 问 "几天？"
- 答 "10 天" → AI 问 "几个人、什么车？"
- 答完 4 题 → AI 流式批量调 create_day + search_poi + add_activity → backlog 出现 ~20 个候选

---

## 3 · Backlog 空态三按钮

### 3.1 行为

`BacklogList` 当 `activities.length === 0`：

- **editable mode (`!readOnly`)**：显示 dashed 边框框，内含：
  - 顶部小字："先把想去的点塞进这里，再拖到右侧 Day"
  - Button 1 (primary)：`+ 手动添加 activity` → 调 `onAddActivity(null)`
  - Button 2 (default)：`💬 让 AI 帮列候选` → 调 `onAskAI`
  - Button 3 (subtle, 小)：`▸ 跳到 Chat 输入框` → 调 `onFocusChat`

- **readOnly mode**：显示简单文案 "尚无候选" 不带 CTA

如果 backlog **不**为空（哪怕只有 1 个 activity）：完全不显示这个空态框，正常列卡片（保持现有行为）。

### 3.2 新 props on BacklogList

```jsx
<BacklogList
  activities={...}
  onAddActivity={...}      // 已有
  onEditActivity={...}     // 已有
  onAskAI={onAskAI}        // 新：调 setPendingChatPrompt(ASK_BACKLOG_PROMPT)
  onFocusChat={onFocusChat}// 新：调 setChatOpen(true)（Chat 收起时展开）
  readOnly={...}           // 已有
/>
```

`onAskAI` / `onFocusChat` 是 optional——传了才显示对应按钮。Show.jsx 在 reader 模式不传（`canEdit ? handler : undefined`），按钮自然不显示。

### 3.3 Show.jsx 接线

```jsx
const askAIPrompt = '请帮我再列一些候选 activity 到 backlog'

<BacklogList
  activities={backlog}
  onAddActivity={canEdit ? openCreate : undefined}
  onEditActivity={canEdit ? openEdit : undefined}
  onAskAI={canEdit ? () => setPendingChatPrompt(askAIPrompt) : undefined}
  onFocusChat={canEdit ? () => setChatOpen(true) : undefined}
  readOnly={!canEdit}
/>
```

`onFocusChat` 简化为只展开 Chat 面板（不强行 focus textarea）——用户看到面板展开自然知道下一步。如果将来要做更精细的 textarea focus，再扩 ChatPanel 加 `pendingFocus` prop。

### 3.4 文件清单

**修改**：
- `app/javascript/components/planner/BacklogList.jsx` — 空态分支 + 新 props
- `app/javascript/pages/Tour/Show.jsx` — 传新 props
- `app/javascript/components/planner/__tests__/BacklogList.test.jsx` — 加 3 条测试

**新建**：无

### 3.5 测试

**Vitest**（新增）：
- 空态 + editable：显示 3 个按钮、显示提示文案
- 空态 + readOnly：只显示 "尚无候选" 文案
- 点 "💬 让 AI 帮列候选" 调 `onAskAI`
- 点 "▸ 跳到 Chat 输入框" 调 `onFocusChat`
- backlog 非空时不显示空态框（已有筛选测试可覆盖）

---

## 4 · 共用约束 / 边界

- 不引入新 npm 依赖
- 不引入新 Ruby gem
- 所有改动 reader 模式有合理表现
- system prompt 改动需保持现有"工具优先 / 不输出 JSON" 等原则不丢
- Sentinel 字符串 `__onboarding_start__` 是约定——前后端各一份常量定义，**不**通过网络字段传递；定义改动需同步两边
- **不做的**：
  - "跳过 onboarding" 按钮（用户不答 AI 自然不继续）
  - Onboarding 进度条（"现在第 ②/④ 题"）—— LLM 自己跟踪即可
  - 多语言提示文案
  - "小 polish"（line 502 提到但跳过）
  - Onboarding 中断恢复 UI（conversation 历史天然恢复）

---

## 5 · 数字预估

| 新增 | 修改 |
|---|---|
| 1 JS 常量文件（onboarding.js）| Tour model · ToursController · ChatStreamJob · Show.jsx · ChatPanel · BacklogList |
| **总**: 1 新文件 | 6 修改文件 |

RSpec 预期 +5（Tour seed_first_day ×2、ToursController conversation_empty ×1、AI tool create_day idempotency 兜底 ×1、ChatStreamJob system_prompt 含 onboarding 段 ×1）。Vitest 预期 +9（BacklogList 空态 ×4、Show.jsx mount onboarding trigger ×3、ChatPanel sentinel skip ×2）。

潜在影响：Tour factory 改动后部分现有 spec 里的 `create(:day, tour: ..., day_index: 1)` 调用需修复——plan 阶段逐个梳理（grep 范围已知）。

---

## 6 · 交付顺序建议

1. **Section 1 · 自动建 D1** — Tour model + spec + 修复受影响的现有 day fixture spec
2. **Section 2.5 · ChatStreamJob system prompt 改造** — 后端独立可上，配合现有任意用户消息验证
3. **Section 2.2 · ToursController#show conversation_empty prop** + request spec
4. **Section 2.3 · Sentinel 常量 + ChatPanel MessageBubble 跳过** + vitest
5. **Section 2.1/2.4 · Show.jsx mount onboarding trigger** + vitest
6. **Section 3 · Backlog 空态三按钮** + vitest
7. 整体 RSpec/Vitest/RuboCop pass + 浏览器手动 QA

每段独立 commit。Section 2 拆 4 步是因为前后端有依赖，但每步互不破坏现有功能（system prompt 改了只影响 AI 行为，前端不显示 sentinel 不影响普通对话）。

---

## 附：已知后续（**不**在本 spec）

- "小 polish"（Tranche A line 502 列出但跳过）：Tour 列表页 health 颜色 / 相对时间格式 / 新建 Tour 流程优化
- "跳过 onboarding" 按钮 / 进度指示器
- Onboarding 完成后弹一个 "教程结束" toast
- `AITools::SuggestFixes` 独立子屏（line 503，仍走 chat-prompt 路径）
- 邀请邮件 / AMAP JS SDK 集成
