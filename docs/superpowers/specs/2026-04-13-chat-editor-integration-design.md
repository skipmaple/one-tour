# Chat-Editor Integration: 三种写入模式 + 保存前 Diff 预览

## Context

AI 旅行助手已经可以通过 ActionCable 流式返回路书内容，但生成的内容只停留在 Chat 面板中，需要用户手动点击"应用到编辑器"按钮全量替换。这导致：

1. 用户体验割裂 — 生成完成后还需手动操作才能在编辑器和预览中看到结果
2. 无法安全迭代 — 用户继续对话让 AI 修改内容时，没有变更追踪能力
3. 保存缺乏安全感 — 用户不知道即将保存的内容相对上次保存改了什么

本设计解决这三个问题。

## 设计概览

三个核心能力：

| 能力 | 解决的问题 |
|------|-----------|
| **三种写入模式** | 控制 AI 生成内容如何进入编辑器 |
| **保存前 Diff 预览** | 保存时展示语义+文本级别的变更对比 |
| **CodeMirror 可编程写入** | 写入编辑器时保留 undo 历史 |

---

## 能力 1: 三种写入模式

### 模式定义

| 模式 | 名称 | 行为 |
|------|------|------|
| `auto` | 自动写入 | LLM 返回含 frontmatter 的内容后，立即写入编辑器 |
| `ask` | 写入前询问 | Chat 中显示确认条，用户点击"应用"后写入（默认模式） |
| `plan` | 计划模式 | AI 只用文字描述变更方案，不输出完整路书内容 |

### 模式切换 UI

位置：Chat 输入框上方工具栏，使用 Mantine `SegmentedControl`。

```
┌─────────────────────────────────────┐
│  AI 旅行助手                     ✕  │
├─────────────────────────────────────┤
│  [消息历史区域]                      │
│                                     │
├─────────────────────────────────────┤
│  [✏️自动] [🔔询问] [📋计划]         │ ← SegmentedControl
├─────────────────────────────────────┤
│  [输入框]                     [发送] │
└─────────────────────────────────────┘
```

### 模式对系统提示的影响

**计划模式**需要修改发送给 LLM 的系统提示。在 `ChatStreamJob#system_prompt` 中根据模式追加指令：

- `auto` / `ask`: 现有提示不变（"当用户要求生成或修改路书时，输出完整的 Markdown 文件"）
- `plan`: 追加 "你现在处于计划模式。描述你打算做的变更，不要输出完整路书内容。用列表说明将要增删改的内容。"

**实现**: 前端发送消息时将当前 `mode` 传给后端 API（`POST /messages` 的请求体增加 `mode` 字段）。`ChatStreamJob` 读取 mode 调整系统提示。

### 写入触发逻辑

在 `useChat.js` 的 `complete` 事件处理中：

```javascript
// complete 事件
if (data.has_guidebook_content) {
  if (mode === 'auto') {
    applyToEditor(data.content)  // 立即写入
  }
  // ask 模式：ChatPanel 渲染确认条（已有的"应用到编辑器"按钮逻辑）
  // plan 模式：不会有 has_guidebook_content=true（LLM 不输出 frontmatter）
}
```

### 关键文件

| 文件 | 改动 |
|------|------|
| `app/javascript/hooks/useChat.js` | 接收 `mode` 和 `onApplyToEditor` 回调，在 auto 模式下自动调用 |
| `app/javascript/components/ChatPanel.jsx` | 添加模式切换 SegmentedControl，传递 mode 给 sendMessage |
| `app/controllers/guidebooks/messages_controller.rb` | 接收 `mode` 参数并传给 Job |
| `app/jobs/chat_stream_job.rb` | 根据 mode 调整 system_prompt |

---

## 能力 2: CodeMirror 可编程写入（保留 Undo）

### 问题

当前 `MarkdownEditor` 是非受控组件 — mount 后外部 value 变化不会同步回编辑器。现有的 `handleApplyContent` 通过 `setRawContent(content)` 更新 React 状态，但编辑器内容不变。

### 方案

通过 `useImperativeHandle` 暴露编辑器的 `replaceContent` 方法，使用 CodeMirror 的 `dispatch()` API 替换文档内容。这会自动创建一个 undo 事务，用户可以 Ctrl+Z 撤销。

```javascript
// MarkdownEditor.jsx — 添加 ref 转发
const MarkdownEditor = forwardRef(function MarkdownEditor({ value, onChange }, ref) {
  const viewRef = useRef(null)

  useImperativeHandle(ref, () => ({
    replaceContent(newContent) {
      const view = viewRef.current
      if (!view) return
      view.dispatch({
        changes: { from: 0, to: view.state.doc.length, insert: newContent }
      })
    }
  }))

  // ... 其余不变
})
```

```javascript
// Edit.jsx — 使用 ref
const editorRef = useRef(null)

const handleApplyContent = (content) => {
  editorRef.current?.replaceContent(content)
  // replaceContent 内部的 dispatch 会触发 updateListener → onChange → setRawContent
  // 所以不需要手动调用 setRawContent
}
```

