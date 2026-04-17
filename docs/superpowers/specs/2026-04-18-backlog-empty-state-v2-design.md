# 候选池空态 V2：贴顶 + 状态驱动的 drop zone

**Date**: 2026-04-18
**Scope**: `app/javascript/components/planner/BacklogList.jsx`

## 问题

上一轮重构（[spec](2026-04-18-backlog-empty-state-redesign-design.md) / 落地 commit 952a3b5）把候选池从"60% 死区"修成"DashedStack flex:1 撑满"，浏览器实测暴露了 5 个新问题（见同会话 UX 锐评）。本 spec 修其中 4 个：

1. **按钮孤岛** — 2 个 36px 按钮垂直居中在 480px 虚线框里，上下各 200px 空白。dead zone 被 flex:1 解决了但 "content isolation" 更重
2. **Drop zone 反向误导** — 空态显示大 drop target，但新用户没有东西可以拖进来（backlog 是拖出的源，不是目的地。从 day column 拖回是次要用法）。默认就渲染 drop zone 是在暗示一个用户没有能力完成的动作
4. **"加一个" 语义弱** — 纯短文脱离 header `候选池` context 后要二次解析
5. **Inset shadow 付不起租** — `rgba(0,0,0,0.04)` 在 480px 高的 panel 里完全看不见；上一轮 shadow 是配合 flex:1 DashedStack 的"凹陷感"，本轮结构变了它也没存在理由

本 spec **不做** 的：
- #3（AI 帮选视觉抬升）—— 与本轮"空态就是空 + 两个同权选项"的哲学冲突，留给未来
- #6（7 天日卡截断）—— Plan 2 的响应式布局另议
- #7（AI 对话已接管 onboarding，候选池按钮该降级吗）—— 超范围，独立一轮

## 非目标

- 不改 header / folded state / droppable id（都已稳定）
- 不改 Show.jsx 外层 grid 布局
- 不增加新的按钮 / 文案 / 图标
- 不做单元测试去断言 drag 状态的 CSS（defer to chrome-devtools-mcp 手测）

## 设计

### 新的状态机

`useDroppable({ id: 'backlog', ... })` 已经返回 `{ setNodeRef, isOver, active }`。用 `active` + `isOver` 驱动 Body 视觉，三态：

| 状态 | 条件 | Body 边框 | Body 背景 |
|---|---|---|---|
| `idle` | `!active` | 无 | transparent |
| `active` | `active && !isOver` | `2px dashed var(--mantine-color-gray-5)` | `var(--mantine-color-gray-0)` |
| `over` | `active && isOver` | 同上 | `#e7f5ff` |

**关键**：
- 默认（`idle`）候选池就是个普通容器，内容直接显示（空态 = 2 个按钮；非空态 = toolbar + filters + cards），不装 drop zone
- 任何 drag 开始时（`active`）→ Body 自动变成可识别的 drop target
- hover 进入时（`over`）→ 更亮的 bg 确认命中

**空态和非空态共用同一套规则**，不分叉。非空态 drag 时 toolbar + cards 保持可见（用户需要上下文，而非"按钮突然消失"）。

### JSX（open-state return block 的 Body div）

```jsx
const { setNodeRef, isOver, active } = useDroppable({
  id: 'backlog',
  data: { dayId: null, position: activities.length + 1 }
})

// 三态派生
const dragState = active ? (isOver ? 'over' : 'active') : 'idle'

const bodyStyle = {
  padding: 12,
  flex: 1,
  display: 'flex',
  flexDirection: 'column',
  border: dragState === 'idle' ? 'none' : '2px dashed var(--mantine-color-gray-5)',
  borderRadius: 4,
  background:
    dragState === 'over' ? '#e7f5ff' :
    dragState === 'active' ? 'var(--mantine-color-gray-0)' :
    undefined,
  transition: 'border-color 120ms ease, background-color 120ms ease',
}
```

注意：

- `border: none` → `2px dashed ...` 的切换会让 Body 内容宽度缩 4px（左右各 2px）。全局 `box-sizing: border-box` 是 Mantine 的默认 reset，所以外尺寸不变、内容盒收缩 4px。文字会产生 2px 横向跳动，可接受。若实测刺眼再调。
- `transition` 120ms 缓冲，避免硬切
- Inset shadow 从 bodyStyle 里**删除**

