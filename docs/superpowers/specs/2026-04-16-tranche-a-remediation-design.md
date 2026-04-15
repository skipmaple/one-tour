# Tranche A Remediation — Tour / Day / Activity Remodel 验收补齐

**Status**: Design approved 2026-04-16 · awaiting implementation plan
**Source**: PM 验收报告 of 2026-04-16 against `2026-04-15-tour-day-activity-remodel-wireframes.html`
**Scope**: 解决 3 件 Critical 阻塞项（Screen 6 · Screen 9 · Screen 10）

---

## 背景

回归验收发现 12 个 wireframe 屏幕中只有 ~35% 完整实现。3 个 Critical 阻塞项即使 MVP 也必须修：

| 阻塞 | 原因 |
|---|---|
| Screen 6 · Activity 编辑面板 完全缺失 | 用户无 UI 修改 activity 任一字段，规划不可用 |
| Screen 9 · 宪法违反闭环 (banner 之外全空) | 无法承认硬违反、看不到已承认列表、不能撤销 |
| Screen 10 · Membership UI 完全缺失 | 多人协作这条产品卖点不可达 (GET /tours/:id/members 现 500) |

这份 spec 把这三件做成一个综合修复，共享一次实施计划。打磨/polish/Tranche B (年表、拖拽可靠性、Planner UX) 不在此 spec 范围。

---

## 1 · Activity 编辑面板 (Screen 6)

### 1.1 容器与入口

- **容器**: Mantine `<Drawer>`，从右侧滑入，宽 `420px`，`overlayProps={{ opacity: 0.4 }}`，`padding="md"`。
- **触发方式**:
  - 点击 `ActivityCard` 本体 → 打开 drawer (mode=`edit`, activityId=当前)
  - 点击 Backlog 顶部 `+ 加一个` → (mode=`create`, targetDayId=`null`)
  - 点击 Day column 顶部 `+ 加一个` → (mode=`create`, targetDayId=day.id)
- **拖拽分离**: `ActivityCard` 左侧加一个 `⋮⋮` grab handle icon (`IconGripVertical`, 16×16)。@dnd-kit 的 `useDraggable` 改用 `activatorNodeRef` 只在 handle 激活。卡片其余区域的 click 走 edit。
- **关闭**: 右上 X 按钮；点 overlay；Esc 键。关闭时若 form dirty，Mantine `modals.openConfirmModal` 二次确认"放弃未保存的修改？"。

### 1.2 表单字段顺序与组件

```
┌─ name ─────────────────────── [textinput, required, maxLength 80] ┐
├─ kind ─ [select] · citizen_level ─ [radio group] ─────────────── ┤
├─ 坐标                                                             ┤
│    纬度 [number] 经度 [number]  [🔍 搜索地点]                    │
├─ 时间                                                             ┤
│    开始 [HH:MM input] · 时长 [number] 分钟                       │
├─ 描述 ─ [textarea, minRows=2, maxRows=4]                          ┤
├─ 贴士 ─ [textarea, minRows=1, maxRows=3]                          ┤
├─ ── 类型细节（按 kind 动态） ─────────────────────────────────   ┤
│   (render from KIND_SCHEMA[kind])                                │
├─ ── 底栏 ────────────────────────────────────────────────────   ┤
│   [保存]  [取消]           [移回 Backlog]   [删除 (红)]           ┘
```

- 底栏：主操作（保存/取消）靠左；次要操作（移回 Backlog / 删除）靠右。"删除"按钮仅 edit 模式出现。
- `kind` 改变时：`details` 当前输入保留（不清空），但渲染按新 schema；其他 kind 独有的字段值保留在 state 但不可见（保存时一并写入 details jsonb，用户切回旧 kind 能看到）。

### 1.3 `detailsSchema.js`

