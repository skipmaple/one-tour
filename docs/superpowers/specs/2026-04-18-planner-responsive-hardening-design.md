# 规划页响应式硬化 — 候选池可折叠 + 日卡自适应（#2）

**Date**: 2026-04-18
**Scope**: `app/javascript/pages/Tour/Show.jsx`、`app/javascript/components/planner/BacklogList.jsx`、`app/javascript/components/planner/DayColumn.jsx`

## 问题

2026-04-17 的设计评审实测（chrome-devtools-mcp）确认：

- **1280×800 Laptop（主力用户屏）**：两侧栏 `260 + 320 = 580px` 加 gap/padding 占死，中段 ≈ 680px。5 张日卡 × `minWidth: 170` + 4 × 8 gap = 882px > 680px → 日卡 strip 的 `overflowX: auto` 启动，**D5 被隐藏在水平滚动之外**，且无任何可见暗示用户"右边还有内容"。
- **1400×900**：中段 ≈ 800px，D5 仅露一角仍不完整。
- 更小屏另论（<1280 另开 task，不在本 spec 范围）。

ChatPanel 已有折叠态（`260/36` 切换），但 BacklogList 固定宽度，两侧不对称，错失了"双向压缩"解决 1280 场景的机会。

## 非目标

- 不做 <1280 的平板 / 手机适配（另开 task）。
- 不做真正的媒体查询断点分支（一套布局 + 两个折叠开关即可覆盖 1280–宽屏）。
- 不动 `PlannerMap`（自身已按父宽度跑）。
- 不动 `dnd-kit` 的任何命中判定 / autoScroll 配置。
- 不持久化 `backlogOpen` / `chatOpen` 到 localStorage（与现状一致）。

## 设计

### A — 候选池可折叠（镜像 ChatPanel）

**[Show.jsx:145](app/javascript/pages/Tour/Show.jsx:145)**：

```jsx
const [chatOpen, setChatOpen] = useState(true)
const [backlogOpen, setBacklogOpen] = useState(true)  // 新增

// grid 改为：
<div style={{
  display: 'grid',
  gridTemplateColumns: `${backlogOpen ? 260 : 36}px 1fr ${chatOpen ? 320 : 36}px`,
  gap: 10,
  padding: 10,
}}>
  <BacklogList
    {...existing}
    open={backlogOpen}
    onToggle={() => setBacklogOpen(v => !v)}
  />
  ...
</div>
```

**[BacklogList.jsx](app/javascript/components/planner/BacklogList.jsx)** 加 `open` + `onToggle` props，折叠态复用 ChatPanel:14-24 的模式：

```jsx
export default function BacklogList({ activities, open, onToggle, ...rest }) {
  if (!open) {
    return (
      <Paper
        withBorder
        onClick={onToggle}
        style={{
          cursor: 'pointer',
          background: '#f3f3f3',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Text size="xs" c="dimmed" style={{ writingMode: 'vertical-rl' }}>
          候选池 ▸
        </Text>
      </Paper>
    )
  }

  return (
    <Paper withBorder /* existing */>
      <Group justify="space-between" p="xs" bg="gray.1">
        <Title order={5}>候选池</Title>
        <Button size="compact-xs" variant="subtle" onClick={onToggle}>收起 ◂</Button>
      </Group>
      {/* existing filters, list, droppable... */}
    </Paper>
  )
}
```

注意：原 `<Title order={5}>候选池</Title>` 可能在组件内部而非顶栏，迁移到新 `Group` 头部，避免重复标题。

### C — 日卡最小宽度 170 → 120 + scroll-shadow

**[DayColumn.jsx:37](app/javascript/components/planner/DayColumn.jsx:37)**：

```diff
- <Paper withBorder style={{ minWidth: 170, display: 'flex', flexDirection: 'column' }}>
+ <Paper withBorder style={{ minWidth: 120, flexShrink: 0, display: 'flex', flexDirection: 'column' }}>
```

`flexShrink: 0` 显式写明当前隐式行为（防止日卡在 flex 收缩时低于 minWidth）。

120 是评估后的取值：5 × 120 + 4 × 8 gap = 632px，在 1280 两栏都开的中段 660px（见下表）内有 28px 余量。内容（"D1 —"、驾驶条、核心条）在 120px 下仍可读。

**Show.jsx:156 日卡 strip 容器**：

```jsx
<div
  style={{
    display: 'flex',
    gap: 8,
    overflowX: 'auto',
    alignItems: 'stretch',
    // scroll-shadow：内容溢出时两侧出现阴影
    background: `
      linear-gradient(to right, white, white),
      linear-gradient(to left, white, white),
      linear-gradient(to right, rgba(0,0,0,.1), rgba(0,0,0,0)),
      linear-gradient(to left, rgba(0,0,0,.1), rgba(0,0,0,0))
    `,
    backgroundPosition: 'left center, right center, left center, right center',
    backgroundSize: '20px 100%, 20px 100%, 10px 100%, 10px 100%',
    backgroundRepeat: 'no-repeat',
    backgroundAttachment: 'local, local, scroll, scroll',
  }}
>
  {days.map(d => <DayColumn .../>)}
  <AddDayButton ... />
</div>
```

