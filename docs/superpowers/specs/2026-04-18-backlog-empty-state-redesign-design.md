# 候选池 onboarding + 使用态完整重构

**Date**: 2026-04-18
**Scope**: `app/javascript/components/planner/BacklogList.jsx`

## 问题

2026-04-18 的 UX 锐评在 a11y audit 之上又暴露 6 个候选池 panel 的设计债：

1. **垂直空间死区** — Panel `1fr` grid row 被拉到 ~1000px，内容固定 340px，下方 660px 空白。不是留白，是 content dropout：panel 声称要显示内容但 60% 面积没东西。
2. **虚线框视觉语言说谎** — 虚线边 + 圆角 + 浅填是行业通用 drop zone 方言，但这里虚线框内只是 3 个按钮，真正的 `useDroppable` 在外层 Paper 上。用户会误拖到虚线框、命中 Paper，"啊？" 体验。
3. **3 个 CTA 优先级倒置** — 当前 hero 是蓝底 "+ 手动添加行"，但 AI-first 产品应把 "AI 帮选" 推到前面；且 "跳到对话输入框" 与 "让 AI 帮列候选" 功能重叠（后者打开聊天并预填 prompt，前者只打开聊天），双入口是信噪比问题。
4. **"候选池" 隐喻零视觉兑现** — 名字叫池但视觉是平面白卡，没有"池"的容器感。
5. **Onboarding cliff** — 空态的 CTA 在加第 1 张卡时整块消失，"AI 帮选" 按钮彻底没了，状态切换太硬。
6. **文案 + 零视觉指示** — "先把想去的点塞进这里，再拖到右侧日。" 两个动词两个手势，但没有任何视觉（箭头 / 动画 / ghost）示范。

## 非目标

- 不改 ChatPanel 的空态（它是对话气泡，结构不同）。
- 不改 Paper `isOver` bg 变色（Plan 2 已有，保留）。
- 不改 ActivityCard 组件本身。
- 不加动画 / SVG 箭头 / 插画（取设计克制路线）。
- 不改 `ChatStreamJob` 或 `useChat` 的 prompt 机制（"AI 帮选" 复用现有 `onAskAI` prop）。

## 设计

### 结构（6 问题的综合方案）

```
<Paper>                                    ← ❌ 去掉 withBorder，靠 default shadow-xs 标边；不再挂 ref
  <Header p="xs" bg="gray.1">
    候选池 | [收起 ◂]                     ← 不变（Plan 2 + a11y 已稳定）
  </Header>

  <Body ref={setNodeRef} style={{          ← #2 droppable ref 迁到 Body；两态共用命中区
    padding: 12,
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.04)',   ← #4 L1 inset shadow = 池的隐喻
    background: isOver ? '#f0f7ff' : undefined,      ← isOver 视觉从 Paper 搬来
  }}>
    {isEmpty && !readOnly ? (
      <DashedStack style={{
        flex: 1,                                      ← #1 撑满 Body 剩余高度
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',                     ← 按钮垂直居中
        gap: 8,
        padding: 16,
        border: '2px dashed var(--mantine-color-gray-5)',
        borderRadius: 4,
        background: '#fafafa',
      }}>
        <Button variant="default" fullWidth>加一个</Button>
        <Button variant="default" fullWidth>AI 帮选</Button>
      </DashedStack>
    ) : isEmpty && readOnly ? (
      <Text size="xs" c="gray.7">尚无候选</Text>      ← readOnly 空态不变
    ) : (
      <>
        {/* 非空态顶部 toolbar — #5 两按钮 compact，和空态视觉连续 */}
        {!readOnly && (
          <Group gap={4} mb="xs" grow>
            <Button size="compact-xs" variant="default">加一个</Button>
            <Button size="compact-xs" variant="default">AI 帮选</Button>
          </Group>
        )}
        <Group gap={4} mb="xs">{/* 类型 + 等级 filters */}</Group>
        <Stack gap={4}>{/* ActivityCard 列表 */}</Stack>
      </>
    )}
  </Body>
</Paper>
```

### 每条问题对应的改动

**#1 flex:1 撑满** — DashedStack 的 `flex: 1`。Body 本身已经 flex column，DashedStack 是唯一子元素时会吃满。

**#2 真 drop target** — `useDroppable` 的 `ref={setNodeRef}` 挂在 Body div 上（新增），不再挂在 Paper（旧位置）或 Stack 子元素（会导致非空态没命中区）。Body 是两态都渲染的唯一容器，作为命中区稳定。

虚线框在空态填满 Body，用户视觉上看到"虚线框 = 可拖入的地方"恰好对应 Body = droppable。语义对齐。

