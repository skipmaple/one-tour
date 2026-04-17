# Constitution Step 1 日期 UX 硬化（#3 + #4）

**Date**: 2026-04-18
**Scope**: `app/javascript/pages/Tour/Constitution.jsx`

## 问题

2026-04-17 的设计评审（基于浏览器实测）中，Step 1 还有两个日期相关的阻塞级问题：

**#3 历史日期可选**
`DatePickerInput` 未设 `minDate`，Apr 1–17 等历史日期全部 `disabled: false`，用户可选"昨天"作为出发日期。另：同文件多处（以及项目其他位置的潜在调用）若用 `new Date().toISOString().slice(0, 10)` 算"今天"，在 Asia/Shanghai（UTC+8）会返回前一天（`2026-04-17` 而非 `2026-04-18`），是潜在时区陷阱。

**#4 日期范围 ↔ 天数静默互写**
[Constitution.jsx:37-54](app/javascript/pages/Tour/Constitution.jsx:37) 的 `handleDateRangeChange` / `handleDaysChange` 做双向同步：
- 设天数 = 5 后选 Apr 20–May 3 范围 → 天数被**静默**改写为 14
- 反向同理

无任何提示、确认、撤销。bug 报告里明确写过"用 '保持 5 天 / 按日期改为 16 天' 的选择提示"。

## 非目标

- 不做项目级 date helper / i18n 层（超范围）。
- 不改后端的 `tour.days_count` / `tour.date_range` 数据模型。
- 不改 Step 2（宪法同意页）任何东西。
- 不动 `proceedToReview` / `agreeAndStart`（已在 2026-04-17 的 crash-fix 里处理）。
- 不尝试保存部分选择（只选了 start 没选 end），保持"选全才 autofill"的现状。

## 设计

### 1. `todayLocal()` — 本地时区"今天"

文件顶部加 pure function：

```js
// Asia/Shanghai 及其他东半球时区下，new Date().toISOString().slice(0,10) 会返回前一天。
// 用 Date 对象自带的本地字段直接构造，避免 UTC 转换。
export function todayLocal() {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`  // ISO 格式 "YYYY-MM-DD"，Mantine DatePickerInput 接受
}
```

用于 `minDate`，也可以日后给其他需要"今天"的调用点用。

### 2. `DatePickerInput` — 加 `minDate`

[Constitution.jsx:159-167](app/javascript/pages/Tour/Constitution.jsx:159) 改为：

```jsx
<DatePickerInput
  type="range"
  label="日期范围"
  placeholder="选择出发和返回日期"
  value={tourDateRange}
  onChange={handleDateRangeChange}
  valueFormat="YYYY-MM-DD"
  minDate={todayLocal()}
  clearable
/>
```

行为：
- 今天及未来 → 可选
- 昨天及更早 → Mantine 自动渲染为 `data-disabled`，点击无效
- 已有 `tour.date_range` 包含历史日期（老数据）→ `DatePickerInput` 不会反向清除，但用户不能把 range 再改回历史范围（符合预期）

### 3. 冲突检测 `detectDateDaysConflict` — pure function

```js
// 返回 null 代表无冲突；否则返回 { implied, current } 两个天数
export function detectDateDaysConflict(range, days) {
  const [start, end] = range || []
  if (!start || !end) return null       // 未选全 → 无冲突
  if (!days || days <= 0) return null   // 天数空 → 无冲突
  const s = new Date(start).getTime()
  const e = new Date(end).getTime()
  if (isNaN(s) || isNaN(e)) return null
  const implied = Math.round((e - s) / 86400000) + 1
  if (implied === days) return null     // 一致 → 无冲突
  return { implied, current: days }
}
```

### 4. 改造 `handleDateRangeChange` / `handleDaysChange` — 冲突场景走 Modal

```js
import { modals } from '@mantine/modals'

function askConflict({ implied, current, onUseRange, onUseDays }) {
  modals.openConfirmModal({
    title: '日期范围和天数对不上',
    children: (
      <Text size="sm">
        你选的是 <b>{implied}</b> 天的日期范围，但当前"天数"填的是 <b>{current}</b>。
        选一个继续：
      </Text>
    ),
    labels: { confirm: `按日期改为 ${implied} 天`, cancel: `保持 ${current} 天，截断日期` },
    onConfirm: onUseRange,
    onCancel: onUseDays,
    // Mantine 的 openConfirmModal 只有两个出口；Esc / 点击遮罩 / 右上 × 都触发 onCancel
    // （即"保持 ${current} 天"分支）。无"两者都不动"的第三条路。
  })
}

const handleDateRangeChange = (newRange) => {
  const [start, end] = newRange || [null, null]
  // 空 / 半选 / 清空 → 直接 setState，不 autofill、不查冲突
  if (!start || !end) {
    setTourDateRange(newRange)
    return
  }
  const conflict = detectDateDaysConflict(newRange, tourDays)
  if (!conflict) {
    // 原有 autofill 逻辑：无冲突（包括天数为空的首次填入）
    setTourDateRange(newRange)
    const implied = Math.round(
      (new Date(end).getTime() - new Date(start).getTime()) / 86400000
    ) + 1
    if (implied > 0) setTourDays(implied)
    return
  }
  askConflict({
    implied: conflict.implied,
    current: conflict.current,
    onUseRange: () => {
      setTourDateRange(newRange)
      setTourDays(conflict.implied)
    },
    onUseDays: () => {
      // 保持天数，截断 end
      const truncatedEnd = new Date(
        new Date(start).getTime() + (conflict.current - 1) * 86400000
      )
      setTourDateRange([start, truncatedEnd])
    },
  })
}

