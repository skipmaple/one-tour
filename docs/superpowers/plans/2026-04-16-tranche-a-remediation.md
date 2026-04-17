# Tranche A 补齐 — 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 修复 3 件 Critical 阻塞项（Activity 编辑面板 · 宪法违反闭环 · Membership UI），使 Planner 达到 MVP 可用。

**Architecture:** Activity Drawer 从右侧滑入，`detailsSchema.js` 驱动 kind-specific 字段。宪法违反走 `Tour#record_override!` 统一入口（UI + AI tool 共用）。Membership 复用已有 `TourMembershipsController`，数据通过 Inertia show props 下发。POI 搜索用新 `PoiSearchesController` + 手写 cache-based throttle。

**Tech Stack:** Rails 8.0, Inertia Rails, React, Mantine 9, @dnd-kit/core, RSpec, Vitest, WebMock

**参考 spec:** `docs/superpowers/specs/2026-04-16-tranche-a-remediation-design.md`

---

## 执行约定

- **TDD 严格：** 每个有行为的 task 按 "先写测试 → 验证失败 → 实现 → 验证通过 → commit" 节奏。
- **常用命令：**
  - Ruby 测试：`mise exec -- bundle exec rspec <path>`
  - 整个 RSpec：`mise exec -- bundle exec rspec`
  - Rubocop：`bin/rubocop -f github`
  - Brakeman：`bin/brakeman --no-pager`
  - JS 测试：`npm test`
  - JS 单文件：`npx vitest run <path>`
- **commit 规范：** 参考 repo 现有风格（短 subject + 可选 body）；不要 `--amend`，失败后新 commit。

---

## 路线图

| Task | 主题 | 结束后能做什么 |
|---|---|---|
| 1 | Tour model override 方法 + AI tool 迁移 | `record_override!` / `revoke_override!` 全绿；AI tool 保持行为一致 |
| 2 | POI 搜索端点 + throttle | `GET /poi_search?q=赛里木湖` 返回 AMAP 候选，60/min 限速 |
| 3 | ConstraintOverridesController | `POST/DELETE /tours/:id/overrides` 全绿 |
| 4 | ActivityCard grab-handle | 拖拽只在 handle 激活，卡片 body 可点击 |
| 5 | Activity 编辑 Drawer（最大块） | 右侧 Drawer 可建/编辑 activity，含 POI 搜索 |
| 6 | AcknowledgeModal + banner 连线 + ChatPanel pendingPrompt | 硬违反可承认、可发 AI 修正 prompt |
| 7 | Constitution 页"已承认列表" | 已承认的 override 可查看、可撤销 |
| 8 | MembershipDrawer + header 入口 | 成员管理可用（邀请/改角色/移除） |
| 9 | 最终验证 | RSpec + Vitest + RuboCop + Brakeman 全绿 |

---

## Task 1: Tour model override 方法 + AI tool 迁移

**Files:**
- Modify: `app/models/tour.rb`
- Modify: `spec/models/tour_spec.rb`
- Modify: `app/ai_tools/acknowledge_violation.rb`
- Modify: `spec/ai_tools/acknowledge_violation_spec.rb`

这是硬前置依赖：Task 3（ConstraintOverridesController）和 Task 6（AcknowledgeModal）都调这些方法。

- [ ] **Step 1: Write failing specs for `record_override!`**

在 `spec/models/tour_spec.rb` 末尾（`end` 之前）追加：

```ruby
describe "#record_override!" do
  let(:tour) { create(:tour) }

  it "appends an override entry with normalized scope and timestamp" do
    tour.record_override!(rule: "max_daily_driving_minutes", scope: { "day_id" => 7 }, reason: "独库必走")
    expect(tour.reload.constraint_overrides.size).to eq(1)
    entry = tour.constraint_overrides.first
    expect(entry["rule"]).to eq("max_daily_driving_minutes")
    expect(entry["scope"]).to eq({ "day_id" => 7 })
    expect(entry["reason"]).to eq("独库必走")
    expect(entry["acknowledged_at"]).to be_present
  end

  it "dedupes by (rule, scope): second call replaces first" do
    tour.record_override!(rule: "r", scope: { "day_id" => 1 }, reason: "first")
    tour.record_override!(rule: "r", scope: { "day_id" => 1 }, reason: "second")
    overrides = tour.reload.constraint_overrides
    expect(overrides.size).to eq(1)
    expect(overrides.first["reason"]).to eq("second")
  end

  it "keeps separate entries when scope differs" do
    tour.record_override!(rule: "r", scope: { "day_id" => 1 }, reason: "a")
    tour.record_override!(rule: "r", scope: { "day_id" => 2 }, reason: "b")
    expect(tour.reload.constraint_overrides.size).to eq(2)
  end

  it "normalizes scope: strips unknown keys, stringifies" do
    tour.record_override!(rule: "r", scope: { day_id: 3, junk: "x" }, reason: "ok")
    expect(tour.reload.constraint_overrides.first["scope"]).to eq({ "day_id" => 3 })
  end
end

describe "#revoke_override!" do
  let(:tour) { create(:tour) }

  it "removes the matching override by (rule, scope)" do
    tour.record_override!(rule: "r", scope: { "day_id" => 1 }, reason: "a")
    tour.record_override!(rule: "r", scope: { "day_id" => 2 }, reason: "b")
    tour.revoke_override!(rule: "r", scope: { "day_id" => 1 })
    overrides = tour.reload.constraint_overrides
    expect(overrides.size).to eq(1)
    expect(overrides.first["scope"]).to eq({ "day_id" => 2 })
  end

  it "is a no-op when no match exists" do
    tour.record_override!(rule: "r", scope: {}, reason: "a")
    tour.revoke_override!(rule: "other", scope: {})
    expect(tour.reload.constraint_overrides.size).to eq(1)
  end
end
```

- [ ] **Step 2: Run specs to verify they fail**

Run: `mise exec -- bundle exec rspec spec/models/tour_spec.rb -e "record_override\|revoke_override" --format documentation`

Expected: FAIL — `NoMethodError: undefined method 'record_override!'`

- [ ] **Step 3: Implement `record_override!`, `revoke_override!`, `normalize_scope` on Tour**

In `app/models/tour.rb`, add these public methods after `buffer_days_count` (before the `private` keyword):

```ruby
def record_override!(rule:, scope:, reason:)
  with_lock do
    norm_scope = normalize_scope(scope)
    new_entry = {
      "rule"            => rule.to_s,
      "scope"           => norm_scope,
      "reason"          => reason.to_s,
      "acknowledged_at" => Time.current.iso8601
    }
    filtered = Array(constraint_overrides).reject do |o|
      o["rule"].to_s == new_entry["rule"] &&
        normalize_scope(o["scope"]) == norm_scope
    end
    update!(constraint_overrides: filtered + [ new_entry ])
  end
end

def revoke_override!(rule:, scope:)
  with_lock do
    norm_scope = normalize_scope(scope)
    filtered = Array(constraint_overrides).reject do |o|
      o["rule"].to_s == rule.to_s &&
        normalize_scope(o["scope"]) == norm_scope
    end
    update!(constraint_overrides: filtered)
  end
end
```

And add `normalize_scope` to the `private` section (after `member?`):

```ruby
def normalize_scope(raw)
  (raw || {}).stringify_keys.slice("day_id", "activity_id")
end
```

- [ ] **Step 4: Run specs to verify they pass**

Run: `mise exec -- bundle exec rspec spec/models/tour_spec.rb -e "record_override\|revoke_override" --format documentation`

Expected: all PASS

- [ ] **Step 5: Migrate `AcknowledgeViolation` to use `Tour#record_override!`**

Replace the entire `execute` method body in `app/ai_tools/acknowledge_violation.rb`:

```ruby
def execute(rule:, reason:, scope: {})
  with_rescues do
    next require_tour! if @tour.nil?

    @tour.record_override!(rule: rule, scope: scope || {}, reason: reason)
    ok(overrides_count: @tour.constraint_overrides.size)
  end
end
```

- [ ] **Step 6: Run existing AI tool specs to confirm behavior preserved**

Run: `mise exec -- bundle exec rspec spec/ai_tools/acknowledge_violation_spec.rb --format documentation`

Expected: all 5 existing examples PASS

- [ ] **Step 7: Commit**

```bash
git add app/models/tour.rb spec/models/tour_spec.rb app/ai_tools/acknowledge_violation.rb
git commit -m "model: Tour#record_override! / revoke_override! + AI tool migration"
```

---

## Task 2: POI 搜索端点 + throttle

**Files:**
- Create: `app/controllers/poi_searches_controller.rb`
- Create: `spec/requests/poi_searches_spec.rb`
- Modify: `config/routes.rb`

- [ ] **Step 1: Add route**

In `config/routes.rb`, add after the `resources :activities` block (around line 30, before `get "/login"`):

```ruby
get "/poi_search", to: "poi_searches#index"
```

- [ ] **Step 2: Write request specs**

Create `spec/requests/poi_searches_spec.rb`:

```ruby
require "rails_helper"

RSpec.describe "POI Search", type: :request do
  def login_as(user)
    post "/login_test", params: { user_id: user.id }
  end

  let(:user) { create(:user) }

  let(:amap_success_body) do
    {
      status: "1",
      pois: [
        { name: "赛里木湖", location: "81.0,44.6", address: "博州", type: "风景名胜" }
      ]
    }.to_json
  end

  before do
    stub_request(:get, /restapi\.amap\.com/).to_return(status: 200, body: amap_success_body)
  end

  describe "GET /poi_search" do
    it "returns candidates for a valid query" do
      login_as(user)
      get "/poi_search", params: { q: "赛里木湖" }
      expect(response).to have_http_status(:ok)
      body = JSON.parse(response.body)
      expect(body["candidates"].size).to eq(1)
      expect(body["candidates"].first["name"]).to eq("赛里木湖")
      expect(body["candidates"].first["lat"]).to eq(44.6)
      expect(body["candidates"].first["lng"]).to eq(81.0)
    end

    it "requires login" do
      get "/poi_search", params: { q: "test" }
      expect(response).to redirect_to("/login")
    end

    it "returns 400 when q is missing" do
      login_as(user)
      get "/poi_search"
      expect(response).to have_http_status(:bad_request)
    end

    it "returns 400 when q is too long" do
      login_as(user)
      get "/poi_search", params: { q: "a" * 81 }
      expect(response).to have_http_status(:bad_request)
    end

    it "returns 502 when AMAP errors" do
      stub_request(:get, /restapi\.amap\.com/).to_return(
        status: 200, body: { status: "0", info: "INVALID_USER_KEY" }.to_json
      )
      login_as(user)
      get "/poi_search", params: { q: "test" }
      expect(response).to have_http_status(:bad_gateway)
      expect(JSON.parse(response.body)["error"]).to include("INVALID_USER_KEY")
    end

    context "throttle" do
      around do |example|
        original = Rails.cache
        Rails.cache = ActiveSupport::Cache::MemoryStore.new
        example.run
      ensure
        Rails.cache = original
      end

      it "returns 429 after exceeding 60 requests per minute" do
        login_as(user)
        60.times { get "/poi_search", params: { q: "ok" } }
        get "/poi_search", params: { q: "one more" }
        expect(response).to have_http_status(:too_many_requests)
      end
    end
  end
end
```