非空态 Body 内是卡片列表，`isOver` 时 Body bg 变 `#f0f7ff`（沿用 Plan 2 的 `isOver` 处理，颜色值来自当前代码）。

**#3 CTA 重排 + 删除** — 删 `onFocusChat` 这整条 prop 和它触发的按钮。两个 CTA 统一成 outline `variant="default"`、无图标、标签 `加一个` / `AI 帮选`。

**#4 inset shadow** — Body div 的 `boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.04)'`。顶部稍深一点（2px offset 模拟阳光从上），给"凹陷容器"感。不用边框。

**#5 两态同 toolbar** — 非空态新加 `Group gap={4} mb="xs" grow` 包含相同 2 个按钮（`compact-xs`）。空态是大号居中 + 非空态是小号顶部 = 尺寸不同但标签 / 角色 / 顺序一致。

**#6 零 instructional text** — 空态 DashedStack 里只有 2 个按钮，没有 "先把想去的点..." 这句。

### Paper 去 withBorder 的代偿

Paper 默认有 `box-shadow: var(--mantine-shadow-xs)`（约 1px 软阴影）。去 `withBorder` 后面板边界靠这层软阴影 + 外层 grid 的 padding 留白标界。

若实测边界过淡（panel 与背景融合），回退方案：改 `shadow="sm"`（更深）或保留 `withBorder` 并把 inset shadow 的 offset 调大。不在本 spec 里切换方案；先按 default shadow 发，出问题再迭代。

## 测试更新

### 删除

- 任何断言 "跳到对话输入框" 按钮 / `onFocusChat` prop 的测试

### 更新

- "renders all activities by default" 及其他非空态测试：断言现有文案 `+ 加一个` 要改成 `加一个`
- 新增非空态测试：toolbar 里能找到 `screen.getByRole('button', { name: 'AI 帮选' })`
- 空态测试：断言 2 个按钮 `加一个` 和 `AI 帮选` 存在；断言 "先把想去的点" 文案**不**存在
- 空态断言虚线框 `flex: 1`（通过检查 inline style）

### 保留

- Folded state `role=button` + `name="展开候选池"` test（a11y plan 已加）
- Filter 类型 / 等级 test
- `onToggle` 点击 test（折叠展开）
- Droppable `isOver` test（如有）

## 风险 / 权衡

- **Paper 去 `withBorder` 后边界淡** — default shadow-xs 是否够用取决于页面背景色。当前规划页背景为白，Paper 也是白，仅靠 1px 软阴影可能看不清边界。实测兜底：改 `shadow="sm"`。
- **"加一个" / "AI 帮选" 文案过短** — 去图标 + 精简文字，新用户首次可能需要多想一秒"点这个会干嘛"。这是用户明确选择的设计取舍（避免图标抢 attention + 避免阅读恐惧）。trade-off 接受。
- **删掉 `onFocusChat` 的调用方** — Show.jsx:151 `onFocusChat={canEdit ? () => setChatOpen(true) : undefined}` 需要同步删除。Lint 会报 unused prop。Plan 里明示。
- **Toolbar 多占一行（~32px）** — 非空态卡片列表可用高度略减。candidate pool 通常不是视觉焦点，接受。
- **Inset shadow 视觉冲击** — 2px 模糊、4px offset、alpha 0.04。实测如太明显改 alpha 0.02；如太隐形改 alpha 0.06。先发 0.04。

## 验收

- 空态：DashedStack 填满 panel body，2 按钮垂直居中，**无任何 instructional 文字**
- 非空态：顶部 2 个 compact outline 按钮（`加一个` / `AI 帮选`），下方 filter + 卡片
- 从任一日卡拖一张 ActivityCard 回候选池：drop 成功进入 backlog（`day_id: null`）
- 空态拖一张卡进虚线框：drop 成功
- `npm test` 全绿（含测试文件更新）
- chrome-devtools-mcp @ 1280×800：panel 内容占满高度，无死区；视觉比较 before/after 截图

## 落地

- 修改 [BacklogList.jsx](app/javascript/components/planner/BacklogList.jsx)、[Show.jsx](app/javascript/pages/Tour/Show.jsx)（删除 `onFocusChat` prop 传入）、[BacklogList.test.jsx](app/javascript/components/planner/__tests__/BacklogList.test.jsx)
- 运行 `mise exec -- bundle exec rspec`、`npm test`、`mise exec -- bundle exec rubocop -f github app/`、`mise exec -- bundle exec brakeman --no-pager`、`npm audit`
- chrome-devtools-mcp 手测空态 + 非空态 + 拖拽双向
