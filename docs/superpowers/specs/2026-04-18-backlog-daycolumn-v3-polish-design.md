# 候选池/日卡 V3 打磨：底部贴靠 + 形状一致 + hint + 字重 + border

**Date**: 2026-04-18
**Scope**: `app/javascript/components/planner/BacklogList.jsx`、`app/javascript/components/planner/DayColumn.jsx`

## 问题

V2（commit 2c68a9e）落地后的 UX 再审找到 5 件打磨级问题。本 spec 一次性处理。

1. **Paper 边框缺失** — V1 Task 4（commit 952a3b5）去掉了 `withBorder`，想靠 Mantine 默认 `shadow-xs` 兜底，但实测候选池边界在白背景上几乎看不到。并列的 ChatPanel 仍用 `withBorder`，**两个侧面板视觉不对称**。
2. **按钮形状 cliff** — V2 空态 2 个按钮垂直 `fullWidth` stack，非空态 toolbar 水平 `grow`。用户加第 1 个候选时按钮形状突变（竖条 → 方块），视觉不连续。
3. **空态情感冷漠** — V2 删掉了 V1 的 hint 文案，2 个按钮孤零零。首次用户缺少 onboarding welcome。
4. **两个 CTA 视觉等权** — `加候选` 和 `AI 帮选` 同 variant、同尺寸、同字重，扫视时分不出差异。AI-first 产品应让 `AI 帮选` 有隐式主导。
5. **CTA 全在顶部** — 候选池 toolbar + 每个日卡的 `+ 加一个` 都在顶部。现代产品（Trello、Notion、微信、Slack）都是 "append at bottom" 的习得 pattern；顶部 CTA 把用户视线从内容拉开，反而打断阅读。

## 非目标

- 不改 V2 的 drop state 三态机器（idle/active/over），保留不动
- 不改 folded state（已 a11y 稳定）
- 不改 Show.jsx 外层 grid
- 不改 ChatPanel
- 不改按钮 onClick 行为（`+ 加一个` 仍 `onAddActivity(day.id)`，`加候选` 仍 `onAddActivity(null)`）

## 设计

### 改动 1 — Paper 加回 `withBorder`

[BacklogList.jsx:87](app/javascript/components/planner/BacklogList.jsx:87)：

```jsx
- <Paper style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
+ <Paper withBorder style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
```

对齐 ChatPanel 的 1px subtle 边框处理。

### 改动 2 — 候选池空态：hint + 水平按钮 + 底部贴靠 + 字重差

Body 已是 `flex-direction: column`，`mt="auto"` 推到底。

当前 V2：

```jsx
{isEmpty && !readOnly && (
  <Stack gap="xs">
    {onAddActivity && (<Button size="sm" variant="default" fullWidth onClick={...}>加候选</Button>)}
    {onAskAI && (<Button size="sm" variant="default" fullWidth onClick={onAskAI}>AI 帮选</Button>)}
  </Stack>
)}
```

V3：

```jsx
{isEmpty && !readOnly && (
  <Stack gap="xs" mt="auto">
    <Text size="xs" c="gray.7">先把想去的点塞进这里，再拖到右侧日。</Text>
    <Group gap={4} grow>
      {onAddActivity && (
        <Button size="sm" variant="default" fw={500} onClick={() => onAddActivity(null)}>加候选</Button>
      )}
      {onAskAI && (
        <Button size="sm" variant="default" fw={700} onClick={onAskAI}>AI 帮选</Button>
      )}
    </Group>
  </Stack>
)}
```

四个具体变化：
- 外 `Stack mt="auto"` → 整个 cluster 贴 Body 底部
- 内加 `<Text>` hint → 承担 onboarding welcome
- `Stack` 内 2 按钮改 `Group gap={4} grow` → 水平等分
- 按钮去 `fullWidth`；加 `fw={500}` / `fw={700}` → AI 隐式主导

### 改动 3 — 候选池非空态：toolbar 移底 + 字重差

当前 V2：

