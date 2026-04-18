# 违宪提示 banner → title 行 chip + popover

**Date**: 2026-04-18
**Scope**: `app/javascript/components/planner/ConstitutionChip.jsx`（新增）；`app/javascript/pages/Tour/Show.jsx`；`app/javascript/components/planner/__tests__/ConstitutionChip.test.jsx`（新增）；`app/javascript/pages/Tour/__tests__/Show.test.jsx`

## 问题

[`ConstitutionBanner`](app/javascript/components/planner/ConstitutionBanner.jsx) 在规划页 title 下方渲染一行（或多行）违宪/建议横幅，每条 ~50px 高且占满全宽。

实测：13 天空 tour（无活动）有 1 条软建议「整程 0 个机动日（建议 ≥ 1）」常驻，硬挤占了 4-panel flex 布局上方的垂直空间。多条 violation 还会把日卡/地图压得更窄。用户原话："它占据了日程和地图上方的宝贵空间"。

软建议尤其噪声大 —— 用户处于编辑流中段，"还没排机动日"是当然的事，但一直挂在最显眼位置毫无价值。

## 非目标

- 不改 [`Tour::ConstitutionCheck`](app/models/tour/constitution_check.rb) 后端逻辑、violation 数据结构或等级划分
- 不删 [`ConstitutionBanner.jsx`](app/javascript/components/planner/ConstitutionBanner.jsx) —— 留给「宪法」/「总览」tab 后续可能复用
- 不改 [`AcknowledgeModal`](app/javascript/components/planner/AcknowledgeModal.jsx) 的"承认违反"流程
- 不改 [`ChatPanel`](app/javascript/components/planner/ChatPanel.jsx) 的 `pendingPrompt` auto-expand 协议
- 不在 DayColumn 上加 per-day 违反角标（用户明确否决）
- 不做"零违反时显示绿色 ✓ 全合规"徽章（用户选了"隐藏一片清净"）
- 不做硬违反弹窗 / 呼吸动画等"额外强调"（用户选了"⛔ 红底足矣"）

## 设计

### 视觉

Title 行原有结构（[Show.jsx:122-143](app/javascript/pages/Tour/Show.jsx:122)）：

```jsx
<Group justify="space-between" mb="xs" mt="sm">
  <div>...title + edit hint...</div>
  <Button>成员</Button>
</Group>
```

改为：

```jsx
<Group justify="space-between" mb="xs" mt="sm">
  <Group gap="xs">  {/* 新增内层 Group：title + chip 一组左对齐 */}
    <div>...title + edit hint...</div>
    <ConstitutionChip
      violations={violations}
      onFix={(v) => setPendingChatPrompt(fixPromptFor(v))}
      onAcknowledge={(v) => setAcknowledgingViolation(v)}
      onDismiss={() => {}}
      readOnly={!canEdit}
    />
  </Group>
  <Button>成员</Button>
</Group>
```

ConstitutionChip 渲染：

- **零 violations / 全部 dismissed**：返回 `null`
- **任意硬违反**：红色 Mantine Badge，`color="red"`，内容 `⛔ {N}` （N = visible violations 总数）
- **仅软建议**：黄色 Badge，`color="yellow"`，内容 `⚠ {N}`
- 大小用 Mantine 默认 `size="sm"`（与 title 视觉重量协调）
- `style={{ cursor: 'pointer' }}`

点击 chip → `Popover` 在其下方左对齐（`position="bottom-start"`）展开，内容是逐条 violation 列表，每条样式直接复用 [ConstitutionBanner.jsx](app/javascript/components/planner/ConstitutionBanner.jsx) 的 `<Paper>` 块（含图标 + 文字 + 按钮组），DRY。

### Popover 内的按钮逻辑（与现有 banner 一致）

每条 violation 渲染（按 [ConstitutionBanner.jsx:34-69](app/javascript/components/planner/ConstitutionBanner.jsx:34) 已有逻辑搬运）：

| 条件 | 按钮 | 点击行为 |
|---|---|---|
| `level === 'hard'` && `!readOnly` | `[帮我修正 →]` 红色 | 调 `onFix(v)` → 关闭 popover |
| `level === 'hard'` && `!readOnly` | `[承认此违反]` 灰色 | 调 `onAcknowledge(v)` → 关闭 popover |
| `level === 'soft'` 或 `readOnly` | `[知道了]` 灰色 | 加入内部 `dismissed` Set + 调 `onDismiss(v)` → 若 visible 总数变 0，自动关闭 popover |

「关闭 popover」= `setOpened(false)`。dismiss 一条不立即关，留给用户继续看其它条。

### ConstitutionChip 组件骨架

`app/javascript/components/planner/ConstitutionChip.jsx`（新文件）：