- [ ] **Step 3: Run specs to verify they fail**

Run: `mise exec -- bundle exec rspec spec/requests/poi_searches_spec.rb --format documentation`

Expected: FAIL — routing error or controller not found

- [ ] **Step 4: Implement `PoiSearchesController`**

Create `app/controllers/poi_searches_controller.rb`:

```ruby
class PoiSearchesController < ApplicationController
  RATE_LIMIT   = 60
  RATE_WINDOW  = 60

  before_action :require_login
  before_action :validate_query
  before_action :throttle!

  def index
    result = PoiSearch.new.search(
      params[:q],
      region_hint: params[:region_hint],
      near_lat:    params[:near_lat],
      near_lng:    params[:near_lng]
    )
    render json: { candidates: result }
  rescue PoiSearch::Error => e
    render json: { error: e.message }, status: :bad_gateway
  end

  private
    def validate_query
      q = params[:q].to_s
      if q.blank? || q.length > 80
        head :bad_request
      end
    end

    def throttle!
      key = "poi_search:#{current_user.id}:#{Time.current.to_i / RATE_WINDOW}"
      count = Rails.cache.increment(key, 1, expires_in: RATE_WINDOW.seconds)
      head :too_many_requests if count && count > RATE_LIMIT
    end
end
```

- [ ] **Step 5: Run specs to verify they pass**

Run: `mise exec -- bundle exec rspec spec/requests/poi_searches_spec.rb --format documentation`

Expected: all 6 examples PASS

- [ ] **Step 6: Commit**

```bash
git add app/controllers/poi_searches_controller.rb spec/requests/poi_searches_spec.rb config/routes.rb
git commit -m "feat: POI search endpoint with AMAP + rate limiting"
```

---

## Task 3: ConstraintOverridesController

**Files:**
- Create: `app/controllers/constraint_overrides_controller.rb`
- Create: `spec/requests/constraint_overrides_spec.rb`
- Modify: `config/routes.rb`

- [ ] **Step 1: Add route**

In `config/routes.rb`, inside the `resources :tours` block, add after the `resource :constitution` line:

```ruby
resource :overrides, only: [ :create, :destroy ], controller: :constraint_overrides
```

- [ ] **Step 2: Write request specs**

Create `spec/requests/constraint_overrides_spec.rb`:

```ruby
require "rails_helper"

RSpec.describe "Constraint Overrides", type: :request do
  def login_as(user)
    post "/login_test", params: { user_id: user.id }
  end

  let(:author) { create(:user) }
  let(:tour)   { create(:tour, author: author) }

  describe "POST /tours/:tour_id/overrides" do
    it "records an override and redirects" do
      login_as(author)
      post "/tours/#{tour.id}/overrides", params: {
        rule: "max_daily_driving_minutes",
        scope: { day_id: 7 },
        reason: "独库必走，无法压缩"
      }
      expect(response).to redirect_to(tour_path(tour))
      expect(tour.reload.constraint_overrides.size).to eq(1)
      expect(tour.constraint_overrides.first["rule"]).to eq("max_daily_driving_minutes")
    end

    it "returns 403 for a reader" do
      reader = create(:user)
      create(:tour_membership, tour: tour, user: reader, role: :reader)
      login_as(reader)
      post "/tours/#{tour.id}/overrides", params: { rule: "r", reason: "test" }
      expect(response).to have_http_status(:forbidden)
    end

    it "returns 404 for nonexistent tour" do
      login_as(author)
      post "/tours/999999/overrides", params: { rule: "r", reason: "test" }
      expect(response).to have_http_status(:not_found)
    end

    it "allows an editor to create an override" do
      editor = create(:user)
      create(:tour_membership, tour: tour, user: editor, role: :editor)
      login_as(editor)
      post "/tours/#{tour.id}/overrides", params: {
        rule: "min_buffer_days", scope: {}, reason: "短途不需要机动日"
      }
      expect(response).to redirect_to(tour_path(tour))
      expect(tour.reload.constraint_overrides.size).to eq(1)
    end
  end

  describe "DELETE /tours/:tour_id/overrides" do
    before do
      tour.record_override!(rule: "max_daily_driving_minutes", scope: { "day_id" => 7 }, reason: "test")
    end

    it "revokes the matching override and redirects" do
      login_as(author)
      delete "/tours/#{tour.id}/overrides", params: {
        rule: "max_daily_driving_minutes",
        scope: { day_id: 7 }
      }
      expect(response).to redirect_to(tour_path(tour))
      expect(tour.reload.constraint_overrides).to be_empty
    end

    it "returns 403 for a reader" do
      reader = create(:user)
      create(:tour_membership, tour: tour, user: reader, role: :reader)
      login_as(reader)
      delete "/tours/#{tour.id}/overrides", params: { rule: "max_daily_driving_minutes" }
      expect(response).to have_http_status(:forbidden)
    end
  end
end
```

- [ ] **Step 3: Run specs to verify they fail**

Run: `mise exec -- bundle exec rspec spec/requests/constraint_overrides_spec.rb --format documentation`

Expected: FAIL — routing error

- [ ] **Step 4: Implement `ConstraintOverridesController`**

Create `app/controllers/constraint_overrides_controller.rb`:

```ruby
class ConstraintOverridesController < ApplicationController
  before_action :require_login
  before_action :set_tour

  def create
    head :forbidden and return unless @tour.editable_by?(current_user)

    @tour.record_override!(
      rule:   params.require(:rule),
      scope:  scope_param,
      reason: params.require(:reason)
    )
    redirect_to tour_path(@tour)
  end

  def destroy
    head :forbidden and return unless @tour.editable_by?(current_user)

    @tour.revoke_override!(
      rule:  params.require(:rule),
      scope: scope_param
    )
    redirect_to tour_path(@tour)
  end

  private
    def set_tour
      @tour = Tour.find_by(id: params[:tour_id])
      head :not_found and return unless @tour
    end

    def scope_param
      raw = params.fetch(:scope, {})
      if raw.respond_to?(:to_unsafe_h)
        raw.to_unsafe_h
      else
        raw.is_a?(Hash) ? raw : {}
      end
    end
end
```

- [ ] **Step 5: Run specs to verify they pass**

Run: `mise exec -- bundle exec rspec spec/requests/constraint_overrides_spec.rb --format documentation`

Expected: all 5 examples PASS

- [ ] **Step 6: Commit**

```bash
git add app/controllers/constraint_overrides_controller.rb spec/requests/constraint_overrides_spec.rb config/routes.rb
git commit -m "feat: ConstraintOverridesController for acknowledge/revoke violations"
```

---

## Task 4: ActivityCard grab-handle + 点击入口

**Files:**
- Modify: `app/javascript/components/planner/ActivityCard.jsx`
- Modify: `app/javascript/components/planner/__tests__/ActivityCard.test.jsx`

- [ ] **Step 1: Update ActivityCard tests**

Replace `app/javascript/components/planner/__tests__/ActivityCard.test.jsx` with:

```jsx
import { render, screen, fireEvent } from '@testing-library/react'
import { DndContext } from '@dnd-kit/core'
import { vi } from 'vitest'
import ActivityCard from '../ActivityCard'

function renderInDnd(ui) {
  return render(<DndContext>{ui}</DndContext>)
}

test('renders tier_one as highlighted', () => {
  renderInDnd(<ActivityCard activity={{ id: 1, name: '赛里木湖', kind: 'scenic', citizen_level: 'tier_one' }} />)
  expect(screen.getByText(/一等/)).toBeInTheDocument()
  expect(screen.getByText(/景/)).toBeInTheDocument()
  expect(screen.getByText('赛里木湖')).toBeInTheDocument()
})

test('renders planned time when provided', () => {
  renderInDnd(<ActivityCard activity={{ id: 1, name: '早餐', kind: 'food', citizen_level: 'tier_three', planned_start_at: '10:00', planned_duration_min: 60 }} />)
  expect(screen.getByText(/10:00/)).toBeInTheDocument()
  expect(screen.getByText(/60 分/)).toBeInTheDocument()
})

test('road infrastructure uses italic+dashed style', () => {
  renderInDnd(<ActivityCard activity={{ id: 1, name: '通勤', kind: 'road', citizen_level: 'infrastructure' }} />)
  expect(screen.getByText('通勤')).toBeInTheDocument()
  expect(screen.getByText(/基础/)).toBeInTheDocument()
})

test('renders a grab handle element', () => {
  renderInDnd(<ActivityCard activity={{ id: 1, name: 'X', kind: 'scenic', citizen_level: 'tier_three' }} />)
  expect(screen.getByTestId('grab-handle')).toBeInTheDocument()
})

test('fires onClick when card body is clicked', () => {
  const onClick = vi.fn()
  renderInDnd(<ActivityCard activity={{ id: 1, name: 'X', kind: 'scenic', citizen_level: 'tier_three' }} onClick={onClick} />)
  fireEvent.click(screen.getByText('X'))
  expect(onClick).toHaveBeenCalledWith(1)
})

test('does not fire onClick when readOnly', () => {
  const onClick = vi.fn()
  renderInDnd(<ActivityCard activity={{ id: 1, name: 'X', kind: 'scenic', citizen_level: 'tier_three' }} onClick={onClick} readOnly />)
  fireEvent.click(screen.getByText('X'))
  expect(onClick).not.toHaveBeenCalled()
})
```

- [ ] **Step 2: Run tests to verify new tests fail**

Run: `npx vitest run app/javascript/components/planner/__tests__/ActivityCard.test.jsx`

Expected: "grab-handle" and "onClick" tests FAIL

- [ ] **Step 3: Modify ActivityCard with grab handle + click handler**

Replace `app/javascript/components/planner/ActivityCard.jsx` with:

