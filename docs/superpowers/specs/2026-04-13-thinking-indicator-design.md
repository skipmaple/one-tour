# AI 思考中动态加载指示器

## Context

AI 旅行助手在等待 LLM 响应时，当前只显示一行静态文字 `思考中...`（灰色 dimmed Text 组件）。缺乏动态反馈，用户不确定系统是否在工作。需要替换为有视觉吸引力的动画指示器。

## 设计方案：音波律动

5 个蓝色渐变竖条按波浪节奏依次升降，旁边带 "思考中..." 文字，整体放在助手消息的灰色气泡中。

### 视觉规格

- **竖条数量**: 5 个
- **竖条宽度**: 3px，圆角 2px
- **竖条颜色**: `linear-gradient(to top, #228be6, #15aabf)`（蓝→青渐变）
- **竖条高度**: 静止 4px，峰值 16px
- **竖条间距**: 3px
- **动画**: `ease-in-out`，周期 1s，每个竖条延迟 0.1s（形成波浪）
- **文字**: "思考中..."，12px，颜色 `#868e96`（Mantine gray-6）
- **容器**: 与助手消息相同的灰色气泡样式（`--mantine-color-gray-0` 背景，`--mantine-radius-sm` 圆角）

### 无障碍

- `prefers-reduced-motion: reduce` 时禁用动画，竖条显示为静态中间高度
- 容器添加 `role="status"` 和 `aria-label="AI 正在思考"`

## 修改文件

| 文件 | 改动 |
|------|------|
| `app/javascript/components/ChatPanel.jsx` | 将 `<Text c="dimmed">思考中...</Text>` 替换为 thinking indicator 气泡 |
| `app/javascript/styles/chat.css` | 添加 `.thinking-indicator`、`.wave-bars`、`.wave-bar` 样式和 `@keyframes wave-bar` 动画 |

## 实现

### chat.css 新增

```css
.thinking-indicator {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 14px;
  background: var(--mantine-color-gray-0);
  border-radius: var(--mantine-radius-sm);
}

.wave-bars {
  display: flex;
  align-items: center;
  gap: 3px;
  height: 20px;
}

.wave-bar {
  width: 3px;
  height: 4px;
  background: linear-gradient(to top, #228be6, #15aabf);
  border-radius: 2px;
  animation: wave-bar 1s ease-in-out infinite;
}

.wave-bar:nth-child(1) { animation-delay: 0s; }
.wave-bar:nth-child(2) { animation-delay: 0.1s; }
.wave-bar:nth-child(3) { animation-delay: 0.2s; }
.wave-bar:nth-child(4) { animation-delay: 0.3s; }
.wave-bar:nth-child(5) { animation-delay: 0.4s; }

@keyframes wave-bar {
  0%, 100% { height: 4px; opacity: 0.3; }
  50% { height: 16px; opacity: 1; }
}

@media (prefers-reduced-motion: reduce) {
  .wave-bar {
    animation: none;
    height: 10px;
    opacity: 0.6;
  }
}
```

### ChatPanel.jsx 替换

将:
```jsx
{streaming && !streamingContent && (
  <Text c="dimmed" size="sm" px="sm">思考中...</Text>
)}
```

替换为:
```jsx
{streaming && !streamingContent && (
  <div className="thinking-indicator" role="status" aria-label="AI 正在思考">
    <div className="wave-bars">
      <div className="wave-bar" />
      <div className="wave-bar" />
      <div className="wave-bar" />
      <div className="wave-bar" />
      <div className="wave-bar" />
    </div>
    <span style={{ fontSize: '0.75rem', color: 'var(--mantine-color-gray-6)' }}>思考中...</span>
  </div>
)}
```

## 验证

1. 打开 Chat 面板，发送一条消息
2. 在 LLM 响应开始前，看到音波律动动画 + "思考中..." 文字
3. LLM 开始返回 chunks 后，动画消失，显示流式内容
4. 在系统偏好设置中开启 "减少动态效果" → 竖条变为静态