```jsx
import { useState } from 'react'
import { Badge, Popover, Stack, Paper, Group, Text, Button } from '@mantine/core'

const noop = () => {}

export default function ConstitutionChip({
  violations,
  onFix = noop,
  onAcknowledge = noop,
  onDismiss = noop,
  readOnly = false,
}) {
  const [opened, setOpened] = useState(false)
  const [dismissed, setDismissed] = useState(new Set())

  if (!violations || violations.length === 0) return null
  const visible = violations
    .map((v, i) => ({ v, i }))
    .filter(({ i }) => !dismissed.has(i))
  if (visible.length === 0) return null

  const hasHard = visible.some(({ v }) => v.level === 'hard')
  const color = hasHard ? 'red' : 'yellow'
  const icon = hasHard ? '⛔' : '⚠'

  const handleDismissOne = (i, v) => {
    const next = new Set(dismissed); next.add(i)
    setDismissed(next)
    onDismiss(v)
    if (visible.length === 1) setOpened(false)  // last one — close popover
  }

  return (
    <Popover opened={opened} onChange={setOpened} position="bottom-start" shadow="md" withinPortal>
      <Popover.Target>
        <Badge
          color={color}
          size="sm"
          style={{ cursor: 'pointer', userSelect: 'none' }}
          onClick={() => setOpened(o => !o)}
          data-testid="constitution-chip"
        >
          {icon} {visible.length}
        </Badge>
      </Popover.Target>

      <Popover.Dropdown p="xs" style={{ maxWidth: 420 }}>
        <Stack gap={4}>
          {visible.map(({ v, i }) => (
            <Paper
              key={i}
              p="xs"
              withBorder
              style={{
                borderColor: v.level === 'hard' ? '#c33' : '#c80',
                background:  v.level === 'hard' ? '#fef0f0' : '#fef8e8',
                color:       v.level === 'hard' ? '#c33' : '#c80',
              }}
            >
              <Group justify="space-between" wrap="nowrap" gap="xs">
                <Text size="sm">
                  {v.level === 'hard' ? '⛔ ' : '⚠ '}{v.message}
                </Text>
                <Group gap="xs" wrap="nowrap">
                  {v.level === 'hard' && !readOnly && (
                    <Button size="compact-xs" color="red" onClick={() => { onFix(v); setOpened(false) }}>
                      帮我修正 →
                    </Button>
                  )}
                  <Button
                    size="compact-xs"
                    variant="default"
                    onClick={() => {
                      if (v.level === 'hard' && !readOnly) {
                        onAcknowledge(v); setOpened(false)
                      } else {
                        handleDismissOne(i, v)
                      }
                    }}
                  >
                    {v.level === 'hard' && !readOnly ? '承认此违反' : '知道了'}
                  </Button>
                </Group>
              </Group>
            </Paper>
          ))}
        </Stack>
      </Popover.Dropdown>
    </Popover>
  )
}
```

注：内部 `dismissed` 状态与现有 `ConstitutionBanner` 行为一致（会话级、不持久化、不发后端）。`onDismiss` 回调保留对外 API 兼容（即便 Show.jsx 当前传 `noop`）。

### Show.jsx 改动

[Show.jsx](app/javascript/pages/Tour/Show.jsx)：

1. **去掉** `import ConstitutionBanner from '../../components/planner/ConstitutionBanner'`
2. **新增** `import ConstitutionChip from '../../components/planner/ConstitutionChip'`
3. **删除** title 行下方的 `<ConstitutionBanner ... />` 整段（[Show.jsx:145-151](app/javascript/pages/Tour/Show.jsx) 一带）
4. **修改** title 行 `<Group justify="space-between">`，把 title `<div>` 包进一个新的内层 `<Group gap="xs">`，并在内层加 `<ConstitutionChip violations={...} {...callbacks} />`，参数直接搬 ConstitutionBanner 之前的入参

不改 `useState(acknowledgingViolation)` / `useState(pendingChatPrompt)` / `setSettingsOpen` 等所有现有状态。`<AcknowledgeModal>` 仍在底部渲染、绑同一个 state 触发。

## 不改（显式）

- ConstitutionBanner.jsx 文件本体（留作潜在复用）
- violation 数据格式（`level`, `message`, 等）
- AI prompt 模板 `fixPromptFor(v)`（[Show.jsx](app/javascript/pages/Tour/Show.jsx) 内 helper）
- AcknowledgeModal 流程
- ChatPanel auto-expand on pendingPrompt
- 「宪法」tab 内任何渲染（与本组件无关）
- 不持久化 dismissed Set（同现状，刷新后软建议重新出现）

## 测试

### 新增 `app/javascript/components/planner/__tests__/ConstitutionChip.test.jsx`

```jsx
import { render, screen, fireEvent } from '@testing-library/react'
import { describe, test, expect, vi } from 'vitest'
import { MantineProvider } from '@mantine/core'
import ConstitutionChip from '../ConstitutionChip'

const renderChip = (props) => render(
  <MantineProvider><ConstitutionChip {...props} /></MantineProvider>
)

const softV  = { level: 'soft', message: '建议 ≥ 1 个机动日' }
const hardV  = { level: 'hard', message: 'D3 驾驶超 7h' }
const hardV2 = { level: 'hard', message: 'D5 一等景超 3 个' }
```

**Cases**:

1. `violations=[]` → 无 chip 渲染（`queryByTestId('constitution-chip')` 为 null）
2. `[softV]` → 黄色 chip，文字 `⚠ 1`
3. `[softV, softV]` → 黄色 chip，文字 `⚠ 2`
4. `[hardV]` → 红色 chip，文字 `⛔ 1`
5. `[hardV, softV]` → 红色 chip（任一硬即红），文字 `⛔ 2`（数字是总数）
6. 点击 chip → popover 打开，能找到 violation 文字
7. `[hardV]`，点击 `帮我修正 →` → `onFix` 被调（带 hardV），popover 关闭
8. `[hardV]`，点击 `承认此违反` → `onAcknowledge` 被调，popover 关闭
9. `[softV, softV]`，点击第 1 条的 `知道了` → 数字变 1（chip 更新到 `⚠ 1`），popover 仍开
10. `[softV]`，点击 `知道了` → chip 消失（`null`），popover 关闭
11. `readOnly=true` + `[hardV]` → 不渲染 `帮我修正` / `承认此违反`，只有 `知道了`

### 修改 `app/javascript/pages/Tour/__tests__/Show.test.jsx`

现有测试 `'renders planner four-panel layout'` 不需要改（不断言 ConstitutionBanner）。检查整个文件搜 `ConstitutionBanner` —— 若有断言，迁移到 `ConstitutionChip` 的 `data-testid`。预期改动微小或无改动。

### 手测

`bin/worktree-dev up`，访问 `/tours/1`（13 天空 tour，目前有 1 条软建议）：

1. **默认**：title 行右侧紧跟 `⚠ 1` 黄色徽章；4-panel 区域顶部 +50px 空间释放
2. 点 chip → 下方弹出 popover，单条建议带 `知道了` 按钮
3. 点 `知道了` → chip 消失，popover 关闭
4. 刷新页 → 软建议又回来（dismissed 不持久化，符合预期）
5. 假设有硬违反场景（用 rails console 强插一条 hard）→ 红色 `⛔ 1`，popover 内有 `帮我修正` 按钮，点击 → ChatPanel 自动展开 + 收到 prompt
6. **零违反场景**：找一条全合规 tour 或 dismiss 当前唯一软建议 → title 行干净，无任何徽章

## 风险 / 权衡

- **dismiss 不持久化**：刷新会恢复，可能让用户觉得"我都点过了为什么还在"。设计选择：与现状一致（ConstitutionBanner 也这么做），软建议本质是"内容驱动"提示，下次进来若条件还成立就该再提示，让用户决定要不要再处理或彻底改 tour。如果想加持久化（例如按 violation message hash 写 localStorage），单独再开 task。
- **Popover 在 collapsed 视口下可能溢出**：Mantine `Popover` 默认会自动调整位置。`withinPortal` 确保不被 4-panel flex 容器的 `overflow: hidden` 截断。
- **`onDismiss` 仍是 noop**：Show.jsx 现在不监听 dismiss（banner 也没监听）。保留接口为后续做"用户已知的软建议不再生成 violation"留扩展点。
- **chip 与 title 的视觉粘着度**：内层 `<Group gap="xs">` 让 chip 与 title 间距 8px 左右。若觉得太挤改 `gap={6}` 或 `gap={4}`。
- **多硬违反时 popover 可能很长**：当前逐条堆叠，最大宽度 420px。若一个 tour 真有 8+ 条硬违反，列表会很长但仍可滚（Popover.Dropdown 默认无 max-height，必要时加 `style={{ maxHeight: 480, overflowY: 'auto' }}`）—— 不预先做。
- **Group 嵌套**：`<Group justify="space-between"><Group gap="xs">title + chip</Group><Button>成员</Button></Group>`，Mantine 嵌套 Group 是支持的。

## 验收

- 默认规划页（有任何 violations）：title 行右侧紧贴 chip；4-panel 区域上方无 banner row
- 零违反规划页：title 行只有 title + 成员按钮；无 chip
- chip 点击展开 popover，三种按钮（修正 / 承认 / 知道了）触发对应回调
- dismiss 软建议直至全空 → chip 消失，popover 自动关闭
- readOnly 模式下硬违反只能「知道了」（不能修正/承认）
- 单测全绿（11 条 ConstitutionChip + 现有 Show / ConstitutionBanner 单测）

## 落地

- 新增 [`ConstitutionChip.jsx`](app/javascript/components/planner/ConstitutionChip.jsx) + [`__tests__/ConstitutionChip.test.jsx`](app/javascript/components/planner/__tests__/ConstitutionChip.test.jsx)
- 修改 [`Show.jsx`](app/javascript/pages/Tour/Show.jsx)：移除 banner、添加 chip 到 title 行
- 微调 [`Show.test.jsx`](app/javascript/pages/Tour/__tests__/Show.test.jsx)（仅当有 ConstitutionBanner 相关断言）
- 跑 `npm test`、`mise exec -- bundle exec rubocop -f github`、`mise exec -- bundle exec brakeman --no-pager`、`npm audit`
