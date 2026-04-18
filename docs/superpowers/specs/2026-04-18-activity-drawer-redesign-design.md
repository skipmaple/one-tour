# 编辑行抽屉重设计（Activity Drawer B-tier redesign）

**日期**：2026-04-18  
**作者**：skipmaple + Claude  
**背景**：当前编辑行抽屉几乎所有字段都是平铺的 text input，缺视觉分段，"更多设置"把关键字段（描述、kind 细节）藏在折叠里，小白用户抱怨体验割裂。本次目标：整体重组信息密度 + 字段级换到合适的控件类型。

---

## 目标

1. 用三段式视觉结构替代扁平列表，建立"位置 → 分类与时间 → 详情"的阅读叙事。
2. 把所有该用 picker/select 的字段换成对应控件（time picker、number + 后缀、枚举 select）。
3. 删除"更多设置"折叠，关键字段默认展开。
4. 合并"描述 + 贴士" → "备注"单字段，后端顺带修掉 `desc`/`description` 列名对不上的死 bug。

## 非目标

- 起点/终点 与 POI 搜索双向绑定（智能联动，归属 C 范畴）
- 菜系/光线/citizen_level 基于 POI type 自动推断
- 根据 km 估算驾驶时长
- 门票分人群分档（儿童/学生）
- 多语言

---

## 设计约束

- **纯中文 UI**：label、placeholder、helper text、错误文案全中文。不用 emoji/icon 作装饰前缀（不再用 `📍`、`⚠`、`💡` 等开头）。
- **抽屉宽度**：保持现在的 420px
- **样式基座**：Mantine v9，原生组件优先，避免自造 primitive

---

## 整体结构

三段式，段与段之间用 Mantine `Divider label="..." labelPosition="left"`，标题用 dimmed xs 字号。

```
编辑行                                    ×
──────────────────────────────────────────
位置  ─────────────────────────────
搜索地点
[输入地名搜索...]

名称 *
[xxx]
地址：xxxxx                    ← helper text 灰色小字

分类与时间  ─────────────────────────
类型
[景点 ▾]

公民等级
○ 一等公民（核心）      ○ 二等公民（配角）
○ 三等公民（可删）      ● 基础设施（自动）

开始时间                时长
[17:00 ▾]              [60] 分钟
                       [30 60 90 120 180]  ← 预设芯片

详情  ─────────────────────────────
备注
[textarea，2 行 autosize]

——（按 kind 动态渲染，见下）——

──────────────────────────────────────────
[保存] [取消]              [移回候选池] [删除]
```

段落分工：
- **位置**：POI 搜索框 + 名称 + 地址。POI 搜索是名称字段的辅助输入，纳入同段不再游离。
- **分类与时间**：类型、公民等级、开始时间、时长 —— 都是"是什么 / 在什么时候"的元数据。
- **详情**：备注 + 按 kind 动态渲染的细节字段。

取消的东西：
- "📍 地址" 前缀 emoji → 改成 `地址：xxx` 纯文本
- 坐标行 `36.06, 103.83` → 完全不显示（地图面板已提供视觉）
- "▾ 更多设置" 折叠按钮 → 取消，描述 / 贴士 / kind 细节全部默认展开

---

## 字段级控件改造

### 通用字段

| 字段 | 现在 | 改造 | 备注 |
|---|---|---|---|
| 开始时间 | text `HH:MM` | `TimeInput`（Mantine `@mantine/dates`）| HH:MM 字符串序列化不变 |
| 时长 | text number | `NumberInput` + `分钟` 后缀 + 预设芯片 `30 60 90 120 180` | 预设点击直接写入 |
| 备注（原描述 + 贴士）| 两个 textarea + 折叠 | 单个 `Textarea` autosize minRows=2 maxRows=5 | 绑定 `desc` 列 |

### 景点 (scenic)

| 字段 | 现在 | 改造 |
|---|---|---|
| 需要预约 | checkbox 末尾 | checkbox 置顶为决策性字段 |
| 最佳光线 | text | `Select` `clearable`，选项：`日出 / 上午 / 正午 / 下午 / 黄昏 / 夜景 / 全天` |
| 海拔 | number | `NumberInput` + `米` 后缀，`min=0 max=9000` |
| 门票 | text | `NumberInput` + `元` 后缀，`min=0`；`0 = 免费`（约定） |
| 建议停留 | number | `NumberInput` + `分钟` + 预设芯片 `30 60 90 120 180` |