```jsx
import { useDraggable, useDroppable } from '@dnd-kit/core'

export default function ActivityCard({ activity, onClick, readOnly }) {
  const isRoadInfra = activity.kind === 'road' && activity.citizen_level === 'infrastructure'
  const isTierOne = activity.citizen_level === 'tier_one'

  const { attributes, listeners, setNodeRef: setDragRef, setActivatorNodeRef, isDragging } = useDraggable({
    id: `activity-${activity.id}`
  })
  const { setNodeRef: setDropRef, isOver } = useDroppable({
    id: `activity-drop-${activity.id}`,
    data: { dayId: activity.day_id, position: activity.position }
  })

  const setRef = (el) => { setDragRef(el); setDropRef(el) }

  const handleClick = () => {
    if (!readOnly && onClick) onClick(activity.id)
  }

  const style = {
    display: 'flex',
    alignItems: 'stretch',
    border: isTierOne ? '1px solid #c80' : (isRoadInfra ? '1px dashed #bbb' : '1px solid #bbb'),
    background: isOver ? '#dbeafe' : (isTierOne ? '#fffaf0' : (isRoadInfra ? '#f5f5f5' : '#fafafa')),
    fontStyle: isRoadInfra ? 'italic' : 'normal',
    marginBottom: 4,
    fontSize: 12,
    opacity: isDragging ? 0.4 : 1
  }

  return (
    <div ref={setRef} style={style} {...attributes}>
      <div
        ref={setActivatorNodeRef}
        {...listeners}
        data-testid="grab-handle"
        style={{
          display: 'flex',
          alignItems: 'center',
          padding: '4px 2px',
          cursor: 'grab',
          color: '#999',
          fontSize: 10,
          userSelect: 'none'
        }}
      >
        ⋮⋮
      </div>
      <div
        onClick={handleClick}
        style={{ flex: 1, padding: '4px 6px', cursor: readOnly ? 'default' : 'pointer' }}
      >
        <strong>{levelLabel(activity.citizen_level)} · {kindLabel(activity.kind)}</strong> {activity.name}
        {activity.planned_start_at && (
          <div style={{ fontSize: 10, color: '#888' }}>
            {activity.planned_start_at}
            {activity.planned_duration_min ? ` · ${activity.planned_duration_min} 分` : ''}
          </div>
        )}
      </div>
    </div>
  )
}

function levelLabel(l) { return { tier_one: '一等', tier_two: '二等', tier_three: '三等', infrastructure: '基础' }[l] || l }
function kindLabel(k) { return { scenic: '景', road: '路', food: '食', stay: '住', fuel: '油', other: '其他' }[k] || k }
```

- [ ] **Step 4: Run tests to verify they all pass**

Run: `npx vitest run app/javascript/components/planner/__tests__/ActivityCard.test.jsx`

Expected: all 6 tests PASS

- [ ] **Step 5: Commit**

```bash
git add app/javascript/components/planner/ActivityCard.jsx app/javascript/components/planner/__tests__/ActivityCard.test.jsx
git commit -m "refactor: ActivityCard grab-handle + click entry for edit drawer"
```

---

## Task 5: Activity 编辑 Drawer

最大块。拆为 5 个子组件：`detailsSchema.js` → `CommonFields.jsx` → `DetailsFields.jsx` → `PoiSearchCombobox.jsx` → `ActivityDrawer.jsx`，最后在 `Show.jsx` / `BacklogList` / `DayColumn` 连线。

**Files:**
- Create: `app/javascript/components/activity-editor/detailsSchema.js`
- Create: `app/javascript/components/activity-editor/CommonFields.jsx`
- Create: `app/javascript/components/activity-editor/DetailsFields.jsx`
- Create: `app/javascript/components/activity-editor/PoiSearchCombobox.jsx`
- Create: `app/javascript/components/activity-editor/ActivityDrawer.jsx`
- Create: `app/javascript/components/activity-editor/__tests__/ActivityDrawer.test.jsx`
- Modify: `app/javascript/components/planner/BacklogList.jsx`
- Modify: `app/javascript/components/planner/DayColumn.jsx`
- Modify: `app/javascript/pages/Tour/Show.jsx`

### Step 1–3: detailsSchema.js

- [ ] **Step 1: Create `detailsSchema.js`**

Create `app/javascript/components/activity-editor/detailsSchema.js`:

```js
// Single source of truth for kind-specific detail fields.
// New kind or field? Change only here. Components iterate this at render time.
// Field type ∈ text | number | checkbox | select.
// select requires `options` array.
export const KIND_SCHEMA = {
  scenic: [
    { key: 'best_light',         label: '最佳光线',         type: 'text' },
    { key: 'altitude',           label: '海拔 (米)',       type: 'number' },
    { key: 'need_reservation',   label: '需要预约',         type: 'checkbox' },
    { key: 'ticket_info',        label: '门票',            type: 'text' },
    { key: 'recommend_stay_min', label: '建议停留 (分钟)',   type: 'number' },
  ],
  road: [
    { key: 'from_name', label: '起点',           type: 'text' },
    { key: 'to_name',   label: '终点',           type: 'text' },
    { key: 'km',        label: '里程 (km)',      type: 'number' },
    { key: 'drive_min', label: '驾驶时长 (分钟)', type: 'number' },
    { key: 'road_type', label: '路型',           type: 'select',
      options: ['高速', '国道', '省道', '山路', '城市'] },
    { key: 'day_only',  label: '仅白天通行',      type: 'checkbox' },
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
    { key: 'has_private_bath', label: '独立卫浴',  type: 'checkbox' },
  ],
  fuel: [
    { key: 'brand',           label: '品牌',           type: 'text' },
    { key: 'h24',             label: '24 小时',        type: 'checkbox' },
    { key: 'next_station_km', label: '到下加油站 (km)', type: 'number' },
  ],
  other: [],
}

// Valid kind values for the kind Select
export const KIND_OPTIONS = [
  { value: 'scenic', label: '景点' },
  { value: 'road',   label: '路段' },
  { value: 'food',   label: '餐饮' },
  { value: 'stay',   label: '住宿' },
  { value: 'fuel',   label: '加油' },
  { value: 'other',  label: '其他' },
]

export const CITIZEN_LEVEL_OPTIONS = [
  { value: 'tier_one',       label: '一等公民（核心）' },
  { value: 'tier_two',       label: '二等公民（配角）' },
  { value: 'tier_three',     label: '三等公民（可删）' },
  { value: 'infrastructure', label: '基础设施（自动）' },
]
```

- [ ] **Step 2: Verify file created**

Run: `ls -la app/javascript/components/activity-editor/detailsSchema.js`

Expected: file exists

- [ ] **Step 3: Commit**

```bash
git add app/javascript/components/activity-editor/detailsSchema.js
git commit -m "feat: detailsSchema.js — single source for kind-specific fields"
```

### Step 4–6: CommonFields + DetailsFields

- [ ] **Step 4: Create `CommonFields.jsx`**

Create `app/javascript/components/activity-editor/CommonFields.jsx`:

```jsx
import { TextInput, Textarea, Select, Radio, Group, Stack } from '@mantine/core'
import { KIND_OPTIONS, CITIZEN_LEVEL_OPTIONS } from './detailsSchema'

export default function CommonFields({ form }) {
  return (
    <Stack gap="sm">
      <TextInput
        label="名称"
        required
        maxLength={80}
        {...form.getInputProps('name')}
      />
      <Group grow>
        <Select
          label="类型"
          data={KIND_OPTIONS}
          allowDeselect={false}
          {...form.getInputProps('kind')}
        />
      </Group>
      <Radio.Group
        label="公民等级"
        {...form.getInputProps('citizen_level')}
      >
        <Group mt={4}>
          {CITIZEN_LEVEL_OPTIONS.map(o => (
            <Radio key={o.value} value={o.value} label={o.label} />
          ))}
        </Group>
      </Radio.Group>
      <Group grow>
        <TextInput
          label="纬度"
          type="number"
          step="any"
          {...form.getInputProps('lat')}
        />
        <TextInput
          label="经度"
          type="number"
          step="any"
          {...form.getInputProps('lng')}
        />
      </Group>
      <Group grow>
        <TextInput
          label="开始时间"
          placeholder="HH:MM"
          {...form.getInputProps('planned_start_at')}
        />
        <TextInput
          label="时长 (分钟)"
          type="number"
          {...form.getInputProps('planned_duration_min')}
        />
      </Group>
      <Textarea
        label="描述"
        minRows={2}
        maxRows={4}
        autosize
        {...form.getInputProps('description')}
      />
      <Textarea
        label="贴士"
        minRows={1}
        maxRows={3}
        autosize
        {...form.getInputProps('tips')}
      />
    </Stack>
  )
}
```

- [ ] **Step 5: Create `DetailsFields.jsx`**

Create `app/javascript/components/activity-editor/DetailsFields.jsx`:

```jsx
import { TextInput, Checkbox, Select, Stack, Title } from '@mantine/core'
import { KIND_SCHEMA } from './detailsSchema'

export default function DetailsFields({ kind, details, onChange }) {
  const schema = KIND_SCHEMA[kind] || []
  if (schema.length === 0) return null

  const handleChange = (key, value) => {
    onChange({ ...details, [key]: value })
  }

  return (
    <Stack gap="sm">
      <Title order={6} c="dimmed">类型细节</Title>
      {schema.map(field => {
        const value = details[field.key]
        if (field.type === 'checkbox') {
          return (
            <Checkbox
              key={field.key}
              label={field.label}
              checked={!!value}
              onChange={e => handleChange(field.key, e.currentTarget.checked)}
            />
          )
        }
        if (field.type === 'select') {
          return (
            <Select
              key={field.key}
              label={field.label}
              data={field.options}
              value={value || null}
              onChange={v => handleChange(field.key, v)}
              clearable
            />
          )
        }
        if (field.type === 'number') {
          return (
            <TextInput
              key={field.key}
              label={field.label}
              type="number"
              value={value ?? ''}
              onChange={e => handleChange(field.key, e.currentTarget.value === '' ? null : Number(e.currentTarget.value))}
            />
          )
        }
        return (
          <TextInput
            key={field.key}
            label={field.label}
            value={value || ''}
            onChange={e => handleChange(field.key, e.currentTarget.value)}
          />
        )
      })}
    </Stack>
  )
}
```

- [ ] **Step 6: Commit**

```bash
git add app/javascript/components/activity-editor/CommonFields.jsx app/javascript/components/activity-editor/DetailsFields.jsx
git commit -m "feat: CommonFields + DetailsFields for activity editor"
```

### Step 7–9: PoiSearchCombobox

- [ ] **Step 7: Create `PoiSearchCombobox.jsx`**

Create `app/javascript/components/activity-editor/PoiSearchCombobox.jsx`:

```jsx
import { useState, useRef, useCallback } from 'react'
import { Combobox, TextInput, Loader, Text, useCombobox } from '@mantine/core'

export default function PoiSearchCombobox({ onPick }) {
  const [query, setQuery] = useState('')
  const [candidates, setCandidates] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const timerRef = useRef(null)
  const combobox = useCombobox()

  const search = useCallback((q) => {
    if (q.trim().length === 0) {
      setCandidates([])
      return
    }
    setLoading(true)
    setError(null)
    fetch(`/poi_search?q=${encodeURIComponent(q)}`)
      .then(res => {
        if (res.status === 429) {
          setError('搜索太频繁，请稍后重试')
          setCandidates([])
          return null
        }
        return res.json()
      })
      .then(data => {
        if (data && data.candidates) {
          setCandidates(data.candidates)
          combobox.openDropdown()
        }
      })
      .catch(() => setError('搜索失败'))
      .finally(() => setLoading(false))
  }, [combobox])

  const handleChange = (val) => {
    setQuery(val)
    clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => search(val), 300)
  }

  const handleSelect = (idx) => {
    const c = candidates[Number(idx)]
    if (c && onPick) {
      onPick({ name: c.name, lat: c.lat, lng: c.lng })
    }
    combobox.closeDropdown()
  }

  return (
    <Combobox store={combobox} onOptionSubmit={handleSelect}>
      <Combobox.Target>
        <TextInput
          label="搜索地点"
          placeholder="输入地名搜索..."
          value={query}
          onChange={e => handleChange(e.currentTarget.value)}
          rightSection={loading ? <Loader size={14} /> : null}
          error={error}
          onFocus={() => { if (candidates.length > 0) combobox.openDropdown() }}
        />
      </Combobox.Target>
      <Combobox.Dropdown>
        <Combobox.Options>
          {candidates.map((c, i) => (
            <Combobox.Option key={i} value={String(i)}>
              <Text size="sm">{c.name}</Text>
              <Text size="xs" c="dimmed">
                {[c.address, c.type].filter(Boolean).join(' · ')}
              </Text>
            </Combobox.Option>
          ))}
          {candidates.length === 0 && !loading && query.trim().length > 0 && (
            <Combobox.Empty>无结果</Combobox.Empty>
          )}
        </Combobox.Options>
      </Combobox.Dropdown>
    </Combobox>
  )
}
```

- [ ] **Step 8: Verify file created**

Run: `ls -la app/javascript/components/activity-editor/PoiSearchCombobox.jsx`

Expected: file exists

- [ ] **Step 9: Commit**

```bash
git add app/javascript/components/activity-editor/PoiSearchCombobox.jsx
git commit -m "feat: PoiSearchCombobox with debounce + throttle error handling"
```

### Step 10–16: ActivityDrawer + wiring

- [ ] **Step 10: Create `ActivityDrawer.jsx`**

Create `app/javascript/components/activity-editor/ActivityDrawer.jsx`:

```jsx
import { useEffect, useState } from 'react'
import { Drawer, Button, Group, Stack } from '@mantine/core'
import { useForm } from '@mantine/form'
import { modals } from '@mantine/modals'
import { router } from '@inertiajs/react'
import { KIND_SCHEMA } from './detailsSchema'
import CommonFields from './CommonFields'
import DetailsFields from './DetailsFields'
import PoiSearchCombobox from './PoiSearchCombobox'

export default function ActivityDrawer({ tourId, opened, onClose, mode, activity, targetDayId }) {
  const isEdit = mode === 'edit'
  const [saving, setSaving] = useState(false)

  const form = useForm({
    initialValues: {
      name: '',
      kind: 'scenic',
      citizen_level: 'tier_three',
      lat: '',
      lng: '',
      planned_start_at: '',
      planned_duration_min: '',
      description: '',
      tips: '',
    },
    validate: {
      name: (v) => (v.trim().length === 0 ? '名称不能为空' : null),
    },
  })

  const [details, setDetails] = useState({})

  // Populate form when editing an existing activity
  useEffect(() => {
    if (opened && isEdit && activity) {
      form.setValues({
        name: activity.name || '',
        kind: activity.kind || 'scenic',
        citizen_level: activity.citizen_level || 'tier_three',
        lat: activity.lat ?? '',
        lng: activity.lng ?? '',
        planned_start_at: activity.planned_start_at || '',
        planned_duration_min: activity.planned_duration_min ?? '',
        description: activity.description || '',
        tips: activity.tips || '',
      })
      setDetails(activity.details || {})
      form.resetDirty()
    }
    if (opened && !isEdit) {
      form.reset()
      setDetails({})
    }
  }, [opened, isEdit, activity?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  // When kind changes, keep only the keys that belong to the new kind's schema
  const handleKindChange = (newKind) => {
    form.setFieldValue('kind', newKind)
    const validKeys = (KIND_SCHEMA[newKind] || []).map(f => f.key)
    const cleaned = {}
    for (const k of validKeys) {
      if (details[k] !== undefined) cleaned[k] = details[k]
    }
    setDetails(cleaned)
  }

  const handlePoiPick = ({ name, lat, lng }) => {
    if (!form.values.name) form.setFieldValue('name', name)
    form.setFieldValue('lat', lat)
    form.setFieldValue('lng', lng)
  }

  const handleClose = () => {
    if (form.isDirty()) {
      modals.openConfirmModal({
        title: '放弃未保存的修改？',
        labels: { confirm: '放弃', cancel: '继续编辑' },
        confirmProps: { color: 'red' },
        onConfirm: onClose,
      })
    } else {
      onClose()
    }
  }

  const handleSave = () => {
    if (form.validate().hasErrors) return
    setSaving(true)

    // Build payload: only include detail keys from current kind's schema
    const kind = form.values.kind
    const validKeys = (KIND_SCHEMA[kind] || []).map(f => f.key)
    const cleanDetails = {}
    for (const k of validKeys) {
      if (details[k] !== undefined && details[k] !== '' && details[k] !== null) {
        cleanDetails[k] = details[k]
      }
    }

    const payload = {
      activity: {
        ...form.values,
        planned_duration_min: form.values.planned_duration_min === '' ? null : Number(form.values.planned_duration_min),
        lat: form.values.lat === '' ? null : Number(form.values.lat),
        lng: form.values.lng === '' ? null : Number(form.values.lng),
        details: cleanDetails,
      },
    }

    const inertiaOpts = {
      preserveScroll: true,
      only: ['activities', 'violations'],
      onSuccess: () => { setSaving(false); onClose() },
      onError: () => setSaving(false),
    }

    if (isEdit) {
      router.patch(`/activities/${activity.id}`, payload, inertiaOpts)
    } else if (targetDayId) {
      router.post(`/tours/${tourId}/days/${targetDayId}/activities`, payload, inertiaOpts)
    } else {
      router.post(`/tours/${tourId}/backlog_activities`, payload, inertiaOpts)
    }
  }

  const handleDelete = () => {
    modals.openConfirmModal({
      title: '确认删除此 activity？',
      labels: { confirm: '删除', cancel: '取消' },
      confirmProps: { color: 'red' },
      onConfirm: () => {
        router.delete(`/activities/${activity.id}`, {
          preserveScroll: true,
          only: ['activities', 'violations'],
          onSuccess: onClose,
        })
      },
    })
  }

  const handleMoveToBacklog = () => {
    router.patch(`/activities/${activity.id}/position`, { to_day_id: null, to_position: 1 }, {
      preserveScroll: true,
      only: ['activities', 'violations'],
      onSuccess: onClose,
    })
  }

  // Intercept kind changes to clean details
  const formWithKindHook = {
    ...form,
    getInputProps: (path) => {
      const props = form.getInputProps(path)
      if (path === 'kind') {
        return { ...props, onChange: handleKindChange }
      }
      return props
    },
  }

  return (
    <Drawer
      opened={opened}
      onClose={handleClose}
      title={isEdit ? '编辑 Activity' : '新建 Activity'}
      position="right"
      size={420}
      overlayProps={{ opacity: 0.4 }}
      padding="md"
    >
      <Stack gap="md">
        <CommonFields form={formWithKindHook} />
        <PoiSearchCombobox onPick={handlePoiPick} />
        <DetailsFields kind={form.values.kind} details={details} onChange={setDetails} />

        <Group justify="space-between" mt="md" pt="md" style={{ borderTop: '1px solid #eee' }}>
          <Group>
            <Button onClick={handleSave} loading={saving}>保存</Button>
            <Button variant="default" onClick={handleClose}>取消</Button>
          </Group>
          {isEdit && (
            <Group>
              {activity?.day_id && (
                <Button variant="subtle" size="xs" onClick={handleMoveToBacklog}>移回 Backlog</Button>
              )}
              <Button variant="subtle" color="red" size="xs" onClick={handleDelete}>删除</Button>
            </Group>
          )}
        </Group>
      </Stack>
    </Drawer>
  )
}
```

- [ ] **Step 11: Write `ActivityDrawer` tests**

Create `app/javascript/components/activity-editor/__tests__/ActivityDrawer.test.jsx`:

```jsx
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MantineProvider } from '@mantine/core'
import { ModalsProvider } from '@mantine/modals'
import { vi } from 'vitest'
import ActivityDrawer from '../ActivityDrawer'

// Mock Inertia router
vi.mock('@inertiajs/react', () => ({
  router: {
    post: vi.fn((url, data, opts) => opts?.onSuccess?.()),
    patch: vi.fn((url, data, opts) => opts?.onSuccess?.()),
    delete: vi.fn((url, opts) => opts?.onSuccess?.()),
  },
}))

// Mock fetch for POI search
global.fetch = vi.fn()

function renderDrawer(props = {}) {
  const defaults = {
    tourId: 1,
    opened: true,
    onClose: vi.fn(),
    mode: 'create',
    activity: null,
    targetDayId: null,
  }
  return render(
    <MantineProvider>
      <ModalsProvider>
        <ActivityDrawer {...defaults} {...props} />
      </ModalsProvider>
    </MantineProvider>
  )
}

test('renders create mode with empty form', () => {
  renderDrawer()
  expect(screen.getByText('新建 Activity')).toBeInTheDocument()
  expect(screen.getByLabelText('名称')).toHaveValue('')
  expect(screen.getByRole('button', { name: '保存' })).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: '删除' })).not.toBeInTheDocument()
})

test('renders edit mode with populated form', () => {
  renderDrawer({
    mode: 'edit',
    activity: {
      id: 42,
      name: '赛里木湖',
      kind: 'scenic',
      citizen_level: 'tier_one',
      day_id: 5,
      details: { altitude: 2073 },
    },
  })
  expect(screen.getByText('编辑 Activity')).toBeInTheDocument()
  expect(screen.getByLabelText('名称')).toHaveValue('赛里木湖')
  expect(screen.getByRole('button', { name: '删除' })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: '移回 Backlog' })).toBeInTheDocument()
})

test('validates name is required on save', async () => {
  renderDrawer()
  fireEvent.click(screen.getByRole('button', { name: '保存' }))
  await waitFor(() => {
    expect(screen.getByText('名称不能为空')).toBeInTheDocument()
  })
})

test('calls router.post for backlog create (no targetDayId)', async () => {
  const { router } = await import('@inertiajs/react')
  const onClose = vi.fn()
  renderDrawer({ onClose })
  fireEvent.change(screen.getByLabelText('名称'), { target: { value: '测试景点' } })
  fireEvent.click(screen.getByRole('button', { name: '保存' }))
  await waitFor(() => {
    expect(router.post).toHaveBeenCalledWith(
      '/tours/1/backlog_activities',
      expect.objectContaining({ activity: expect.objectContaining({ name: '测试景点' }) }),
      expect.anything()
    )
    expect(onClose).toHaveBeenCalled()
  })
})

test('calls router.post for day create (with targetDayId)', async () => {
  const { router } = await import('@inertiajs/react')
  renderDrawer({ targetDayId: 5 })
  fireEvent.change(screen.getByLabelText('名称'), { target: { value: '午餐' } })
  fireEvent.click(screen.getByRole('button', { name: '保存' }))
  await waitFor(() => {
    expect(router.post).toHaveBeenCalledWith(
      '/tours/1/days/5/activities',
      expect.anything(),
      expect.anything()
    )
  })
})
```