工作原理（Roma Komarov's scroll-shadow trick）：
- 两层"白色遮罩"跟随内容滚动（`local`）
- 两层"阴影"固定在容器上（`scroll`）
- 内容未溢出时白色遮罩盖住阴影 → 看不见
- 有溢出且滚动到中间时两侧阴影可见 → 暗示方向

纯 CSS，无 JS，无 `ResizeObserver`，无新依赖。

### 1280 宽度预算核对

外层 padding 10 两侧 → 可用 1260；grid 两 gap 共 20。middle = 1260 − col1 − col3 − 20。

| 场景 | 中段可用 | 5 天需要（5 × 120 + 4 × 8） | 结果 |
|---|---|---|---|
| 两栏都开 | 1260 − 260 − 320 − 20 = 660 | 632 | 容纳，28px 余量 |
| Backlog 开 / Chat 关 | 1260 − 260 − 36 − 20 = 944 | 632 | 充裕 |
| Backlog 关 / Chat 开 | 1260 − 36 − 320 − 20 = 884 | 632 | 充裕 |
| 两栏都关 | 1260 − 36 − 36 − 20 = 1168 | 632 | 充裕 |
| 6 天，两栏都开 | 660 | 760 | 溢出，scroll-shadow 提示右滑 |
| 7 天，两栏都开 | 660 | 888 | 溢出，同上 |

1280 默认（两栏都开 + 5 天）此前 D5 完全不可见，现在 D1–D5 全部容纳于中段，无水平滚动。

### 不改（显式）

- `chatOpen` 默认值（`useState(true)`）
- `backlogOpen` 默认值：跟 chat 一致，`useState(true)`
- `<1280` 的响应式行为（另开 task）
- `PlannerMap` 的 `height`（跟父）、地图 SDK 配置
- `AddDayButton` 位置 / 样式

## 测试

### 组件测试

`app/javascript/components/planner/__tests__/BacklogList.test.jsx` 已存在 → 补充：

- `open={false}` 时：只渲染 "候选池 ▸" 竖文 + 可点击 Paper，不渲染 filters / list / droppable
- `open={true}` 时：头部渲染"收起 ◂"按钮，点击触发 `onToggle`
- 原有测试全部保留

### 视觉回归（新增）

`spec/system/planner_layout_spec.rb` 或现有 Capybara 系统测试补充（若项目无 system spec，则用 `__tests__/PlannerLayout.test.jsx` + `jsdom`，不做真实视觉）：

断言（1280×800 viewport，5 天 tour）：
- `document.body.scrollWidth === document.body.clientWidth`（无横向溢出）
- 所有 5 张 DayColumn 的 `getBoundingClientRect().right <= window.innerWidth + 1`（± 1 容忍渲染取整）

此 assertion 是本次 spec 的 acceptance criterion（评审报告里明文列为阻塞项）。

### 手测脚本

在评审用的 chrome-devtools-mcp 环境（`bin/worktree-dev up`）：
1. 1280×800 打开 `/tours/<id>` 规划页（5 天 tour）→ D1–D5 全可见
2. 点候选池"收起 ◂" → D1–D5 卡片变宽
3. 再点 chat"收起 ▸" → 日卡继续变宽
4. 再点候选池竖条"候选池 ▸" → 恢复
5. 改为 7 天 tour → scroll-shadow 在右侧出现；滚动到最右后右侧阴影消失、左侧出现

## 风险 / 权衡

- **日卡 120px 最小**：头部 "D1 —"、驾驶条 `░░░░░ 0/7h`、核心 `░░░ 0/3` 在 120px 下仍可读（评审屏幕实测 170px 处内容稀疏，有收缩余地）。活动卡片（`ActivityCard`）标题至 120px 时可能轻度换行——现阶段可接受，后续如需裁剪另议。
- **Scroll-shadow CSS 复杂**：4 层 gradient 的文字描述对人类不直观。配上内联注释 + 参考链接即可。不值得为此引入库（`react-indiana-drag-scroll` 等）。
- **Backlog 折叠态无 badge**：候选池里若有待处理项，折叠时用户看不见"有东西"。现状 ChatPanel 折叠也没 badge（`needsExpand` 那条路径只处理 `pendingPrompt`）。保持对称，未来加也是双向加。
- **`backgroundAttachment: local` 浏览器支持**：Safari 14+、Chrome 4+、Firefox 25+。项目目标浏览器都覆盖。

## 验收

- 1280×800，5 天 tour：D1–D5 同屏可见，无 body 横向出血
- 候选池折叠 → 竖条 "候选池 ▸"；展开 → 顶部"收起 ◂"按钮
- 7 天 tour：日卡 strip 右侧显式有阴影提示可滚；滚到最右后阴影左右对调
- 组件测试全绿（折叠/展开两态 + 原有）

## 落地

- 修改 [Show.jsx](app/javascript/pages/Tour/Show.jsx)、[BacklogList.jsx](app/javascript/components/planner/BacklogList.jsx)、[DayColumn.jsx](app/javascript/components/planner/DayColumn.jsx)
- 补充 [__tests__/BacklogList.test.jsx](app/javascript/components/planner/__tests__/BacklogList.test.jsx)
- 运行 `mise exec -- bundle exec rspec`（预期无变化）、`npm test`、`bin/rubocop -f github`、`bin/brakeman --no-pager`、`npm audit`
