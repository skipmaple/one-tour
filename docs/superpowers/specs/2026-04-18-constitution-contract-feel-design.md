# 宪法"契约化"：去除新疆硬编码 + 覆盖值高亮

**Date**: 2026-04-18
**Scope**: `app/javascript/components/planner/ConstitutionFullText.jsx`（+ 一处 callsite 在 `pages/Tour/Constitution.jsx` 传 prop）

## 问题

宪法文本目前是"模板化"而非"契约化"，两层问题：

**(a) 新疆地理条款硬编码**。4 处具体地名只在新疆行程里成立，在川西/云南/海南等行程里出现毫无意义，用户感到与行程错位：

| 位置 | 原文 |
|---|---|
| [第三条](../../../app/javascript/components/planner/ConstitutionFullText.jsx) | 伊犁比北京偏西约 30 个经度，手机时间减 2 小时 = 体感时间。 |
| [第六条](../../../app/javascript/components/planner/ConstitutionFullText.jsx) | 一等公民路（独库、伊昭）...二等公民路（果子沟大桥段）... |
| [第八条](../../../app/javascript/components/planner/ConstitutionFullText.jsx) | 毡房/蒙古包体验整程最多 1 晚。 |
| [第十八条](../../../app/javascript/components/planner/ConstitutionFullText.jsx) | ...独库建议南→北走。 |

**(b) 签署后"分不清是被选择还是默认"**。已确认参数数据流正常（改 `max_daily_driving_minutes=300` 后宪法文本第十条正确显示"≤ 5 小时"），但视觉上与默认值无任何差异。全默认走完用户会感觉"这是个静态模板"，改过参数的用户也没法一眼看出哪些是自己选的。

## 非目标

- 不做"按目的地分支文本"（A2 路线，覆盖率差维护成本高）
- 不改后端，不新增数据库字段，不改 `Constitution::DEFAULTS` 结构
- 不给全默认用户伪造"定制感"——本应是默认就让它看起来是默认
- 不动未参数化的红色强调文本（时区条等保持原样）

## 设计

### (a) 文本改为"举例式"

4 处修改，统一原则：具体地名前加"如"，并用**跨区域至少 2 个参考**稀释单一地域感：

- 第三条："一个「日」包含多个有规律的「行」，遵循人类作息和当地节奏。**西部地区（如新疆、西藏西部）比北京实际偏西约 2 小时**，需考虑体感时间差。"
- 第六条："路不是管道。一等公民路（**如独库、318、滇藏等景观公路**）行驶过程本身就是目的；二等公民路（**如果子沟大桥段、雅鲁藏布大拐弯段**）沿途有景观但不需全程慢行；普通路段仅追求效率。"
- 第八条："围绕当日最后一个景点就近安排。底线：女生可接受的卫生条件、独立卫浴、手机可充电。**特色民俗住宿（如毡房、蒙古包、藏式民宿）**体验整程最多 1 晚。"
- 第十八条："避开大流量方向；最期待的景点放在体力天气最好的日子；**对有明显方向差异的景观路段（如独库南→北），提前研究最佳行车方向**。"

这些是有用的作者知识（时区差、景观公路方向、特色住宿），只是之前锁死在一个地域。加"如"后从"本程涉及 X"变成"原则叙述里顺带举个例子"。

### (b) 覆盖值高亮

`ConstitutionFullText` 接收 `defaults` prop（controller 已经传给 `Constitution.jsx`，现在透传一层即可）：

```jsx
// ConstitutionFullText.jsx
export default function ConstitutionFullText({ constitution, defaults }) {
  const c = constitution || {}
  const d = defaults || {}
  const isOverride = (field) =>
    d[field] !== undefined && c[field] !== d[field]

  const valStyle = (field) => isOverride(field)
    ? { ...DOC.red, textDecoration: 'underline', fontWeight: 800 }
    : DOC.red
  ...
}
```

对每个参数化数字（9 处占位，7 个字段）做替换，例：

```jsx
// 原
<span style={DOC.red}> ≤ {driveH} 小时</span>
// 改后
<span
  style={valStyle('max_daily_driving_minutes')}
  title={isOverride('max_daily_driving_minutes')
    ? `默认 ${Math.round(d.max_daily_driving_minutes/60)} 小时`
    : undefined}
> ≤ {driveH} 小时</span>
```

**覆盖字段清单**（7 处原红色占位，对应 7 个字段）：

| 条款 | 字段 | 显示单位 |
|---|---|---|
| 第七条 | `max_tier_two_food_per_tour` | 家 |
| 第九条 | `max_fuel_emergency_per_tour` | 次 |
| 第十条 | `max_daily_driving_minutes` | 小时 |
| 第十条 | `max_mountain_road_minutes` | 小时 |
| 第十一条 | `max_tier_one_per_day` | 个 |
| 第十二条 | `min_daily_buffer_minutes` | 分钟 |
| 第十二条 | `min_buffer_days` | 天 |

**不覆盖**：第十四条里 `{t2Food}`、`{fuelEmg}` 的再次出现原文没用红色（作者故意——此处是跨引用而非首次声明）。保留这个设计意图，不在第十四条加高亮，避免引入新的视觉噪声。

### Callsite 改动

`pages/Tour/Constitution.jsx` 两处 `<ConstitutionFullText constitution={...} />` 都要加 `defaults={defaults}`：
- [第 203 行](../../../app/javascript/pages/Tour/Constitution.jsx)：Step 2 review
- [第 239 行](../../../app/javascript/pages/Tour/Constitution.jsx)：签署后 read-only

### 行为对照

| 场景 | 改前 | 改后 |
|---|---|---|
| 新建川西行程 Step 2 | 看到"独库"、"伊犁"、"毡房" | 均已改举例式 |
| 全默认走完 | 所有数字红色加粗 | 不变（无覆盖=无下划线） |
| 改驾驶为 5h 后 Step 2 | "≤ 5 小时" 与默认同样样式 | "≤ <u>5</u> 小时"，hover 显示"默认 7 小时" |
| 签署后只读视图 | 同上 | 同上（覆盖信号持续保留） |

## 验证

手动 E2E（浏览器）：
1. 新建 "川西 5 日" 行程 → Step 2
2. 预期：看到第三条"西部地区..."、第六条"独库、318、滇藏"、第八条"毡房、蒙古包、藏式民宿"、第十八条"独库南→北"前面都有"如"
3. 所有数字值都是默认红色加粗，**无下划线**
4. 返回 Step 1，改驾驶上限 7→5 小时 → Step 2
5. 预期：第十条"≤ 5 小时"**有下划线**，hover tooltip 显示"默认 7 小时"；其他 6 个值仍无下划线

单测：`ConstitutionFullText.test.jsx` 目前未存在（只有 `Constitution.test.jsx` 覆盖上层）；可选给新 helper 加 2 个用例（override true/false 分别渲染不同 style），但覆盖值高亮主要是视觉呈现，E2E 已经足以保证。