- [ ] **Step 12: Run tests**

Run: `npx vitest run app/javascript/components/activity-editor/__tests__/ActivityDrawer.test.jsx`

Expected: all 5 tests PASS

- [ ] **Step 13: Add `+ 加一个` buttons to BacklogList and DayColumn**

In `app/javascript/components/planner/BacklogList.jsx`, replace with:

```jsx
import { Paper, Title, Stack, Text, Button } from '@mantine/core'
import { useDroppable } from '@dnd-kit/core'
import ActivityCard from './ActivityCard'

export default function BacklogList({ activities, onAddActivity, onEditActivity, readOnly }) {
  const { setNodeRef, isOver } = useDroppable({
    id: 'backlog',
    data: { dayId: null, position: activities.length + 1 }
  })
  return (
    <Paper withBorder p="sm" ref={setNodeRef} style={{ background: isOver ? '#e8f0fb' : undefined }}>
      <Title order={5} mb="xs">Backlog（候选池）</Title>
      {!readOnly && onAddActivity && (
        <Button size="compact-xs" variant="light" fullWidth mb="xs" onClick={() => onAddActivity(null)}>
          + 加一个
        </Button>
      )}
      <Stack gap={4}>
        {activities.map(a => (
          <ActivityCard key={a.id} activity={a} onClick={onEditActivity} readOnly={readOnly} />
        ))}
        {activities.length === 0 && <Text size="xs" c="dimmed">尚无候选。可手动添加或让 AI 帮忙。</Text>}
      </Stack>
    </Paper>
  )
}
```

In `app/javascript/components/planner/DayColumn.jsx`, replace with:

```jsx
import { Paper, Text, Stack, Group, Button } from '@mantine/core'
import { useDroppable } from '@dnd-kit/core'
import ActivityCard from './ActivityCard'

export default function DayColumn({ day, activities, constitution, onAddActivity, onEditActivity, readOnly }) {
  const maxH = Math.round((constitution?.max_daily_driving_minutes || 420) / 60)
  const maxTier1 = constitution?.max_tier_one_per_day || 3

  const driveMin = activities
    .filter(a => a.kind === 'road')
    .reduce((sum, a) => sum + (parseInt(a.details?.drive_min || 0, 10) || 0), 0)
  const driveH = Math.round(driveMin / 60 * 10) / 10
  const tierOneCount = activities.filter(a => a.citizen_level === 'tier_one').length

  const { setNodeRef, isOver } = useDroppable({
    id: `day-${day.id}`,
    data: { dayId: day.id, position: activities.length + 1 }
  })

  return (
    <Paper withBorder style={{ minWidth: 170, display: 'flex', flexDirection: 'column' }}>
      <Group justify="space-between" p="xs" bg="gray.1">
        <Text fw={600}>D{day.day_index}</Text>
        <Text size="xs" c="dimmed">{day.date || '—'}</Text>
      </Group>
      {!readOnly && onAddActivity && (
        <div style={{ padding: '4px 8px' }}>
          <Button size="compact-xs" variant="light" fullWidth onClick={() => onAddActivity(day.id)}>
            + 加一个
          </Button>
        </div>
      )}
      <Stack gap={4} p="xs" ref={setNodeRef} style={{ flex: 1, minHeight: 140, background: isOver ? '#e8f0fb' : undefined }}>
        {activities.map(a => (
          <ActivityCard key={a.id} activity={a} onClick={onEditActivity} readOnly={readOnly} />
        ))}
        {activities.length === 0 && <Text size="xs" c="dimmed" ta="center" mt="md">空</Text>}
      </Stack>
      <div style={{ borderTop: '1px dashed #ccc', padding: '4px 8px', fontSize: 10, color: '#666' }}>
        驾驶 {progressBar(driveH, maxH)} {driveH}/{maxH}h<br />
        核心 {progressBar(tierOneCount, maxTier1, 3)} {tierOneCount}/{maxTier1}
        {day.buffer_day && <> · buffer</>}
      </div>
    </Paper>
  )
}

function progressBar(value, max, width = 5) {
  const filled = Math.min(Math.round((value / max) * width), width)
  return '█'.repeat(filled) + '░'.repeat(width - filled)
}
```

- [ ] **Step 14: Wire ActivityDrawer in Show.jsx**

Replace `app/javascript/pages/Tour/Show.jsx` with:

```jsx
import { useState } from 'react'
import { Head, router, usePage } from '@inertiajs/react'
import { Button, Paper, Text, Stack } from '@mantine/core'
import { DndContext, closestCenter } from '@dnd-kit/core'
import BacklogList from '../../components/planner/BacklogList'
import DayColumn from '../../components/planner/DayColumn'
import PlannerMap from '../../components/planner/PlannerMap'
import ChatPanel from '../../components/planner/ChatPanel'
import ConstitutionBanner from '../../components/planner/ConstitutionBanner'
import ActivityDrawer from '../../components/activity-editor/ActivityDrawer'

export default function Show({ tour, days, activities, violations }) {
  const { current_user } = usePage().props
  const canEdit = tour.editable_by_current_user
  const [chatOpen, setChatOpen] = useState(true)
  const backlog = activities.filter(a => !a.day_id)
  const byDay = Object.fromEntries(days.map(d => [ d.id, activities.filter(a => a.day_id === d.id) ]))
  const nextDayIndex = days.length === 0 ? 1 : Math.max(...days.map(d => d.day_index)) + 1

  // Activity editor state
  const [editor, setEditor] = useState({ open: false, mode: 'create', activityId: null, targetDayId: null })

  const openCreate = (dayId) => setEditor({ open: true, mode: 'create', activityId: null, targetDayId: dayId })
  const openEdit = (activityId) => setEditor({ open: true, mode: 'edit', activityId, targetDayId: null })
  const closeEditor = () => setEditor({ open: false, mode: 'create', activityId: null, targetDayId: null })

  const editingActivity = editor.activityId ? activities.find(a => a.id === editor.activityId) : null

  return (
    <div>
      <Head title={tour.title} />
      <DndContext collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <div style={{ padding: 10 }}>
          <ConstitutionBanner violations={violations} />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: `260px 1fr ${chatOpen ? 320 : 36}px`, gap: 10, padding: 10 }}>
          <BacklogList
            activities={backlog}
            onAddActivity={canEdit ? openCreate : undefined}
            onEditActivity={canEdit ? openEdit : undefined}
            readOnly={!canEdit}
          />
          <div style={{ display: 'grid', gridTemplateRows: 'auto 1fr', gap: 10 }}>
            <PlannerMap activities={activities} days={days} />
            <div style={{ display: 'flex', gap: 8, overflowX: 'auto', alignItems: 'stretch' }}>
              {days.map(d => (
                <DayColumn
                  key={d.id}
                  day={d}
                  activities={byDay[d.id] || []}
                  constitution={tour.constitution}
                  onAddActivity={canEdit ? openCreate : undefined}
                  onEditActivity={canEdit ? openEdit : undefined}
                  readOnly={!canEdit}
                />
              ))}
              <AddDayButton tour={tour} nextDayIndex={nextDayIndex} empty={days.length === 0} />
            </div>
          </div>
          <ChatPanel tour={tour} open={chatOpen} onToggle={() => setChatOpen(!chatOpen)} />
        </div>
      </DndContext>

      <ActivityDrawer
        tourId={tour.id}
        opened={editor.open}
        onClose={closeEditor}
        mode={editor.mode}
        activity={editingActivity}
        targetDayId={editor.targetDayId}
      />
    </div>
  )

  function handleDragEnd({ active, over }) {
    if (!over) return
    if (active.id === over.id) return
    const activityId = String(active.id).replace(/^activity-/, '')
    const data = over.data.current || {}
    const toDayId = data.dayId ?? null
    const toPosition = data.position ?? 1

    router.patch(
      `/activities/${activityId}/position`,
      { to_day_id: toDayId, to_position: toPosition },
      {
        preserveState: true,
        preserveScroll: true,
        only: [ 'activities', 'violations' ],
        onError: () => { alert('拖拽未保存，请重试') }
      }
    )
  }
}

function AddDayButton({ tour, nextDayIndex, empty }) {
  const handleAdd = () => {
    router.post(
      `/tours/${tour.id}/days`,
      { day: { day_index: nextDayIndex } },
      {
        only: [ 'days', 'activities', 'violations' ],
        preserveState: true,
        preserveScroll: true
      }
    )
  }

  if (empty) {
    return (
      <Paper
        withBorder
        style={{
          minWidth: 260,
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          alignItems: 'center',
          border: '2px dashed #ccc',
          background: '#fafafa',
          padding: 24,
          gap: 8
        }}
      >
        <Stack gap={6} align="center">
          <Text fw={600} size="sm">还没有 Day</Text>
          <Text size="xs" c="dimmed" ta="center">
            从第 1 天开始，或让 AI 帮你一次排完
          </Text>
          <Button size="xs" onClick={handleAdd} data-testid="add-day-empty">
            + 新建 Day 1
          </Button>
        </Stack>
      </Paper>
    )
  }

  return (
    <Paper
      withBorder
      onClick={handleAdd}
      style={{
        minWidth: 60,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        cursor: 'pointer',
        border: '2px dashed #ccc',
        background: '#fafafa',
        color: '#666'
      }}
      data-testid="add-day-slot"
    >
      <Text size="sm" fw={500}>+ Day {nextDayIndex}</Text>
    </Paper>
  )
}
```