### 路段 (road)

| 字段 | 现在 | 改造 |
|---|---|---|
| 起点 / 终点 | text | 保留 text |
| 里程 | number | `NumberInput` + `km` 后缀 |
| 驾驶时长 | number | `NumberInput` + `分钟` + 预设芯片 `30 60 90 120 180` |
| 路型 | Select | 保留 |
| 仅白天通行 | checkbox | 保留 |
| **布局** | 每字段独占 1 行 | 里程 + 驾驶时长并排 |

### 餐饮 (food)

| 字段 | 现在 | 改造 |
|---|---|---|
| 菜系 | text | `Autocomplete`，推荐选项：`甘肃菜 / 川菜 / 粤菜 / 湘菜 / 东北菜 / 清真 / 西餐 / 其他`，允许自由输入 |
| 必吃 | text | 保留（开放答案）|
| 营业时间 | text | 保留 text，placeholder 改为 `如：10:00-22:00 周一休息` |
| 人均 | number | `NumberInput` + `元` 后缀 |

### 住宿 (stay)

| 字段 | 现在 | 改造 |
|---|---|---|
| 卫生等级 | Select | 保留 |
| 人均 | number | `NumberInput` + `元` 后缀 |
| 独立卫浴 | checkbox | 保留 |

### 加油 (fuel)

| 字段 | 现在 | 改造 |
|---|---|---|
| 品牌 | text | `Autocomplete`，推荐选项：`中石化 / 中石油 / 壳牌 / 中海油 / 其他`，允许自由输入 |
| 24 小时 | checkbox | 保留 |
| 到下加油站 | number | `NumberInput` + `km` 后缀 |

### 跨字段布局规则
- 成对数字并排：`开始时间 / 时长`、`里程 / 驾驶时长`、`海拔 / 建议停留`。
- `NumberInput` 统一 `min={0}`、`hideControls={false}`（保留 ↑↓ 步进）、默认 step=1。
- 预设芯片放在输入框**下方**（右侧空间不够，会挤字段），用 `Group gap={4}` 渲染，点击 `setFieldValue`。
- Autocomplete 的推荐选项存在 `detailsSchema.js` 的新字段 `suggestions`，与 `options`（select 专用）并列。

---

## 后端变更

### 1. Drop `activities.tips` 列（破坏性迁移）

用户明确授权不迁移历史 tips 数据。

```ruby
class DropTipsFromActivities < ActiveRecord::Migration[8.0]
  def change
    remove_column :activities, :tips, :text
  end
end
```

### 2. 修 `desc` / `description` 列名对不上的 bug

现状：
- DB 列是 `desc`（见 `db/schema.rb` 和 migration）
- `activities_controller#activity_params` permit `:desc`
- 前端 form 字段叫 `description` → 用户填的"描述"**从没成功保存过**

修法：统一成 `desc`（保持列名不变，避免又一次迁移）。
- 前端 form field 从 `description` 改名为 `desc`
- UI label 仍是 `备注`
- `as_json` 输出 `desc` 键（Rails 默认行为，无需改）

### 3. `activity_params` 更新

- 移除 `:tips`
- `:desc` 保留

### 4. AI tool `update_activity.rb`

- `UPDATABLE` 列表移除 `tips`
- `:patch` desc 字符串同步更新

---

## 前端变更

### 文件清单

| 文件 | 变更 |
|---|---|
| `app/javascript/components/activity-editor/ActivityDrawer.jsx` | form `initialValues` / `setValues` / handlers：`description` → `desc`；移除 `tips`；保留刚修的 POI pick 改名逻辑、reset 逻辑 |
| `app/javascript/components/activity-editor/CommonFields.jsx` | 整块重写：三段 Divider + 段内 fields；用 `TimeInput`、`NumberInput` + 后缀；删 `📍`；删 `tips` textarea；描述→备注 |
| `app/javascript/components/activity-editor/DetailsFields.jsx` | 支持 `type: 'number_with_suffix'`、`type: 'autocomplete'`、`type: 'select_clearable'`；芯片 preset 能力 |
| `app/javascript/components/activity-editor/detailsSchema.js` | 每个字段按上表重新声明 type，scenic 的顺序调整（`need_reservation` 置顶） |
| `app/javascript/components/activity-editor/PoiSearchCombobox.jsx` | 不动（上一轮已改 onPick 附 address） |

