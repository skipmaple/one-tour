# 候选池空态 V5：虚线框只留 hint，按钮拎到 Body 底部

**Date**: 2026-04-18
**Scope**: `app/javascript/components/planner/BacklogList.jsx`

## 问题

V4（commit 3243a91）把 V1 的 dashed 填充 frame 找回来了，hint 和 2 个按钮都放在 frame 内部居中。实际使用下发现：

1. **Frame 内容混杂**：hint（被动引导文案）和 buttons（交互控件）在同一个视觉容器里，认知上二者是不同类别的元素
2. **按钮位置跨状态仍不一致**：空态按钮在 dashed frame 内中部，非空态 toolbar 在 Body 底部——用户加第 1 张候选时按钮 Y 位置仍有跳动

## 设计原则

把 dashed frame 定位为**纯视觉 onboarding 容器**，只放 hint。按钮独立成 toolbar 贴 Body 底部，和非空态 toolbar 位置一致。

## 非目标

- 不改非空态（V3 filter → cards → toolbar 底部布局不动）
- 不改 V2 Body drag-state 三态机器
- 不改 V3 的 Paper withBorder、日卡布局、字重差异、hint 文案
- 不改 V4 的 drag 时 frame fade 交接逻辑

## 设计

### 新的空态 JSX

V4（当前，commit 3243a91）：

```jsx
{isEmpty && !readOnly && (
  <Stack
    gap="xs"
    p="md"
    justify="center"
    style={{ flex: 1, border: ..., background: ..., transition: ... }}
  >
    <Text size="xs" c="gray.7" ta="center">先把想去的点塞进这里，再拖到右侧日。</Text>
    <Group gap={4} grow>
      <Button fw={500}>加候选</Button>
      <Button fw={700}>AI 帮选</Button>
    </Group>
  </Stack>
)}
```

V5：

```jsx
{isEmpty && !readOnly && (
  <>
    <Stack
      gap="xs"
      p="md"
      justify="center"
      style={{
        flex: 1,
        border: '2px dashed ' + (dragState === 'idle' ? 'var(--mantine-color-gray-5)' : 'transparent'),
        borderRadius: 4,
        background: dragState === 'idle' ? '#fafafa' : 'transparent',
        transition: 'border-color 120ms ease, background-color 120ms ease',
      }}
    >
      <Text size="xs" c="gray.7" ta="center">先把想去的点塞进这里，再拖到右侧日。</Text>
    </Stack>
    <Group gap={4} grow mt="xs">
      {onAddActivity && (
        <Button size="sm" variant="default" fw={500} onClick={() => onAddActivity(null)}>
          加候选
        </Button>
      )}
      {onAskAI && (
        <Button size="sm" variant="default" fw={700} onClick={onAskAI}>
          AI 帮选
        </Button>
      )}
    </Group>
  </>
)}
```

### V4 → V5 变化

| 项 | V4 | V5 |
|---|---|---|
| Dashed Stack 内容 | hint + Group(buttons) | **仅 hint** |
| Buttons 位置 | Stack 内垂直居中 | Stack 外，Body 底部 |
| Buttons 和 frame 的距离 | 同 Stack `gap="xs"` | `Group mt="xs"`（8px） |
| Drag 时 buttons 可见性 | 在 fade-out 的 Stack 内，靠 text c="gray.7" 保持可读 | 完全独立于 Stack，drag 时不受影响 |
| Fragment 包裹 | 不需要（单 Stack 根） | 需要 `<>...</>`（Stack + Group 两个兄弟）|

### 两态按钮 Y 位置对齐

**空态 V5**：
```
[Paper withBorder]
  Header
  [Body padding:12, flex column]
    [Stack dashed, flex:1]      ← 撑满上方
      hint (centered)
    [Group mt:xs]                ← 贴 Body 底部
      [加候选] [AI 帮选]
```

**非空态（V3 不变）**：
```
[Paper withBorder]
  Header
  [Body padding:12, flex column]
    [Group filter]               ← 顶部
    [Stack cards]
    [Group mt:auto, grow]        ← 贴 Body 底部
      [加候选] [AI 帮选]
```

两态 toolbar 都在 **Body 底部 + padding 12px 内**，Y 位置完全对齐。用户加第 1 张候选 → 上方 dashed frame 变成 filter+cards，但 toolbar 原地不动。

### Drag 态下的行为

- Dashed Stack：border-color / bg → `transparent`，V2 Body 的 drop-zone 视觉（外边 dashed + gray-0 bg）接管
- **Buttons**：完全独立于 Stack，drag 时不 fade、不隐藏、可见可点。用户拖到一半想手动加也 OK
- 外 Body drag 视觉（V2 三态机器）正常生效

### 按钮尺寸差异（刻意保留）

空态 `size="sm"`（36px 高）vs 非空态 `size="compact-xs"`（24px 高）。理由：非空态 toolbar 上方有 cards 内容压力，按钮紧凑让位；空态无内容压力，按钮可以大一点作为主操作。这是**内容密度驱动的尺寸差**，非 cliff 问题。Y 位置对齐是核心，尺寸微差可接受。

## 测试

V3 / V4 的断言继续通过：
- hint `getByText(/先把想去的点塞进这里/)` 仍命中（仍渲染）
- Buttons by role+name 仍命中（仍渲染）

无新测试。Drag 态视觉由 chrome-devtools-mcp 手测验证。

## 风险 / 权衡

- **Fragment 包裹 vs Stack 包裹** — 用 `<>...</>` 让 Stack 和 Group 成为 Body 的直接 flex children。Stack `flex:1` 吃掉所有剩余空间，Group 自然贴底。如果用外层 Stack 包裹会引入第二层 flex，不必要。
- **按钮尺寸空态 sm / 非空态 compact-xs 的差异** — 见上方段落。接受。
- **`mt="xs"` 8px gap** — 空态 Stack bottom edge 到 Group top 有 8px 气息，避免挤在一起。对照 V3 的 `mb="xs"` 同值。
- **drag 态下 dashed Stack fade 但仍占 flex:1 空间** — 正确行为。Stack "消失" 是视觉 fade，layout 上仍然存在，buttons 位置稳定。

## 验收

- 空态静止：
  - Body 内上方有大片 dashed 填充 frame，hint 水平+垂直居中
  - Frame 下方 8px 气息后，2 按钮 Group 贴 Body 底部
- 空态 drag：
  - 外 Body dashed 边淡入（V2 已有）
  - 内 Stack dashed 边淡出（V4 已有）
  - **Buttons 完全无变化**
- 空态 → 非空态切换（加第 1 张候选）：
  - 上方 dashed frame → filter row + cards Stack
  - Buttons Y 位置**不变**
- 非空态不变
- `npm test` 全绿

## 落地

- 修改 [BacklogList.jsx](app/javascript/components/planner/BacklogList.jsx) 空态 block（拆 Stack 为 Stack + Group 两兄弟，约 15 行替换 15 行）
- 无测试改动
- 运行 `npm test`、`mise exec -- bundle exec rubocop -f github app/`、`mise exec -- bundle exec brakeman --no-pager`、`npm audit`
- chrome-devtools-mcp 手测：空态静止（frame 空态 + 按钮底部）+ 空态 drag（frame fade + 按钮稳定）
