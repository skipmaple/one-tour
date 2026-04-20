# Activity 参与人（ActivityParticipant）

**Status**: Design approved 2026-04-21 · awaiting implementation plan
**Scope**: 每个 activity 可关联参与成员，由 author + editor 通过 ActivityDrawer "参与人" tab 增删查改；分账和 UI 展示联动；废弃 `TourMembership#participating_day_ids`

---

## 背景

当前 Tour 成员粒度到 `TourMembership`（reader / editor），每个 membership 有个 `participating_day_ids` jsonb 列，意图是按"参与天数"分账。但：

- `participates_in_day?` / `participating_day_ids` 在整个代码库**没有任何消费者**（expense 分账靠 `participant_ids` 表单参数直传，见 [compute_splits.rb:14-19](../../../app/models/expense/compute_splits.rb))
- 实际使用场景更需要**按单个 activity 粒度**而不是按天：同一天里一部分人去景点、一部分人留宿点；同一天的门票费只应由去的人 AA

本次改造把"参与关系"从 day 级下沉到 activity 级，同时服务三类用途：

- **A. 分账精度**：activity-scope expense 默认按该 activity 的参与人分账
- **B. 小分队行程**：标记某活动只有部分成员参加，行程卡片可视化
- **C. 展示标签**：卡片上显示参与成员头像

---

## 1 · 决策汇总

| 决策点 | 选择 | 理由 |
|---|---|---|
| 数据模型 | **新建 `ActivityParticipant` 表**（activity_id, user_id）| 规范化，未来可挂字段；和 `TourMembership` 风格一致；候选方案 A（Activity 上 jsonb 列）无扩展空间、C（TourMembership ↔ Activity 反向）作者边界多 |
| 空集语义 | **默认全员参与** | 情侣/家庭游常态是"一起行动"，默认全员 + 减人比默认零人 + 每次勾全部顺手得多；与原 `participating_day_ids` 的"空=全程"约定同构 |
| 编辑入口 | **ActivityDrawer 新增"参与人" tab** | 和现有 basic/gallery/route 定位一致；不挤压核心表单；点击才加载 |
| 分账联动 | **预填 + 可覆盖**（activity-scope expense 首次选中 activity 时预填参与人，用户可改）| 把"分账精度"落实；保留用户"我去了但这顿没吃"的灵活覆盖 |
| Day 级处理 | **废弃 `participating_day_ids`**，同 PR 删列 + 删 UI + 删 spec | 零消费者，数据纯种 speculative；保留反而是语义冗余 |
| 权限 | 沿用 `tour.editable_by?`（author + editor） | activity 编辑边界已存在，不开新 policy |
| 候选人池 | `tour.author_id + tour.member_ids` | 任意 User 不合理；白名单由 controller 强制 |

---

## 2 · 数据模型

### 新表 `activity_participants`

```ruby
create_table :activity_participants do |t|
  t.references :activity, null: false, foreign_key: true, index: true
  t.references :user,     null: false, foreign_key: true, index: true
  t.timestamps
end
add_index :activity_participants, [:activity_id, :user_id], unique: true
```

索引动机：
- unique (activity_id, user_id) — 防止重复插入
- activity_id — 读 activity 时常规查询
- user_id — 反查"某人参与了哪些活动"（未来做"我的行程"页有用）

### `ActivityParticipant` 模型

```ruby
class ActivityParticipant < ApplicationRecord
  belongs_to :activity
  belongs_to :user

  validates :user_id, uniqueness: { scope: :activity_id }
  validate  :user_belongs_to_tour

  private
    def user_belongs_to_tour
      tour = activity&.tour
      return unless tour && user_id
      allowed = [ tour.author_id, *tour.tour_memberships.pluck(:user_id) ]
      errors.add(:user_id, "不属于本行程成员") unless allowed.include?(user_id)
    end
end
```

### `Activity` 扩充