const handleDaysChange = (val) => {
  const [start, end] = tourDateRange || [null, null]
  // 没有起点 / 天数清空 → 直接 setState，不联动
  if (!start || !val || val <= 0) {
    setTourDays(val)
    return
  }
  // 没有 end（未选完范围）→ 按常规 autofill 写入 end
  if (!end) {
    setTourDays(val)
    const newEnd = new Date(new Date(start).getTime() + (val - 1) * 86400000)
    setTourDateRange([start, newEnd])
    return
  }
  const conflict = detectDateDaysConflict([start, end], val)
  if (!conflict) {
    setTourDays(val)
    return
  }
  askConflict({
    implied: conflict.implied,
    current: val,
    onUseRange: () => {
      // 用户改的是天数，但选择"按日期"→ 回滚天数到日期蕴含值
      setTourDays(conflict.implied)
    },
    onUseDays: () => {
      setTourDays(val)
      const newEnd = new Date(new Date(start).getTime() + (val - 1) * 86400000)
      setTourDateRange([start, newEnd])
    },
  })
}
```

### 冲突场景表

| 场景 | 行为 |
|---|---|
| 首次选日期（天数空） | 直接 autofill 天数 |
| 首次填天数（start 有 end 空） | 直接 autofill end |
| 首次填天数（start/end 都空） | 只 setState 天数 |
| 日期和天数一致（用户只是再编辑） | 直接 setState |
| 两者都有且改动产生不一致 | **弹 Modal** |
| 清空日期范围（start 或 end 为 null） | 只动日期，不动天数 |
| 清空天数（val = 0/null） | 只动天数，不动日期 |

## 测试

新测试文件 `app/javascript/pages/Tour/__tests__/date-days-sync.test.js`：

- `todayLocal()`
  - 冻结时间至 `2026-04-18 08:00 Asia/Shanghai`（即 `00:00 UTC`）→ 返回 `"2026-04-18"`（非 UTC 的 `2026-04-17`）
  - 冻结时间至 `2026-04-18 23:59 Asia/Shanghai` → 返回 `"2026-04-18"`
- `detectDateDaysConflict()`
  - `([null, null], 5)` / `(['2026-04-20', null], 5)` → `null`
  - `(['2026-04-20', '2026-04-24'], null)` / `(..., 0)` → `null`
  - `(['2026-04-20', '2026-04-24'], 5)` → `null`（5 天一致）
  - `(['2026-04-20', '2026-05-03'], 5)` → `{ implied: 14, current: 5 }`
  - 非法日期字符串 → `null`

只测 pure function；Modal 流程的断言范围：
- `__tests__/ConstitutionDateDaysModal.test.jsx`（可选，轻量）：用 `@mantine/modals` Provider 包裹，断言冲突场景下 `modals.openConfirmModal` 被调用 1 次；确认/取消各分支触发对应 state 变化。

## 风险 / 权衡

- **老数据 `tour.date_range` 含历史范围**：`DatePickerInput` 初次渲染不会因 `minDate` 反向清除已有值（Mantine 行为），但用户若重选会被限制。这是可接受的——不主动破坏老数据，但不允许再制造新的历史行程。
- **时区统一性**：本 spec 只引入 `todayLocal()` 这一个 pure helper，不改 `formatDateISO`（它已经正确使用 `getFullYear()` 等本地方法）。项目级时区一致性是单独问题。
- **Modal 按钮语序**：主按钮"按日期改为 N 天"放 confirm 位——推测用户刚改的是日期，多数会想按日期为准。次按钮是逆操作。反方向的 `handleDaysChange` 走的是同一个 modal，按钮文案照刚才改动方向生成，语义对称。
- **Esc = 保持天数**：Mantine `openConfirmModal` 只支持 2 个出口，`onCancel` 默认绑定 Esc / 遮罩点击 / ×，无 "都不动" 的第三条路。这是刻意取舍——再引入自定义 3-按钮 modal 代价大于收益；用户反悔可再编辑一次，会重新弹出。

## 验收

- 打开日期 picker，`< today` 的按钮视觉变灰、不可点
- 天数 5 + 选 Apr 20–May 3 → Modal 弹出；"按日期"后天数变 14；"保持天数"后 end 变 Apr 24；Esc 走"保持天数"分支
- 反向：日期 Apr 20–24 + 改天数为 10 → Modal；"按日期"后天数回 5；"保持天数"后 end 变 Apr 29
- 首次填：天数空 + 选范围 → 无 Modal、天数 autofill；范围空 + 填天数 → 无 Modal（无起点则无 end autofill）
- Pure function 测试全绿；`npm test` 整体无回归

## 落地

- 修改 [Constitution.jsx](app/javascript/pages/Tour/Constitution.jsx)
- 新增 [__tests__/date-days-sync.test.js](app/javascript/pages/Tour/__tests__/date-days-sync.test.js)
- （可选）新增 [__tests__/ConstitutionDateDaysModal.test.jsx](app/javascript/pages/Tour/__tests__/ConstitutionDateDaysModal.test.jsx)
- 运行 `mise exec -- bundle exec rspec`（预期无变化）、`npm test`（新增两组测试通过）、`bin/rubocop -f github`、`bin/brakeman --no-pager`、`npm audit`
