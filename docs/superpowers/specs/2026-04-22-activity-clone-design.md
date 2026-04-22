# Activity 一键克隆 — Design

## Context / Why

用户在规划"住同一家酒店 → 出去玩 → 回酒店"的行程时，需要在时间线里建两张描述同一地点的卡（同名、同位置、同 kind、同公民等级），仅时间段不同。手工重建第二张意味着重复输入名字、搜索 POI、填 kind 和 citizen_level、可能还要重填 details——高频且无信息量。

功能目标：详情抽屉内一键克隆当前活动，新卡片紧跟源卡之后、复制除"开始时间"外的全部内容字段、不复制图片和历史账目。

## Decisions（已定）

| 维度 | 取舍 |
|---|---|
| **落位** | 同 day_id 内，`position = source.position + 1`；同 scope 中原本在源之后的兄弟全部 `position += 1`。候选池（`day_id IS NULL`）同样规则。 |
| **复制字段** | `name / kind / citizen_level / lat / lng / address / desc / planned_duration_min / details(deep_dup)`。保留默认/显式 participants。 |
| **清空字段** | `planned_start_at`（唯一清空项）。 |
| **不复制** | `activity_images` / `expenses` / `tour_budgets`。 |
| **名称** | 原样复制，不追加"（副本）"/序号。 |
| **入口** | `ActivityDetailDrawer` header 内，与 `[记一笔] [编辑]` 同一 Group，仅 `canEdit=true` 渲染。 |
| **触发成本** | 点卡片 → 抽屉打开 → 点克隆 = 2 次点击。 |
| **抽屉跳转** | 克隆后抽屉保留在源活动，不切换到新活动。 |
| **撤销** | `undoStack` 推入 "克隆 {name}" → undoFn = `DELETE /activities/:newId`。不回滚兄弟位移（只关心相对顺序）。 |
| **实现路径** | 后端新端点 `POST /activities/:id/clone`，复制逻辑封装在 `Activity#clone_for_same_day!` 模型方法。 |

## Architecture

### 改动清单

**后端（3 个文件）**

- `config/routes.rb` — 在 `resources :activities` 块内加 `post :clone, on: :member`
- `app/controllers/activities_controller.rb` — 新 action `#clone`，授权后委派给模型方法
- `app/models/activity.rb` — 新实例方法 `#clone_for_same_day!`

**前端（2 个文件）**

- `app/javascript/components/planner/ActivityDetailDrawer.jsx` — 在 `DetailHeaderSection` 的按钮 Group 内插入 `[克隆]` 按钮；组件顶层 props 新增 `onClone`
- `app/javascript/pages/Tour/Show.jsx` — 新回调 `handleCloneActivity`，镜像 `ActivityDrawer.jsx:162-190` 的 fetch + `router.reload` + undoStack 模式；作为 `onClone` 传入 drawer

**测试（3 个文件）**

- `spec/models/activity_spec.rb` — `#clone_for_same_day!` 的单元测试
- `spec/requests/activities_controller_spec.rb` — `POST /activities/:id/clone` 的 request spec
- `app/javascript/components/planner/__tests__/ActivityDetailDrawer.test.jsx` — 追加按钮渲染 + 回调测试

### Controller

```ruby
# ActivitiesController
def clone
  source = Activity.find(params[:id])
  head :forbidden and return unless source.tour.editable_by?(current_user)
  new_activity = source.clone_for_same_day!
  render json: { id: new_activity.id, position: new_activity.position }
end
```

不复用 `#create`：`create` 的语义是"从零建"，`clone` 的语义是"从源复制 + 位移兄弟"。合并两套流程会让 param 分支变脏。

### Model

```ruby
# Activity
def clone_for_same_day!
  transaction do
    # 1. 位移：同 tour、同 day_id、position 大于源的兄弟全部 +1
    tour.activities
        .where(day_id: day_id)
        .where("position > ?", position)
        .update_all("position = position + 1")

    # 2. 新建活动（planned_start_at 清空，details deep_dup）
    new_activity = tour.activities.create!(
      day_id: day_id,
      position: position + 1,
      name: name,
      kind: kind,
      citizen_level: citizen_level,
      lat: lat, lng: lng, address: address,
      desc: desc,
      planned_duration_min: planned_duration_min,
      planned_start_at: nil,
      details: details.deep_dup,
    )

    # 3. 复制 activity_participants 行（若源有显式列表）
    activity_participants.find_each do |ap|
      new_activity.activity_participants.create!(user_id: ap.user_id)
    end

    new_activity
  end
end
```

逻辑放模型层而非控制器：可直接单元测试，未来若在 UI 多处触发（AI 聊天建议 / 批量克隆等）可复用。

### 前端数据流