### 数据流

```
AI 生成内容
  → handleApplyContent(content)
  → editorRef.current.replaceContent(content)
  → CodeMirror dispatch({ changes })       ← 创建 undo 事务
  → EditorView.updateListener 触发
  → onChange(newDoc)
  → setRawContent(newDoc)                   ← React 状态更新
  → useFrontmatter 重新解析
  → 左侧 Preview / Map 实时刷新
```

**Undo 行为**: 用户按 Ctrl+Z 会回退到写入前的编辑器内容。连续的 AI 写入各自独立，可以逐次撤销。

**边界情况**: 自动模式下，如果用户正在编辑器中打字，AI 完成生成后会立即替换全部内容（包括用户未保存的编辑）。这是自动模式的预期行为 — 用户选择自动模式意味着接受这个取舍。如果用户需要更多控制，应切换到"询问"或"计划"模式。

### 关键文件

| 文件 | 改动 |
|------|------|
| `app/javascript/components/MarkdownEditor.jsx` | 添加 `forwardRef` + `useImperativeHandle` 暴露 `replaceContent` |
| `app/javascript/pages/Guidebook/Edit.jsx` | 创建 `editorRef`，修改 `handleApplyContent` 使用 ref |

---

## 能力 3: 保存前 Diff 预览

### 触发条件

用户点击"保存"按钮时，如果当前内容与上次保存的内容不同（`dirty === true`），弹出 Diff Modal 而非直接保存。

### Diff Modal 结构

使用 Mantine `Modal` 全屏展示（`fullScreen` 或 `size="xl"`）：

```
┌─ 保存确认 ────────────────────────────────────────────┐
│                                                        │
│  📋 变更摘要                                            │
│  ┌──────────────────────────────────────────────────┐  │
│  │ • 新增第 4 天：库尔勒 → 若羌                       │  │
│  │ • 修改第 2 天：住宿从"民宿"改为"酒店"              │  │
│  │ • 修改标题："北疆环线" → "南北疆大环线"             │  │
│  └──────────────────────────────────────────────────┘  │
│                                                        │
│  📝 文本差异（左右双栏）                                  │
│  ┌────────────────────────┬─────────────────────────┐  │
│  │  原始内容 (上次保存)     │  当前内容                │  │
│  ├────────────────────────┼─────────────────────────┤  │
│  │  ---                   │  ---                    │  │
│  │- title: 北疆环线        │+ title: 南北疆大环线     │  │
│  │  date_range: 5/1 - 5/7 │  date_range: 5/1 - 5/7 │  │
│  │  ...                   │  ...                    │  │
│  └────────────────────────┴─────────────────────────┘  │
│                                                        │
│                          [取消]  [确认保存]              │
└────────────────────────────────────────────────────────┘
```

### 语义摘要（上半部分）

在前端复用 `parseFrontmatter` 解析两份内容的 frontmatter，进行结构化对比：

```javascript
// hooks/useDiff.js
function computeSemanticSummary(oldContent, newContent) {
  const oldFm = parseFrontmatter(oldContent).data
  const newFm = parseFrontmatter(newContent).data

  const summary = []

  // 标题变更
  if (oldFm.title !== newFm.title) {
    summary.push(`标题："${oldFm.title}" → "${newFm.title}"`)
  }

  // 天数对比
  const oldDays = (oldFm.days || []).map((d, i) => ({ ...d, _idx: i }))
  const newDays = (newFm.days || []).map((d, i) => ({ ...d, _idx: i }))
  // 按 day number 匹配：新增的天、删除的天、内容变化的天

  // 其他顶层字段（title 已单独处理）
  const topFields = ['date_range', 'vehicle', 'trip_style', 'total_km', 'budget_per_person']
  for (const key of topFields) {
    if (JSON.stringify(oldFm[key]) !== JSON.stringify(newFm[key])) {
      summary.push(`${key}："${oldFm[key]}" → "${newFm[key]}"`)
    }
  }

  return summary
}
```

### 文本 Diff（下半部分）— 左右双栏布局

安装 `diff` npm 包（轻量，~8KB），使用 `diffLines` 计算行级差异，以 **side-by-side** 双栏布局展示：

```
┌─────────────────────────┬─────────────────────────┐
│  原始内容 (上次保存)      │  当前内容                │
├─────────────────────────┼─────────────────────────┤
│  ---                    │  ---                    │
│- title: 北疆环线         │+ title: 南北疆大环线      │
│  date_range: 5/1 - 5/7  │  date_range: 5/1 - 5/7  │
│  vehicle: 自驾           │  vehicle: 自驾           │
│                         │+ total_km: 3200          │
│  days:                  │  days:                   │
│    ...                  │    ...                   │
│                         │+ - day: 4                │
│                         │+   title: 库尔勒 → 若羌   │
└─────────────────────────┴─────────────────────────┘
```