```jsx
{!isEmpty && (
  <>
    {!readOnly && (onAddActivity || onAskAI) && (
      <Group gap={4} mb="xs" grow>
        {onAddActivity && (<Button size="compact-xs" variant="default">加候选</Button>)}
        {onAskAI && (<Button size="compact-xs" variant="default">AI 帮选</Button>)}
      </Group>
    )}

    <Group gap={4} mb="xs">
      <Select ... aria-label="按类型筛选" />
      <Select ... aria-label="按等级筛选" />
    </Group>

    <Stack gap={4}>
      {filtered.map(a => <ActivityCard ... />)}
      {filtered.length === 0 && <Text size="xs" c="dimmed">无匹配的候选。调整筛选或清空条件。</Text>}
    </Stack>
  </>
)}
```

V3：

```jsx
{!isEmpty && (
  <>
    <Group gap={4} mb="xs">
      <Select ... aria-label="按类型筛选" />
      <Select ... aria-label="按等级筛选" />
    </Group>

    <Stack gap={4}>
      {filtered.map(a => <ActivityCard ... />)}
      {filtered.length === 0 && <Text size="xs" c="dimmed">无匹配的候选。调整筛选或清空条件。</Text>}
    </Stack>

    {!readOnly && (onAddActivity || onAskAI) && (
      <Group gap={4} mt="auto" grow>
        {onAddActivity && (
          <Button size="compact-xs" variant="default" fw={500} onClick={() => onAddActivity(null)}>加候选</Button>
        )}
        {onAskAI && (
          <Button size="compact-xs" variant="default" fw={700} onClick={onAskAI}>AI 帮选</Button>
        )}
      </Group>
    )}
  </>
)}
```

三个变化：
- Toolbar Group 从第 1 位移到最后位
- Toolbar `mb="xs"` → `mt="auto"`（推到底，且它下面已无兄弟元素）
- 两个 Button 加 `fw={500}` / `fw={700}`

阅读顺序：**filter（输入）→ cards（内容）→ toolbar（动作）**。

### 改动 4 — 日卡 `+ 加一个` 移底

[DayColumn.jsx:81-87](app/javascript/components/planner/DayColumn.jsx:81)：

当前 DOM 顺序：

```
<Paper>
  <div data-testid="day-header">...</div>
  {dragWarning && ...}
  {+ 加一个 button}         ← 当前位置
  <Stack>cards / 空</Stack>
  <div>metrics footer</div>
</Paper>
```

V3 DOM 顺序：

```
<Paper>
  <div data-testid="day-header">...</div>
  {dragWarning && ...}
  <Stack>cards / 空</Stack>
  {+ 加一个 button}         ← 移到这里
  <div>metrics footer</div>
</Paper>
```

按钮本身不变（`size="compact-xs" variant="light" fullWidth` + `+ 加一个` label + `onAddActivity(day.id)`）—— 只调 JSX 顺序。

空态下：
```
D1 — 04-20 周一
(Stack minHeight 140 居中显示 "空")
+ 加一个
--- 虚线分隔 ---
驾驶 ░░░░░ 0/4h
核心 ░░░ 0/3
```

非空态下：
```
D1 — 04-20 周一
card 1
card 2
+ 加一个
--- 虚线分隔 ---
驾驶 ░░░░░ 0/4h
核心 ░░░ 0/3
```

Append-at-bottom pattern 统一。

### 视觉层次（V3 完成态）

**候选池空态**：

```
┌─[Paper withBorder]──────┐
│ 候选池        收起 ◂    │
│─────────────────────────│
│                          │  ← 大片顶部空白
│                          │
│                          │
│ 先把想去的点塞进这里，      │  ← hint（底部贴靠）
│ 再拖到右侧日。              │
│ [加候选]  [AI 帮选 ●]    │  ← 按钮水平，AI 字重重
└─────────────────────────┘
```

**候选池非空态**：

