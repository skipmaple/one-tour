# 默认值 + 空状态 + 不劝退 + 富卡片提示 设计（子项目③ / P1-4·P2-6·P2-7）

日期：2026-06-03
分支：claude/strange-noyce-4e5387
来源：PM 新用户视角评估的 P1-4 / P2-6 / P2-7（3 子项目中的第③个，收尾）

## 背景

新用户被一组"劝退/困惑"细节伤害：

- **空行程就挨训**（P1-4）：还没加任何活动，宪法校验已报黄色软提示「整程 0 个机动日（建议 ≥ 1）」——没干活先被说教，且"机动日"是看不懂的词。
- **随手加的点全是"可选"**（P2-6a）：新建活动默认 `citizen_level = tier_three`（DB 默认 `2` + 编辑器 `EMPTY_FORM_VALUES`），卡片对 tier_three 显示「可选」——新人加什么都标"可有可无"，观感劝退。
- **空卡**（P2-6b）：手敲名字、不用高德搜索选点时，卡片只有名字（无评分/营业/照片）。
- **空白天只有一个"空"字**（P2-7）：`DayColumn` 空状态无引导。

## 锁定决策

1. **新建活动默认层级 tier_three → tier_two「想去」**，且**全来源一致**（DB 默认 + 编辑器默认 + edit fallback），使手动加 / AI/API 省略 level 时都落「想去」（卡片中性、不挂标签）。
2. **空行程不报机动日违反**：`check_buffer_days` 在 `@tour.activities.empty?` 时返回 nil。
3. **空白天 CTA**：`DayColumn` 空状态「空」→ 引导文案。
4. **富卡片轻量提示**：编辑器 位置/名称 处加一行灰字 hint。
5. 实现：就地改默认/空状态/校验 + 一行 hint；含**一个非破坏性迁移**（`change_column_default`）。不改枚举、不改存量数据、不动卡片 pickMeta「可选」文案、不做保存时自动富集。

## 设计

### 1. 默认层级 tier_three → tier_two（全来源一致）

**DB 默认**（`db/schema.rb:49` 当前 `t.integer "citizen_level", default: 2, null: false`）：
- 新增迁移 `db/migrate/<ts>_change_activities_citizen_level_default.rb`：
  ```ruby
  class ChangeActivitiesCitizenLevelDefault < ActiveRecord::Migration[8.0]
    def up
      change_column_default :activities, :citizen_level, from: 2, to: 1
    end
    def down
      change_column_default :activities, :citizen_level, from: 1, to: 2
    end
  end
  ```
  非破坏性：只改未来插入的默认（tier_two=1），**存量行不变**。运行后 `schema.rb` 第 49 行变 `default: 1`。
- 覆盖面：AI `add_activity` / 任何 API 在省略 `citizen_level` 时 → DB 默认 → tier_two。

**编辑器默认**（`ActivityDrawer.jsx`）：
- 第 17 行 `EMPTY_FORM_VALUES.citizen_level: 'tier_three'` → `'tier_two'`。
- 第 62 行 edit-load fallback `activity.citizen_level || 'tier_three'` → `|| 'tier_two'`（防御性；citizen_level NOT NULL 实际不会触发，仅保持一致）。

（road 强制 tier_one 的逻辑不变；max_tier_one_per_day 约束不受影响——tier_two 不计入。）

### 2. 空行程不报机动日违反（P1-4）

`app/models/tour/constitution_check.rb` `check_buffer_days`（约 53-64 行）开头加一行：
```ruby
    def check_buffer_days
      return nil if @tour.activities.empty?   # 空行程不提前报"机动日不足"
      limit = @rules[:min_buffer_days]
      ...
```
语义：用户还没加任何活动时，不报 min_buffer_days 软提示；加了第一个活动后照常校验。（其它 check_* 本就依赖 per-day 活动，空行程不触发，无需改。）

### 3. 空白天 CTA（P2-7）

`DayColumn.jsx` 空状态（约 252-254）：
```jsx
        {activities.length === 0 && !filterActive && (
          <Text size="xs" c="dimmed" ta="center" mt="md">空</Text>
        )}
```
→
```jsx
        {activities.length === 0 && !filterActive && (
          <Text size="xs" c="dimmed" ta="center" mt="md" px="xs">把候选拖到这里，或用下方「+ 加一个」</Text>
        )}
```
（保留 `!readOnly && onAddActivity` 时底部已有的「+ 加一个」按钮；只读时仍是引导文案——只读用户看到"把候选拖到这里"略不贴切，但低频；保持单一文案以免复杂。若要更精确可后续按 readOnly 分支，本轮不做。）

### 4. 富卡片轻量提示（P2-6b）

`CommonFields.jsx` 位置区（`LocationPicker` 之后、名称附近）加一行灰字 hint：
```jsx
        <Text size="xs" c="dimmed">用高德搜索选点，可自动带评分、营业时间、照片</Text>
```
放在**紧随 `LocationPicker` 之后**（位置区顶部、名称输入之前）——hint 讲的是"用搜索选点"，贴着搜索控件最达意。无条件常显（CommonFields 始终在编辑器内）。

## 触达文件

- `db/migrate/<ts>_change_activities_citizen_level_default.rb`（新）+ `db/schema.rb`（重生成，default 2→1）。
- `app/models/tour/constitution_check.rb`（check_buffer_days 空行程守卫）。
- `app/javascript/components/activity-editor/ActivityDrawer.jsx`（EMPTY_FORM_VALUES + edit fallback tier_two）。
- `app/javascript/components/planner/DayColumn.jsx`（空状态 CTA）。
- `app/javascript/components/activity-editor/CommonFields.jsx`（富卡片 hint）。

## 测试

- `spec/models/activity_spec.rb`：`create(:activity)`（或不指定 citizen_level 的新建）默认 `tier_two`（验证 DB 默认；注意 factory 若显式给了 citizen_level 要测"省略时"的路径——用 `Activity.new(tour:, name:).citizen_level` 或建一条不带 level 的）。
- `spec/models/tour/constitution_check_spec.rb`（或现有 constitution check spec）：空行程（无 activities，min_buffer_days≥1）→ 无 min_buffer_days 违反；加一个活动后 → 恢复报违反。
- `ActivityDrawer.test.jsx`：新建态默认选中「想去」(tier_two)；create payload `citizen_level: 'tier_two'`。
- `DayColumn.test.jsx`：空状态（非筛选）显示引导文案（断 `把候选拖到这里` 而非「空」）。
- `ActivityDrawer.test.jsx` 或 CommonFields 测试：富卡片 hint 文案存在。

## 边界与非目标

- 不改 `citizen_level` 枚举值、不 backfill 存量活动（存量保持其原 level）。
- 不动卡片 `pickMeta` 的「可选」文案（tier_three 仍显"可选"——与编辑器「备选」的措辞差异留待以后；本轮新默认 tier_two 卡片本就不挂标签，问题已缓解）。
- 不做"保存时自动富集"（富卡片只做轻量提示）。
- 不动宪法正文、不改其它 constitution check。
- 空白天 CTA 不按 readOnly 分支细化（单一文案）。