```ruby
has_many :activity_participants, dependent: :destroy
has_many :participants, through: :activity_participants, source: :user

# 单源语义出口：空 = 全员（author + members）
def effective_participant_ids
  ids = activity_participants.pluck(:user_id)
  return ids if ids.any?
  [ tour.author_id, *tour.tour_memberships.pluck(:user_id) ]
end
```

### `User` 扩充

```ruby
has_many :activity_participants, dependent: :destroy
```

### `TourMembership` destroy 级联

成员从 tour 移出时，该 user 在本 tour 所有 activity 的 ActivityParticipant 行同步清理：

```ruby
# app/models/tour_membership.rb
after_destroy :cleanup_activity_participants

private
  def cleanup_activity_participants
    ActivityParticipant
      .joins(:activity)
      .where(user_id: user_id, activities: { tour_id: tour_id })
      .delete_all
  end
```

作者离队目前不支持，不处理。

### 废弃 `participating_day_ids`

同 migration：

```ruby
remove_column :tour_memberships, :participating_day_ids, :jsonb
```

连带删除：
- [tour_membership.rb:8](../../../app/models/tour_membership.rb:8) `participating_day_ids_belong_to_tour` 验证
- [tour_membership.rb:13-16](../../../app/models/tour_membership.rb:13) `participates_in_day?` 方法
- [tour_memberships_controller.rb:25-27](../../../app/controllers/tour_memberships_controller.rb:25) params 处理
- [tours_controller.rb:41](../../../app/controllers/tours_controller.rb:41) payload 字段
- [MembershipDrawer.jsx:117-160](../../../app/javascript/components/planner/MembershipDrawer.jsx:117) `ParticipatingDays` 子组件 + [:108-110](../../../app/javascript/components/planner/MembershipDrawer.jsx:108) 调用点
- [tour_membership_spec.rb:25-60](../../../spec/models/tour_membership_spec.rb:25) 相关 describe 块

零 expense 消费者、无生产数据回填需求。

---

## 3 · 后端 API

### 路由

```ruby
# config/routes.rb
resources :activities, only: [ :create, :update, :destroy ] do
  resource :participants, only: [ :update ], controller: :activity_participants
end
```

生成：`PUT /activities/:activity_id/participants`（单数 resource = collection-level replace）

### `ActivityParticipantsController`

```ruby
class ActivityParticipantsController < ApplicationController
  before_action :require_login
  before_action :set_activity
  before_action :require_editable

  def update
    ids = Array(params[:user_ids]).map(&:to_i).uniq
    ids &= candidate_user_ids  # 白名单过滤：非 tour 成员的 user_id 被静默丢弃

    ActivityParticipant.transaction do
      @activity.activity_participants.destroy_all
      ids.each { |uid| @activity.activity_participants.create!(user_id: uid) }
    end
    redirect_to @activity.tour
  end

  private
    def set_activity
      @activity = Activity.find(params[:activity_id])
    end

    def require_editable
      head(:forbidden) unless @activity.tour.editable_by?(current_user)
    end

    def candidate_user_ids
      tour = @activity.tour
      [ tour.author_id, *tour.tour_memberships.pluck(:user_id) ]
    end
end
```

设计决定：
- **整份替换而非 add/remove**：每次 toggle 发完整新数组，和现有 `participating_day_ids` 的交互同构（[MembershipDrawer.jsx:121-136](../../../app/javascript/components/planner/MembershipDrawer.jsx:121)）；避免"首次从全员过渡到子集时发 N-1 个 POST"的瀑布
- **空数组合法**：回到"默认全员"状态；controller 执行 destroy_all 后不插新行
- **白名单过滤用 `&=`**：伪造的 user_id 静默丢弃，不返回错误（保留前端简单的"一发了之"流）
- **`find_or_create_by!` 不用**：因为 destroy_all + 新插是整体 transactional replace，不需要行级幂等

### Tour/Show payload 扩充

[tours_controller.rb](../../../app/controllers/tours_controller.rb) 返回的每个 activity json 追加：

