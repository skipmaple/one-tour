# 候选池 / 对话面板折叠态 a11y 硬化

**Date**: 2026-04-18
**Scope**: `app/javascript/components/planner/BacklogList.jsx`、`app/javascript/components/planner/ChatPanel.jsx`、`app/javascript/pages/Tour/Show.jsx`

## 问题

2026-04-18 的 WCAG 2.1 AA 审计（在本分支 Plan 2 落地后）暴露出 5 个问题，其中 3 个 Critical / Major 是 BacklogList 与 ChatPanel 共享的折叠态 pattern——继承自 ChatPanel，并在 [a6ca321](https://github.com/...)（Plan 2 Task 1）镜像到 BacklogList。

### Critical

1. **折叠态 `<Paper onClick>` 没有语义角色** — `role=null` / `tabIndex=-1` / `aria-label=null`。键盘用户无法展开；屏幕阅读器不宣告可交互。违反 WCAG 2.1.1（Keyboard）+ 4.1.2（Name/Role/Value）。同时影响 BacklogList 和 ChatPanel。
2. **折叠 label "展开候选池 ▸" / "◂ 展开 AI 对话" 对比度 2.99:1** — `#868e96` on `#f3f3f3`。违反 1.4.3（Contrast 4.5:1 for 12px 正常文本）。
3. **空态提示 "先把想去的点塞进这里，再拖到右侧日。" 对比度 3.18:1** — `#868e96` on `#fafafa`。同违反 1.4.3。

### Major

4. **折叠条宽度 36px** — 小于 WCAG 2.5.5（Target Size）要求的 44×44 最小触摸目标。

### Minor

5. **虚线框边 `#ccc` on `#fff` = 1.61:1** — 若视作 UI 结构边界则违反 1.4.11（Non-text Contrast 3:1）；纯装饰则豁免。

## 非目标

- 不修改 Mantine 的 `c="dimmed"` token 全局定义（超范围）。若项目后续做统一色板清理，本次改动的 `c="gray.7"` 可随之收敛回到 token 级别。
- 不添加折叠态的 badge / 计数提示（当前设计两处都无，非 a11y 问题）。
- 不改 Plan 2 已验证的 5-day × 1280×800 "D1–D5 全可见" 行为。预算核对见下方"1280 宽度预算核对"。
- 不改其他已通过审计的按钮 / 链接颜色（收起 ◂ / 跳到对话输入框 / 主按钮均 ≥4.5:1）。

## 设计

### 1. 折叠态改 `UnstyledButton`（#1, #4）

Mantine `<UnstyledButton>` 默认渲染为 `<button>` 元素，自带：

- `role="button"` + `tabIndex=0`（Tab 可达）
- Enter / Space 触发 `onClick`（WCAG 2.1.1 合规，无需手动加 `onKeyDown`）
- 聚焦时原生焦点环（WCAG 2.4.7）

BacklogList 折叠分支（替换 commit a6ca321 中的 `<Paper>` 块）：

```jsx
if (!open) {
  return (
    <UnstyledButton
      onClick={onToggle}
      aria-label="展开候选池"
      style={{
        cursor: 'pointer',
        background: '#f3f3f3',
        border: '1px solid var(--mantine-color-default-border)',
        borderRadius: 4,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: '100%',
        height: '100%',
      }}
    >
      <Text size="xs" c="gray.7" style={{ writingMode: 'vertical-rl' }}>
        展开候选池 ▸
      </Text>
    </UnstyledButton>
  )
}
```

ChatPanel 折叠分支对称改动，`aria-label="展开 AI 对话"`、Text 内容保持 "◂ 展开 AI 对话"。

**显式 aria-label 的理由**：SR 只读 Text 内容的话会念出 "展开候选池 右向三角" 之类，装饰字符干扰。`aria-label` 会覆盖子文本作为可访问名。

### 2. 对比度统一修到 gray.7（#2, #3）

三处 `c="dimmed"` 改为 `c="gray.7"`：

| 位置 | 文本 | 旧 | 新 | 新对比度 |
|---|---|---|---|---|
| BacklogList 折叠 label | "展开候选池 ▸" | `#868e96` on `#f3f3f3` (2.99:1) | `#495057` on `#f3f3f3` | 8.23:1 ✅ |
| ChatPanel 折叠 label | "◂ 展开 AI 对话" | `#868e96` on `#f3f3f3` (2.99:1) | `#495057` on `#f3f3f3` | 8.23:1 ✅ |
| BacklogList 空态提示 | "先把想去的点..." | `#868e96` on `#fafafa` (3.18:1) | `#495057` on `#fafafa` | 8.76:1 ✅ |

不改其他 `c="dimmed"` 用法（例如筛选过滤数字 "3/10"、ActivityCard 次要字段等）——审计只覆盖候选池，别的位置未验证。

### 3. 折叠宽度 36→44（#4）

`Show.jsx:145` 的 `gridTemplateColumns`：

```jsx
gridTemplateColumns: `${backlogOpen ? 260 : 44}px 1fr ${chatOpen ? 320 : 44}px`
```

两侧对称。

#### 1280 宽度预算核对

外层 padding 10 两侧 → 可用 1260；grid 两 gap 共 20。middle = 1260 − col1 − col3 − 20。

| 场景 | 中段可用 | 5 天需要（5 × 120 + 4 × 8） | 变化 |
|---|---|---|---|
| 两栏都开 | 660 | 632 | 不变（未改 260/320） |
| Backlog 开 / Chat 关 | 1260 − 260 − 44 − 20 = **936** | 632 | 比旧 944 少 8px，仍充裕 |
| Backlog 关 / Chat 开 | 1260 − 44 − 320 − 20 = **876** | 632 | 比旧 884 少 8px，仍充裕 |
| 两栏都关 | 1260 − 44 − 44 − 20 = **1152** | 632 | 比旧 1188 少 36px，仍充裕 |
| 6 天，两栏都开 | 660 | 760 | 溢出（scroll-shadow 生效，与 Plan 2 同） |

Plan 2 的 acceptance criterion（1280×800 × 5 天 = D1–D5 全可见）不受影响。

### 4. 虚线框 `#ccc` → `#adb5bd`（#5）

BacklogList 空态 Stack 的内联 `border: '2px dashed #ccc'` → `border: '2px dashed var(--mantine-color-gray-5)'`（约 `#adb5bd`，3.03:1）。

把颜色从硬编码 hex 换成 Mantine 变量，未来全局调色板变动会跟随。

### 5. 测试

`BacklogList.test.jsx` 新增 1 条（已有 3 条覆盖折叠态行为，这条断言新增的语义角色 + 可访问名）：

```jsx
test('folded state exposes role=button with accessible name 展开候选池', () => {
  const onToggle = vi.fn()
  render(
    <MantineProvider>
      <DndContext>
        <BacklogList activities={fixtures} open={false} onToggle={onToggle} />
      </DndContext>
    </MantineProvider>
  )
  const btn = screen.getByRole('button', { name: '展开候选池' })
  expect(btn).toBeInTheDocument()
  fireEvent.click(btn)
  expect(onToggle).toHaveBeenCalledTimes(1)
})
```

原有的 "clicking the collapsed trigger calls onToggle"（Plan 2 Task 1 加的）会继续测击活路径。这条新增测试聚焦在 **语义名称（WCAG 4.1.2）**：Plan 2 那条用的是 `screen.getByText(/展开候选池/)`——即使没有 `role="button"` 也能过；新测试改用 `getByRole('button', { name: '展开候选池' })`，只有当元素既是 button 角色又有匹配可访问名时才通过，正好锁定本次 spec 的 a11y 约束。

键盘 Enter / Space 的行为由浏览器原生提供（`<UnstyledButton>` → `<button>`），jsdom 不模拟这个转换。键盘测试不在单元测试范围内，靠 chrome-devtools-mcp 手测覆盖（见验收）。

`ChatPanel.test.jsx` 加同样 1 条（label 改为 "展开 AI 对话"）。

## 风险 / 权衡

- **UnstyledButton 默认无 Paper 边框 / 圆角** — 已在 style 里显式加 `border` 和 `borderRadius`。视觉上与原 `<Paper withBorder>` 应保持一致，需实测确认。
- **44px 折叠比 36px 略宽 8px** — 全开双栏场景中段宽度不变；双栏都关场景少 36px 可用宽度，但 5 天仍有 520px 余量。接受。
- **Mantine color token 选择** — `gray.7` 是 `#495057`，对比度 8+:1 都远超 4.5:1。刻意选一个"足够深"的档，避免未来 Mantine 主题微调把我们卷回边界线。
- **`c="dimmed"` 只改 3 处** — 审计外的 `c="dimmed"` 不动（项目里 30+ 处）。这是范围自律，不是全局 a11y 整改。

## 验收

- Tab 键能到达 BacklogList 和 ChatPanel 折叠条，焦点环可见
- 折叠条按 Enter 或 Space 展开
- VoiceOver 宣告为 "展开候选池，按钮" / "展开 AI 对话，按钮"
- Chrome DevTools 对比度扫描：三个修改点的目标文本 ≥4.5:1
- 1280×800 × 5 天验证：D1–D5 仍全可见，body 无横向溢出
- `npm test` 全绿（含 2 条新测试：BacklogList + ChatPanel 各 1）

## 落地

- 修改 [BacklogList.jsx](app/javascript/components/planner/BacklogList.jsx)、[ChatPanel.jsx](app/javascript/components/planner/ChatPanel.jsx)、[Show.jsx](app/javascript/pages/Tour/Show.jsx)
- 补充 [BacklogList.test.jsx](app/javascript/components/planner/__tests__/BacklogList.test.jsx)、[ChatPanel.test.jsx](app/javascript/components/planner/__tests__/ChatPanel.test.jsx)
- 运行 `mise exec -- bundle exec rspec`（预期无变化）、`npm test`（4 条新测试绿）、`bin/rubocop -f github`、`bin/brakeman --no-pager`、`npm audit`
- chrome-devtools-mcp 手测：键盘 Tab + Enter 到折叠条；对比度 DevTools 扫描 3 点