```js
// app/javascript/components/activity-editor/detailsSchema.js
// 单一数据源。新增 kind 或字段改这里。字段 type ∈ text|number|checkbox|select。
// select 需要提供 options。组件渲染用 CommonFields 内的迭代器。
export const KIND_SCHEMA = {
  scenic: [
    { key: 'best_light',       label: '最佳光线',       type: 'text' },
    { key: 'altitude',         label: '海拔 (米)',     type: 'number' },
    { key: 'need_reservation', label: '需要预约',       type: 'checkbox' },
    { key: 'ticket_info',      label: '门票',          type: 'text' },
    { key: 'recommend_stay_min', label: '建议停留 (分钟)', type: 'number' },
  ],
  road: [
    { key: 'from_name', label: '起点',     type: 'text' },
    { key: 'to_name',   label: '终点',     type: 'text' },
    { key: 'km',        label: '里程 (km)', type: 'number' },
    { key: 'drive_min', label: '驾驶时长 (分钟)', type: 'number' },
    { key: 'road_type', label: '路型',     type: 'select',
      options: ['高速', '国道', '省道', '山路', '城市'] },
    { key: 'day_only',  label: '仅白天通行', type: 'checkbox' },
  ],
  food: [
    { key: 'cuisine',    label: '菜系',      type: 'text' },
    { key: 'must_eat',   label: '必吃',      type: 'text' },
    { key: 'open_hours', label: '营业时间',   type: 'text' },
    { key: 'price_pp',   label: '人均 (元)',  type: 'number' },
  ],
  stay: [
    { key: 'sanitation',       label: '卫生等级', type: 'select',
      options: ['基础', '标准', '豪华'] },
    { key: 'price_pp',         label: '人均 (元)', type: 'number' },
    { key: 'has_private_bath', label: '独立卫浴', type: 'checkbox' },
  ],
  fuel: [
    { key: 'brand',           label: '品牌',      type: 'text' },
    { key: 'h24',             label: '24 小时',   type: 'checkbox' },
    { key: 'next_station_km', label: '到下加油站 (km)', type: 'number' },
  ],
  other: [],
}
```

**不做的** (YAGNI)：`stop_points[]` / `limit_speed` / `amenities[]` 数组字段暂无 UI 录入控件；若 AI 写入 details 仍然保留（前端不显示数组字段）。

### 1.4 POI 搜索端点

- **路由**: `get '/poi_search', to: 'poi_searches#index'` (单数 endpoint，无 :id)
- **Controller**: `app/controllers/poi_searches_controller.rb`
  - `before_action :require_login`
  - 参数 `q` (必填, 1-80 char), `region_hint` (可选), `near_lat`/`near_lng` (可选, float)
  - 调现有 `PoiSearch.new.search(...)` service
  - 返 JSON: `{ candidates: [{name, lat, lng, address, type}, ...] }`
  - Rate limit: 60 req/min/user，超出返 429（借助 `Rack::Attack` 或手写基于 `Rails.cache.increment` 的 throttle，见 1.7）
- **前端**: `PoiSearchCombobox.jsx` 用 Mantine `Combobox` + 300ms debounce + loading 态
  - 选中某候选 → 回调 `onPick({name, lat, lng})`，drawer 父组件把这三字段填进 form state
  - 候选显示格式：`{name}  ·  {address}  ·  {type}`（type 截断显示）

### 1.5 Create / Edit 路径

| 动作 | HTTP | 端点 | 备注 |
|---|---|---|---|
| Create in backlog | POST | `/tours/:id/backlog_activities` | 现有 |
| Create in day | POST | `/tours/:id/days/:day_id/activities` | 现有 |
| Edit | PATCH | `/activities/:id` | 现有 |
| Delete | DELETE | `/activities/:id` | 现有 |
| Move to backlog | PATCH | `/activities/:id/position` body `{to_day_id: null, to_position: 1}` | 现有 |

全走 Inertia `router.*`，`onSuccess` 关 drawer + partial reload `['activities']`。

### 1.6 文件清单