```
用户点 [克隆]
  └─ onClone(activity.id)（ActivityDetailDrawer → Show.jsx）
      └─ fetch POST /activities/:id/clone
          └─ 2xx：router.reload({ only: ['activities','violations'] })
          │    └─ Inertia 重拉 activities，新卡通过 props 出现在源卡右边
          │    └─ undoStack.push(label: "克隆 {name}", undoFn: fetch DELETE)
          └─ 非 2xx：notifications.show({message:"克隆失败", color:"red"})
```

Inertia props 回流后 DnD position 自动来自服务器返回值，前端不做乐观更新。

## Edge Cases

| 场景 | 处理 |
|---|---|
| Reader 绕过前端 POST | `tour.editable_by?` → `head :forbidden`。 |
| 源活动在候选池 | `day_id: nil` 依然被 `where(day_id: nil)` 正确匹配（Rails 翻译成 `IS NULL`）。候选池内克隆规则一致。 |
| 源活动已被别人删除 | `Activity.find` 抛 404 → 前端 toast `克隆失败`，抽屉保持打开。 |
| 并发克隆同一源 | 两个事务各自完成位移+insert。最坏结果 position 值不连续但相对顺序正确。当前用户量级不加锁。 |
| `details` 引用共享 | `deep_dup` 防御；即使不 `deep_dup` 也因 `create!` 落库为新行而不会共享——但 `deep_dup` 成本近零，作为显式意图保留。 |
| 源活动有 `activity_images` | **不复制**。新卡缩略图为空，与同名源卡天然视觉可分（天然消解同名歧义）。 |
| 源活动有 `expenses` | **不复制**。账目是历史记录，逻辑上不属于"活动模板"。 |
| 源活动默认全员（空 participants） | 新活动也空 → 继承默认全员语义。 |
| Validation 失败（理论上不会） | `create!` 抛 `RecordInvalid` → 500 → Sentry。不做降级，避免过度设计。 |
| `planned_duration_min` 是否清 | 保留。用户觉得不合适进编辑改；不多加"智能清空"让规则发散。 |

## Testing

### Model spec（`spec/models/activity_spec.rb`）

```
describe "#clone_for_same_day!"
  - 复制字段：name / kind / citizen_level / lat / lng / address / desc /
    planned_duration_min / details 与源相等
  - planned_start_at 被清空
  - day_id == 源 day_id
  - position == 源.position + 1
  - 位移：位于源之后、同 day 的兄弟 position 全部 +1
  - 位移不越界：其他 day 的活动 position 不变
  - 源在候选池（day_id: nil）时，克隆也在候选池、位移仅在候选池范围
  - 源有显式 activity_participants → 新活动继承同一份 user_ids
  - 源为默认全员（participants 空）→ 新活动也空
  - 不复制 activity_images：src.activity_images 非空时 new.activity_images.empty?
  - 不复制 expenses：src.expenses 非空时 new.expenses.empty?
  - details 是独立副本：new.details 修改后 src.details 不变
```

### Request spec（`spec/requests/activities_controller_spec.rb`）

```
describe "POST /activities/:id/clone"
  - editor：200，返回 JSON { id, position }；新活动持久化
  - reader：403
  - 未登录：302 → /login
  - 源不存在：404
  - 事务性：强制让 participants 复制失败 → 新活动不落库、兄弟 position 未 +1
```

### 前端 spec（`ActivityDetailDrawer.test.jsx` 追加）

```
- canEdit=true：[克隆] 按钮渲染；点击触发 onClone(activity.id)
- canEdit=false：[克隆] 不渲染
- 候选池源（day_id: null）：[克隆] 仍然渲染
  （与 [记一笔] 的候选池禁用不同——候选池也允许克隆）
```

### 不测的

- `Show.jsx` 的 fetch + reload + undoStack 联动：与 `ActivityDrawer.jsx:162-190` 的创建流程同一模式，已有测试覆盖，重复测等于加维护负担。
- 并发克隆：前述已接受"不加锁"的取舍，不写 flaky 并发测试。

### 本地校验（CLAUDE.md 要求）

```sh
mise exec -- bundle exec rspec spec/models/activity_spec.rb spec/requests/activities_controller_spec.rb
npm test -- app/javascript/components/planner/__tests__/ActivityDetailDrawer.test.jsx
bin/rubocop -f github
bin/brakeman --no-pager
```

## Non-goals

- AI 聊天建议"克隆这一天作为第 N 天" —— 不在本次范围。
- 批量克隆（一次克隆多张卡）—— YAGNI，未有用户场景。
- 跨 tour 克隆 —— 场景极少，且跨 tour 涉及权限 / participants 语义完全不同，独立项目对待。
- 克隆后自动切抽屉到新卡 —— 未有证据表明用户需要；观察一段时间再决定。
- 克隆时弹 confirm 对话框 —— undo 已足够兜底，confirm 会拖慢高频路径。