```
┌─[Paper withBorder]──────┐
│ 候选池        收起 ◂    │
│─────────────────────────│
│ [类型▼]  [等级▼]        │  ← filter 顶
│ card 1                   │
│ card 2                   │
│ ...                      │
│                          │
│ [加候选]  [AI 帮选 ●]    │  ← toolbar 底
└─────────────────────────┘
```

**日卡（empty vs full）**：

空态：header → 空 → `+ 加一个` → metrics
非空：header → cards → `+ 加一个` → metrics

## 测试改动

### BacklogList.test.jsx

- **翻转** V2 的 absence 断言 `expect(screen.queryByText(/先把想去的点塞进这里/)).not.toBeInTheDocument()` → `expect(screen.getByText(/先把想去的点塞进这里/)).toBeInTheDocument()`
- 其他 role+name 断言不受位置变化影响

### DayColumn.test.jsx

需要 audit：如果任何测试用 `within(...)` 或 element 顺序 index 断言 button 位置，需要调整。已有测试多数基于 role/name/text，影响应很小。在实现 task 里 `npm test` 会兜底。

## 风险 / 权衡

- **`mt="auto"` 兼容性** — Mantine `Stack` / `Group` prop `mt` 映射为 `margin-top` inline style；`"auto"` 合法 CSS margin 值。Mantine v9 确认支持。
- **Paper `withBorder` + drop state border 同存** — Paper 1px solid 在外边缘，Body drag state 2px dashed 在内。两者物理位置无冲突；drag 态下形成"外框 + 内焦"的嵌套视觉，层次加强而非干扰。
- **日卡底部 `+ 加一个` 和候选池底部 `加候选` 并存视觉** — 同列（Show.jsx grid 中间列）的 day 卡底有 `+ 加一个`，左侧候选池底有 `加候选`（无 `+`）。两者底部并列时视觉对称，内容语义正确区分（day-level inline append vs panel-level new candidate）。接受。
- **字重 500/700 跨主题稳定性** — 两个值都显式设定，不依赖 Mantine default。换主题仅影响本面板相对权重（500 vs 700 差异恒定）。
- **首次用户空态 hint 位置在底** — 按 X 流派的统一规则，hint + 按钮钉底。新用户首次入眼点可能不在 hint；但候选池 panel 宽 260px、高 ~500px，scan 到底部只需一次 eye movement，可接受。收益（两态一致、append-at-bottom 心智）> 代价。

## 验收

- 候选池 Paper 有可见 1px subtle border（和 ChatPanel 对齐）
- 空态：panel 顶部 ~70% 为空白；hint + 水平 2 按钮贴在 Body 底部
- 非空态：filter 顶 → cards 中 → toolbar 底
- 两态 toolbar label 一致（加候选 / AI 帮选），字重 `加候选 fw=500` / `AI 帮选 fw=700` 可辨
- 日卡 DOM 顺序：header → (dragWarning) → Stack(cards/空) → `+ 加一个` → metrics
- Drop state 三态机器无回归（拖卡至候选池时 Body dashed 边框 + gray.0/#e7f5ff bg 按 V2 spec 切换）
- `npm test` 全绿（含 hint 断言翻转）

## 落地

- 修改 [BacklogList.jsx](app/javascript/components/planner/BacklogList.jsx)、[DayColumn.jsx](app/javascript/components/planner/DayColumn.jsx)
- 修改 [BacklogList.test.jsx](app/javascript/components/planner/__tests__/BacklogList.test.jsx)（1 条断言翻转）
- 可能需要修改 [DayColumn.test.jsx](app/javascript/components/planner/__tests__/DayColumn.test.jsx) 如果有顺序相关断言
- 运行 `mise exec -- bundle exec rspec`、`npm test`、`mise exec -- bundle exec rubocop -f github app/`、`mise exec -- bundle exec brakeman --no-pager`、`npm audit`
- chrome-devtools-mcp 手测：空态底部贴靠 / 非空态 toolbar 底部 / 日卡 + 加一个底部 / 拖卡回 backlog 仍然生效