**新建**:
- `app/javascript/components/activity-editor/ActivityDrawer.jsx`
- `app/javascript/components/activity-editor/detailsSchema.js`
- `app/javascript/components/activity-editor/CommonFields.jsx`
- `app/javascript/components/activity-editor/DetailsFields.jsx`
- `app/javascript/components/activity-editor/PoiSearchCombobox.jsx`
- `app/controllers/poi_searches_controller.rb`
- `spec/requests/poi_searches_spec.rb`
- `app/javascript/components/activity-editor/__tests__/ActivityDrawer.test.jsx`

**修改**:
- `app/javascript/components/planner/ActivityCard.jsx` — 加 grab handle，改 useDraggable 使用 `activatorNodeRef`
- `app/javascript/components/planner/BacklogList.jsx` — header 加 `+ 加一个` button
- `app/javascript/components/planner/DayColumn.jsx` — header 加 `+ 加一个` button
- `app/javascript/pages/Tour/Show.jsx` — state `editor = { open, mode, activityId|null, targetDayId|null }`，渲染 `<ActivityDrawer>`
- `config/routes.rb` — 加 `get '/poi_search', ...`
- `app/javascript/components/planner/__tests__/ActivityCard.test.jsx` — 更新拖拽/点击行为测试

### 1.7 Rate limit 细节

最简实现（不引入 Rack::Attack）：
```ruby
class PoiSearchesController < ApplicationController
  LIMIT  = 60          # 请求
  WINDOW = 60.seconds  # 每

  before_action :require_login
  before_action :throttle!

  def index
    result = PoiSearch.new.search(params[:q], region_hint: params[:region_hint],
                                  near_lat: params[:near_lat], near_lng: params[:near_lng])
    render json: { candidates: result }
  rescue PoiSearch::Error => e
    render json: { error: e.message }, status: :bad_gateway
  end

  private
    def throttle!
      key = "poi_search:#{current_user.id}:#{(Time.current.to_i / WINDOW).floor}"
      count = Rails.cache.increment(key, 1, expires_in: WINDOW)
      head :too_many_requests if count && count > LIMIT
    end
end
```

---

## 2 · 宪法违反闭环 (Screen 9)

### 2.1 banner 按钮连线

`Show.jsx` 把三个 handler 传给 `<ConstitutionBanner>`：

```jsx
const [acknowledgingViolation, setAcknowledgingViolation] = useState(null)
const chatPanelRef = useRef(null)

<ConstitutionBanner
  violations={violations}
  onFix={(v) => {
    chatPanelRef.current?.expand?.()
    chatPanelRef.current?.send?.(fixPromptFor(v))
  }}
  onAcknowledge={(v) => setAcknowledgingViolation(v)}
  onDismiss={() => {}}
/>

<AcknowledgeModal
  violation={acknowledgingViolation}
  onClose={() => setAcknowledgingViolation(null)}
/>
```

`fixPromptFor(v)` 生成中文预设 prompt，例如：
> 请分析 D3 驾驶超 7h 的硬违反，给我 3 个修正方案，每个说明原因、对其他日的影响，以及整程天数/体验是否变化。

`ChatPanel` 需要向外暴露 `expand()` + `send()` 两个方法（用 `useImperativeHandle` + `forwardRef`）。

### 2.2 `AcknowledgeModal.jsx`

- Mantine `Modal`, size "md", title "承认此违反后"
- Body 构成：
  - 红色 Alert：`永久静音 《{rule}》 · 范围 {scope}`
  - 说明段：`若后续你把 D3 的 activity 改到别天（仍超时）或改了宪法，需手动撤销。撤销路径：宪法页 → 已承认列表 → 撤销`
  - `Textarea` label `承认原因 *` placeholder `例如：独库公路是本程核心，无法压缩；同行人员已确认`
  - 计数 `{reason.length} / 10 字 {✓|×}` (颜色：≥10 绿，<10 红)