### 空态内容（`isEmpty && !readOnly`）

上一轮的 DashedStack + flex:1 + justify=center 整段删除。替换为裸 `Stack`：

```jsx
{isEmpty && !readOnly && (
  <Stack gap="xs">
    {onAddActivity && (
      <Button size="sm" variant="default" fullWidth onClick={() => onAddActivity(null)}>
        加候选
      </Button>
    )}
    {onAskAI && (
      <Button size="sm" variant="default" fullWidth onClick={onAskAI}>
        AI 帮选
      </Button>
    )}
  </Stack>
)}
```

Stack 没有 `flex:1`，所以它只占内容高度（~100px），贴在 Body padding 内的顶部。下方剩余空间就是诚实的空白（Body 是 flex column，Stack 自然 align 到顶）。

### 非空态内容（`!isEmpty`）

结构完全保留上一轮的 toolbar Group + filter Group + ActivityCard Stack。**唯一文案改动**：toolbar 的 `加一个` Button label 改为 `加候选`。

### readOnly 空态

`{isEmpty && readOnly && <Text size="xs" c="gray.7">尚无候选</Text>}` 保持不动。

## 测试更新

### 删除 / 修改

- 空态测试里如果有 `expect(screen.getByText(...))` 断言"虚线框存在"的（上一轮可能没有这种断言），移除
- "empty + editable: shows CTA buttons..."：`getByRole('button', { name: '加一个' })` → `getByRole('button', { name: '加候选' })`
- "non-empty backlog: ... toolbar shows both buttons"：`getAllByRole('button', { name: '加一个' })` → `getAllByRole('button', { name: '加候选' })`
- "non-empty backlog: clicking toolbar AI 帮选"：无需改
- "empty + editable: clicking AI 帮选 calls onAskAI"：无需改

### 不新增

Drag 状态的 CSS 断言成本高（jsdom 不模拟 pointer drag；dnd-kit 的 active state 也难造出来）。defer 到 chrome-devtools-mcp 手测 + 实际 drag 交互。

## 风险 / 权衡

- **`useDroppable` 的 `active` 字段** — 文档明确：`useDroppable` 返回 `{ active: Active | null, isOver, node, over, rect, setNodeRef }`。`active` 是 global drag state（项目里当前正在拖的对象），不是本 droppable 特有。实测确认。如果这个字段为 undefined，改用 `useDndContext()` 从上下文拿。
- **Border 切换时的 layout shift** — 上面分析过 2px × 2 的横向内容收缩。120ms transition 能缓和，用户体感是"边缘渐出"而不是"内容跳动"。可接受。
- **非空态 drag 视觉" target 太大"** — 整个 Body 都是 drop zone，用户无论拖到 toolbar 区还是 card 区都命中 backlog。这是 dnd-kit 原本行为，本 spec 不改。
- **同一会话已有 3 个 spec 改同一个文件** — BacklogList.jsx 在最近 20 个 commit 里被反复编辑。每次都在上一轮基础上继续。这是当前项目节奏，不额外重构。

## 验收

- 空态默认：2 按钮（`加候选` / `AI 帮选`）贴在 Body 顶部 padding 内；**下方纯白空白**；Body 无边框
- 非空态默认：toolbar（`加候选` / `AI 帮选`）+ filter + card；Body 无边框
- 从 day column 开始拖任何一张 ActivityCard：**候选池 Body 立刻出现 dashed gray-5 边框 + gray-0 浅底**
- 继续拖到候选池 Body 上方：bg 加亮至 `#e7f5ff`，drop 成功（day_id → null）
- 拖完释放：Body 立即回到 idle 态
- `npm test` 全绿（含 label 改字）
- chrome-devtools-mcp 手测三态切换

## 落地

- 修改 [BacklogList.jsx](app/javascript/components/planner/BacklogList.jsx)（单文件）
- 修改测试文案：`加一个` → `加候选`（2 处）
- 运行 `mise exec -- bundle exec rspec`（预期无变化）、`npm test`、`mise exec -- bundle exec rubocop -f github app/`、`mise exec -- bundle exec brakeman --no-pager`、`npm audit`
- chrome-devtools-mcp：打开 tour，从某 day 拖卡到 backlog 观察 3 态切换
