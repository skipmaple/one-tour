# Constitution Step 1 崩溃修复 + 异步错误反馈

**Date**: 2026-04-17
**Scope**: `app/javascript/pages/Tour/Constitution.jsx`（以及同文件内调用的 Sentry / notifications / modals）

## 问题

用户在"宪法 → 规划"流程 Step 1 选择日期范围后点击"下一步 →"：按钮无反应。控制台抛出 `TypeError: d.getFullYear is not a function`（`formatDateISO`），错误被 async 函数吞掉，前端既不跳下一步也不报错。用户以为按钮坏了，只能放弃或重试。

**根因**：`@mantine/dates` v7+ 的 `DatePickerInput[type="range"]` 发出 `[string, string]`（ISO `"YYYY-MM-DD"`），而初始化解析出的是 `[Date, Date]`。`formatDateISO` 假设输入为 `Date`，对字符串调用 `.getFullYear()` 即崩溃。崩溃发生在 `onChange` 触发之后（首次进入没事、选过日期就挂）。

**次级问题**（同一屏）：
- `proceedToReview` 的 4 个 `fetch` 均未检查 `response.ok`；后端 4xx/5xx 也会"成功"走到 `setSetupStep(2)`，但参数实际未保存。
- `agreeAndStart` 的 1 个 `fetch` 同样未检查 `response.ok`。
- 两个异步函数都没有加载态，按钮在 1–2s 内的 4 次串行请求期间可以被重复点击。
- `resetToDefaults` 用 `window.confirm` 打破 Mantine 品牌一致性（同项目其他 confirm 均使用 `modals.openConfirmModal`）。

## 非目标

- 不做项目级 `fetchJson` helper（留给未来）。
- 不改 `DatePickerInput` 的数据形态（维持 Mantine 默认 ISO string 即可）。
- 不修复 Step 1 发现的其他 UX 问题（双向日期/天数覆盖无警告、默认日期 `today-1`、`↺ 恢复默认`永远禁用、等），这些各自独立。

## 设计

### 1. `formatDateISO` — 容忍 string | Date | 空值

```js
function formatDateISO(d) {
  if (!d) return null
  if (typeof d === 'string') {
    return /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : formatDateISO(new Date(d))
  }
  if (!(d instanceof Date) || isNaN(d)) return null
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}
```

行为：
- `"2026-04-16"` → `"2026-04-16"`（零开销快路径）
- `Date` 对象 → 格式化后的字符串
- `null`/`undefined`/`""` → `null`
- `new Date("bogus")`（Invalid Date）→ `null`
- 意外输入（`{}`、数字等）→ `null`

调用方 `proceedToReview` 已有 `(startDate && endDate)` 保护，拿到 `null` 会把 `dateRangeStr` 也设为 `null`，不走拼接路径，与"未选日期"等价。这是刻意的——"只选了一半"不算异常，保存为空即可。

### 2. 文件内 `postJson` helper

```js
async function postJson(url, method, body) {
  const token = document.querySelector('meta[name=csrf-token]')?.getAttribute('content') || ''
  const res = await fetch(url, {
    method,
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'X-CSRF-Token': token,
    },
    body: body ? JSON.stringify(body) : undefined,
  })
  if (!res.ok) throw new Error(`${method} ${url} 失败 (${res.status})`)
  return res
}
```

- 作用域：Constitution.jsx 文件内函数。不 export，不抽到 `lib/`。
- 被替换的 4 个 `fetch` 调用点：`proceedToReview` 中 3 处（tour PATCH、constitution PATCH、days POST 循环，循环内部是 1 处调用点执行 0–N 次），`agreeAndStart` 中 1 处（constitution/accept POST）。
- 错误信息故意带上 method + URL + 状态码，直接进 Sentry 的 `err.message`，不再需要额外 extra。

### 3. `proceedToReview` — try/catch + loading + toast

```js
const [isSaving, setIsSaving] = useState(false)

const proceedToReview = async () => {
  if (!tourTitle.trim()) {
    notifications.show({ message: '请先填写程名', color: 'red' })
    return
  }
  if (isSaving) return
  setIsSaving(true)
  try {
    const [startDate, endDate] = tourDateRange
    const s = formatDateISO(startDate)
    const e = formatDateISO(endDate)
    const dateRangeStr = (s && e) ? `${s} ~ ${e}` : null

    await postJson(`/tours/${tour.id}`, 'PATCH', {
      tour: { title: tourTitle.trim(), date_range: dateRangeStr, team_size: tourTeamSize || null },
    })
    await postJson(`/tours/${tour.id}/constitution`, 'PATCH', { constitution: c })

    const currentDayCount = tour.days_count || 1
    const targetDayCount = tourDays || 1
    for (let i = currentDayCount + 1; i <= targetDayCount; i++) {
      await postJson(`/tours/${tour.id}/days`, 'POST', { day: { day_index: i } })
    }

    setSetupStep(2)
    window.scrollTo(0, 0)
  } catch (err) {
    notifications.show({ message: `保存失败：${err.message}`, color: 'red' })
    Sentry.captureException(err, {
      tags: { area: 'tour_setup', op: 'save_params' },
      extra: { tour_id: tour.id },
    })
  } finally {
    setIsSaving(false)
  }
}
```

行为契约：
- 空 title 的 toast 替代"静默 return"（现状是点了啥都不发生）。
- `isSaving` 防抖：连点只响应第一次。
- 异常时只 toast，不推进到 Step 2——用户可以修正后重试。
- Sentry tag 遵循项目约定 `{ area, op }`（见 [useChat.js:91](app/javascript/hooks/useChat.js:91), [:127](app/javascript/hooks/useChat.js:127)）。`extra` 只传 `tour_id`——遵循 [CLAUDE.md](CLAUDE.md) PII 规范，不传 title/人数等可能泄露用户隐私的字段。