- Footer：`取消` / `我确认承认`（红色边框，`disabled={reason.trim().length < 10}`）
- 提交：
  ```js
  router.post(`/tours/${tourId}/overrides`,
    { rule: violation.rule, scope: violation.scope, reason },
    { only: ['violations'], preserveState: true,
      onSuccess: () => { onClose(); showSuccessToast('已静音') } })
  ```

### 2.3 `ConstraintOverridesController`

**路由** (`routes.rb`):
```ruby
resources :tours, except: [:new, :edit] do
  # ... 已有 ...
  resource :overrides, only: [:create, :destroy], controller: :constraint_overrides
end
```

**Controller** (`app/controllers/constraint_overrides_controller.rb`):
```ruby
class ConstraintOverridesController < ApplicationController
  before_action :require_login
  before_action :set_tour

  def create
    head :forbidden and return unless @tour.editable_by?(current_user)
    @tour.record_override!(
      rule:   params.require(:rule),
      scope:  params.fetch(:scope, {}).to_unsafe_h,
      reason: params.require(:reason)
    )
    redirect_to tour_path(@tour)
  end

  def destroy
    head :forbidden and return unless @tour.editable_by?(current_user)
    @tour.revoke_override!(
      rule:  params.require(:rule),
      scope: params.fetch(:scope, {}).to_unsafe_h
    )
    redirect_to tour_path(@tour)
  end

  private
    def set_tour
      @tour = Tour.find_by(id: params[:tour_id])
      head :not_found and return unless @tour
    end
end
```

### 2.4 Tour model concern — overrides API

抽 `Tour#record_override!` / `#revoke_override!` 到 model (不起 concern，directly on Tour)：

```ruby
# in app/models/tour.rb
def record_override!(rule:, scope:, reason:)
  new_entry = {
    "rule" => rule.to_s,
    "scope" => (scope || {}).stringify_keys,
    "reason" => reason.to_s,
    "acknowledged_at" => Time.current.iso8601
  }
  filtered = Array(constraint_overrides).reject do |o|
    o["rule"].to_s == new_entry["rule"] &&
      (o["scope"] || {}).stringify_keys == new_entry["scope"]
  end
  update!(constraint_overrides: filtered + [ new_entry ])
end

def revoke_override!(rule:, scope:)
  target_scope = (scope || {}).stringify_keys
  filtered = Array(constraint_overrides).reject do |o|
    o["rule"].to_s == rule.to_s &&
      (o["scope"] || {}).stringify_keys == target_scope
  end
  update!(constraint_overrides: filtered)
end
```

`AITools::AcknowledgeViolation#execute` 改成只调 `@tour.record_override!(...)`，删自己复制的那段 filter logic。

### 2.5 Constitution 页"已承认的违反"卡片

**位置**：Constitution 页底部（`app/javascript/pages/Tour/Constitution.jsx`），在"恢复默认/返回"按钮行之后加一段。

**数据**：Inertia props 目前有 `tour` / `constitution` / `defaults`。加 `overrides: @tour.constraint_overrides` 到 `Tours::ConstitutionsController#show` 的 render props。

**UI**：只在 `overrides.length > 0` 时渲染整块。

```
─ 已承认的违反 (N) ──────────────────────
| 规则 | 范围 | 理由 | 承认于 | |
| max_daily_driving_minutes | D3 | 独库必走 + 无替代方案 | 4/14 15:32 | [撤销] |
```

撤销动作：`router.delete(`/tours/${tour.id}/overrides`, { data: { rule, scope }, onSuccess: reload })`

### 2.6 文件清单（Violation 部分）

**新建**:
- `app/controllers/constraint_overrides_controller.rb`
- `app/javascript/components/planner/AcknowledgeModal.jsx`
- `spec/requests/constraint_overrides_spec.rb`
- `app/javascript/components/planner/__tests__/AcknowledgeModal.test.jsx`