```ruby
participant_user_ids: activity.activity_participants.pluck(:user_id)
```

**不**预序列化 `effective_participant_ids`——前端看到 `[]` 自己应用"空=全员"约定；避免作者/成员变更后 payload 静态不同步。

---

## 4 · 前端 UI

### ActivityDrawer 新 tab "参与人"

[ActivityDrawer.jsx](../../../app/javascript/components/activity-editor/ActivityDrawer.jsx) tabs 由 `基本 / 图集 / 路线` 扩展为 `基本 / 图集 / 路线 / 参与人`。

Tab 内容结构：

```
[若 participant_user_ids == []]
  [info Alert] 默认全员参与。取消勾选某人即切换为"仅列出成员参与"模式。

候选人清单（tour.author + tour.members）:
  ☑ [avatar] 张三  作者
  ☑ [avatar] 李四
  ☑ [avatar] 王五
  ☐ [avatar] 赵六
```

交互规则：
- `isFullTrip = participant_user_ids.length === 0`
- `isFullTrip === true` → 所有 checkbox 视觉上勾选
- 第一次取消某人 → next 数组 = `[tour.author_id, ...members.map(m => m.user_id)].filter(id => id !== unchecked)`
- 继续 toggle → 常规集合增删
- 若 next 长度等于候选人池总数 → 转为 `[]`（回到"默认全员"闭环）
- 每次 toggle 立即发请求：

```js
router.put(`/activities/${activity.id}/participants`, { user_ids: next }, {
  preserveScroll: true,
  only: ['activities'],
})
```

`canEdit` prop 沿用 ActivityDrawer 既有逻辑（基于 `tour.editable_by?`）；`canEdit === false` 时所有 checkbox disabled，视觉保持可读。

`UserLabel` 组件复用 [planner/UserLabel](../../../app/javascript/components/planner/UserLabel.jsx)（作者加 isAuthor 徽标）。

### ActivityCard 展示层（use case C）

[ActivityCard.jsx](../../../app/javascript/components/planner/ActivityCard.jsx) 右下角：

- `isFullTrip === true` → 不显示任何头像（默认态视觉安静）
- `isFullTrip === false` → 叠放 3 个小头像 + "+N"（N = 显式成员数 - 3）溢出指示；点击打开 drawer 参与人 tab

使用 Mantine `<Avatar.Group>` + Tabler `IconUsers` fallback；不用 emoji（遵循 [前端图标规约](../../../CLAUDE.md)）。

### 复用工具函数

新增 `app/javascript/lib/effectiveParticipants.js`：

```js
export function effectiveParticipants(activity, { author, members }) {
  const ids = activity.participant_user_ids || []
  if (ids.length > 0) return ids
  return [author.user_id, ...members.map(m => m.user_id)]
}
```

ActivityDrawer 参与人 tab、ActivityCard 头像组、expense 表单预填**三处都读这一个函数**，避免"空=全员"逻辑漂移。

---

## 5 · 分账预填

**范围**：仅影响**创建/编辑 activity-scope expense** 的表单默认值；day-scope / tour-scope expense 行为不变。

**行为**：
1. 用户在 expense 表单选 scope=activity + 选中某个 activity
2. 表单调用 `effectiveParticipants(activity, { author, members })` 拿到预填 user_ids
3. 表单的"分账成员"多选 UI 初始化为该集合
4. 用户之后手动增减不会被 activity 变化反向覆盖（用 React effect dependency 锁定"首次选中 activity"触发点）

**不做**：
- 不追踪"expense 创建后 activity 参与人变了要不要回溯改 splits"——`ExpenseSplit` 行一旦生成就是独立真相
- day-scope / tour-scope expense 不读 activity 参与人
- 既有 expense 行不迁移、不重算

---

## 6 · 权限矩阵

更新 [MembershipDrawer.jsx:215](../../../app/javascript/components/planner/MembershipDrawer.jsx:215) `PermissionMatrix` 表格：

