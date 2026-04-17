# 候选池空态 V4：dashed 容器回归 + drag 态交接

**Date**: 2026-04-18
**Scope**: `app/javascript/components/planner/BacklogList.jsx`

## 问题

V3（commit dbc743d）按 append-at-bottom 规则把空态的 hint + 按钮钉在 Body 底部，大片上方留白。实际使用中**缺乏容器感**——单薄的文字和按钮漂浮在 500px 面板里，没有"这里是个池"的视觉兑现。

V1 原本的虚线 light-gray 填充 frame（见 `docs/superpowers/specs/2026-04-18-backlog-empty-state-redesign-design.md` 落地结果 952a3b5）提供了明确的"onboarding 容器"视觉，但在 V2（commit 2c68a9e）为了解决"drop zone 反向误导"被删除。

本 spec 做一次**精准回归**：把 V1 的 dashed frame 空态视觉找回来，同时保留 V2/V3 的所有增益（drag-state 机器、hint 文案、horizontal 按钮、字重差异、Paper withBorder）。

## 非目标

- 不改非空态（filter → cards → toolbar 底部布局不动）
- 不改 V2 的 Body drag-state 三态机器
- 不改日卡、Folded state、Paper withBorder
- 不改测试（hint presence 已在 V3 断言）
- 不碰 Show.jsx

## 设计

### 核心：空态 Stack 变成"drag 态会让位"的虚线容器

V3 空态（当前）：

```jsx
{isEmpty && !readOnly && (
  <Stack gap="xs" mt="auto">
    <Text size="xs" c="gray.7">先把想去的点塞进这里，再拖到右侧日。</Text>
    <Group gap={4} grow>
      {onAddActivity && (<Button size="sm" variant="default" fw={500}>加候选</Button>)}
      {onAskAI && (<Button size="sm" variant="default" fw={700}>AI 帮选</Button>)}
    </Group>
  </Stack>
)}
```

V4 空态：

```jsx
{isEmpty && !readOnly && (
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
    <Group gap={4} grow>
      {onAddActivity && (<Button size="sm" variant="default" fw={500}>加候选</Button>)}
      {onAskAI && (<Button size="sm" variant="default" fw={700}>AI 帮选</Button>)}
    </Group>
  </Stack>
)}
```

### 变化点（V3 → V4）

| 属性 | V3 | V4 |
|---|---|---|
| 外层 props | `gap="xs" mt="auto"` | `gap="xs" p="md" justify="center"` |
| flex 布局 | 无 flex → content-fit 被 mt:auto 推到底 | `flex: 1` 填满 Body 垂直 |
| 位置 | 底部贴靠 | 垂直居中 |
| 边框（idle） | 无 | `2px dashed gray-5` |
| 背景（idle） | 无 | `#fafafa` |
| 边框（drag active/over） | 无 | `2px dashed transparent`（只淡 color，width 保持 2px）|
| 背景（drag active/over） | 无 | `transparent` |
| transition | 无 | `border-color 120ms ease, background-color 120ms ease` |
| hint text-align | 默认 (left) | `ta="center"`（匹配 reference 图居中视觉）|
| Group grow / 按钮 | 无变化 | 无变化 |

### Drag-state 交接机制

V2 已为 Body div 绑定同样的 transition（`border-color 120ms ease, background-color 120ms ease`）。V4 把同一 transition 也加到内 Stack 上，让 drag 进入时：

- **外 Body** border-color `transparent → gray-5`，bg `undefined → gray-0`（V2 逻辑不变）
- **内 Stack** border-color `gray-5 → transparent`，bg `#fafafa → transparent`（V4 新增）

两层 transition 同步 120ms ease 运行——外 frame 淡入、内 frame 淡出——形成 **单层 drop zone 取代双层**的视觉。

Drag 结束（`dragState → idle`）时反向 crossfade，内 frame 回来。

### 为什么 `border: '2px dashed transparent'` 而非 `border: 'none'`

CSS transition 不能平滑过渡 `border-style`（dashed → none）或宽度从 2px → 0。维持 `2px dashed` 恒定宽度，仅动画 `border-color` 从色值到 `transparent`，是**零 layout shift + 平滑淡入淡出**的唯一干净方案。

内容盒 padding 从始至终 account for 2px border，切换时 hint / 按钮零位移。

### Reference 图对照

用户提供的 reference（dashed 圆角 light-gray 填充 + 居中 hint + 下方按钮）视觉，V4 完整复现。

## 测试

- V3 测试的 `expect(screen.getByText(/先把想去的点塞进这里/)).toBeInTheDocument()` 继续通过（hint 仍渲染）
- 按钮 role+name 断言继续通过
- 没有新的单元测试 —— drag-state 的视觉切换靠 chrome-devtools-mcp 手测

## 风险 / 权衡

- **transition 不支持 `border-style`** — 仅 `border-color` 有平滑动画。通过恒定 2px width + transparent 色值 hack 掉
- **内 Stack p="md"（16px）+ 外 Body padding 12px** — content 距离 Paper 边缘至少 12+16+2 = 30px。对 260px 宽 panel 来说内容可用 ~196px，两按钮 grow 等分 ≈ 94px / 个，够放 `加候选` / `AI 帮选` 各 3 字
- **`flex: 1` 上 Stack + 外 Body 已是 flex column** — 合法 CSS，Stack 撑满 Body 剩余空间（Body 被 header 吃掉一部分，剩余全归 Stack）
- **hint 居中（`ta="center"`）和非空态 filter 左对齐不冲突** — 非空态不进入这个分支
- **两层 dashed 在 `transparent` transition 中点瞬间可能有"穿帮"** — 120ms 中点时内外都有 ~50% alpha dashed，可能视觉混乱。但 120ms 是感知阈值边界，中间帧停留极短（<60ms），实际观察不到

## 验收

- 空态静止（`dragState === 'idle'`）：
  - 内 dashed light-gray frame 大面积占据 Body
  - hint 居中、2 按钮在下
  - 对照 reference 图视觉匹配
- 拖日卡 → 候选池（`dragState === 'active'` 然后 `over`）：
  - 内 frame 120ms 淡出到 transparent
  - 外 Body 同时 120ms 淡入 dashed + bg
  - 视觉上是 **单层 drop zone**（不再双边）
  - hint + 按钮位置零位移
- drop 完成：drag state 回 idle，反向 crossfade，内 frame 回来
- 非空态：一丝不变
- `npm test` 全绿

## 落地

- 修改 [BacklogList.jsx](app/javascript/components/planner/BacklogList.jsx) 空态 block（约 15 行替换 10 行）
- 无测试改动
- 运行 `npm test`、`mise exec -- bundle exec rubocop -f github app/`、`mise exec -- bundle exec brakeman --no-pager`、`npm audit`
- chrome-devtools-mcp 手测：静止态（截图对比 reference 图） + 拖拽态切换（肉眼验证 crossfade）