### 新增控件规则（DetailsFields）

字段 schema 约定：
```js
{ key, label, type: 'text' | 'number' | 'checkbox' | 'select' | 'number_with_suffix' | 'autocomplete' | 'select_clearable',
  suffix?: '米' | 'km' | '元' | '分钟',
  options?: string[],       // for select / select_clearable
  suggestions?: string[],   // for autocomplete
  presets?: number[]        // for number_with_suffix
}
```

### 预设芯片组件

新文件 `app/javascript/components/activity-editor/PresetChips.jsx`：
```jsx
export default function PresetChips({ values, onPick }) {
  return (
    <Group gap={4} mt={4}>
      {values.map(v => (
        <UnstyledButton
          key={v}
          onClick={() => onPick(v)}
          style={{ fontSize: 11, padding: '2px 8px', border: '1px solid #ddd', borderRadius: 12, background: '#fafafa' }}
        >
          {v}
        </UnstyledButton>
      ))}
    </Group>
  )
}
```

---

## 数据流（不变）

1. 用户编辑/新建 → form 本地 state
2. 保存 → Inertia `router.patch /activities/:id` 或 `fetch POST /tours/:id/{days/:d_id/activities|backlog_activities}`
3. 服务端 `activity_params.permit(...)` → `Activity.update!` / `create!`
4. 重定向 → Tour#show 重新渲染 Planner

备注字段从此绑定 `desc` 列（真实列）。

---

## 测试

### Vitest
- `ActivityDrawer.test.jsx`：
  - 已有 10 个用例全部保留（POI pick、reset、address display 等）
  - 新增：`renders all three section headers (位置/分类与时间/详情)`
  - 新增：`ticket amount 0 is treated as "免费"`（断言 saved payload 里 `details.ticket_info === 0`）
  - 新增：`duration preset chip click sets form value`
  - 新增：`备注 field saves to desc column`（断言 payload `activity.desc === "..."`，不含 `tips`）
  - 移除：任何 `tips` 相关断言

- `CommonFields.test.jsx`（若尚无，新建）：
  - 段标题渲染
  - `NumberInput` 带后缀渲染
  - `Autocomplete` 的 `suggestions` 下拉出现

### RSpec
- `activities_controller_spec.rb`：
  - 加一个 `it "accepts desc but not tips"` case，确保 permit 列表正确
- Migration：`ActiveRecord::Base.connection.column_exists?(:activities, :tips)` 在回滚/迁移后分别应返回 true/false。

---

## 回滚策略

- Drop tips 的 migration 有 `def change` 形式（`remove_column :activities, :tips, :text`），可自动 `rollback` 恢复空列
- 前端改动是常规 PR，`git revert` 即可
- 如线上发现严重回归，建议直接 revert 整个 PR（迁移回滚顺序：先 app 回滚再 DB 回滚）

---

## 非显式影响

- AI 聊天里的 `UpdateActivity` tool 如果之前曾给 activity 写过 tips，调用会失败（字段不存在）—— AI system prompt 会基于 FrontmatterSchema 重新生成，但 `update_activity.rb` 的 param desc 里提到了 tips，需要一并改
- 历史 activity 的 tips 列在 drop 之后不可恢复 —— 用户已确认不迁移

---

## 验收条件

- [ ] 抽屉打开（编辑或新建）视觉上是 3 段 Divider + 各自标题
- [ ] 开始时间是原生 TimeInput，点击弹 time picker
- [ ] 时长、建议停留、驾驶时长下方有 `30 60 90 120 180` 芯片，点击生效
- [ ] NumberInput 右侧有单位后缀（米/km/元/分钟）
- [ ] 最佳光线、菜系、加油品牌是 Select / Autocomplete（不是纯 text）
- [ ] 备注文字保存后再打开依然看到（desc 列真的写入了）
- [ ] 旧 activity 的 tips 不再出现在 UI；新 activity 不发送 tips
- [ ] `bin/rubocop -f github`、`bin/brakeman --no-pager`、`mise exec -- bundle exec rspec`、`npm test` 全过
- [ ] 无 console error、无 Sentry 新 issue