**修改**:
- `app/models/tour.rb` — 加 `record_override!` / `revoke_override!`
- `app/ai_tools/acknowledge_violation.rb` — 改用 `@tour.record_override!`
- `spec/ai_tools/acknowledge_violation_spec.rb` — 无需大改（行为不变），补一条"和 controller 等效"的 cross-test
- `spec/models/tour_spec.rb` — 加 model method specs
- `config/routes.rb` — 加 `resource :overrides`
- `app/controllers/tours/constitutions_controller.rb` — props 加 `overrides`
- `app/javascript/pages/Tour/Constitution.jsx` — 底部加"已承认列表" + 撤销
- `app/javascript/pages/Tour/Show.jsx` — state + 给 `<ConstitutionBanner>` 传 3 个 handler + 渲染 `<AcknowledgeModal>`
- `app/javascript/components/planner/ChatPanel.jsx` — `forwardRef` + `useImperativeHandle` 暴露 `expand()` / `send()`

---

## 3 · Membership UI (Screen 10)

### 3.1 入口

Planner header 现在只有 "路书" logo 和 Avatar。加一个 `👥` 图标按钮（Mantine `ActionIcon` + `IconUsers`），位置在 Avatar 左侧。

**可见性**：仅 `tour.editable_by?(current_user)` 为真时显示该图标（reader 不显）。

### 3.2 `MembershipDrawer.jsx`

- Mantine `<Drawer>`, 宽 `420px`, 右侧滑入，title "本程成员"
- 三节内容（Stack 间距 md）：

**当前成员 section**：
- 对于每个 membership (含 author)：
  ```
  📧 email                [author | editor/reader select]     [移除]
  ```
- `author` 行：角色 Badge 静态，无移除按钮，灰标 "作者不可移除"
- 非作者行：role Mantine `Select`，选中即触发 `router.patch(tour_member_path(tour, m), { role: newRole }, {...})`
- 移除按钮：Mantine `modals.openConfirmModal` 二次确认"将 {email} 移出本程？"

**邀请新成员 section**：
- `TextInput` email + `Select` role (editor/reader) + `Button 邀请`
- Submit → `router.post(tour_members_path(tour), { email, role }, {...})`
- `onError`（404 email not found）→ Mantine Notification "该邮箱还没注册路书账号，请让对方先注册"
- 仅作者可见；editor 看到这一节置灰 + 提示 "仅作者可改成员"

**权限矩阵 section** (可折叠 Accordion, 默认收起)：
- 静态表格 4 行 × 3 列，从 spec 抄写

### 3.3 数据流

- `ToursController#show` 添加 props:
  ```ruby
  members: @tour.tour_memberships.includes(:user).map { |m|
    { id: m.id, user_id: m.user_id, email: m.user.email, role: m.role, is_author: false }
  } + [ { id: nil, user_id: @tour.author_id, email: @tour.author.email, role: 'author', is_author: true } ]
  ```
- 所有 CRUD 走现有端点。`router.reload({ only: ['members'] })` 在每个操作 onSuccess。
- 不新建 `TourMembershipsController#index`（避免额外路由 + JSON API 分支）。

### 3.4 文件清单（Membership 部分）

**新建**:
- `app/javascript/components/planner/MembershipDrawer.jsx`
- `app/javascript/components/planner/__tests__/MembershipDrawer.test.jsx`

**修改**:
- `app/javascript/layouts/AppLayout.jsx` — 不改（入口不放 AppLayout）
- `app/javascript/pages/Tour/Show.jsx` — state 加 `membersDrawerOpen`，头部加 `👥` ActionIcon（仅 editable_by 显），渲染 `<MembershipDrawer>`
- `app/controllers/tours_controller.rb` — `show` props 加 `members: ...`
- `spec/requests/tours_spec.rb` — 补一条"show inertia props 包含 members"

### 3.5 权限行为一览表

| 当前用户 | 👥 图标 | 看成员列表 | 改角色 | 移除 | 邀请 |
|---|---|---|---|---|---|
| author | ✓ | ✓ | ✓ | ✓ | ✓ |
| editor | ✓ | ✓ | ✗ (disabled) | ✗ (hidden) | ✗ (disabled) |
| reader | ✗ | — | — | — | — |