| 操作 | 作者 | 编辑者 | 只读 |
|---|---|---|---|
| 查看行程 | ✓ | ✓ | ✓ |
| 编辑 Activity / Day | ✓ | ✓ | ✗ |
| **改 Activity 参与人** | ✓ | ✓ | ✗ |
| 管理成员 | ✓ | ✗ | ✗ |
| 删除行程 | ✓ | ✗ | ✗ |

"改 Activity 参与人"是新行；其他行不变。

---

## 7 · 测试策略

### Ruby (RSpec)

- `spec/models/activity_participant_spec.rb`（新）
  - uniqueness (activity_id, user_id)
  - user 必须属于 tour.author 或 tour.members（传外人 invalid）
- `spec/models/activity_spec.rb`（扩充）
  - `effective_participant_ids` — 空回退全员；非空就是显式集合
- `spec/models/tour_membership_spec.rb`（改）
  - **删** lines 25-60（`participating_day_ids` / `participates_in_day?` 相关用例）
  - **加** destroy 回调：移除 membership 会清理该 user 在本 tour 所有 activity 的 ActivityParticipant 行
- `spec/requests/activity_participants_spec.rb`（新）
  - author PUT 成功
  - editor PUT 成功
  - reader PUT 返回 403
  - 非成员 user_id 被白名单过滤（即使伪造也不插入）
  - 空数组合法（回到"默认全员"）
  - Inertia 响应：带 `X-Inertia` 头 → redirect；json 分支留后续按需添加

### JS (Vitest)

- `ActivityDrawer.test.jsx`（扩充）
  - 新增"参与人" tab 渲染
  - 首次取消一人 → 发送"全员 minus 该人"的完整数组
  - 重新勾回全员 → 发送 `[]`
  - `canEdit=false` 时 checkbox 全部 disabled
- ActivityCard（扩充或新 snapshot）
  - 显式子集 → 头像组 + "+N" 溢出
  - 默认全员 → 不渲染头像组

### CI 本地校验（[CLAUDE.md#before-claiming-done](../../../CLAUDE.md)）

- `mise exec -- bundle exec rspec`
- `npm test`
- `bin/rubocop -f github`
- `bin/brakeman --no-pager`
- `npm audit`

### 交付前手动 E2E（必须，不可跳过）

在 CI 本地校验通过之后、宣布完成之前，自己驱动浏览器跑一遍完整路径（用 Playwright MCP / `preview_*` 工具），对每一步截图 / 网络日志为证：

1. author 身份打开 activity → 切 "参与人" tab → 默认全员状态（Alert + 全勾）
2. 取消一人 → ActivityCard 出现头像组 + "+N" 溢出
3. 勾回全员 → Alert 回来、卡片头像组消失
4. 新建 activity-scope expense 选中该 activity → 分账候选人预填 = 当前参与人
5. 切 editor 账号：重复 1-4，同样可改
6. 切 reader 账号：checkbox 全部 disabled、伪造 PUT 请求被后端拒（403）
7. 把某成员从 tour 移除 → 确认其在所有 activity 的参与记录也一并清理
8. MembershipDrawer 里原"参与的日期"区块已消失

---

## 8 · 不做的（显式 YAGNI）

- **ActivityParticipant 表只存 (activity_id, user_id)**，不加 role / note / 权重字段——将来有明确需求再迁移
- **不写 E2E 自动化**（Playwright CI 流程）——手动 E2E 已覆盖关键路径；自动化成本高于当前收益
- **不做批量 activity 参与人编辑**（比如"把这个人从 D1-D5 所有 activity 里移除"）——现有 UI 对单个 activity 操作已足够；如果出现高频需求再做
- **不追溯修正既有 expense 的 split**——`ExpenseSplit` 一旦生成就是历史真相
- **不做参与人关系的 AI 上下文同步**——AI Travel Assistant 目前读的是 tour 级元数据，activity 参与人信息与其无关