**Important:** This relies on a new prop `tour.editable_by_current_user` from the backend. Add to `ToursController#show`:

In `app/controllers/tours_controller.rb`, modify the `show` action's props hash to include:

```ruby
render inertia: "Tour/Show", props: {
  tour: @tour.as_json.merge("editable_by_current_user" => @tour.editable_by?(current_user)),
  days: @tour.days.as_json,
  activities: @tour.activities.as_json,
  violations: Tour::ConstitutionCheck.for(@tour).map(&:to_h)
}
```

- [ ] **Step 15: Run all JS tests to check nothing broke**

Run: `npm test`

Expected: all existing tests PASS (ActivityCard tests may need adjustment — see Step 4)

- [ ] **Step 16: Commit**

```bash
git add app/javascript/components/activity-editor/ app/javascript/components/planner/BacklogList.jsx app/javascript/components/planner/DayColumn.jsx app/javascript/pages/Tour/Show.jsx app/controllers/tours_controller.rb
git commit -m "feat: Activity editor drawer with create/edit/delete + POI search"
```

---

## Task 6: AcknowledgeModal + banner 连线 + ChatPanel pendingPrompt

**Files:**
- Create: `app/javascript/components/planner/AcknowledgeModal.jsx`
- Create: `app/javascript/components/planner/__tests__/AcknowledgeModal.test.jsx`
- Modify: `app/javascript/pages/Tour/Show.jsx`
- Modify: `app/javascript/components/planner/ChatPanel.jsx`
- Modify: `app/javascript/components/planner/__tests__/ChatPanel.test.jsx`
- Modify: `app/javascript/components/planner/ConstitutionBanner.jsx` — 加 `readOnly` prop 隐藏 reader 的操作按钮
- Modify: `app/javascript/components/planner/__tests__/ConstitutionBanner.test.jsx` — 加 readOnly 测试

- [ ] **Step 1: Add `readOnly` prop to ConstitutionBanner (§4 reader 模式一致性)**

In `app/javascript/components/planner/ConstitutionBanner.jsx`, add `readOnly = false` to the destructured props:

```jsx
export default function ConstitutionBanner({
  violations,
  onFix = noop,
  onAcknowledge = noop,
  onDismiss = noop,
  readOnly = false,
}) {
```

Then modify the button rendering inside the `.map()`. Replace:

```jsx
{v.level === 'hard' && (
  <Button size="compact-xs" color="red" onClick={() => onFix(v)}>
    帮我修正 →
  </Button>
)}
<Button
  size="compact-xs"
  variant="default"
  onClick={() => {
    if (v.level === 'hard') {
      onAcknowledge(v)
    } else {
      handleDismiss(i, v)
    }
  }}
>
  {v.level === 'hard' ? '承认此违反' : '知道了'}
</Button>
```

with:

```jsx
{!readOnly && v.level === 'hard' && (
  <Button size="compact-xs" color="red" onClick={() => onFix(v)}>
    帮我修正 →
  </Button>
)}
<Button
  size="compact-xs"
  variant="default"
  onClick={() => {
    if (v.level === 'hard' && !readOnly) {
      onAcknowledge(v)
    } else {
      handleDismiss(i, v)
    }
  }}
>
  {v.level === 'hard' && !readOnly ? '承认此违反' : '知道了'}
</Button>
```

When `readOnly=true`: hard violations show only "知道了" (local dismiss), no "帮我修正". Soft violations unchanged.

- [ ] **Step 2: Add readOnly test to ConstitutionBanner.test.jsx**

In `app/javascript/components/planner/__tests__/ConstitutionBanner.test.jsx`, add:

```jsx
test('hides 帮我修正 and 承认此违反 when readOnly', () => {
  renderWithMantine(<ConstitutionBanner
    violations={[{ level: 'hard', rule: 'r', scope: {}, message: 'hard issue' }]}
    readOnly
  />)
  expect(screen.queryByRole('button', { name: /帮我修正/ })).not.toBeInTheDocument()
  expect(screen.queryByRole('button', { name: '承认此违反' })).not.toBeInTheDocument()
  expect(screen.getByRole('button', { name: '知道了' })).toBeInTheDocument()
})
```

- [ ] **Step 3: Run ConstitutionBanner tests**

Run: `npx vitest run app/javascript/components/planner/__tests__/ConstitutionBanner.test.jsx`

Expected: all PASS (including new readOnly test)

- [ ] **Step 4: Create `AcknowledgeModal.jsx`**

Create `app/javascript/components/planner/AcknowledgeModal.jsx`:

```jsx
import { useState } from 'react'
import { Modal, Textarea, Button, Group, Text, Alert, Stack } from '@mantine/core'
import { notifications } from '@mantine/notifications'
import { router } from '@inertiajs/react'

const MIN_REASON_LENGTH = 10

export default function AcknowledgeModal({ violation, tourId, onClose }) {
  const [reason, setReason] = useState('')
  const [submitting, setSubmitting] = useState(false)

  if (!violation) return null

  const valid = reason.trim().length >= MIN_REASON_LENGTH

  const handleSubmit = () => {
    if (!valid) return
    setSubmitting(true)
    router.post(`/tours/${tourId}/overrides`, {
      rule: violation.rule,
      scope: violation.scope,
      reason: reason.trim(),
    }, {
      preserveScroll: true,
      only: ['violations'],
      onSuccess: () => {
        setSubmitting(false)
        setReason('')
        onClose()
        notifications.show({ message: '已静音', color: 'green' })
      },
      onError: () => setSubmitting(false),
    })
  }

  return (
    <Modal
      opened={!!violation}
      onClose={onClose}
      title="承认此违反"
      size="md"
    >
      <Stack gap="md">
        <Alert color="red" variant="light">
          永久静音 《{violation.rule}》
        </Alert>
        <Text size="sm" c="dimmed">
          若后续你把相关 activity 改到别天（仍违反）或改了宪法，需手动撤销。撤销路径：宪法页 → 已承认列表 → 撤销
        </Text>
        <Textarea
          label="承认原因"
          required
          placeholder="例如：独库公路是本程核心，无法压缩；同行人员已确认"
          value={reason}
          onChange={e => setReason(e.currentTarget.value)}
          minRows={2}
        />
        <Text size="xs" c={valid ? 'green' : 'red'}>
          {reason.trim().length} / {MIN_REASON_LENGTH} 字 {valid ? '✓' : '×'}
        </Text>
        <Group justify="flex-end">
          <Button variant="default" onClick={onClose}>取消</Button>
          <Button
            color="red"
            variant="outline"
            disabled={!valid}
            loading={submitting}
            onClick={handleSubmit}
          >
            我确认承认
          </Button>
        </Group>
      </Stack>
    </Modal>
  )
}
```

- [ ] **Step 5: Write `AcknowledgeModal` tests**

Create `app/javascript/components/planner/__tests__/AcknowledgeModal.test.jsx`:

```jsx
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MantineProvider } from '@mantine/core'
import { Notifications } from '@mantine/notifications'
import { vi } from 'vitest'
import AcknowledgeModal from '../AcknowledgeModal'

vi.mock('@inertiajs/react', () => ({
  router: {
    post: vi.fn((url, data, opts) => opts?.onSuccess?.()),
  },
}))

const violation = { level: 'hard', rule: 'max_daily_driving_minutes', scope: { day_id: 3 }, message: 'D3 驾驶超时' }

function renderModal(props = {}) {
  return render(
    <MantineProvider>
      <Notifications />
      <AcknowledgeModal violation={violation} tourId={1} onClose={vi.fn()} {...props} />
    </MantineProvider>
  )
}

test('renders nothing when violation is null', () => {
  const { container } = render(
    <MantineProvider><AcknowledgeModal violation={null} tourId={1} onClose={() => {}} /></MantineProvider>
  )
  expect(container.innerHTML).toBe('')
})

test('confirm button is disabled when reason is too short', () => {
  renderModal()
  const btn = screen.getByRole('button', { name: '我确认承认' })
  expect(btn).toBeDisabled()
})

test('confirm button enables when reason reaches 10 chars', () => {
  renderModal()
  fireEvent.change(screen.getByLabelText(/承认原因/), { target: { value: '独库公路是本程核心无法压缩' } })
  expect(screen.getByRole('button', { name: '我确认承认' })).not.toBeDisabled()
})

test('submits override via router.post', async () => {
  const { router } = await import('@inertiajs/react')
  const onClose = vi.fn()
  renderModal({ onClose })
  fireEvent.change(screen.getByLabelText(/承认原因/), { target: { value: '独库公路是本程核心无法压缩' } })
  fireEvent.click(screen.getByRole('button', { name: '我确认承认' }))
  await waitFor(() => {
    expect(router.post).toHaveBeenCalledWith(
      '/tours/1/overrides',
      expect.objectContaining({ rule: 'max_daily_driving_minutes', reason: '独库公路是本程核心无法压缩' }),
      expect.anything()
    )
    expect(onClose).toHaveBeenCalled()
  })
})
```

- [ ] **Step 6: Run tests**

Run: `npx vitest run app/javascript/components/planner/__tests__/AcknowledgeModal.test.jsx`

Expected: all 4 tests PASS

- [ ] **Step 7: Add pendingPrompt support to ChatPanel**

In `app/javascript/components/planner/ChatPanel.jsx`, modify the default export to accept two new props and add a `useEffect`:

Change the function signature from:
```jsx
export default function ChatPanel({ tour, open, onToggle }) {
```
to:
```jsx
export default function ChatPanel({ tour, open, onToggle, pendingPrompt, onPromptConsumed }) {
```

And change the collapsed branch to also handle expanding when a prompt arrives. Replace the entire `ChatPanel` component body:

```jsx
export default function ChatPanel({ tour, open, onToggle, pendingPrompt, onPromptConsumed }) {
  // Auto-expand and send when a pending prompt arrives (e.g. from ConstitutionBanner "帮我修正")
  const needsExpand = pendingPrompt && !open

  useEffect(() => {
    if (needsExpand && onToggle) onToggle()
  }, [needsExpand]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!open) {
    return (
      <Paper
        withBorder
        onClick={onToggle}
        style={{ cursor: 'pointer', background: '#f3f3f3', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      >
        <Text size="xs" c="dimmed" style={{ writingMode: 'vertical-rl' }}>◂ 展开 AI 对话</Text>
      </Paper>
    )
  }

  return (
    <Paper withBorder style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 400 }}>
      <Group justify="space-between" p="xs" bg="gray.1">
        <Text fw={600} size="sm">AI 对话</Text>
        <Button size="compact-xs" variant="subtle" onClick={onToggle}>收起 ▸</Button>
      </Group>
      <ChatBody tour={tour} pendingPrompt={pendingPrompt} onPromptConsumed={onPromptConsumed} />
    </Paper>
  )
}
```