---

## 4 · 共用约束 / 边界

- 所有新 controller 动作必须 `require_login`，并在 editable_by? / owned_by? 边界做授权检查；模型级 spec 覆盖越权用例。
- 所有新表单的 button 全部 Mantine `Button`，样式跟现有一致（无新颜色）。
- 不引入新 npm 依赖（已有 @mantine/core 9, @dnd-kit/core, @inertiajs/react 都够）。
- 不引入新 Ruby gem。
- `Rails.cache` 做 rate limit 即可，dev 用 `:memory_store`；生产 kamal 已用 Solid 栈自带。
- **Testing 原则**：每个新 controller 至少 3 条 request spec（happy / forbidden / 404）；每个新 React 组件 ≥ 3 条 vitest（渲染 + 主交互 + 边界）。
- **Reader 模式一致性**：`tour.editable_by?(current_user)` 为 false 的用户（reader + 非成员路径已被 show 层拦截，所以只剩 reader）在 Planner 上：
  - `👥` 成员图标不显（已在 3.1 说）
  - Backlog / DayColumn 的 `+ 加一个` 按钮不显
  - ActivityCard 点击 **不** 打开 drawer（改成静态展示；可以加 tooltip "只读"）
  - ConstitutionBanner 的 "承认" / "帮我修正" 按钮不显（只保留 "知道了" 本地 dismiss）
  - MembershipDrawer 如果从 URL 强进也应该判权限 —— 不过入口已封，兜底 OK。
- **不做的**：邀请邮件；"帮我修正"独立子屏；移动端响应式；键盘快捷键；soft-delete activity；stop_points[] / amenities[] 数组录入。

---

## 5 · 数字预估

| 新增 | 修改 |
|---|---|
| 5 JSX 组件 + 3 .test.jsx | 6 JSX 修改 |
| 2 Ruby controller + 2 request_spec | 4 Ruby 修改 (routes, tour model, tours/constitutions_controller, acknowledge_violation tool) |
| 1 JS schema config | — |
| **总**: ~13 new files | ~10 modified files |

RSpec 预期 +9 examples (PoiSearches×3, ConstraintOverrides×3, Tour model overrides×2, tours_spec members×1)。Vitest 预期 +12 (ActivityDrawer×5, AcknowledgeModal×3, MembershipDrawer×4)。

---

## 6 · 交付顺序建议（实施计划阶段细化）

为了让 review 能按块进行，建议这个顺序：

1. **Tour model + concern refactor** (record_override! / revoke_override!) + `acknowledge_violation` 迁移
2. **POI 搜索端点**（独立，容易审）
3. **ConstraintOverridesController** + routes + specs
4. **ActivityCard grab-handle 改造** + dnd-kit `activatorNodeRef` + 点击入口（纯重构）
5. **Activity 编辑 Drawer**（最大块，内部分 CommonFields / DetailsFields / PoiSearchCombobox 三个子组件）
6. **AcknowledgeModal + banner handler 连线 + ChatPanel forwardRef**
7. **Constitution 页"已承认的违反"卡片**
8. **Tour/Show props 加 members**
9. **MembershipDrawer + header 入口**
10. Overall Rspec/Vitest/rubocop pass

每一步 commit 一条，便于回滚。

---

## 附：已知后续（**不**在本 spec）

- Tranche B: 全程年表、拖拽可靠性、Planner UX 打磨（backlog 筛选/meta、day header 元数据、drop preview）
- Tranche C: AI 多轮 onboarding、Backlog 空态双 CTA、自动建 D1、小 polish
- "帮我修正" 独立子屏 + `AITools::SuggestFixes`（本 spec 走 chat-prompt 路径）
- 邀请邮件（本 spec 要求被邀请人已注册）
- AMAP JS SDK 前端集成（仍沿用 placeholder）