左栏显示上次保存的内容，右栏显示当前编辑器内容。删除的行在左栏红色高亮，新增的行在右栏绿色高亮，修改的行两侧都高亮。未变更的行两栏同步显示，提供上下文。

```javascript
import { diffLines } from 'diff'

function SideBySideDiff({ oldText, newText }) {
  const changes = diffLines(oldText, newText)
  // 将 changes 拆分为 left/right 两列行数组
  // removed → 只出现在左栏（红色背景）
  // added → 只出现在右栏（绿色背景）
  // unchanged → 两栏同步显示
  const { leftLines, rightLines } = buildSideBySideLines(changes)

  return (
    <div style={{ display: 'flex', gap: 0, fontFamily: 'monospace', fontSize: '0.8rem' }}>
      <div style={{ flex: 1, borderRight: '1px solid var(--mantine-color-gray-3)' }}>
        <div style={{ padding: '4px 8px', fontWeight: 600, borderBottom: '1px solid ...' }}>
          原始内容
        </div>
        {leftLines.map((line, i) => <DiffLine key={i} {...line} />)}
      </div>
      <div style={{ flex: 1 }}>
        <div style={{ padding: '4px 8px', fontWeight: 600, borderBottom: '1px solid ...' }}>
          当前内容
        </div>
        {rightLines.map((line, i) => <DiffLine key={i} {...line} />)}
      </div>
    </div>
  )
}
```

两栏同步滚动：外层 `ScrollArea` 包裹整个 diff 区域，左右两栏等高对齐（删除行对面插入空行占位，保持行号对齐）。

### 保存时的 lastSavedContent 追踪

`useAutoSave` 需要新增追踪"上次保存成功的内容"：

```javascript
// useAutoSave.js 改动
const lastSavedContentRef = useRef(initialContent)

// 保存成功后更新
lastSavedContentRef.current = content

// 暴露给外部
return { ..., lastSavedContent: lastSavedContentRef.current }
```

### 保存流程变更

```
用户点击"保存"
  → dirty?
    → No: 不操作（或提示"没有变更"）
    → Yes: 打开 Diff Modal
      → 用户看到语义摘要 + 文本 diff
      → 点击"确认保存": 执行 save()，关闭 Modal
      → 点击"取消": 关闭 Modal，不保存
```

### 关键文件

| 文件 | 操作 |
|------|------|
| `package.json` | 安装 `diff` npm 包 |
| `app/javascript/hooks/useAutoSave.js` | 追踪 `lastSavedContent` |
| `app/javascript/hooks/useDiff.js` | **新建** — `computeSemanticSummary` + 封装 diff 逻辑 |
| `app/javascript/components/DiffModal.jsx` | **新建** — Diff 预览 Modal 组件 |
| `app/javascript/pages/Guidebook/Edit.jsx` | 保存按钮改为先打开 DiffModal |

---

## 实施顺序

### Step 1: CodeMirror 可编程写入
- 改造 `MarkdownEditor.jsx`：`forwardRef` + `useImperativeHandle`
- 改造 `Edit.jsx`：`editorRef` + 新的 `handleApplyContent`
- 验证：Chat 中点击"应用到编辑器" → 编辑器内容更新 + Ctrl+Z 可撤销 + 左侧预览同步刷新

### Step 2: 三种写入模式
- `ChatPanel.jsx` 添加 SegmentedControl
- `useChat.js` 接收 mode，auto 模式下自动调用 applyToEditor
- `MessagesController` + `ChatStreamJob` 传递 mode 并调整 system_prompt
- 验证：切换三种模式，AI 行为符合预期

### Step 3: 保存前 Diff 预览
- 安装 `diff` npm 包
- `useAutoSave.js` 追踪 lastSavedContent
- 新建 `useDiff.js` hook
- 新建 `DiffModal.jsx` 组件
- `Edit.jsx` 保存按钮集成 DiffModal
- 验证：编辑内容后点击保存 → 弹出 Diff Modal → 语义摘要 + 文本 diff 正确显示

## 验证方式

1. **Step 1 验证**: 打开编辑器 → AI 助手生成路书 → 点击"应用到编辑器" → 编辑器内容更新 → Ctrl+Z 回退 → 左侧 Markdown 预览和地图预览正确显示
2. **Step 2 验证**: 切换到自动模式 → AI 生成路书后自动写入编辑器 → 切换到计划模式 → AI 只描述变更方案不输出路书
3. **Step 3 验证**: 手动或 AI 修改内容后点击保存 → Diff Modal 弹出 → 语义摘要列出天数/标题等变更 → 文本 diff 高亮显示增删行 → 确认保存成功
4. **全流程**: AI 生成 → 自动写入编辑器 → 用户继续对话修改 → AI 更新编辑器 → 用户点击保存 → 查看 diff → 确认保存
5. `bundle exec rspec` 全部通过
6. `npm test` 全部通过