### 4. `agreeAndStart` — 同样结构

```js
const [isAccepting, setIsAccepting] = useState(false)

const agreeAndStart = async () => {
  if (isAccepting) return
  setIsAccepting(true)
  try {
    await postJson(`/tours/${tour.id}/constitution/accept`, 'POST')
    router.visit(`/tours/${tour.id}`)
  } catch (err) {
    notifications.show({ message: `无法开始规划：${err.message}`, color: 'red' })
    Sentry.captureException(err, {
      tags: { area: 'tour_setup', op: 'accept_constitution' },
      extra: { tour_id: tour.id },
    })
    setIsAccepting(false)   // 失败留在当前屏，允许重试
  }
  // 成功不 reset isAccepting —— router.visit 已离开页面
}
```

### 5. `resetToDefaults` — `window.confirm` → `modals.openConfirmModal`

```js
import { modals } from '@mantine/modals'

const resetToDefaults = () => {
  if (!dirty) return
  const changedCount = Object.keys(defaults)
    .filter(k => String(c[k]) !== String(defaults[k])).length
  modals.openConfirmModal({
    title: '恢复默认参数？',
    children: (
      <Text size="sm">
        恢复默认会丢弃你已修改的 {changedCount} 个参数，确认吗？
      </Text>
    ),
    labels: { confirm: '恢复默认', cancel: '取消' },
    confirmProps: { color: 'red' },
    onConfirm: () => setC({ ...defaults }),
  })
}
```

`ModalsProvider` 已在 [inertia.jsx:57](app/javascript/entrypoints/inertia.jsx:57) 挂载，全局可用。

### 6. 按钮 UI 更新

Step 1 底部的"下一步 →":

```jsx
<Button onClick={proceedToReview} loading={isSaving} disabled={isSaving}>
  {isSaving ? '保存中…' : '下一步 →'}
</Button>
```

Step 2 底部的"同意并开始规划 →":

```jsx
<Button onClick={agreeAndStart} loading={isAccepting} disabled={isAccepting} color="red">
  {isAccepting ? '开始规划中…' : '同意并开始规划 →'}
</Button>
```

（保留现有 color/variant，只加 loading/label。）

### 7. Import 变更

顶部新增：

```js
import { notifications } from '@mantine/notifications'
import { modals } from '@mantine/modals'
import * as Sentry from '@sentry/react'
```

`@sentry/react` 已是项目依赖（见 [package.json](package.json) sentry 集成，参考 [useChat.js:2](app/javascript/hooks/useChat.js:2)）。

## 测试

### 单元（Vitest）

新文件 `app/javascript/pages/Tour/__tests__/formatDateISO.test.js`——只测试纯函数：

| 输入 | 期望输出 |
|---|---|
| `"2026-04-16"` | `"2026-04-16"` |
| `"2026-4-16"` | `"2026-04-16"`（走解析分支） |
| `new Date(2026, 3, 16)` | `"2026-04-16"`（月份 0-index） |
| `null` | `null` |
| `undefined` | `null` |
| `""` | `null` |
| `new Date("bogus")` | `null` |
| `{}` | `null` |
| `12345` | `null` |

需要把 `formatDateISO` 从文件底部 `export` 出来（当前是文件局部函数）。仅 export 这一个函数，其他保持局部。

### 手动回归

Dev 环境 (127.0.0.1:9000)，以开发者登录：

1. **复现原 bug**：新建程 → 选日期范围 → 点"下一步" → 应进入 Step 2（不再卡住）。
2. **后端挂**：`kill -STOP <rails-pid>` 或断网 → 选日期 → 点下一步 → 应看到红色 toast `保存失败：PATCH /tours/…`；Sentry dev 项目应收到一条事件，tags `area=tour_setup op=save_params`。
3. **双击防抖**：快速连点"下一步"两次 → 第二次无效，按钮显示 spinner。
4. **空标题**：清空"程名" → 点下一步 → 红色 toast `请先填写程名`；`window.alert` 不再出现。
5. **恢复默认弹窗**：改一个参数 → 点"↺ 恢复默认" → 应出现 Mantine modal（不是浏览器 confirm）→ 取消保留、确认重置。
6. **同意并开始规划失败路径**：Step 2 → 断网 → 点"同意并开始规划" → 红色 toast；仍在 Step 2，可重试。

### CI

运行 `mise exec -- bundle exec rspec`（应无变化）、`npm test`（新增 formatDateISO 测试通过）、`bin/rubocop -f github`（无变化）、`bin/brakeman --no-pager`（无变化）、`npm audit`（无变化）。参见 [CLAUDE.md](CLAUDE.md) "Before claiming done" 清单。

## 风险与反向

- **Sentry 事件噪声**：修完后用户遇到后端错误才会上报；首次上线后 24h 观察 `area=tour_setup` 的事件频率，若异常高说明后端侧还有 bug 要追。
- **`formatDateISO` 行为悄悄变宽容**：文件内其他调用者（目前只有 `proceedToReview`）受影响是正面的；无其他调用方。
- **没改的东西**：`tourDateRange` 的内部存储仍然是 `[Date | string, Date | string]` 混合类型——初始从 `tour.date_range` 解析出 `Date`，`onChange` 后变 `string`。可以工作但不够干净。未来若做内部状态一致性重构，应从 `handleDateRangeChange` 入口统一成 string。本次不做。

## 开放问题

无。

## 文件清单（实现时）

- 修改 [app/javascript/pages/Tour/Constitution.jsx](app/javascript/pages/Tour/Constitution.jsx)
- 新增 `app/javascript/pages/Tour/__tests__/formatDateISO.test.js`