Add the `useEffect` import (already imported) and add to `ChatBody`:

```jsx
function ChatBody({ tour, pendingPrompt, onPromptConsumed }) {
  const { messages, streaming, pendingToolCalls, error, send } = useChat({ tourId: tour.id })
  const [ text, setText ] = useState('')
  const scrollRef = useRef(null)

  useEffect(() => {
    const el = scrollRef.current
    if (el && typeof el.scrollTo === 'function') {
      el.scrollTo({ top: el.scrollHeight })
    }
  }, [ messages, pendingToolCalls, streaming ])

  // Auto-send pending prompt from ConstitutionBanner
  useEffect(() => {
    if (pendingPrompt && !streaming) {
      send(pendingPrompt)
      if (onPromptConsumed) onPromptConsumed()
    }
  }, [pendingPrompt]) // eslint-disable-line react-hooks/exhaustive-deps

  // ... rest unchanged
```

- [ ] **Step 8: Update ChatPanel tests for pendingPrompt**

In `app/javascript/components/planner/__tests__/ChatPanel.test.jsx`, add at the end of the `describe('ChatPanel')` block:

```jsx
test('auto-sends pendingPrompt and calls onPromptConsumed', () => {
  const onPromptConsumed = vi.fn()
  renderPanel({ pendingPrompt: '请分析 D3 驾驶超时', onPromptConsumed })
  expect(mockState.send).toHaveBeenCalledWith('请分析 D3 驾驶超时')
  expect(onPromptConsumed).toHaveBeenCalled()
})
```

- [ ] **Step 9: Wire AcknowledgeModal + banner handlers in Show.jsx**

In `app/javascript/pages/Tour/Show.jsx`, add imports at top:

```jsx
import AcknowledgeModal from '../../components/planner/AcknowledgeModal'
```

Add state inside the `Show` component (after the editor state):

```jsx
// Violation acknowledge state
const [acknowledgingViolation, setAcknowledgingViolation] = useState(null)
const [pendingChatPrompt, setPendingChatPrompt] = useState(null)
```

Update the `<ConstitutionBanner>` to pass handlers + `readOnly`:

```jsx
<ConstitutionBanner
  violations={violations}
  onFix={(v) => setPendingChatPrompt(fixPromptFor(v))}
  onAcknowledge={(v) => setAcknowledgingViolation(v)}
  onDismiss={() => {}}
  readOnly={!canEdit}
/>
```

Update `<ChatPanel>` to pass pendingPrompt:

```jsx
<ChatPanel
  tour={tour}
  open={chatOpen}
  onToggle={() => setChatOpen(!chatOpen)}
  pendingPrompt={pendingChatPrompt}
  onPromptConsumed={() => setPendingChatPrompt(null)}
/>
```

Add `<AcknowledgeModal>` after the `<ActivityDrawer>`:

```jsx
<AcknowledgeModal
  violation={acknowledgingViolation}
  tourId={tour.id}
  onClose={() => setAcknowledgingViolation(null)}
/>
```

Add the `fixPromptFor` helper at the bottom of Show.jsx (before `AddDayButton`):

```jsx
function fixPromptFor(v) {
  return `请分析 ${v.message} 的硬违反，给我 3 个修正方案，每个说明原因、对其他日的影响，以及整程天数/体验是否变化。`
}
```

- [ ] **Step 10: Run all JS tests**

Run: `npm test`

Expected: all PASS

- [ ] **Step 11: Commit**

```bash
git add app/javascript/components/planner/AcknowledgeModal.jsx app/javascript/components/planner/__tests__/AcknowledgeModal.test.jsx app/javascript/components/planner/ChatPanel.jsx app/javascript/components/planner/__tests__/ChatPanel.test.jsx app/javascript/components/planner/ConstitutionBanner.jsx app/javascript/components/planner/__tests__/ConstitutionBanner.test.jsx app/javascript/pages/Tour/Show.jsx
git commit -m "feat: AcknowledgeModal + banner handler wiring + ChatPanel pendingPrompt + reader readOnly"
```

---

## Task 7: Constitution 页"已承认的违反"卡片

**Files:**
- Modify: `app/controllers/tours/constitutions_controller.rb`
- Modify: `app/javascript/pages/Tour/Constitution.jsx`

- [ ] **Step 1: Add `overrides` prop to ConstitutionsController**

In `app/controllers/tours/constitutions_controller.rb`, modify the `show` action's render to:

```ruby
render inertia: "Tour/Constitution", props: {
  tour: @tour.as_json,
  constitution: @tour.constitution,
  defaults: Constitution::DEFAULTS.deep_stringify_keys,
  overrides: @tour.constraint_overrides
}
```

- [ ] **Step 2: Add "已承认列表" section to Constitution.jsx**

In `app/javascript/pages/Tour/Constitution.jsx`, update the component signature to receive `overrides`:

```jsx
export default function Constitution({ tour, constitution, defaults, overrides }) {
```

Add this section after the `<Group justify="space-between">` (the button row), before the closing `</Stack>`:

```jsx
{overrides && overrides.length > 0 && (
  <Stack gap="xs" mt="lg" pt="md" style={{ borderTop: '1px solid #eee' }}>
    <Title order={4}>已承认的违反 ({overrides.length})</Title>
    <table style={{ width: '100%', fontSize: 13, borderCollapse: 'collapse' }}>
      <thead>
        <tr style={{ textAlign: 'left', borderBottom: '1px solid #ddd' }}>
          <th style={{ padding: '6px 8px' }}>规则</th>
          <th style={{ padding: '6px 8px' }}>范围</th>
          <th style={{ padding: '6px 8px' }}>理由</th>
          <th style={{ padding: '6px 8px' }}>承认于</th>
          <th style={{ padding: '6px 8px' }}></th>
        </tr>
      </thead>
      <tbody>
        {overrides.map((o, i) => (
          <tr key={i} style={{ borderBottom: '1px solid #eee' }}>
            <td style={{ padding: '6px 8px' }}><code>{o.rule}</code></td>
            <td style={{ padding: '6px 8px' }}>{formatScope(o.scope)}</td>
            <td style={{ padding: '6px 8px' }}>{o.reason}</td>
            <td style={{ padding: '6px 8px' }}>{formatDate(o.acknowledged_at)}</td>
            <td style={{ padding: '6px 8px' }}>
              <Button
                size="compact-xs"
                variant="subtle"
                color="red"
                onClick={() => {
                  router.delete(`/tours/${tour.id}/overrides`, {
                    data: { rule: o.rule, scope: o.scope },
                    preserveScroll: true,
                    onSuccess: () => router.reload({ only: ['overrides'] }),
                  })
                }}
              >
                撤销
              </Button>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  </Stack>
)}
```

Add the helpers at the bottom of the file:

```jsx
function formatScope(scope) {
  if (!scope || Object.keys(scope).length === 0) return '全局'
  return Object.entries(scope).map(([k, v]) => `${k}=${v}`).join(', ')
}

function formatDate(iso) {
  if (!iso) return '—'
  const d = new Date(iso)
  return `${d.getMonth() + 1}/${d.getDate()} ${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`
}
```

- [ ] **Step 3: Run RSpec to confirm controller change works**

Run: `mise exec -- bundle exec rspec spec/requests/ --format documentation`

Expected: all PASS

- [ ] **Step 4: Commit**

```bash
git add app/controllers/tours/constitutions_controller.rb app/javascript/pages/Tour/Constitution.jsx
git commit -m "feat: Constitution page shows acknowledged overrides with revoke"
```

---

## Task 8: MembershipDrawer + header 入口

**Files:**
- Create: `app/javascript/components/planner/MembershipDrawer.jsx`
- Create: `app/javascript/components/planner/__tests__/MembershipDrawer.test.jsx`
- Modify: `app/controllers/tours_controller.rb`
- Modify: `app/javascript/pages/Tour/Show.jsx`
- Modify: `spec/requests/tours_spec.rb`

- [ ] **Step 1: Add `members` + `author` props to ToursController#show**

In `app/controllers/tours_controller.rb`, modify the `show` action:

```ruby
def show
  head :not_found and return unless @tour.visible_to?(current_user)
  render inertia: "Tour/Show", props: {
    tour: @tour.as_json.merge("editable_by_current_user" => @tour.editable_by?(current_user)),
    days: @tour.days.as_json,
    activities: @tour.activities.as_json,
    violations: Tour::ConstitutionCheck.for(@tour).map(&:to_h),
    members: @tour.tour_memberships.includes(:user).filter_map { |m|
      next unless m.user
      { id: m.id, user_id: m.user_id, email: m.user.email, role: m.role }
    },
    author: { user_id: @tour.author_id, email: @tour.author.email }
  }
end
```

- [ ] **Step 2: Write request spec for members prop**

In `spec/requests/tours_spec.rb`, add inside the main describe block:

```ruby
describe "GET /tours/:id props" do
  it "includes members and author in Inertia props" do
    tour = create(:tour, author: user)
    editor = create(:user, email: "editor@test.com")
    create(:tour_membership, tour: tour, user: editor, role: :editor)

    login_as(user)
    get "/tours/#{tour.id}"
    expect(response).to have_http_status(:ok)
    expect(response.body).to include("members")
    expect(response.body).to include("author")
    expect(response.body).to include("editor@test.com")
    expect(response.body).to include("editable_by_current_user")
  end
end
```

- [ ] **Step 3: Run spec to verify it passes**

Run: `mise exec -- bundle exec rspec spec/requests/tours_spec.rb -e "members and author" --format documentation`

Expected: PASS

- [ ] **Step 4: Create `MembershipDrawer.jsx`**

Create `app/javascript/components/planner/MembershipDrawer.jsx`:

```jsx
import { useState } from 'react'
import { Drawer, Stack, Text, Group, TextInput, Select, Button, Badge, Accordion, Table } from '@mantine/core'
import { modals } from '@mantine/modals'
import { notifications } from '@mantine/notifications'
import { router, usePage } from '@inertiajs/react'

const ROLE_OPTIONS = [
  { value: 'editor', label: '编辑者' },
  { value: 'reader', label: '只读' },
]

export default function MembershipDrawer({ opened, onClose, tour, members, author }) {
  const { current_user } = usePage().props
  const isAuthor = current_user?.id === author.user_id

  return (
    <Drawer
      opened={opened}
      onClose={onClose}
      title="本程成员"
      position="right"
      size={420}
      padding="md"
    >
      <Stack gap="md">
        <CurrentMembers
          tour={tour}
          members={members}
          author={author}
          isAuthor={isAuthor}
        />
        <InviteSection tour={tour} isAuthor={isAuthor} />
        <PermissionMatrix />
      </Stack>
    </Drawer>
  )
}

function CurrentMembers({ tour, members, author, isAuthor }) {
  return (
    <Stack gap="xs">
      <Text fw={600} size="sm">当前成员</Text>

      {/* Author row — always first, not editable */}
      <Group justify="space-between" p="xs" style={{ background: '#f9f9f9', borderRadius: 4 }}>
        <Text size="sm">{author.email}</Text>
        <Badge color="gray" variant="light">作者</Badge>
      </Group>

      {members.map(m => (
        <Group key={m.id} justify="space-between" p="xs" style={{ borderBottom: '1px solid #eee' }}>
          <Text size="sm" style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {m.email}
          </Text>
          <Group gap="xs">
            <Select
              data={ROLE_OPTIONS}
              value={m.role}
              onChange={newRole => {
                router.patch(`/tours/${tour.id}/members/${m.id}`, { role: newRole }, {
                  preserveScroll: true,
                  only: ['members'],
                })
              }}
              w={100}
              size="xs"
              allowDeselect={false}
              disabled={!isAuthor}
            />
            {isAuthor && (
              <Button
                size="compact-xs"
                variant="subtle"
                color="red"
                onClick={() => {
                  modals.openConfirmModal({
                    title: `将 ${m.email} 移出本程？`,
                    labels: { confirm: '移除', cancel: '取消' },
                    confirmProps: { color: 'red' },
                    onConfirm: () => {
                      router.delete(`/tours/${tour.id}/members/${m.id}`, {
                        preserveScroll: true,
                        only: ['members'],
                      })
                    },
                  })
                }}
              >
                移除
              </Button>
            )}
          </Group>
        </Group>
      ))}
    </Stack>
  )
}

function InviteSection({ tour, isAuthor }) {
  const [email, setEmail] = useState('')
  const [role, setRole] = useState('reader')
  const [submitting, setSubmitting] = useState(false)

  const handleInvite = () => {
    if (!email.trim()) return
    setSubmitting(true)
    router.post(`/tours/${tour.id}/members`, { email: email.trim(), role }, {
      preserveScroll: true,
      only: ['members'],
      onSuccess: () => {
        setEmail('')
        setSubmitting(false)
      },
      onError: () => {
        notifications.show({ message: '该邮箱还没注册路书账号，请让对方先注册', color: 'red' })
        setSubmitting(false)
      },
    })
  }

  return (
    <Stack gap="xs">
      <Text fw={600} size="sm">邀请新成员</Text>
      {!isAuthor && (
        <Text size="xs" c="dimmed">仅作者可改成员</Text>
      )}
      <Group>
        <TextInput
          placeholder="email@example.com"
          value={email}
          onChange={e => setEmail(e.currentTarget.value)}
          style={{ flex: 1 }}
          disabled={!isAuthor}
        />
        <Select
          data={ROLE_OPTIONS}
          value={role}
          onChange={setRole}
          w={100}
          size="sm"
          allowDeselect={false}
          disabled={!isAuthor}
        />
        <Button size="sm" onClick={handleInvite} disabled={!isAuthor} loading={submitting}>
          邀请
        </Button>
      </Group>
    </Stack>
  )
}

function PermissionMatrix() {
  return (
    <Accordion>
      <Accordion.Item value="permissions">
        <Accordion.Control>权限矩阵</Accordion.Control>
        <Accordion.Panel>
          <Table fontSize="xs">
            <Table.Thead>
              <Table.Tr>
                <Table.Th>操作</Table.Th>
                <Table.Th>作者</Table.Th>
                <Table.Th>编辑者</Table.Th>
                <Table.Th>只读</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              <Table.Tr><Table.Td>查看行程</Table.Td><Table.Td>✓</Table.Td><Table.Td>✓</Table.Td><Table.Td>✓</Table.Td></Table.Tr>
              <Table.Tr><Table.Td>编辑 Activity/Day</Table.Td><Table.Td>✓</Table.Td><Table.Td>✓</Table.Td><Table.Td>✗</Table.Td></Table.Tr>
              <Table.Tr><Table.Td>管理成员</Table.Td><Table.Td>✓</Table.Td><Table.Td>✗</Table.Td><Table.Td>✗</Table.Td></Table.Tr>
              <Table.Tr><Table.Td>删除行程</Table.Td><Table.Td>✓</Table.Td><Table.Td>✗</Table.Td><Table.Td>✗</Table.Td></Table.Tr>
            </Table.Tbody>
          </Table>
        </Accordion.Panel>
      </Accordion.Item>
    </Accordion>
  )
}
```

- [ ] **Step 5: Write MembershipDrawer tests**

Create `app/javascript/components/planner/__tests__/MembershipDrawer.test.jsx`:

```jsx
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MantineProvider } from '@mantine/core'
import { ModalsProvider } from '@mantine/modals'
import { Notifications } from '@mantine/notifications'
import { vi } from 'vitest'
import MembershipDrawer from '../MembershipDrawer'

vi.mock('@inertiajs/react', () => ({
  router: {
    post: vi.fn((url, data, opts) => opts?.onSuccess?.()),
    patch: vi.fn((url, data, opts) => opts?.onSuccess?.()),
    delete: vi.fn((url, opts) => opts?.onSuccess?.()),
  },
  usePage: () => ({ props: { current_user: { id: 1, email: 'author@test.com' } } }),
}))

const tour = { id: 42, title: 'Test' }
const author = { user_id: 1, email: 'author@test.com' }
const members = [
  { id: 10, user_id: 2, email: 'editor@test.com', role: 'editor' },
  { id: 11, user_id: 3, email: 'reader@test.com', role: 'reader' },
]

function renderDrawer(props = {}) {
  return render(
    <MantineProvider>
      <ModalsProvider>
        <Notifications />
        <MembershipDrawer
          opened={true}
          onClose={vi.fn()}
          tour={tour}
          members={members}
          author={author}
          {...props}
        />
      </ModalsProvider>
    </MantineProvider>
  )
}

test('renders author row with badge and member rows', () => {
  renderDrawer()
  expect(screen.getByText('author@test.com')).toBeInTheDocument()
  expect(screen.getByText('作者')).toBeInTheDocument()
  expect(screen.getByText('editor@test.com')).toBeInTheDocument()
  expect(screen.getByText('reader@test.com')).toBeInTheDocument()
})

test('shows invite section for author', () => {
  renderDrawer()
  expect(screen.getByPlaceholderText('email@example.com')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: '邀请' })).not.toBeDisabled()
})

test('shows remove button for members when user is author', () => {
  renderDrawer()
  const removeButtons = screen.getAllByRole('button', { name: '移除' })
  expect(removeButtons.length).toBe(2)
})

test('renders permission matrix in accordion', () => {
  renderDrawer()
  expect(screen.getByText('权限矩阵')).toBeInTheDocument()
})
```

- [ ] **Step 6: Run tests**

Run: `npx vitest run app/javascript/components/planner/__tests__/MembershipDrawer.test.jsx`

Expected: all 4 tests PASS

- [ ] **Step 7: Wire MembershipDrawer in Show.jsx**

In `app/javascript/pages/Tour/Show.jsx`, add import:

```jsx
import MembershipDrawer from '../../components/planner/MembershipDrawer'
```

Update the component signature to receive new props:

```jsx
export default function Show({ tour, days, activities, violations, members, author }) {
```

Add state:

```jsx
const [membersDrawerOpen, setMembersDrawerOpen] = useState(false)
```

Add a header row above the DndContext with the 👥 button (replace the `<div style={{ padding: 10 }}>` wrapping `ConstitutionBanner`):

```jsx
<div style={{ padding: 10 }}>
  <Group justify="space-between" mb="xs">
    <Text fw={700} size="lg">{tour.title}</Text>
    {canEdit && (
      <Button
        size="compact-sm"
        variant="subtle"
        onClick={() => setMembersDrawerOpen(true)}
        aria-label="管理成员"
      >
        👥
      </Button>
    )}
  </Group>
  <ConstitutionBanner
    violations={violations}
    onFix={(v) => setPendingChatPrompt(fixPromptFor(v))}
    onAcknowledge={(v) => setAcknowledgingViolation(v)}
    onDismiss={() => {}}
  />
</div>
```

Add `<MembershipDrawer>` after `<AcknowledgeModal>`:

```jsx
<MembershipDrawer
  opened={membersDrawerOpen}
  onClose={() => setMembersDrawerOpen(false)}
  tour={tour}
  members={members || []}
  author={author || { user_id: tour.author_id, email: '' }}
/>
```

- [ ] **Step 8: Run all JS tests**

Run: `npm test`

Expected: all PASS

- [ ] **Step 9: Commit**

```bash
git add app/javascript/components/planner/MembershipDrawer.jsx app/javascript/components/planner/__tests__/MembershipDrawer.test.jsx app/javascript/pages/Tour/Show.jsx app/controllers/tours_controller.rb spec/requests/tours_spec.rb
git commit -m "feat: MembershipDrawer with invite/role change/remove + header entry"
```

---

## Task 9: 最终验证

- [ ] **Step 1: Run full RSpec suite**

Run: `mise exec -- bundle exec rspec --format documentation`

Expected: all PASS. If failures, fix and re-run.

- [ ] **Step 2: Run full Vitest suite**

Run: `npm test`

Expected: all PASS. If failures, fix and re-run.

- [ ] **Step 3: Run RuboCop**

Run: `bin/rubocop -f github`

Expected: no offenses. Fix any style violations.

- [ ] **Step 4: Run Brakeman**

Run: `bin/brakeman --no-pager`

Expected: no warnings. Review any flagged items.

- [ ] **Step 5: Run npm audit**

Run: `npm audit`

Expected: no new vulnerabilities.

- [ ] **Step 6: Final commit (if any fixes needed)**

```bash
git add -A
git commit -m "chore: Tranche A final lint + test fixes"
```

---

## 附：Inertia `onError` 与 TourMembershipsController 的已知问题

现有 `TourMembershipsController#create` 在找不到 email 时返回 `head :not_found`。Inertia 将 4xx 非 redirect 响应交给全局错误处理（显示错误页），不会触发 `onError` callback。

Task 8 的 `MembershipDrawer` 通过 `onError` 捕获错误并显示 notification。如果这条路不通（实测 `onError` 不触发），需改 `TourMembershipsController#create`：

```ruby
# 把
head :not_found and return unless user
# 改成
unless user
  redirect_to tour_path(@tour), inertia: { errors: { email: "该邮箱还没注册路书账号" } }
  return
end
```

并在 `ApplicationController` 添加 errors sharing：

```ruby
inertia_share errors: -> { session.delete(:inertia_errors) || {} }
```

**实施时机：** Task 8 Step 4 手动测试时验证。如果 `onError` 正常触发则无需改。
