# 地点选择 + 路段概念合流重构 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让用户能准确选对地点（省市可见 + 地图拖钉）、把"路段"概念从 activity 层和 route_leg 层合流为"景观公路（tier_one road）+ 驾驶段（route_leg + 可 override）"，一并修 `Day#driving_minutes_total` 漏算 route_leg 的隐藏 bug。

**Architecture:** 三层改动协同——(1) 后端：`route_legs` 加 override 字段，`RouteLeg::Upsert` 感知景观公路的 start/end 坐标，`Day` 汇总改 hybrid sum；(2) 前端：新 `LocationPicker` 组件（single + dual 模式）替换 `PoiSearchCombobox`，新 `RouteLegEditModal` 接入驾驶段编辑；(3) 数据迁移：rake 任务把低 tier road activity 迁入 route_leg override，删掉这些 activity，加 DB check constraint 锁定 `kind=road ↔ tier_one`。

**Tech Stack:** Rails 8.0、PostgreSQL（jsonb + check constraint）、Mantine v9、React 19、AMAP Web 服务 REST + Web 端 JS SDK 2.0、RSpec、Vitest、WebMock。

**Spec:** [docs/superpowers/specs/2026-04-24-location-road-unification-design.md](../specs/2026-04-24-location-road-unification-design.md)

---

## File Structure

### 新建文件

| 路径 | 职责 |
|---|---|
| `db/migrate/<ts>_add_override_to_route_legs.rb` | 加 `distance_m_override` / `duration_s_override` / `note` / `overridden_at` / `overridden_by_id` |
| `db/migrate/<ts>_add_road_tier_one_check_constraint.rb` | 约束 `kind=road → citizen_level=tier_one` |
| `app/javascript/components/activity-editor/LocationPicker.jsx` | 新 POI 选择器（single + dual 模式） |
| `app/javascript/components/activity-editor/LocationPickerMap.jsx` | 地图缩略图 + 拖钉交互 |
| `app/javascript/components/planner/RouteLegEditModal.jsx` | 驾驶段 override 编辑 Modal |
| `app/javascript/hooks/useAmapDirection.js` | 前端调 `/amap_direction` 的 hook |
| `app/controllers/amap_directions_controller.rb` | `/amap_direction` 只读代理（给前端实时算 driving） |
| `lib/tasks/route_leg_override.rake` | 三个迁移 rake：migrate / rename / delete |
| `spec/models/route_leg_override_migration_spec.rb` | Rake 单元测试 |
| `app/javascript/components/activity-editor/__tests__/LocationPicker.test.jsx` | LocationPicker 测试 |
| `app/javascript/components/planner/__tests__/RouteLegEditModal.test.jsx` | Modal 测试 |

### 修改文件

| 路径 | 改动概要 |
|---|---|
| `app/models/poi_search.rb` | `search` 返 pname/cityname/adname/pcode |
| `app/controllers/poi_searches_controller.rb` | 透传新字段（shape 兼容） |
| `app/models/activity.rb` | `before_save` 景观公路镜像 + tier_one 必要 validation |
| `app/models/route_leg.rb` | 加 `effective_distance_m` / `effective_duration_s` / `overridden?`；`compute_endpoint_digest` 接受解析后坐标 |
| `app/models/route_leg/upsert.rb` | 解析 from/to 景观公路为 start/end；digest 改用解析后坐标 |
| `app/models/day.rb` | `driving_minutes_total` 改 hybrid sum |
| `app/controllers/route_legs_controller.rb` | 新增 `PATCH` 写 override、`DELETE` 清 override |
| `config/routes.rb` | 加 `amap_directions#show`；开放 `route_legs#update`、`destroy` |
| `app/javascript/components/activity-editor/ActivityDrawer.jsx` | `handlePoiPick` 适配 value/onChange；road kind 传 dual 模式 |
| `app/javascript/components/activity-editor/CommonFields.jsx` | 替换为 `LocationPicker`；road 特殊分支 |
| `app/javascript/components/activity-editor/detailsSchema.js` | road kind keys 改名；KIND_OPTIONS label |
| `app/javascript/components/planner/DayColumn.jsx` | 删低 tier road 分支；synthesized connector 可点击 |
| `app/javascript/components/planner/RoadConnector.jsx` | 删 activity-backed；synthesized 加 `已调整` 徽章 + onClick |
| `spec/factories/activities.rb` | road 默认 tier_one |
| `spec/models/day_spec.rb` | 覆盖 hybrid sum |
| `spec/models/route_leg/upsert_spec.rb` | 景观公路感知测试 |
| `spec/models/poi_search_spec.rb` | 新字段测试 |

### 删除文件（Phase I）

| 路径 | 原因 |
|---|---|
| `app/javascript/components/activity-editor/PoiSearchCombobox.jsx` | 被 LocationPicker 完全替代 |
| `app/javascript/components/activity-editor/__tests__/PoiSearchCombobox.test.jsx`（若存在） | 同上 |

---

## Phase A ｜后端与数据模型地基

部署后：后端 API 多返省市字段（前端暂未用）、`Day#driving_minutes_total` 修漏算 bug、景观公路感知生效（迁移前没有低 tier road 会受影响）。

### Task A.1: Migration - route_legs 加 override 字段

**Files:**
- Create: `db/migrate/<timestamp>_add_override_to_route_legs.rb`

- [ ] **Step 1: 生成 migration 文件**

```bash
bin/rails generate migration AddOverrideToRouteLegs
```

- [ ] **Step 2: 填充 migration**

编辑新生成的 `db/migrate/<timestamp>_add_override_to_route_legs.rb`：

```ruby
class AddOverrideToRouteLegs < ActiveRecord::Migration[8.0]
  def change
    add_column :route_legs, :distance_m_override, :integer
    add_column :route_legs, :duration_s_override, :integer
    add_column :route_legs, :note,                :text
    add_column :route_legs, :overridden_at,       :datetime
    add_reference :route_legs, :overridden_by, foreign_key: { to_table: :users }, null: true
  end
end
```

- [ ] **Step 3: 跑 migration**

```bash
bin/rails db:migrate
```

Expected: `== <ts> AddOverrideToRouteLegs: migrated`。`db/schema.rb` 多出 5 列。

- [ ] **Step 4: 提交**

```bash
git add db/migrate/ db/schema.rb
git commit -m "feat(route_leg): 加 override 字段 (distance/duration/note/audit)"
```

---

### Task A.2: RouteLeg model - override helpers

**Files:**
- Modify: `app/models/route_leg.rb`
- Test: `spec/models/route_leg_spec.rb`

- [ ] **Step 1: 写失败测试**

在 `spec/models/route_leg_spec.rb` 末尾（`end` 之前）加：

```ruby
describe "override" do
  let(:tour) { create(:tour) }
  let(:from_act) { create(:activity, tour: tour, lat: 36.0, lng: 103.0) }
  let(:to_act)   { create(:activity, tour: tour, lat: 37.0, lng: 104.0, position: 2) }
  let(:leg) do
    RouteLeg.create!(tour: tour, from_activity: from_act, to_activity: to_act,
                     mode: :driving, distance_m: 100_000, duration_s: 3600,
                     polyline: { "coords" => [] })
  end

  it "#overridden? is false when overridden_at is nil" do
    expect(leg.overridden?).to be false
  end

  it "#overridden? is true when overridden_at is set" do
    leg.update!(overridden_at: Time.current)
    expect(leg.overridden?).to be true
  end

  it "#effective_distance_m returns override when present" do
    leg.update!(distance_m_override: 120_000, overridden_at: Time.current)
    expect(leg.effective_distance_m).to eq(120_000)
  end

  it "#effective_distance_m falls back to distance_m when override nil" do
    expect(leg.effective_distance_m).to eq(100_000)
  end

  it "#effective_duration_s returns override when present" do
    leg.update!(duration_s_override: 4000, overridden_at: Time.current)
    expect(leg.effective_duration_s).to eq(4000)
  end

  it "#effective_duration_s falls back to duration_s when override nil" do
    expect(leg.effective_duration_s).to eq(3600)
  end
end
```

- [ ] **Step 2: 跑测试确认失败**

```bash
bin/rspec spec/models/route_leg_spec.rb
```

Expected: FAIL `NoMethodError: undefined method 'overridden?'`（或类似）

- [ ] **Step 3: 实现 helpers**

编辑 `app/models/route_leg.rb`，在 `cache_valid?` 后面加：

```ruby
  def overridden?
    overridden_at.present?
  end

  def effective_distance_m
    distance_m_override || distance_m
  end

  def effective_duration_s
    duration_s_override || duration_s
  end
```

- [ ] **Step 4: 跑测试确认通过**

```bash
bin/rspec spec/models/route_leg_spec.rb
```

Expected: 全绿。

- [ ] **Step 5: 提交**

```bash
git add app/models/route_leg.rb spec/models/route_leg_spec.rb
git commit -m "feat(route_leg): #overridden? / #effective_distance_m / #effective_duration_s"
```

---

### Task A.3: PoiSearch 返 pname/cityname/adname/pcode

**Files:**
- Modify: `app/models/poi_search.rb`
- Test: `spec/models/poi_search_spec.rb`

- [ ] **Step 1: 写失败测试**

编辑 `spec/models/poi_search_spec.rb`，把现有第一个测试的 `body.pois` 扩展并加 expectations：

```ruby
    it "returns a list of POI candidates from AMAP v5/place/text" do
      stub_request(:get, "https://restapi.amap.com/v5/place/text")
        .with(query: hash_including(
          "keywords" => "赛里木湖",
          "key" => api_key,
          "output" => "JSON"
        ))
        .to_return(
          status: 200,
          body: {
            status: "1",
            pois: [
              {
                name: "赛里木湖", location: "81.20,44.55", address: "博州", type: "风景名胜",
                pname: "新疆维吾尔自治区", cityname: "博尔塔拉蒙古自治州",
                adname: "博乐市", pcode: "650000"
              }
            ]
          }.to_json,
          headers: { "Content-Type" => "application/json" }
        )

      results = described_class.new.search("赛里木湖")
      expect(results.first[:name]).to eq("赛里木湖")
      expect(results.first[:lat]).to eq(44.55)
      expect(results.first[:lng]).to eq(81.20)
      expect(results.first[:address]).to eq("博州")
      expect(results.first[:pname]).to eq("新疆维吾尔自治区")
      expect(results.first[:cityname]).to eq("博尔塔拉蒙古自治州")
      expect(results.first[:adname]).to eq("博乐市")
      expect(results.first[:pcode]).to eq("650000")
    end
```

- [ ] **Step 2: 跑测试确认失败**

```bash
bin/rspec spec/models/poi_search_spec.rb
```

Expected: FAIL（`results.first[:pname]` 返 nil）。

- [ ] **Step 3: 改实现**

编辑 `app/models/poi_search.rb` 的 `Array(data["pois"]).map` 块：

```ruby
    Array(data["pois"]).map do |poi|
      lng, lat = poi["location"].to_s.split(",").map(&:to_f)
      {
        name:     poi["name"],
        lat:      lat,
        lng:      lng,
        address:  poi["address"],
        type:     poi["type"],
        pname:    poi["pname"],
        cityname: poi["cityname"],
        adname:   poi["adname"],
        pcode:    poi["pcode"]
      }
    end
```

- [ ] **Step 4: 跑测试确认通过**

```bash
bin/rspec spec/models/poi_search_spec.rb
```

Expected: 全绿。

- [ ] **Step 5: 验证 controller 透传（手动 smoke）**

```bash
bin/rails runner 'r = PoiSearch.new.search("北京"); puts r.first.to_json'
```

Expected: 输出 JSON 包含 `"pname"` key。（若本地无 AMAP_API_KEY 跳过。）

- [ ] **Step 6: 提交**

```bash
git add app/models/poi_search.rb spec/models/poi_search_spec.rb
git commit -m "feat(poi_search): 返省市区 pname/cityname/adname/pcode 供消歧义"
```

---

### Task A.4: Activity before_save 景观公路镜像 + tier_one 校验

**Files:**
- Modify: `app/models/activity.rb`
- Test: `spec/models/activity_spec.rb`

- [ ] **Step 1: 写失败测试**

在 `spec/models/activity_spec.rb` 末尾加 describe 块：

```ruby
  describe "scenic road (kind=road, citizen_level=tier_one)" do
    let(:tour) { create(:tour) }
    let(:day)  { tour.days.first }

    it "mirrors lat/lng/address from details.start_* on save" do
      a = Activity.create!(
        tour: tour, day: day, name: "独库公路",
        kind: :road, citizen_level: :tier_one, position: 1,
        details: {
          "start_lat" => 42.9, "start_lng" => 83.5, "start_address" => "独库南入口",
          "end_lat"   => 44.0, "end_lng"   => 84.7, "end_address"   => "独库北出口"
        }
      )
      expect(a.lat.to_f).to eq(42.9)
      expect(a.lng.to_f).to eq(83.5)
      expect(a.address).to eq("独库南入口")
    end

    it "rejects kind=road with citizen_level != tier_one (model validation)" do
      a = build(:activity, tour: tour, day: day, kind: :road, citizen_level: :tier_two)
      expect(a).not_to be_valid
      expect(a.errors[:citizen_level]).to include(/景观公路必须为 tier_one/)
    end
  end
```

- [ ] **Step 2: 跑测试确认失败**

```bash
bin/rspec spec/models/activity_spec.rb -e "scenic road"
```

Expected: FAIL。

- [ ] **Step 3: 改 activity.rb**

在 `app/models/activity.rb` 里加回调和校验（位置：现有 validation 之后）：

```ruby
  before_save :mirror_scenic_road_start_coords

  validate :road_must_be_tier_one

  private

  def mirror_scenic_road_start_coords
    return unless road? && tier_one?
    d = details || {}
    self.lat     = d["start_lat"]     if d["start_lat"].present?
    self.lng     = d["start_lng"]     if d["start_lng"].present?
    self.address = d["start_address"] if d["start_address"].present?
  end

  def road_must_be_tier_one
    return unless road?
    errors.add(:citizen_level, "景观公路必须为 tier_one") unless tier_one?
  end
```

（注意：`road?` / `tier_one?` 是 Rails enum 自动生成的谓词方法。如果 activity.rb 已有 `private`，把新增方法插入 private 块。确保 `before_save` 放在 public 部分。）

- [ ] **Step 4: 跑测试确认通过**

```bash
bin/rspec spec/models/activity_spec.rb -e "scenic road"
```

Expected: 通过。

- [ ] **Step 5: 跑完整 activity spec 防回归**

```bash
bin/rspec spec/models/activity_spec.rb
```

Expected: 全绿。（若原测试依赖 `kind: :road, citizen_level: :tier_three`——通常来自 factory 的 `citizen_level :tier_three` default——会出错。下个 task 改 factory 解决。）

- [ ] **Step 6: 调整 factory**

编辑 `spec/factories/activities.rb`：

```ruby
FactoryBot.define do
  factory :activity do
    tour
    day { nil }
    sequence(:position) { |n| n }
    sequence(:name) { |n| "Activity #{n}" }
    kind { :scenic }
    citizen_level { :tier_three }

    trait :scenic_road do
      kind { :road }
      citizen_level { :tier_one }
      details do
        {
          "start_lat" => 42.9, "start_lng" => 83.5, "start_name" => "南入口",
          "end_lat"   => 44.0, "end_lng"   => 84.7, "end_name"   => "北出口",
          "km" => 120, "drive_min" => 180
        }
      end
    end
  end
end
```

- [ ] **Step 7: 再跑**

```bash
bin/rspec spec/models/activity_spec.rb spec/models/day_spec.rb spec/models/route_leg/upsert_spec.rb
```

Expected: 全绿。若 upsert_spec 里有 `create(:activity, ..., kind: :road)` 带 tier_three default 会失败——改为 `:scenic_road` trait 或显式 `citizen_level: :tier_one`。

- [ ] **Step 8: 提交**

```bash
git add app/models/activity.rb spec/models/activity_spec.rb spec/factories/activities.rb spec/models/route_leg/
git commit -m "feat(activity): 景观公路起点坐标镜像 + tier_one 校验 + factory trait"
```

---

### Task A.5: RouteLeg.compute_endpoint_digest 改用解析后坐标

**Files:**
- Modify: `app/models/route_leg.rb`
- Test: `spec/models/route_leg_spec.rb`

说明：`compute_endpoint_digest` 今天直接用 activity.lat/lng。改后景观公路要用 details.start/end。既然景观公路 before_save 已把 lat/lng 镜像到 start，对非景观公路端点两种写法等价；但当 activity 是 to_activity 时需要用 end，必须显式解析。把解析逻辑抽到一个 helper。

- [ ] **Step 1: 写失败测试**

在 `spec/models/route_leg_spec.rb` "override" 块之后加：

```ruby
describe "endpoint digest with scenic road" do
  let(:tour) { create(:tour) }
  let(:prev) { create(:activity, tour: tour, lat: 36.0, lng: 103.0, position: 1) }
  let(:scenic) { create(:activity, :scenic_road, tour: tour, position: 2) }

  it "uses scenic road's details.start as TO endpoint digest input" do
    # When scenic is TO, use its start_lat/start_lng (entering the scenic road)
    digest_args = RouteLeg.resolve_endpoint_coords(from_activity: prev, to_activity: scenic)
    expect(digest_args[:from_lat].to_f).to eq(36.0)
    expect(digest_args[:from_lng].to_f).to eq(103.0)
    expect(digest_args[:to_lat].to_f).to eq(42.9)
    expect(digest_args[:to_lng].to_f).to eq(83.5)
  end

  it "uses scenic road's details.end as FROM endpoint digest input" do
    # When scenic is FROM, use its end_lat/end_lng (leaving the scenic road)
    next_act = create(:activity, tour: tour, lat: 45.0, lng: 85.0, position: 3)
    digest_args = RouteLeg.resolve_endpoint_coords(from_activity: scenic, to_activity: next_act)
    expect(digest_args[:from_lat].to_f).to eq(44.0)
    expect(digest_args[:from_lng].to_f).to eq(84.7)
    expect(digest_args[:to_lat].to_f).to eq(45.0)
    expect(digest_args[:to_lng].to_f).to eq(85.0)
  end
end
```

- [ ] **Step 2: 跑测试确认失败**

```bash
bin/rspec spec/models/route_leg_spec.rb -e "endpoint digest with scenic road"
```

Expected: FAIL `NoMethodError: undefined method 'resolve_endpoint_coords'`。

- [ ] **Step 3: 加 `resolve_endpoint_coords` 类方法**

编辑 `app/models/route_leg.rb`，在 `compute_endpoint_digest` 之前加：

```ruby
  # Resolve "real" endpoint coords for leg computation. For tier_one road
  # activities (景观公路), use details.start_* when activity is TO (entering)
  # and details.end_* when activity is FROM (leaving). Other activities use
  # their lat/lng directly.
  def self.resolve_endpoint_coords(from_activity:, to_activity:)
    from_lat, from_lng = resolve_for(from_activity, role: :from)
    to_lat,   to_lng   = resolve_for(to_activity,   role: :to)
    { from_lat: from_lat, from_lng: from_lng, to_lat: to_lat, to_lng: to_lng }
  end

  def self.resolve_for(activity, role:)
    if activity.kind == "road" && activity.citizen_level == "tier_one"
      d = activity.details || {}
      if role == :from
        [ d["end_lat"], d["end_lng"] ]
      else
        [ d["start_lat"], d["start_lng"] ]
      end
    else
      [ activity.lat, activity.lng ]
    end
  end
  private_class_method :resolve_for
```

- [ ] **Step 4: 改 `expected_endpoint_digest` 用新解析**

在同一文件，替换 `expected_endpoint_digest`：

```ruby
  def expected_endpoint_digest
    args = self.class.resolve_endpoint_coords(
      from_activity: from_activity, to_activity: to_activity
    )
    self.class.compute_endpoint_digest(
      from_lat: args[:from_lat], from_lng: args[:from_lng],
      to_lat:   args[:to_lat],   to_lng:   args[:to_lng],
      mode:     mode
    )
  end
```

- [ ] **Step 5: 跑测试**

```bash
bin/rspec spec/models/route_leg_spec.rb
```

Expected: 全绿。

- [ ] **Step 6: 提交**

```bash
git add app/models/route_leg.rb spec/models/route_leg_spec.rb
git commit -m "feat(route_leg): resolve_endpoint_coords 解析景观公路 start/end"
```

---

### Task A.6: RouteLeg::Upsert 用解析后坐标调 AMAP

**Files:**
- Modify: `app/models/route_leg/upsert.rb`
- Test: `spec/models/route_leg/upsert_spec.rb`

- [ ] **Step 1: 写失败测试**

在 `spec/models/route_leg/upsert_spec.rb` 末尾（`end` 之前）加：

```ruby
  describe "scenic road endpoint resolution" do
    let(:scenic) { create(:activity, :scenic_road, tour: tour, position: 2) }
    let(:post_scenic) { create(:activity, tour: tour, lat: 45.0, lng: 85.0, position: 3) }

    it "calls Amap with scenic start coords when scenic is TO" do
      allow(fake_service).to receive(:fetch).and_return(fake_result)
      described_class.new(
        tour: tour, from_activity_id: from_act.id, to_activity_id: scenic.id,
        mode: :driving, service: fake_service
      ).call

      expect(fake_service).to have_received(:fetch).with(
        hash_including(to_lat: 42.9, to_lng: 83.5)
      )
    end

    it "calls Amap with scenic end coords when scenic is FROM" do
      allow(fake_service).to receive(:fetch).and_return(fake_result)
      described_class.new(
        tour: tour, from_activity_id: scenic.id, to_activity_id: post_scenic.id,
        mode: :driving, service: fake_service
      ).call

      expect(fake_service).to have_received(:fetch).with(
        hash_including(from_lat: 44.0, from_lng: 84.7)
      )
    end
  end
```

- [ ] **Step 2: 跑测试确认失败**

```bash
bin/rspec spec/models/route_leg/upsert_spec.rb -e "scenic road endpoint resolution"
```

Expected: FAIL——`fetch` 被以 `from_lat: 42.9`（镜像后的）调用，而非 `to_lat: 42.9`，因为 upsert 今天直接用 `from.lat / to.lat`。

- [ ] **Step 3: 改 `Upsert#call`**

编辑 `app/models/route_leg/upsert.rb`，替换 `@service.fetch(...)` 调用：

```ruby
    args = RouteLeg.resolve_endpoint_coords(from_activity: from, to_activity: to)
    result = @service.fetch(
      from_lat: args[:from_lat].to_f, from_lng: args[:from_lng].to_f,
      to_lat:   args[:to_lat].to_f,   to_lng:   args[:to_lng].to_f,
      mode:     @mode
    )
```

（替换掉原 `result = @service.fetch(from_lat: from.lat.to_f, ...)` 那一段。）

- [ ] **Step 4: 跑测试**

```bash
bin/rspec spec/models/route_leg/upsert_spec.rb
```

Expected: 全绿（含新加的 scenic road 测试）。

- [ ] **Step 5: 提交**

```bash
git add app/models/route_leg/upsert.rb spec/models/route_leg/upsert_spec.rb
git commit -m "feat(route_leg): Upsert 景观公路感知 (从 start/end 取坐标调 AMAP)"
```

---

### Task A.7: Day#driving_minutes_total hybrid sum

**Files:**
- Modify: `app/models/day.rb`
- Test: `spec/models/day_spec.rb`

- [ ] **Step 1: 写失败测试**

编辑 `spec/models/day_spec.rb` 的 `describe "#driving_minutes_total"` 块，新增测试并调整旧测试：

```ruby
  describe "#driving_minutes_total" do
    let(:tour) { create(:tour) }
    let(:day) { create(:day, tour: tour, day_index: 2) }

    it "sums route_leg duration (effective) across this day's activities" do
      a1 = create(:activity, tour: tour, day: day, lat: 36.0, lng: 103.0, position: 1)
      a2 = create(:activity, tour: tour, day: day, lat: 37.0, lng: 104.0, position: 2)
      RouteLeg.create!(tour: tour, from_activity: a1, to_activity: a2,
                       mode: :driving, distance_m: 100_000, duration_s: 7200,
                       polyline: { "coords" => [] })
      expect(day.driving_minutes_total).to eq(120)  # 7200s / 60
    end

    it "uses duration_s_override when set (via effective)" do
      a1 = create(:activity, tour: tour, day: day, lat: 36.0, lng: 103.0, position: 1)
      a2 = create(:activity, tour: tour, day: day, lat: 37.0, lng: 104.0, position: 2)
      RouteLeg.create!(tour: tour, from_activity: a1, to_activity: a2,
                       mode: :driving, distance_m: 100_000, duration_s: 7200,
                       duration_s_override: 10_800, overridden_at: Time.current,
                       polyline: { "coords" => [] })
      expect(day.driving_minutes_total).to eq(180)  # 10800 / 60
    end

    it "adds tier_one scenic road's details.drive_min on top of legs" do
      a1 = create(:activity, tour: tour, day: day, lat: 36.0, lng: 103.0, position: 1)
      scenic = create(:activity, :scenic_road, tour: tour, day: day, position: 2)
      # Leg prev → scenic exists, contributes 60 min
      RouteLeg.create!(tour: tour, from_activity: a1, to_activity: scenic,
                       mode: :driving, distance_m: 50_000, duration_s: 3600,
                       polyline: { "coords" => [] })
      # Scenic itself contributes its own drive_min (180 from trait)
      expect(day.driving_minutes_total).to eq(60 + 180)
    end

    it "returns 0 when no activities and no legs" do
      expect(day.driving_minutes_total).to eq(0)
    end
  end
```

- [ ] **Step 2: 跑测试确认失败**

```bash
bin/rspec spec/models/day_spec.rb -e "driving_minutes_total"
```

Expected: FAIL（今天的实现是 activity-only）。

- [ ] **Step 3: 改 `Day#driving_minutes_total`**

编辑 `app/models/day.rb`，替换方法：

```ruby
  def driving_minutes_total
    leg_minutes + scenic_road_minutes
  end

  private

  def leg_minutes
    RouteLeg
      .where(from_activity_id: activities.pluck(:id))
      .sum { |l| l.effective_duration_s.to_i } / 60
  end

  def scenic_road_minutes
    activities
      .where(kind: :road, citizen_level: :tier_one)
      .sum { |a| a.details["drive_min"].to_i }
  end
```

（如果文件里已有 `private` 块，把新方法放在已有 `private` 后面；否则创建 private 块。`hard_violation?` 的 private 保留。）

- [ ] **Step 4: 跑测试**

```bash
bin/rspec spec/models/day_spec.rb
```

Expected: 全绿。

- [ ] **Step 5: 提交**

```bash
git add app/models/day.rb spec/models/day_spec.rb
git commit -m "fix(day): driving_minutes_total 合并 route_leg + 景观公路 (修漏算 bug)"
```

---

## Phase B ｜LocationPicker single mode

部署后（结合 Phase C）：普通 kind 抽屉的地点选择面目一新（省市可见、地图预览、拖钉微调）。

### Task B.1: `useAmapDirection` hook

**Files:**
- Create: `app/javascript/hooks/useAmapDirection.js`
- Test: `app/javascript/hooks/__tests__/useAmapDirection.test.js`

- [ ] **Step 1: 写失败测试**

新建 `app/javascript/hooks/__tests__/useAmapDirection.test.js`：

```javascript
import { renderHook, waitFor } from '@testing-library/react'
import { vi, beforeEach } from 'vitest'
import useAmapDirection from '../useAmapDirection'

global.fetch = vi.fn()

beforeEach(() => { global.fetch.mockReset() })

describe('useAmapDirection', () => {
  it('returns null state initially', () => {
    const { result } = renderHook(() => useAmapDirection(null))
    expect(result.current).toEqual({ status: 'idle', data: null, error: null })
  })

  it('fetches when all four coords present', async () => {
    global.fetch.mockResolvedValue({
      ok: true,
      json: async () => ({ distance_m: 120000, duration_s: 9000 })
    })
    const { result } = renderHook(() =>
      useAmapDirection({ from: { lat: 42.9, lng: 83.5 }, to: { lat: 44.0, lng: 84.7 } })
    )
    await waitFor(() => expect(result.current.status).toBe('ready'))
    expect(result.current.data).toEqual({ distance_m: 120000, duration_s: 9000 })
  })

  it('returns error on 502', async () => {
    global.fetch.mockResolvedValue({ ok: false, status: 502 })
    const { result } = renderHook(() =>
      useAmapDirection({ from: { lat: 1, lng: 1 }, to: { lat: 2, lng: 2 } })
    )
    await waitFor(() => expect(result.current.status).toBe('error'))
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

```bash
npm test -- useAmapDirection
```

Expected: FAIL - module not found.

- [ ] **Step 3: 实现 hook**

新建 `app/javascript/hooks/useAmapDirection.js`：

```javascript
import { useEffect, useState } from 'react'

/**
 * Fetch AMAP driving distance/duration between two coords.
 * @param {null | { from: { lat, lng }, to: { lat, lng } }} coords
 * @returns {{ status: 'idle'|'loading'|'ready'|'error', data, error }}
 */
export default function useAmapDirection(coords) {
  const [state, setState] = useState({ status: 'idle', data: null, error: null })

  useEffect(() => {
    if (!coords || !coords.from || !coords.to) {
      setState({ status: 'idle', data: null, error: null })
      return
    }
    const { from, to } = coords
    if ([from.lat, from.lng, to.lat, to.lng].some(v => v == null)) {
      setState({ status: 'idle', data: null, error: null })
      return
    }

    let cancelled = false
    setState({ status: 'loading', data: null, error: null })

    const url = `/amap_direction?from_lat=${from.lat}&from_lng=${from.lng}` +
                `&to_lat=${to.lat}&to_lng=${to.lng}`
    fetch(url)
      .then(res => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        return res.json()
      })
      .then(data => {
        if (!cancelled) setState({ status: 'ready', data, error: null })
      })
      .catch(err => {
        if (!cancelled) setState({ status: 'error', data: null, error: err.message })
      })

    return () => { cancelled = true }
  }, [coords?.from?.lat, coords?.from?.lng, coords?.to?.lat, coords?.to?.lng])

  return state
}
```

- [ ] **Step 4: 跑测试**

```bash
npm test -- useAmapDirection
```

Expected: 全绿。

- [ ] **Step 5: 加后端路由 + controller**

编辑 `config/routes.rb`，在合适位置加：

```ruby
  get "/amap_direction", to: "amap_directions#show"
```

新建 `app/controllers/amap_directions_controller.rb`：

```ruby
class AmapDirectionsController < ApplicationController
  before_action :require_login

  def show
    result = AmapDirectionService.new.fetch(
      from_lat: params[:from_lat].to_f, from_lng: params[:from_lng].to_f,
      to_lat:   params[:to_lat].to_f,   to_lng:   params[:to_lng].to_f,
      mode:     :driving
    )
    render json: { distance_m: result[:distance_m], duration_s: result[:duration_s] }
  rescue AmapDirectionService::Error => e
    render json: { error: e.message }, status: :bad_gateway
  end
end
```

- [ ] **Step 6: 写 request spec**

新建 `spec/requests/amap_directions_spec.rb`：

```ruby
require "rails_helper"

RSpec.describe "AmapDirections", type: :request do
  let(:user) { create(:user) }

  before { post "/login_test", params: { user_id: user.id } }

  it "returns distance + duration from AmapDirectionService" do
    svc = instance_double(AmapDirectionService)
    allow(AmapDirectionService).to receive(:new).and_return(svc)
    allow(svc).to receive(:fetch).and_return(
      distance_m: 120_000, duration_s: 9000, polyline: { "coords" => [] }
    )

    get "/amap_direction", params: {
      from_lat: 42.9, from_lng: 83.5, to_lat: 44.0, to_lng: 84.7
    }
    expect(response).to have_http_status(:ok)
    expect(JSON.parse(response.body)).to include("distance_m" => 120_000, "duration_s" => 9000)
  end
end
```

- [ ] **Step 7: 跑后端测试**

```bash
bin/rspec spec/requests/amap_directions_spec.rb
```

Expected: 全绿。

- [ ] **Step 8: 提交**

```bash
git add app/javascript/hooks/useAmapDirection.js app/javascript/hooks/__tests__/useAmapDirection.test.js \
         app/controllers/amap_directions_controller.rb config/routes.rb \
         spec/requests/amap_directions_spec.rb
git commit -m "feat: /amap_direction 代理 + useAmapDirection hook"
```

---

### Task B.2: LocationPickerMap 组件（拖钉）

**Files:**
- Create: `app/javascript/components/activity-editor/LocationPickerMap.jsx`
- Test: `app/javascript/components/activity-editor/__tests__/LocationPickerMap.test.jsx`

- [ ] **Step 1: 写失败测试**

新建 `app/javascript/components/activity-editor/__tests__/LocationPickerMap.test.jsx`：

```jsx
import { render, screen } from '@testing-library/react'
import { MantineProvider } from '@mantine/core'
import { vi } from 'vitest'
import LocationPickerMap from '../LocationPickerMap'

// Mock useAmap to "ready" so AMap.Map code path runs
vi.mock('../../../hooks/useAmap', () => ({
  default: () => 'ready'
}))
vi.mock('@inertiajs/react', () => ({
  usePage: () => ({ props: { amap_js_api_key: 'k', amap_js_security_code: 's' } })
}))

// Stub window.AMap with a minimal spy API
const markerSetPosition = vi.fn()
const markerOn = vi.fn()
const mapOn = vi.fn()
beforeEach(() => {
  markerSetPosition.mockClear()
  markerOn.mockClear()
  mapOn.mockClear()
  window.AMap = {
    Map: vi.fn().mockImplementation(() => ({ destroy: vi.fn(), on: mapOn, setCenter: vi.fn() })),
    Marker: vi.fn().mockImplementation(() => ({
      setMap: vi.fn(), setPosition: markerSetPosition, on: markerOn
    }))
  }
})

const renderWrap = (props) => render(
  <MantineProvider><LocationPickerMap {...props} /></MantineProvider>
)

describe('LocationPickerMap', () => {
  it('renders "地图加载中" placeholder before SDK ready', () => {
    vi.resetModules()
    // Override useAmap to 'loading' — separate test would need remock; instead verify ready path
    renderWrap({ lat: 42.9, lng: 83.5, onMove: vi.fn() })
    // When ready, placeholder should NOT be present
    expect(screen.queryByText(/地图加载中/)).not.toBeInTheDocument()
  })

  it('creates draggable marker bound to onMove', () => {
    const onMove = vi.fn()
    renderWrap({ lat: 42.9, lng: 83.5, onMove })
    expect(window.AMap.Marker).toHaveBeenCalledWith(expect.objectContaining({ draggable: true }))
    // Simulate drag by calling the registered 'dragend' handler
    const dragendCall = markerOn.mock.calls.find(c => c[0] === 'dragend')
    expect(dragendCall).toBeTruthy()
    // Handler should call onMove with new lat/lng
    const handler = dragendCall[1]
    handler({ target: { getPosition: () => ({ getLat: () => 43.0, getLng: () => 83.6 }) } })
    expect(onMove).toHaveBeenCalledWith({ lat: 43.0, lng: 83.6 })
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

```bash
npm test -- LocationPickerMap
```

Expected: FAIL - module not found.

- [ ] **Step 3: 实现 LocationPickerMap**

新建 `app/javascript/components/activity-editor/LocationPickerMap.jsx`：

```jsx
import { useEffect, useRef } from 'react'
import { usePage } from '@inertiajs/react'
import { Paper, Text } from '@mantine/core'
import useAmap from '../../hooks/useAmap'

// Interactive mini-map for LocationPicker: draggable pin that calls onMove on
// dragend. Unlike ActivityMiniMap (read-only), this one enables pan/zoom/drag
// and listens for map 'click' to re-position the pin. Reuses useAmap for
// shared SDK loading.
export default function LocationPickerMap({ lat, lng, onMove, height = 180 }) {
  const { amap_js_api_key, amap_js_security_code } = usePage().props
  const sdkState = useAmap(amap_js_api_key, amap_js_security_code)
  const containerRef = useRef(null)
  const mapRef = useRef(null)
  const markerRef = useRef(null)

  useEffect(() => {
    if (sdkState !== 'ready') return
    if (!containerRef.current || lat == null || lng == null) return

    const map = new window.AMap.Map(containerRef.current, {
      zoom: 14,
      center: [ lng, lat ],
      dragEnable: true,
      zoomEnable: true,
      doubleClickZoom: true,
      scrollWheel: true,
      keyboardEnable: false,
    })
    mapRef.current = map

    const marker = new window.AMap.Marker({
      position: [ lng, lat ],
      map,
      draggable: true,
      anchor: 'bottom-center',
    })
    markerRef.current = marker

    const handleDragend = (e) => {
      const pos = e.target.getPosition()
      onMove?.({ lat: pos.getLat(), lng: pos.getLng() })
    }
    marker.on('dragend', handleDragend)

    const handleClick = (e) => {
      const nextLat = e.lnglat.getLat()
      const nextLng = e.lnglat.getLng()
      marker.setPosition([ nextLng, nextLat ])
      onMove?.({ lat: nextLat, lng: nextLng })
    }
    map.on('click', handleClick)

    return () => {
      marker?.setMap(null)
      map?.destroy()
      mapRef.current = null
      markerRef.current = null
    }
  }, [sdkState, lat, lng])  // eslint-disable-line react-hooks/exhaustive-deps

  if (sdkState === 'loading') {
    return <Paper withBorder p="sm" style={{ height }}><Text size="xs" c="dimmed">地图加载中…</Text></Paper>
  }
  if (sdkState === 'error') {
    return <Paper withBorder p="sm" style={{ height }}><Text size="xs" c="red">地图不可用</Text></Paper>
  }
  return <div ref={containerRef} style={{ height, borderRadius: 4, overflow: 'hidden' }} />
}
```

- [ ] **Step 4: 跑测试**

```bash
npm test -- LocationPickerMap
```

Expected: 全绿。

- [ ] **Step 5: 提交**

```bash
git add app/javascript/components/activity-editor/LocationPickerMap.jsx \
         app/javascript/components/activity-editor/__tests__/LocationPickerMap.test.jsx
git commit -m "feat(activity-editor): LocationPickerMap (小地图 + 拖钉)"
```

---

### Task B.3: LocationPicker 组件（single mode）

**Files:**
- Create: `app/javascript/components/activity-editor/LocationPicker.jsx`
- Test: `app/javascript/components/activity-editor/__tests__/LocationPicker.test.jsx`

- [ ] **Step 1: 写失败测试**

新建 `app/javascript/components/activity-editor/__tests__/LocationPicker.test.jsx`：

```jsx
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MantineProvider } from '@mantine/core'
import { vi, beforeEach } from 'vitest'
import LocationPicker from '../LocationPicker'

vi.mock('../LocationPickerMap', () => ({
  default: ({ lat, lng, onMove }) => (
    <div data-testid="map-stub" data-lat={lat} data-lng={lng}>
      <button onClick={() => onMove({ lat: 43, lng: 84 })}>drag-pin</button>
    </div>
  )
}))

global.fetch = vi.fn()

const renderLP = (props = {}) => render(
  <MantineProvider>
    <LocationPicker value={null} onChange={vi.fn()} {...props} />
  </MantineProvider>
)

beforeEach(() => { global.fetch.mockReset() })

describe('LocationPicker (single)', () => {
  it('shows "搜索地点" input when no value', () => {
    renderLP()
    expect(screen.getByPlaceholderText(/输入地名/)).toBeInTheDocument()
  })

  it('debounced search hits /poi_search with province-rich results', async () => {
    global.fetch.mockResolvedValue({
      ok: true,
      json: async () => ({ candidates: [
        { name: '金刚镇人民政府', lat: 28.1, lng: 113.0,
          pname: '湖南省', cityname: '长沙市', adname: '浏阳市',
          address: '金刚镇平湾村', type: '政府机构' }
      ]})
    })
    renderLP()
    fireEvent.change(screen.getByPlaceholderText(/输入地名/), { target: { value: '金刚' } })
    await waitFor(() => expect(global.fetch).toHaveBeenCalled())
    await waitFor(() => expect(screen.getByText('金刚镇人民政府')).toBeInTheDocument())
    expect(screen.getByText(/湖南省·长沙市·浏阳市/)).toBeInTheDocument()
  })

  it('fires onChange with full POI fields on option click', async () => {
    const onChange = vi.fn()
    global.fetch.mockResolvedValue({
      ok: true,
      json: async () => ({ candidates: [
        { name: '金刚镇', lat: 28.1, lng: 113.0,
          pname: '湖南省', cityname: '长沙市', adname: '浏阳市',
          address: '平湾村', type: '乡镇' }
      ]})
    })
    renderLP({ onChange })
    fireEvent.change(screen.getByPlaceholderText(/输入地名/), { target: { value: '金刚' } })
    await waitFor(() => expect(screen.getByText('金刚镇')).toBeInTheDocument())
    fireEvent.click(screen.getByText('金刚镇'))
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({
      name: '金刚镇', lat: 28.1, lng: 113.0,
      pname: '湖南省', cityname: '长沙市', adname: '浏阳市'
    }))
  })

  it('after selection shows summary chip with province and [重选] button', async () => {
    const onChange = vi.fn()
    renderLP({
      value: { name: '春丽和金刚小酒馆', lat: 28.1, lng: 113.0,
               pname: '湖南省', cityname: '长沙市', adname: '岳麓区',
               address: '...', type: '餐饮' },
      onChange
    })
    expect(screen.getByText('春丽和金刚小酒馆')).toBeInTheDocument()
    expect(screen.getByText(/湖南省·长沙市·岳麓区/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /重选/ })).toBeInTheDocument()
  })

  it('dragging pin updates lat/lng via onChange', () => {
    const onChange = vi.fn()
    renderLP({
      value: { name: 'X', lat: 28.1, lng: 113.0, pname: '湖', cityname: '长', adname: '岳' },
      onChange
    })
    fireEvent.click(screen.getByText('drag-pin'))
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ lat: 43, lng: 84 }))
  })

  it('region chip from regionHint is shown and closable', () => {
    renderLP({ regionHint: '浏阳市' })
    expect(screen.getByText(/城市: 浏阳市/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /关闭城市/ })).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

```bash
npm test -- LocationPicker.test
```

Expected: FAIL - module not found.

- [ ] **Step 3: 实现 LocationPicker**

新建 `app/javascript/components/activity-editor/LocationPicker.jsx`：

```jsx
import { useState, useRef, useCallback, useEffect } from 'react'
import {
  Combobox, TextInput, Loader, Text, Stack, Group, Button, Paper, Badge,
  useCombobox, ActionIcon,
} from '@mantine/core'
import { IconX, IconMapPin } from '@tabler/icons-react'
import LocationPickerMap from './LocationPickerMap'

/**
 * Unified location picker. Search → result list with province/city → selected
 * summary chip → draggable mini-map.
 *
 * Props:
 *   value:       { name, lat, lng, address, pname, cityname, adname, type } | null
 *   onChange:    (next) => void
 *   regionHint:  string? — city name to bias search (default open, user can close)
 *   nearbyCenter: { lat, lng }? — passed to backend as near_lat/near_lng
 *   disabled:    boolean
 */
export default function LocationPicker({ value, onChange, regionHint, nearbyCenter, disabled }) {
  const [query, setQuery] = useState('')
  const [candidates, setCandidates] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [activeRegion, setActiveRegion] = useState(regionHint || null)
  const timerRef = useRef(null)
  const combobox = useCombobox()

  useEffect(() => { setActiveRegion(regionHint || null) }, [regionHint])

  const search = useCallback((q) => {
    if (q.trim().length === 0) { setCandidates([]); return }
    setLoading(true); setError(null)
    const params = new URLSearchParams({ q })
    if (activeRegion) params.set('region_hint', activeRegion)
    if (nearbyCenter?.lat) params.set('near_lat', nearbyCenter.lat)
    if (nearbyCenter?.lng) params.set('near_lng', nearbyCenter.lng)
    fetch(`/poi_search?${params}`)
      .then(res => res.status === 429 ? (setError('搜索太频繁，请稍后重试'), null) : res.json())
      .then(data => {
        if (data?.candidates) {
          setCandidates(data.candidates)
          combobox.openDropdown()
        }
      })
      .catch(() => setError('搜索失败'))
      .finally(() => setLoading(false))
  }, [activeRegion, nearbyCenter?.lat, nearbyCenter?.lng, combobox])

  const handleSelect = (idx) => {
    const c = candidates[Number(idx)]
    if (c) {
      onChange({
        name: c.name, lat: c.lat, lng: c.lng, address: c.address || '',
        pname: c.pname, cityname: c.cityname, adname: c.adname, type: c.type
      })
      setQuery('')
      setCandidates([])
    }
    combobox.closeDropdown()
  }

  const handleMapMove = ({ lat, lng }) => {
    if (value) onChange({ ...value, lat, lng })
  }

  const provinceCityDistrict = (c) => [c.pname, c.cityname, c.adname].filter(Boolean).join('·')

  // Selected state: compact summary + map
  if (value) {
    return (
      <Stack gap="xs">
        <Paper withBorder p="sm" data-testid="location-picker-selected">
          <Group justify="space-between" wrap="nowrap" align="flex-start">
            <Stack gap={2}>
              <Text fw={500} size="sm">
                <IconMapPin size={14} style={{ marginRight: 4, verticalAlign: -2 }} />
                {value.name}
              </Text>
              <Text size="xs" c="blue">{provinceCityDistrict(value)}</Text>
              {value.type && <Text size="xs" c="dimmed">{value.type}</Text>}
            </Stack>
            {!disabled && (
              <Button variant="subtle" size="compact-xs" onClick={() => onChange(null)}>重选</Button>
            )}
          </Group>
        </Paper>
        <LocationPickerMap lat={value.lat} lng={value.lng} onMove={handleMapMove} />
        <Text size="xs" c="dimmed">
          坐标 {Number(value.lat).toFixed(4)}, {Number(value.lng).toFixed(4)}
        </Text>
      </Stack>
    )
  }

  // Search state
  return (
    <Stack gap="xs">
      {activeRegion && (
        <Group gap="xs">
          <Badge variant="light" rightSection={
            <ActionIcon
              size="xs" variant="transparent" aria-label="关闭城市过滤"
              onClick={() => setActiveRegion(null)}
            ><IconX size={12} /></ActionIcon>
          }>城市: {activeRegion}</Badge>
        </Group>
      )}
      <Combobox store={combobox} onOptionSubmit={handleSelect} disabled={disabled}>
        <Combobox.Target>
          <TextInput
            placeholder="输入地名搜索..."
            value={query}
            onChange={e => {
              const v = e.currentTarget.value
              setQuery(v)
              clearTimeout(timerRef.current)
              timerRef.current = setTimeout(() => search(v), 300)
            }}
            rightSection={loading ? <Loader size={14} /> : null}
            error={error}
            onFocus={() => { if (candidates.length > 0) combobox.openDropdown() }}
            disabled={disabled}
          />
        </Combobox.Target>
        <Combobox.Dropdown>
          <Combobox.Options>
            {candidates.map((c, i) => (
              <Combobox.Option key={i} value={String(i)}>
                <Text fw={500} size="sm">{c.name}</Text>
                <Text size="xs" c="blue">{provinceCityDistrict(c)}{c.type ? ` · ${c.type}` : ''}</Text>
                {c.address && <Text size="xs" c="dimmed" lineClamp={1}>{c.address}</Text>}
              </Combobox.Option>
            ))}
            {candidates.length === 0 && !loading && query.trim().length > 0 && (
              <Combobox.Empty>无结果</Combobox.Empty>
            )}
          </Combobox.Options>
        </Combobox.Dropdown>
      </Combobox>
    </Stack>
  )
}
```

- [ ] **Step 4: 跑测试**

```bash
npm test -- LocationPicker.test
```

Expected: 全绿。

- [ ] **Step 5: 提交**

```bash
git add app/javascript/components/activity-editor/LocationPicker.jsx \
         app/javascript/components/activity-editor/__tests__/LocationPicker.test.jsx
git commit -m "feat(activity-editor): LocationPicker single mode (搜索+省市+地图+拖钉)"
```

---

## Phase C ｜非 road 抽屉接入 LocationPicker

### Task C.1: ActivityDrawer + CommonFields 替换为 LocationPicker（非 road）

**Files:**
- Modify: `app/javascript/components/activity-editor/ActivityDrawer.jsx`
- Modify: `app/javascript/components/activity-editor/CommonFields.jsx`
- Modify: `app/javascript/components/activity-editor/__tests__/ActivityDrawer.test.jsx`

- [ ] **Step 1: 改 ActivityDrawer 的 handlePoiPick**

编辑 `app/javascript/components/activity-editor/ActivityDrawer.jsx`，把 `handlePoiPick` 改为接受完整 value object 并计算 regionHint：

```jsx
  const handlePoiPick = (picked) => {
    if (picked === null) {
      // User clicked 重选: clear lat/lng/address
      form.setFieldValue('lat', '')
      form.setFieldValue('lng', '')
      form.setFieldValue('address', '')
      poiFilledName.current = ''
      return
    }
    const { name, lat, lng, address } = picked
    const current = form.values.name
    if (!current || current === poiFilledName.current) {
      form.setFieldValue('name', name)
      poiFilledName.current = name
    }
    form.setFieldValue('lat', lat)
    form.setFieldValue('lng', lng)
    form.setFieldValue('address', address || '')
  }
```

（保留原先的名称保护逻辑。）

在 ActivityDrawer 顶层计算出 `regionHint` 和 `nearbyCenter` 传给 CommonFields：

```jsx
  // Extract city from sibling activities (same day > same tour)
  const cityHint = (() => {
    const sameDay = (allActivities || []).filter(a => a.day_id === targetDayId && a.id !== activity?.id)
    const pool = sameDay.length > 0 ? sameDay : (allActivities || [])
    const counts = {}
    pool.forEach(a => {
      const city = a.cityname  // backend will expose this on activity; if absent, skip
      if (city) counts[city] = (counts[city] || 0) + 1
    })
    const top = Object.entries(counts).sort((a, b) => b[1] - a[1])[0]
    return top ? top[0] : null
  })()

  const nearbyCenter = (() => {
    const sameDay = (allActivities || []).filter(a => a.day_id === targetDayId && a.id !== activity?.id && a.lat && a.lng)
    if (sameDay.length === 0) return null
    const avgLat = sameDay.reduce((s, a) => s + Number(a.lat), 0) / sameDay.length
    const avgLng = sameDay.reduce((s, a) => s + Number(a.lng), 0) / sameDay.length
    return { lat: avgLat, lng: avgLng }
  })()
```

在 `<CommonFields ...>` 调用里加 props：`regionHint={cityHint} nearbyCenter={nearbyCenter}`。

- [ ] **Step 2: 改 CommonFields 使用 LocationPicker（非 road）**

编辑 `app/javascript/components/activity-editor/CommonFields.jsx`：

```jsx
import LocationPicker from './LocationPicker'
// 删掉: import PoiSearchCombobox from './PoiSearchCombobox'

// 组件 signature 加 regionHint, nearbyCenter
export default function CommonFields({
  form, onPoiPick, kind, details, onDetailsChange,
  author, members, canEdit,
  participantUserIds, onParticipantsChange,
  regionHint, nearbyCenter,
}) {
```

把 `<PoiSearchCombobox onPick={onPoiPick} />` 替换为：

```jsx
      <LocationPicker
        value={form.values.lat && form.values.lng ? {
          name: form.values.name || '未命名',
          lat: Number(form.values.lat),
          lng: Number(form.values.lng),
          address: form.values.address || '',
          pname: form.values.pname || '',
          cityname: form.values.cityname || '',
          adname: form.values.adname || '',
          type: form.values.type || '',
        } : null}
        onChange={onPoiPick}
        regionHint={regionHint}
        nearbyCenter={nearbyCenter}
        disabled={!canEdit}
      />
```

（注意：`pname` 等字段目前不在 form.values 里。保存时不持久化到 DB，纯是 LocationPicker 内部展示。如果需要持久化，走后续扩展。现在让 LocationPicker 在 value 里看到什么就显示什么；选完一次把 pname 存到 form state 以便 re-render 时展示。）

修改 ActivityDrawer 的 EMPTY_FORM_VALUES + setValues，加上省市区字段临时存储：

```jsx
const EMPTY_FORM_VALUES = {
  name: '', kind: 'scenic', citizen_level: 'tier_three',
  lat: '', lng: '', address: '',
  pname: '', cityname: '', adname: '', type: '',
  planned_start_at: '', planned_duration_min: '', desc: '',
}
```

以及 `handlePoiPick` 里：

```jsx
    form.setFieldValue('pname', picked.pname || '')
    form.setFieldValue('cityname', picked.cityname || '')
    form.setFieldValue('adname', picked.adname || '')
    form.setFieldValue('type', picked.type || '')
```

保存 payload 里 strip 掉这 4 个临时字段（不要提交到后端）：

```jsx
    const { pname, cityname, adname, type, ...formValues } = form.values
    const payload = { activity: { ...formValues, /* ...existing */ } }
```

- [ ] **Step 3: 更新 ActivityDrawer.test.jsx**

把现有的 `vi.mock('../PoiSearchCombobox', ...)` 改为 `vi.mock('../LocationPicker', ...)`：

```jsx
vi.mock('../LocationPicker', () => ({
  default: ({ onChange }) => (
    <div data-testid="location-picker-stub">
      <button type="button" onClick={() => onChange({
        name: '兰州大学(地铁站)', lat: 36.05, lng: 103.82, address: '兰州城关区天水南路',
        pname: '甘肃省', cityname: '兰州市', adname: '城关区', type: '地铁站'
      })}>pick-lanzhou</button>
      <button type="button" onClick={() => onChange({
        name: '米生拉', lat: 29.77, lng: 87.25, address: '谢通门县 · 地名',
        pname: '西藏自治区', cityname: '日喀则市', adname: '谢通门县', type: '地名'
      })}>pick-misheng</button>
    </div>
  ),
}))
```

- [ ] **Step 4: 跑前端测试**

```bash
npm test -- ActivityDrawer
```

Expected: 全绿（LocationPicker stub 替换后原有场景依然覆盖）。

- [ ] **Step 5: 跑全量前端**

```bash
npm test
```

Expected: 全绿。

- [ ] **Step 6: 提交**

```bash
git add app/javascript/components/activity-editor/ActivityDrawer.jsx \
         app/javascript/components/activity-editor/CommonFields.jsx \
         app/javascript/components/activity-editor/__tests__/ActivityDrawer.test.jsx
git commit -m "feat(activity-editor): 非 road 抽屉用 LocationPicker 替换 PoiSearchCombobox"
```

---

## Phase D ｜LocationPicker dual mode

### Task D.1: LocationPicker dual mode + auto-preview

**Files:**
- Modify: `app/javascript/components/activity-editor/LocationPicker.jsx`
- Modify: `app/javascript/components/activity-editor/__tests__/LocationPicker.test.jsx`

- [ ] **Step 1: 写失败测试**

在 `LocationPicker.test.jsx` 末尾加 dual 模式测试：

```jsx
describe('LocationPicker (dual)', () => {
  it('renders two searches stacked', () => {
    render(
      <MantineProvider>
        <LocationPicker mode="dual" value={{ start: null, end: null }} onChange={vi.fn()} />
      </MantineProvider>
    )
    expect(screen.getByText('起点')).toBeInTheDocument()
    expect(screen.getByText('终点')).toBeInTheDocument()
  })

  it('onChange fires with { start, end } shape in dual mode', async () => {
    const onChange = vi.fn()
    global.fetch.mockResolvedValue({
      ok: true,
      json: async () => ({ candidates: [
        { name: '独库南入口', lat: 42.9, lng: 83.5, pname: '新疆', cityname: '阿克苏', adname: '库车' }
      ]})
    })
    render(
      <MantineProvider>
        <LocationPicker mode="dual" value={{ start: null, end: null }} onChange={onChange} />
      </MantineProvider>
    )
    const inputs = screen.getAllByPlaceholderText(/输入地名/)
    fireEvent.change(inputs[0], { target: { value: '独库' } })
    await waitFor(() => expect(screen.getByText('独库南入口')).toBeInTheDocument())
    fireEvent.click(screen.getByText('独库南入口'))
    expect(onChange).toHaveBeenCalledWith({
      start: expect.objectContaining({ name: '独库南入口' }),
      end: null,
    })
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

```bash
npm test -- LocationPicker.test
```

Expected: FAIL。

- [ ] **Step 3: 改 LocationPicker 支持 mode="dual"**

编辑 `LocationPicker.jsx`，在组件顶部加 mode prop 分支，把原 single 逻辑抽成内部 `SingleLocationPicker`。文件新 shape：

```jsx
// export default: dispatches on mode
export default function LocationPicker({ mode = 'single', value, onChange, ...rest }) {
  if (mode === 'dual') {
    const handleStart = (start) => onChange({ ...value, start })
    const handleEnd   = (end)   => onChange({ ...value, end })
    return (
      <Stack gap="md">
        <div>
          <Text size="sm" fw={500} mb="xs">起点</Text>
          <SingleLocationPicker value={value?.start} onChange={handleStart} {...rest} />
        </div>
        <div>
          <Text size="sm" fw={500} mb="xs">终点</Text>
          <SingleLocationPicker value={value?.end} onChange={handleEnd} {...rest} />
        </div>
      </Stack>
    )
  }
  return <SingleLocationPicker value={value} onChange={onChange} {...rest} />
}

function SingleLocationPicker({ /* ... same as current LocationPicker body ... */ }) {
  // existing logic moved here unchanged
}
```

Move the entire current `LocationPicker` function body into `SingleLocationPicker`. The top `export default` becomes the dispatcher.

- [ ] **Step 4: 跑测试**

```bash
npm test -- LocationPicker.test
```

Expected: 全绿。

- [ ] **Step 5: 提交**

```bash
git add app/javascript/components/activity-editor/LocationPicker.jsx \
         app/javascript/components/activity-editor/__tests__/LocationPicker.test.jsx
git commit -m "feat(location-picker): dual mode (起点/终点双搜索)"
```

---

## Phase E ｜景观公路抽屉模板

### Task E.1: detailsSchema 改 + KIND_OPTIONS label

**Files:**
- Modify: `app/javascript/components/activity-editor/detailsSchema.js`
- Modify: `app/javascript/components/activity-editor/DetailsFields.jsx`（支持 `hidden`）

**背景**：ActivityDrawer 的 save 逻辑用 `KIND_SCHEMA[kind]` 过滤 details keys。如果把 km / drive_min / start_* / end_* 从 road schema 里删掉，保存时会被扔掉。解法：keys 保留在 schema 供 save 使用，加 `hidden: true` 标记让 DetailsFields 不渲染。

- [ ] **Step 1: 改 DetailsFields 跳过 hidden fields**

编辑 `app/javascript/components/activity-editor/DetailsFields.jsx`，在 map 渲染 schema 的循环顶部加：

```jsx
  {schema.filter(f => !f.hidden).map(field => (
    // ... existing rendering logic ...
  ))}
```

（如果现有代码直接 map，加 `.filter(f => !f.hidden)` 即可；保持 row 分组逻辑。）

- [ ] **Step 2: 改 road schema + label**

编辑 `app/javascript/components/activity-editor/detailsSchema.js`：

```javascript
  road: [
    // Hidden: set by dual POI search + RoadLocationSection inputs
    { key: 'start_name',    hidden: true },
    { key: 'start_lat',     hidden: true },
    { key: 'start_lng',     hidden: true },
    { key: 'start_address', hidden: true },
    { key: 'start_pname',   hidden: true },
    { key: 'start_cityname', hidden: true },
    { key: 'start_adname',  hidden: true },
    { key: 'end_name',      hidden: true },
    { key: 'end_lat',       hidden: true },
    { key: 'end_lng',       hidden: true },
    { key: 'end_address',   hidden: true },
    { key: 'end_pname',     hidden: true },
    { key: 'end_cityname',  hidden: true },
    { key: 'end_adname',    hidden: true },
    { key: 'km',            hidden: true },
    { key: 'drive_min',     hidden: true },
    // Visible fields: rendered by DetailsFields
    { key: 'road_type', label: '路型', type: 'select',
      options: ['高速', '国道', '省道', '山路', '城市'] },
    { key: 'day_only',  label: '仅白天通行', type: 'checkbox' },
  ],
```

在 `KIND_OPTIONS`：

```javascript
export const KIND_OPTIONS = [
  { value: 'scenic', label: '景点' },
  { value: 'road',   label: '景观公路' },   // 原 '路段'
  { value: 'food',   label: '餐饮' },
  { value: 'stay',   label: '住宿' },
  { value: 'fuel',   label: '加油' },
  { value: 'other',  label: '其他' },
]
```

- [ ] **Step 3: 跑 DetailsFields 测试防回归**

```bash
npm test -- DetailsFields
```

Expected: 全绿（road kind 现在的可见 field 只剩 road_type + day_only）。

- [ ] **Step 4: 提交**

```bash
git add app/javascript/components/activity-editor/detailsSchema.js \
         app/javascript/components/activity-editor/DetailsFields.jsx
git commit -m "feat(details-schema): road → 景观公路；隐藏 km/drive_min/start_*/end_* 走专用 UI"
```

---

### Task E.2: CommonFields road 分支用 dual LocationPicker + km/drive_min 输入

**Files:**
- Modify: `app/javascript/components/activity-editor/CommonFields.jsx`
- Modify: `app/javascript/components/activity-editor/ActivityDrawer.jsx`

- [ ] **Step 1: 加 road 分支到 CommonFields**

在 CommonFields.jsx 里，把 `<LocationPicker value={...} onChange={onPoiPick} ... />` 的那一段用 kind 分支：

```jsx
      {kind === 'road' ? (
        <RoadLocationSection
          form={form}
          onScenicRoadChange={onPoiPick}  // parent handler receives { start, end }
          regionHint={regionHint}
          canEdit={canEdit}
        />
      ) : (
        <LocationPicker
          value={form.values.lat && form.values.lng ? {
            name: form.values.name || '未命名',
            lat: Number(form.values.lat), lng: Number(form.values.lng),
            address: form.values.address || '',
            pname: form.values.pname || '', cityname: form.values.cityname || '',
            adname: form.values.adname || '', type: form.values.type || '',
          } : null}
          onChange={onPoiPick}
          regionHint={regionHint}
          nearbyCenter={nearbyCenter}
          disabled={!canEdit}
        />
      )}
```

- [ ] **Step 2: 实现 `RoadLocationSection`（同文件底部）**

在 CommonFields.jsx 末尾加：

```jsx
import useAmapDirection from '../../hooks/useAmapDirection'

function RoadLocationSection({ form, onScenicRoadChange, regionHint, canEdit }) {
  // Read start/end from details. Store new selections via onScenicRoadChange which
  // writes into details.start_*/end_* in ActivityDrawer.
  const start = form.values.details?.start_lat ? {
    name: form.values.details.start_name,
    lat: Number(form.values.details.start_lat),
    lng: Number(form.values.details.start_lng),
    address: form.values.details.start_address,
    pname: form.values.details.start_pname,
    cityname: form.values.details.start_cityname,
    adname: form.values.details.start_adname,
  } : null

  const end = form.values.details?.end_lat ? {
    name: form.values.details.end_name,
    lat: Number(form.values.details.end_lat),
    lng: Number(form.values.details.end_lng),
    address: form.values.details.end_address,
    pname: form.values.details.end_pname,
    cityname: form.values.details.end_cityname,
    adname: form.values.details.end_adname,
  } : null

  // Auto-fetch AMAP driving when both endpoints present
  const amapCoords = (start && end) ? {
    from: { lat: start.lat, lng: start.lng },
    to:   { lat: end.lat,   lng: end.lng }
  } : null
  const { status, data } = useAmapDirection(amapCoords)

  const handleChange = ({ start: nextStart, end: nextEnd }) => {
    onScenicRoadChange({ start: nextStart, end: nextEnd })
  }

  return (
    <Stack gap="sm">
      <LocationPicker
        mode="dual"
        value={{ start, end }}
        onChange={handleChange}
        regionHint={regionHint}
        disabled={!canEdit}
      />
      <Group grow>
        <NumberInput
          label="里程" min={0}
          value={form.values.details?.km ?? ''}
          onChange={v => form.setFieldValue('details.km', v === '' ? null : Number(v))}
          rightSection={<Text size="xs" c="dimmed" pr="xs">km</Text>}
          rightSectionWidth={40}
          description={data ? `AMAP: ${Math.round(data.distance_m / 1000)} km` : null}
        />
        <NumberInput
          label="驾驶时长" min={0}
          value={form.values.details?.drive_min ?? ''}
          onChange={v => form.setFieldValue('details.drive_min', v === '' ? null : Number(v))}
          rightSection={<Text size="xs" c="dimmed" pr="xs">分钟</Text>}
          rightSectionWidth={56}
          description={data ? `AMAP: ${Math.round(data.duration_s / 60)} 分钟` : null}
        />
      </Group>
      {status === 'error' && (
        <Text size="xs" c="red">AMAP 预估失败，请手动输入里程和时长</Text>
      )}
    </Stack>
  )
}
```

（同文件顶部 import 里把 `useAmapDirection` 加进来。）

- [ ] **Step 3: ActivityDrawer `handlePoiPick` 分化 road / non-road**

编辑 `app/javascript/components/activity-editor/ActivityDrawer.jsx`，在 `handlePoiPick` 前加辅助：

```jsx
  const handlePoiPick = (picked) => {
    const kind = form.values.kind
    if (kind === 'road') {
      // picked shape: { start: {...}, end: {...} }
      const d = { ...(form.values.details || {}) }
      if (picked?.start) {
        d.start_name = picked.start.name
        d.start_lat = picked.start.lat
        d.start_lng = picked.start.lng
        d.start_address = picked.start.address
        d.start_pname = picked.start.pname
        d.start_cityname = picked.start.cityname
        d.start_adname = picked.start.adname
      } else if (picked && picked.start === null) {
        delete d.start_name; delete d.start_lat; delete d.start_lng
        delete d.start_address; delete d.start_pname; delete d.start_cityname; delete d.start_adname
      }
      if (picked?.end) {
        d.end_name = picked.end.name
        d.end_lat = picked.end.lat
        d.end_lng = picked.end.lng
        d.end_address = picked.end.address
        d.end_pname = picked.end.pname
        d.end_cityname = picked.end.cityname
        d.end_adname = picked.end.adname
      } else if (picked && picked.end === null) {
        delete d.end_name; delete d.end_lat; delete d.end_lng
        delete d.end_address; delete d.end_pname; delete d.end_cityname; delete d.end_adname
      }
      setDetails(d)
      form.setFieldValue('details', d)
      // Name fallback: if empty, use start_name - end_name
      if (!form.values.name && d.start_name && d.end_name) {
        form.setFieldValue('name', `${d.start_name} - ${d.end_name}`)
      }
      return
    }
    // non-road: existing behavior
    // ... original handlePoiPick body for single-point ...
  }
```

- [ ] **Step 4: road kind 切换时自动设 tier_one 并锁死**

在 ActivityDrawer 里 `handleKindChange` 加：

```jsx
  const handleKindChange = (newKind) => {
    form.setFieldValue('kind', newKind)
    if (newKind === 'road') {
      form.setFieldValue('citizen_level', 'tier_one')
    }
    const validKeys = (KIND_SCHEMA[newKind] || []).map(f => f.key)
    const cleaned = {}
    for (const k of validKeys) {
      if (details[k] !== undefined) cleaned[k] = details[k]
    }
    setDetails(cleaned)
  }
```

在 CommonFields.jsx 的 `<Radio.Group label="公民等级" ...>` 上加 disabled：

```jsx
      <Radio.Group label="公民等级" {...form.getInputProps('citizen_level')}>
        <SimpleGrid cols={2} spacing="xs" mt={4}>
          {CITIZEN_LEVEL_OPTIONS.map(o => (
            <Radio key={o.value} value={o.value} label={o.label}
                   disabled={form.values.kind === 'road' && o.value !== 'tier_one'} />
          ))}
        </SimpleGrid>
      </Radio.Group>
```

- [ ] **Step 5: 跑测试**

```bash
npm test -- activity-editor
```

Expected: 全绿。

- [ ] **Step 6: 提交**

```bash
git add app/javascript/components/activity-editor/CommonFields.jsx \
         app/javascript/components/activity-editor/ActivityDrawer.jsx
git commit -m "feat(road-drawer): 景观公路用 dual LocationPicker + 自动预填 km/drive_min"
```

---

### Task E.3: ActivityDrawer 强制 road=tier_one 保存逻辑 + 测试

**Files:**
- Modify: `app/javascript/components/activity-editor/__tests__/ActivityDrawer.test.jsx`

- [ ] **Step 1: 先读现有 test 的 render helper 模式**

```bash
head -80 app/javascript/components/activity-editor/__tests__/ActivityDrawer.test.jsx
```

记下组件是怎么 render 的（props 清单、wrapper providers）。下一步的测试用例照抄这个 shape。

- [ ] **Step 2: 加 road 抽屉 UI 测试**

在 `ActivityDrawer.test.jsx` 末尾（最后的 `})` 之前）加：

```jsx
describe('road kind (景观公路)', () => {
  const baseProps = {
    tourId: 1, opened: true, onClose: vi.fn(), mode: 'create',
    activity: null, targetDayId: null, images: [], allActivities: [],
    days: [], routeLegs: [], canEdit: true,
    author: { id: 1, name: 'Drew' }, members: []
  }

  it('auto-sets citizen_level=tier_one when switching to road', async () => {
    render(<MantineProvider><ModalsProvider><ActivityDrawer {...baseProps} /></ModalsProvider></MantineProvider>)
    // 打开类型 Select（Mantine Select）
    const typeSelect = screen.getByLabelText('类型')
    fireEvent.click(typeSelect)
    // 点"景观公路" option
    await waitFor(() => screen.getByText('景观公路'))
    fireEvent.click(screen.getByText('景观公路'))
    // 此时 tier_one radio 应为 checked
    const tierOneRadio = screen.getByLabelText(/一等公民/)
    await waitFor(() => expect(tierOneRadio).toBeChecked())
  })

  it('disables non-tier_one radios when kind=road', async () => {
    render(<MantineProvider><ModalsProvider><ActivityDrawer {...baseProps} /></ModalsProvider></MantineProvider>)
    fireEvent.click(screen.getByLabelText('类型'))
    await waitFor(() => screen.getByText('景观公路'))
    fireEvent.click(screen.getByText('景观公路'))
    // 检查其他三级 radio disabled
    await waitFor(() => expect(screen.getByLabelText(/二等公民/)).toBeDisabled())
    expect(screen.getByLabelText(/三等公民/)).toBeDisabled()
    expect(screen.getByLabelText(/基础设施/)).toBeDisabled()
  })
})
```

（如果 citizen level label 文案和上面不一致——按项目实际 `CITIZEN_LEVEL_OPTIONS` 对齐。）

- [ ] **Step 3: 跑测试**

```bash
npm test -- ActivityDrawer
```

Expected: 全绿。

- [ ] **Step 4: 提交**

```bash
git add app/javascript/components/activity-editor/__tests__/ActivityDrawer.test.jsx
git commit -m "test(activity-drawer): 景观公路 kind 切换锁定 tier_one"
```

---

## Phase F ｜RouteLeg 编辑 Modal

### Task F.1: Backend - PATCH/DELETE route_legs override

**Files:**
- Modify: `config/routes.rb`
- Modify: `app/controllers/route_legs_controller.rb`
- Test: `spec/requests/route_legs_spec.rb`

- [ ] **Step 1: 看现有 routes / controller**

```bash
bin/rails routes | grep route_leg
```

记下现有 actions。

- [ ] **Step 2: 加 update / destroy 路由**

编辑 `config/routes.rb`，扩展 `resources :route_legs` 为：

```ruby
  resources :route_legs, only: [ :update, :destroy ]
```

（如原先是 only: [:show]，新增两个 action；如果原没有，整条加进来。）

- [ ] **Step 3: 写失败测试**

在 `spec/requests/route_legs_spec.rb` 末尾加：

```ruby
describe "PATCH /route_legs/:id" do
  let(:user) { create(:user) }
  let(:tour) { create(:tour, author: user) }
  let(:a1) { create(:activity, tour: tour, lat: 36.0, lng: 103.0, position: 1) }
  let(:a2) { create(:activity, tour: tour, lat: 37.0, lng: 104.0, position: 2) }
  let(:leg) do
    RouteLeg.create!(tour: tour, from_activity: a1, to_activity: a2,
                     mode: :driving, distance_m: 100_000, duration_s: 3600,
                     polyline: { "coords" => [] })
  end

  before { post "/login_test", params: { user_id: user.id } }

  it "writes override fields and sets overridden_at/by" do
    patch "/route_legs/#{leg.id}", params: {
      route_leg: { distance_m_override: 120_000, duration_s_override: 4000, note: "绕行" }
    }, as: :json
    expect(response).to have_http_status(:ok)
    leg.reload
    expect(leg.distance_m_override).to eq(120_000)
    expect(leg.duration_s_override).to eq(4000)
    expect(leg.note).to eq("绕行")
    expect(leg.overridden_at).to be_present
    expect(leg.overridden_by_id).to eq(user.id)
  end
end

describe "DELETE /route_legs/:id/override (via destroy alias)" do
  # Strategy: PATCH with all-nil override clears it.
  let(:user) { create(:user) }
  let(:tour) { create(:tour, author: user) }
  let(:a1) { create(:activity, tour: tour, lat: 36.0, lng: 103.0, position: 1) }
  let(:a2) { create(:activity, tour: tour, lat: 37.0, lng: 104.0, position: 2) }
  let(:leg) do
    RouteLeg.create!(tour: tour, from_activity: a1, to_activity: a2,
                     mode: :driving, distance_m: 100_000, duration_s: 3600,
                     distance_m_override: 120_000, duration_s_override: 4000,
                     note: "old", overridden_at: Time.current, overridden_by: user,
                     polyline: { "coords" => [] })
  end

  before { post "/login_test", params: { user_id: user.id } }

  it "clearing override nulls all override fields" do
    delete "/route_legs/#{leg.id}", as: :json
    expect(response).to have_http_status(:ok)
    leg.reload
    expect(leg.distance_m_override).to be_nil
    expect(leg.duration_s_override).to be_nil
    expect(leg.note).to be_nil
    expect(leg.overridden_at).to be_nil
    expect(leg.overridden_by_id).to be_nil
  end
end
```

- [ ] **Step 4: 跑测试确认失败**

```bash
bin/rspec spec/requests/route_legs_spec.rb
```

Expected: FAIL - routes / actions missing。

- [ ] **Step 5: 实现 controller actions**

编辑 `app/controllers/route_legs_controller.rb`（如果不存在则创建），加 / 扩展：

```ruby
class RouteLegsController < ApplicationController
  before_action :require_login
  before_action :find_leg, only: [ :update, :destroy ]

  def update
    @leg.update!(
      distance_m_override: params.dig(:route_leg, :distance_m_override),
      duration_s_override: params.dig(:route_leg, :duration_s_override),
      note:                params.dig(:route_leg, :note),
      overridden_at:       Time.current,
      overridden_by_id:    current_user.id,
    )
    render json: { id: @leg.id, overridden: true }
  end

  def destroy
    @leg.update!(
      distance_m_override: nil, duration_s_override: nil,
      note: nil, overridden_at: nil, overridden_by_id: nil
    )
    render json: { id: @leg.id, overridden: false }
  end

  private

  def find_leg
    @leg = RouteLeg.joins(:tour).where(tours: { author_id: current_user.id }).find(params[:id])
  end
end
```

（注意：`find_leg` 限制为 tour.author 用户。如果已有更复杂的权限（membership），沿用项目既有 pattern。）

- [ ] **Step 6: 跑测试**

```bash
bin/rspec spec/requests/route_legs_spec.rb
```

Expected: 全绿。

- [ ] **Step 7: 提交**

```bash
git add config/routes.rb app/controllers/route_legs_controller.rb spec/requests/route_legs_spec.rb
git commit -m "feat(route_legs): PATCH 写 override / DELETE 清 override"
```

---

### Task F.2: RouteLegEditModal + 接入 DayColumn

**Files:**
- Create: `app/javascript/components/planner/RouteLegEditModal.jsx`
- Modify: `app/javascript/components/planner/RoadConnector.jsx`
- Modify: `app/javascript/components/planner/DayColumn.jsx`

- [ ] **Step 1: 实现 Modal**

新建 `app/javascript/components/planner/RouteLegEditModal.jsx`：

```jsx
import { useState, useEffect } from 'react'
import { Modal, Stack, Group, Text, NumberInput, Textarea, Button, ActionIcon } from '@mantine/core'
import { IconRefresh } from '@tabler/icons-react'
import { router } from '@inertiajs/react'

export default function RouteLegEditModal({ opened, onClose, leg }) {
  const [distKm, setDistKm] = useState('')
  const [durMin, setDurMin] = useState('')
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!leg) return
    setDistKm(leg.distance_m_override != null
      ? Math.round(leg.distance_m_override / 1000)
      : Math.round(leg.distance_m / 1000))
    setDurMin(leg.duration_s_override != null
      ? Math.round(leg.duration_s_override / 60)
      : Math.round(leg.duration_s / 60))
    setNote(leg.note || '')
  }, [leg?.id])

  if (!leg) return null

  const amapKm = Math.round(leg.distance_m / 1000)
  const amapMin = Math.round(leg.duration_s / 60)

  const handleSave = () => {
    setSaving(true)
    fetch(`/route_legs/${leg.id}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json', 'Accept': 'application/json',
        'X-CSRF-Token': document.querySelector('meta[name=csrf-token]')?.getAttribute('content') || ''
      },
      body: JSON.stringify({ route_leg: {
        distance_m_override: Number(distKm) * 1000,
        duration_s_override: Number(durMin) * 60,
        note: note || null
      }})
    }).then(res => {
      setSaving(false)
      if (res.ok) { router.reload({ only: ['route_legs'] }); onClose() }
    })
  }

  const handleReset = () => {
    setSaving(true)
    fetch(`/route_legs/${leg.id}`, {
      method: 'DELETE',
      headers: {
        'Accept': 'application/json',
        'X-CSRF-Token': document.querySelector('meta[name=csrf-token]')?.getAttribute('content') || ''
      }
    }).then(res => {
      setSaving(false)
      if (res.ok) { router.reload({ only: ['route_legs'] }); onClose() }
    })
  }

  return (
    <Modal opened={opened} onClose={onClose} title="编辑驾驶段" centered size="md">
      <Stack gap="md">
        <Text size="sm" c="dimmed">
          {leg.from_activity_name} → {leg.to_activity_name}
        </Text>
        <Group grow align="flex-end">
          <NumberInput
            label="距离" value={distKm} onChange={v => setDistKm(v)}
            rightSection={<Text size="xs" c="dimmed" pr="xs">km</Text>} rightSectionWidth={36}
            min={0}
            description={
              <Group gap={4}>
                <Text size="xs" c="dimmed">高德: {amapKm} km</Text>
                <ActionIcon size="xs" variant="subtle" onClick={() => setDistKm(amapKm)}>
                  <IconRefresh size={12} />
                </ActionIcon>
              </Group>
            }
          />
          <NumberInput
            label="时长" value={durMin} onChange={v => setDurMin(v)}
            rightSection={<Text size="xs" c="dimmed" pr="xs">分钟</Text>} rightSectionWidth={56}
            min={0}
            description={
              <Group gap={4}>
                <Text size="xs" c="dimmed">高德: {amapMin} 分钟</Text>
                <ActionIcon size="xs" variant="subtle" onClick={() => setDurMin(amapMin)}>
                  <IconRefresh size={12} />
                </ActionIcon>
              </Group>
            }
          />
        </Group>
        <Textarea label="备注" value={note} onChange={e => setNote(e.currentTarget.value)}
                  placeholder="如: 实际走了绕行路" minRows={2} />
        <Group justify="space-between">
          <Button variant="subtle" onClick={handleReset} loading={saving}>重置为高德原始值</Button>
          <Group>
            <Button variant="default" onClick={onClose}>取消</Button>
            <Button onClick={handleSave} loading={saving}>保存</Button>
          </Group>
        </Group>
      </Stack>
    </Modal>
  )
}
```

- [ ] **Step 2: 让 RoadConnector.synthesized 可点击 + 加"已调整"徽章**

编辑 `app/javascript/components/planner/RoadConnector.jsx`，改 `SynthesizedConnector`：

```jsx
function SynthesizedConnector({ leg, isHighlighted, onHoverConnector, onClearHover,
                                 fromActivityId, toActivityId, dayColorName, onClick }) {
  const km = leg.distance_m_override != null
    ? Math.round(leg.distance_m_override / 1000)
    : Math.round(leg.distance_m / 1000)
  const min = leg.duration_s_override != null
    ? Math.round(leg.duration_s_override / 60)
    : Math.round(leg.duration_s / 60)
  const overridden = leg.overridden_at != null
  const classes = [
    'rc-line',
    'rc-synthesized',
    isHighlighted ? 'rc-highlighted' : '',
  ].filter(Boolean).join(' ')

  return (
    <div
      className={classes}
      data-day-color={dayColorName}
      onMouseEnter={() => onHoverConnector?.(fromActivityId, toActivityId)}
      onMouseLeave={onClearHover}
      onClick={() => onClick?.(leg)}
    >
      <IconCar size={12} stroke={2} aria-hidden="true" />
      <ConnectorText km={km} min={min} />
      {overridden && <span className="rc-overridden-badge">已调整</span>}
    </div>
  )
}
```

同时在 `export default function RoadConnector` 把 `onClick` 透传到 SynthesizedConnector。

改 CSS（编辑 `app/javascript/styles/activity-card.css` 现有 `.rc-line.rc-synthesized` 规则，同时在末尾加徽章）：

```css
/* 替换原先的 cursor: default */
.rc-line.rc-synthesized {
  cursor: pointer;
  opacity: 0.85;
  border-left-style: dotted;
}
.rc-line.rc-synthesized:hover {
  opacity: 1.0;
}
.rc-overridden-badge {
  font-size: 10px; color: var(--mantine-color-blue-6);
  padding: 1px 6px; border: 1px solid var(--mantine-color-blue-3); border-radius: 8px;
  margin-left: auto;
}
```

注意：原 `.rc-synthesized` 没有 `pointer-events: none`（已确认），所以不需要额外 override。

- [ ] **Step 3: DayColumn 接入 Modal**

在 `DayColumn.jsx` 顶部引入：

```jsx
import { useState } from 'react'
import RouteLegEditModal from './RouteLegEditModal'
```

在组件顶部加 state：

```jsx
  const [editingLeg, setEditingLeg] = useState(null)
```

把渲染 synthesized RoadConnector 的地方加 `onClick={setEditingLeg}`（可能有多个调用处；都改）。

在 return 底部（紧跟原容器）加：

```jsx
      <RouteLegEditModal opened={!!editingLeg} leg={editingLeg} onClose={() => setEditingLeg(null)} />
```

- [ ] **Step 4: 跑前端测试**

```bash
npm test -- planner
```

Expected: 全绿（可能需要补 smoke 测试）。

- [ ] **Step 5: 加 smoke test**

新建 `app/javascript/components/planner/__tests__/RouteLegEditModal.test.jsx`：

```jsx
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MantineProvider } from '@mantine/core'
import { vi, beforeEach } from 'vitest'
import RouteLegEditModal from '../RouteLegEditModal'

vi.mock('@inertiajs/react', () => ({ router: { reload: vi.fn() } }))
global.fetch = vi.fn()
beforeEach(() => global.fetch.mockReset())

const leg = {
  id: 1, from_activity_name: '兰州', to_activity_name: '刘家峡',
  distance_m: 118000, duration_s: 8700,
  distance_m_override: null, duration_s_override: null, note: null, overridden_at: null
}

describe('RouteLegEditModal', () => {
  it('pre-fills inputs from AMAP values when no override', () => {
    render(<MantineProvider><RouteLegEditModal opened={true} leg={leg} onClose={vi.fn()} /></MantineProvider>)
    expect(screen.getByDisplayValue('118')).toBeInTheDocument()  // km rounded
    expect(screen.getByDisplayValue('145')).toBeInTheDocument()  // min rounded (8700/60)
  })

  it('saves via PATCH and closes', async () => {
    global.fetch.mockResolvedValue({ ok: true })
    const onClose = vi.fn()
    render(<MantineProvider><RouteLegEditModal opened={true} leg={leg} onClose={onClose} /></MantineProvider>)
    fireEvent.click(screen.getByText('保存'))
    await waitFor(() => expect(global.fetch).toHaveBeenCalledWith(
      '/route_legs/1', expect.objectContaining({ method: 'PATCH' })
    ))
    await waitFor(() => expect(onClose).toHaveBeenCalled())
  })

  it('reset calls DELETE', async () => {
    global.fetch.mockResolvedValue({ ok: true })
    render(<MantineProvider><RouteLegEditModal opened={true} leg={leg} onClose={vi.fn()} /></MantineProvider>)
    fireEvent.click(screen.getByText(/重置为高德/))
    await waitFor(() => expect(global.fetch).toHaveBeenCalledWith(
      '/route_legs/1', expect.objectContaining({ method: 'DELETE' })
    ))
  })
})
```

- [ ] **Step 6: 跑测试**

```bash
npm test
```

Expected: 全绿。

- [ ] **Step 7: 提交**

```bash
git add app/javascript/components/planner/RouteLegEditModal.jsx \
         app/javascript/components/planner/RoadConnector.jsx \
         app/javascript/components/planner/DayColumn.jsx \
         app/javascript/components/planner/__tests__/RouteLegEditModal.test.jsx \
         app/javascript/styles/activity-card.css
git commit -m "feat(planner): RouteLegEditModal 驾驶段 override 编辑"
```

---

### Task F.3: Activity 坐标变化时 override 清理确认

**Files:**
- Modify: `app/javascript/components/activity-editor/ActivityDrawer.jsx`

- [ ] **Step 1: 写辅助函数"哪些 leg 会失效"**

在 ActivityDrawer.jsx 里加一个 pure helper（放在文件底部 `csrfToken()` 前）：

```javascript
// Given an edited activity and all known legs, return legs whose digest will
// invalidate because the activity's relevant coords are changing. For road
// kind, "relevant coords" = details.start/end (via resolve rule); for others,
// it's activity.lat/lng.
function affectedLegsFromEdit(activity, originalActivity, routeLegs) {
  if (!originalActivity) return []  // create mode
  const id = originalActivity.id
  const related = (routeLegs || []).filter(
    l => l.from_activity_id === id || l.to_activity_id === id
  )
  if (related.length === 0) return []

  const coordsChanged = (() => {
    if (activity.kind === 'road' && activity.citizen_level === 'tier_one') {
      const d0 = originalActivity.details || {}
      const d1 = activity.details || {}
      return d0.start_lat !== d1.start_lat || d0.start_lng !== d1.start_lng ||
             d0.end_lat !== d1.end_lat   || d0.end_lng !== d1.end_lng
    }
    return Number(originalActivity.lat) !== Number(activity.lat) ||
           Number(originalActivity.lng) !== Number(activity.lng)
  })()
  if (!coordsChanged) return []

  return related.filter(l => l.overridden_at != null)
}
```

- [ ] **Step 2: 在 handleSave 前插入确认**

在 `handleSave` 开头（`if (form.validate().hasErrors) return` 之后）插入：

```javascript
    // Check if coord change will clear any overrides
    const affected = affectedLegsFromEdit(
      { ...form.values, details, kind: form.values.kind, citizen_level: form.values.citizen_level },
      activity,
      routeLegs
    )
    if (affected.length > 0) {
      const names = affected
        .map(l => `${l.from_activity_name || '起'} → ${l.to_activity_name || '止'}`)
        .join('、')
      const confirmed = await new Promise(resolve => {
        modals.openConfirmModal({
          title: '检测到驾驶段手动调整将被重置',
          children: (
            <div>
              <Text size="sm">以下驾驶段的 km / 时长 / 备注手动调整会被清空并回到高德原始值：</Text>
              <Text size="sm" fw={500} mt="xs">{names}</Text>
              <Text size="sm" c="dimmed" mt="xs">（因为起/终点坐标发生了变化）</Text>
            </div>
          ),
          labels: { confirm: '继续保存', cancel: '取消' },
          confirmProps: { color: 'orange' },
          onConfirm: () => resolve(true),
          onCancel: () => resolve(false),
        })
      })
      if (!confirmed) return
    }
```

需要在文件顶部 import 多加 `Text`（如果还没 import）以及 `modals` 已有。

- [ ] **Step 3: 后端在 Upsert 触发重算时清 override**

编辑 `app/models/route_leg/upsert.rb`，在 `@service.fetch(...)` 后面 `leg.assign_attributes(...)` 块加清理：

```ruby
    leg.assign_attributes(
      distance_m:      result[:distance_m],
      duration_s:      result[:duration_s],
      polyline:        result[:polyline],
      endpoint_digest: leg.expected_endpoint_digest,
      fetched_at:      Time.current,
      # Clear override: coords changed, old manual adjustment is stale
      distance_m_override: nil,
      duration_s_override: nil,
      note:             nil,
      overridden_at:    nil,
      overridden_by_id: nil,
    )
```

- [ ] **Step 4: 补 Upsert 测试**

在 `spec/models/route_leg/upsert_spec.rb` 末尾加：

```ruby
describe "override cleanup when coords change" do
  it "clears override on refetch after endpoint moves" do
    allow(fake_service).to receive(:fetch).and_return(fake_result)
    leg = call_upsert
    leg.update!(
      distance_m_override: 500_000, duration_s_override: 30_000,
      note: "绕行", overridden_at: Time.current
    )

    # User moves "to" coords
    to_act.update!(lat: 40.0, lng: 85.0)
    call_upsert  # cache miss → refetch → should clear override
    leg.reload
    expect(leg.distance_m_override).to be_nil
    expect(leg.duration_s_override).to be_nil
    expect(leg.note).to be_nil
    expect(leg.overridden_at).to be_nil
  end
end
```

- [ ] **Step 5: 跑测试**

```bash
bin/rspec spec/models/route_leg/upsert_spec.rb
npm test -- ActivityDrawer
```

Expected: 全绿。

- [ ] **Step 6: 提交**

```bash
git add app/javascript/components/activity-editor/ActivityDrawer.jsx \
         app/models/route_leg/upsert.rb \
         spec/models/route_leg/upsert_spec.rb
git commit -m "feat: 坐标变化时清空 override + 前端保存前确认"
```

---

## Phase G ｜数据迁移 rake 任务（写好，先不跑）

### Task G.1: Rake - migrate low tier road → route_leg override

**Files:**
- Create: `lib/tasks/route_leg_override.rake`
- Test: `spec/lib/tasks/route_leg_override_spec.rb`

- [ ] **Step 1: 写失败测试**

新建 `spec/lib/tasks/route_leg_override_spec.rb`：

```ruby
require "rails_helper"
require "rake"

RSpec.describe "route_leg_override rake tasks" do
  before(:all) do
    Rake.application.rake_require("tasks/route_leg_override", [ Rails.root.to_s + "/lib" ])
    Rake::Task.define_task(:environment)
  end

  let(:tour) { create(:tour) }
  let(:day)  { tour.days.first }

  describe "route_leg_override:migrate_low_tier_road" do
    let(:prev) { create(:activity, tour: tour, day: day, lat: 36.0, lng: 103.0, position: 1) }
    let(:road) do
      create(:activity, tour: tour, day: day, kind: :road, citizen_level: :tier_two,
             lat: 36.5, lng: 103.5, position: 2,
             details: { "km" => 120, "drive_min" => 150 })
    end
    let(:nxt)  { create(:activity, tour: tour, day: day, lat: 37.0, lng: 104.0, position: 3) }

    before do
      prev; road; nxt  # materialize in order
      # Stub AmapDirectionService so Upsert call in rake doesn't hit network
      allow_any_instance_of(AmapDirectionService).to receive(:fetch).and_return(
        distance_m: 110_000, duration_s: 7000, polyline: { "coords" => [] }
      )
    end

    it "creates leg prev→next with override from road's details" do
      Rake::Task["route_leg_override:migrate_low_tier_road"].invoke
      leg = RouteLeg.find_by(from_activity_id: prev.id, to_activity_id: nxt.id)
      expect(leg).to be_present
      expect(leg.distance_m_override).to eq(120_000)
      expect(leg.duration_s_override).to eq(150 * 60)
      expect(leg.note).to include(road.name)
      expect(leg.overridden_at).to be_present
    end

    it "does not delete the activity (deletion is separate task)" do
      Rake::Task["route_leg_override:migrate_low_tier_road"].reenable
      Rake::Task["route_leg_override:migrate_low_tier_road"].invoke
      expect(Activity.exists?(road.id)).to be true
    end

    it "DRY_RUN=1 produces report but creates no override" do
      ENV["DRY_RUN"] = "1"
      Rake::Task["route_leg_override:migrate_low_tier_road"].reenable
      Rake::Task["route_leg_override:migrate_low_tier_road"].invoke
      expect(RouteLeg.where(from_activity_id: prev.id).any? { |l| l.overridden? }).to be false
      ENV.delete("DRY_RUN")
    end
  end

  describe "route_leg_override:rename_scenic_road_details" do
    it "renames from_name/to_name to start_name/end_name for tier_one road" do
      a = create(:activity, tour: tour, day: day, kind: :road, citizen_level: :tier_one,
                 lat: 42.9, lng: 83.5, position: 1,
                 details: { "from_name" => "南入口", "to_name" => "北出口", "km" => 120 })
      Rake::Task["route_leg_override:rename_scenic_road_details"].reenable
      Rake::Task["route_leg_override:rename_scenic_road_details"].invoke
      a.reload
      expect(a.details["start_name"]).to eq("南入口")
      expect(a.details["end_name"]).to eq("北出口")
      expect(a.details).not_to have_key("from_name")
      expect(a.details).not_to have_key("to_name")
      expect(a.details["km"]).to eq(120)  # unchanged
    end

    it "is idempotent (running twice is safe)" do
      a = create(:activity, tour: tour, day: day, kind: :road, citizen_level: :tier_one,
                 lat: 42.9, lng: 83.5, position: 1,
                 details: { "start_name" => "南入口" })  # already migrated
      Rake::Task["route_leg_override:rename_scenic_road_details"].reenable
      Rake::Task["route_leg_override:rename_scenic_road_details"].invoke
      a.reload
      expect(a.details["start_name"]).to eq("南入口")
    end
  end

  describe "route_leg_override:delete_low_tier_road" do
    it "destroys non-tier_one road activities and renumbers positions" do
      a1 = create(:activity, tour: tour, day: day, lat: 36.0, lng: 103.0, position: 1)
      low = create(:activity, tour: tour, day: day, kind: :road, citizen_level: :tier_two,
                   lat: 36.5, lng: 103.5, position: 2, details: { "km" => 10 })
      a3 = create(:activity, tour: tour, day: day, lat: 37.0, lng: 104.0, position: 3)
      Rake::Task["route_leg_override:delete_low_tier_road"].reenable
      Rake::Task["route_leg_override:delete_low_tier_road"].invoke
      expect(Activity.exists?(low.id)).to be false
      expect(a1.reload.position).to eq(1)
      expect(a3.reload.position).to eq(2)  # renumbered
    end

    it "leaves tier_one road activities untouched" do
      scenic = create(:activity, :scenic_road, tour: tour, day: day, position: 1)
      Rake::Task["route_leg_override:delete_low_tier_road"].reenable
      Rake::Task["route_leg_override:delete_low_tier_road"].invoke
      expect(Activity.exists?(scenic.id)).to be true
    end
  end
end
```

- [ ] **Step 2: 跑测试确认失败**

```bash
bin/rspec spec/lib/tasks/route_leg_override_spec.rb
```

Expected: FAIL - task not defined。

- [ ] **Step 3: 实现 rake task**

新建 `lib/tasks/route_leg_override.rake`：

```ruby
namespace :route_leg_override do
  desc "Migrate low-tier road activities to route_leg override (DRY_RUN=1 to preview)"
  task migrate_low_tier_road: :environment do
    dry_run = ENV["DRY_RUN"] == "1"
    report = { processed: 0, migrated: 0, orphaned: [], with_attachments: [] }

    Activity.where(kind: :road).where.not(citizen_level: :tier_one).find_each do |road|
      report[:processed] += 1
      prev_act = road.day&.activities&.where("position < ?", road.position)&.order(:position)&.last
      next_act = road.day&.activities&.where("position > ?", road.position)&.order(:position)&.first

      if prev_act.nil? || next_act.nil?
        report[:orphaned] << { id: road.id, name: road.name, day_id: road.day_id }
        next
      end

      # Flag activities with expense/image associations (if they exist in this codebase)
      if road.respond_to?(:expenses) && road.expenses.any?
        report[:with_attachments] << { id: road.id, type: "expense" }
      end

      next if dry_run

      leg = RouteLeg::Upsert.new(
        tour: road.tour, from_activity_id: prev_act.id, to_activity_id: next_act.id,
        mode: :driving
      ).call

      km = road.details["km"].to_f
      drive_min = road.details["drive_min"].to_i
      note = [ road.name, road.desc ].reject { |s| s.nil? || s.strip.empty? }.join(" · ")
      ActiveRecord::Base.transaction do
        leg.update!(
          distance_m_override: (leg.distance_m_override || 0) + (km * 1000).round,
          duration_s_override: (leg.duration_s_override || 0) + (drive_min * 60),
          note: [ leg.note, note ].compact_blank.join(" / ").presence,
          overridden_at: Time.current,
          overridden_by_id: road.tour.author_id,
        )
      end
      report[:migrated] += 1
    end

    puts "=== route_leg_override:migrate_low_tier_road report ==="
    puts "DRY_RUN" if dry_run
    puts "处理活动数: #{report[:processed]}"
    puts "已迁移到 override: #{report[:migrated]}"
    puts "孤立首/末活动（数据丢失）: #{report[:orphaned].size}"
    report[:orphaned].each { |r| puts "  - id=#{r[:id]} name=#{r[:name]}" }
    puts "关联 expense/image: #{report[:with_attachments].size}"
    report[:with_attachments].each { |r| puts "  - id=#{r[:id]} type=#{r[:type]}" }
  end

  desc "Rename scenic road details keys from_name/to_name → start_name/end_name"
  task rename_scenic_road_details: :environment do
    count = 0
    Activity.where(kind: :road, citizen_level: :tier_one).find_each do |a|
      d = a.details || {}
      changed = false
      if d.key?("from_name")
        d["start_name"] = d.delete("from_name"); changed = true
      end
      if d.key?("to_name")
        d["end_name"] = d.delete("to_name"); changed = true
      end
      if changed
        a.update_column(:details, d)
        count += 1
      end
    end
    puts "改名 tier_one road activity: #{count}"
  end

  desc "Delete low-tier road activities (run AFTER migrate_low_tier_road)"
  task delete_low_tier_road: :environment do
    count = 0
    Activity.where(kind: :road).where.not(citizen_level: :tier_one).find_each do |a|
      a.destroy!
      count += 1
    end
    puts "删除低 tier road activity: #{count}"
    # Renumber positions per day
    Day.joins(:activities).distinct.find_each do |d|
      d.activities.order(:position).each_with_index do |act, i|
        act.update_column(:position, i + 1)
      end
    end
    puts "重排 day positions 完成"
  end
end
```

- [ ] **Step 4: 跑测试**

```bash
bin/rspec spec/lib/tasks/route_leg_override_spec.rb
```

Expected: 全绿。

- [ ] **Step 5: 提交**

```bash
git add lib/tasks/route_leg_override.rake spec/lib/tasks/route_leg_override_spec.rb
git commit -m "feat(rake): route_leg_override 三个迁移任务（含 DRY_RUN）"
```

---

## Phase H ｜生产迁移执行（runbook，手动 gate）

⚠️ **本阶段不是代码修改，是生产操作。严格按顺序执行，每步人工确认后再进下一步。**

### Task H.1: 部署 PR 1（Phase A-G 的代码）

- [ ] **Step 1: 本地全量测试**

```bash
bin/rspec
npm test
bin/rubocop -f github
bin/brakeman --no-pager
```

全绿才能开 PR。

- [ ] **Step 2: 开 PR，CI 通过后人工 review**

```bash
gh pr create --title "feat: 地点选择 + 路段概念合流重构 PR1 (加法)" --body "$(cat <<'EOF'
## Summary
- LocationPicker 新组件替换 PoiSearchCombobox（非 road 抽屉）
- route_legs 加 override 字段，RouteLegEditModal 接入
- RouteLeg::Upsert 景观公路感知
- Day#driving_minutes_total 修漏算 bug
- 景观公路抽屉双 POI 模板
- 迁移 rake 任务（先不跑）

## Test plan
- [ ] bin/rspec 全绿
- [ ] npm test 全绿
- [ ] 手动：新建普通活动看省市
- [ ] 手动：新建景观公路看双 POI + 自动预填
- [ ] 手动：点 Planner 驾驶段开 Modal
EOF
)"
```

- [ ] **Step 3: User merges PR from GitHub UI**

不 auto-merge（按 CLAUDE.md 约定）。

- [ ] **Step 4: Deploy**

按 `deploy_workflow.md`：merge 到 main → 切回 main → `mise exec -- bundle exec kamal deploy`。

### Task H.2: 生产 backup

- [ ] **Step 1: 确认生产 backup 机制已运行一次**

```bash
mise exec -- bundle exec kamal app exec --reuse "pg_dump -U postgres one_tour_production > /tmp/pre-migration-$(date +%Y%m%d-%H%M%S).sql"
```

或通过 Kamal accessories 已有的 backup 脚本。确认 backup 文件大小合理（几十 MB 到 GB 级别取决于数据量）。

### Task H.3: Dry run

- [ ] **Step 1: 执行 DRY_RUN**

```bash
mise exec -- bundle exec kamal app exec --reuse "DRY_RUN=1 bin/rails route_leg_override:migrate_low_tier_road"
```

记录输出。

- [ ] **Step 2: 人工审阅报告**

检查：
- 处理活动数合理吗？
- 孤立首/末活动有多少？这些数据会丢——可接受？
- 关联 expense/image 的有几个？如果非 0，逐个判断是否真的该删。

**🛑 如果报告里有不可接受的数据丢失或意外关联，停在这里，和 Drew 对齐后再继续。**

### Task H.4: 真跑迁移

- [ ] **Step 1: 迁移 override**

```bash
mise exec -- bundle exec kamal app exec --reuse "bin/rails route_leg_override:migrate_low_tier_road"
```

- [ ] **Step 2: 改 scenic road details keys**

```bash
mise exec -- bundle exec kamal app exec --reuse "bin/rails route_leg_override:rename_scenic_road_details"
```

- [ ] **Step 3: 删除低 tier road activity**

```bash
mise exec -- bundle exec kamal app exec --reuse "bin/rails route_leg_override:delete_low_tier_road"
```

- [ ] **Step 4: 修历史 route_leg 的 duration=0（AMAP v5 parser bug 修前的遗产）**

PR1 修了 `AmapDirectionService` 漏读 v5 shape 的 `path.cost.duration`，
但历史 route_leg 的 `duration_s=0` 不会自动修（cache_valid? 看 polyline + digest
都在）。这个 rake 把"有距离无时长"的 leg 批量 refetch：

```bash
# 先 dry run 看命中多少条
mise exec -- bundle exec kamal app exec --reuse "DRY_RUN=1 bin/rails route_leg_maintenance:refetch_zero_duration"
# 人工确认数量合理后真跑
mise exec -- bundle exec kamal app exec --reuse "bin/rails route_leg_maintenance:refetch_zero_duration"
```

幂等：跑完再跑一次应该报 `Found 0 legs`。

### Task H.5: Spot check

- [ ] **Step 1: 后台核查**

```bash
mise exec -- bundle exec kamal app exec --reuse "bin/rails runner 'puts Activity.where(kind: :road).where.not(citizen_level: :tier_one).count'"
```

Expected: `0`。

```bash
mise exec -- bundle exec kamal app exec --reuse "bin/rails runner 'puts RouteLeg.where.not(overridden_at: nil).count'"
```

Expected: 接近迁移报告里的 migrated 数。

- [ ] **Step 2: 前端 spot check**

登录生产，随机选一个行程 → 看 Planner：
- 驾驶段是否正常显示
- 已 override 的段是否有"已调整"徽章
- 点击驾驶段 Modal 是否弹出、数值正确

- [ ] **Step 3: 人工签字**

问 Drew："生产迁移完成，spot check 看起来 OK。是否进 PR 2 清理？"

---

## Phase I ｜清理 PR 2

### Task I.1: Migration - check constraint

**Files:**
- Create: `db/migrate/<ts>_add_road_tier_one_check_constraint.rb`

- [ ] **Step 1: 生成 migration**

```bash
bin/rails generate migration AddRoadTierOneCheckConstraint
```

- [ ] **Step 2: 填充**

```ruby
class AddRoadTierOneCheckConstraint < ActiveRecord::Migration[8.0]
  def change
    add_check_constraint :activities,
      "NOT (kind = 1 AND citizen_level != 0)",
      name: "road_must_be_tier_one"
  end
end
```

- [ ] **Step 3: 跑 migration**

```bash
bin/rails db:migrate
```

Expected: 成功。如失败，意味着仍有非 tier_one 的 road activity 没被 rake 删掉——回 Phase H 排查。

- [ ] **Step 4: 提交**

```bash
git add db/migrate/ db/schema.rb
git commit -m "fix(activity): DB check constraint 锁 kind=road ↔ tier_one"
```

---

### Task I.2: 删 DayColumn.jsx 低 tier road 分支

**Files:**
- Modify: `app/javascript/components/planner/DayColumn.jsx`

- [ ] **Step 1: 定位并删**

```bash
grep -n "kind === 'road' && citizen_level !== 'tier_one'" app/javascript/components/planner/DayColumn.jsx
```

定位后删除整段分支（约行 95, 117-137）。保持其他逻辑不变。

- [ ] **Step 2: 跑 DayColumn 测试**

```bash
npm test -- DayColumn
```

Expected: 全绿。若测试里有低 tier road 渲染用例，删掉或改。

- [ ] **Step 3: 提交**

```bash
git add app/javascript/components/planner/DayColumn.jsx app/javascript/components/planner/__tests__/DayColumn.test.jsx
git commit -m "chore(planner): 删 DayColumn 低 tier road 渲染分支（迁移已完成）"
```

---

### Task I.3: 删 RoadConnector activity-backed variant

**Files:**
- Modify: `app/javascript/components/planner/RoadConnector.jsx`

- [ ] **Step 1: 删 `ActivityBackedConnector`**

把 `function ActivityBackedConnector(...) { ... }` 整块删除。`export default function RoadConnector` 简化为：

```jsx
export default function RoadConnector({ leg, isHighlighted, onHoverConnector, onClearHover,
                                         fromActivityId, toActivityId, dayColorName, onClick }) {
  return <SynthesizedConnector
    leg={leg} isHighlighted={isHighlighted}
    onHoverConnector={onHoverConnector} onClearHover={onClearHover}
    fromActivityId={fromActivityId} toActivityId={toActivityId}
    dayColorName={dayColorName} onClick={onClick}
  />
}
```

也可以直接 `export default SynthesizedConnector`。

- [ ] **Step 2: 删 extractKmMin 里 activity 分支**

现在只从 leg 读数据：

```javascript
function extractKmMin({ leg }) {
  const km = leg?.distance_m_override != null
    ? Math.round(leg.distance_m_override / 1000)
    : (leg?.distance_m != null ? Math.round(leg.distance_m / 1000) : undefined)
  const min = leg?.duration_s_override != null
    ? Math.round(leg.duration_s_override / 60)
    : (leg?.duration_s != null ? Math.round(leg.duration_s / 60) : undefined)
  return { km, min }
}
```

- [ ] **Step 3: 跑测试**

```bash
npm test -- RoadConnector
```

Expected: 全绿（删 activity-backed 相关测试）。

- [ ] **Step 4: 提交**

```bash
git add app/javascript/components/planner/RoadConnector.jsx app/javascript/components/planner/__tests__/RoadConnector.test.jsx
git commit -m "chore(planner): 删 RoadConnector activity-backed variant"
```

---

### Task I.4: 删 PoiSearchCombobox

**Files:**
- Delete: `app/javascript/components/activity-editor/PoiSearchCombobox.jsx`

- [ ] **Step 1: 确认无引用**

```bash
grep -rn "PoiSearchCombobox" app/javascript/ spec/
```

Expected: 无匹配（CommonFields 已改为 LocationPicker；ActivityDrawer.test 也已 remock）。

- [ ] **Step 2: 删文件**

```bash
git rm app/javascript/components/activity-editor/PoiSearchCombobox.jsx
```

如果存在对应测试文件，一并删。

- [ ] **Step 3: 跑全量测试**

```bash
npm test
```

Expected: 全绿。

- [ ] **Step 4: 提交**

```bash
git commit -m "chore(activity-editor): 删 PoiSearchCombobox（被 LocationPicker 取代）"
```

---

### Task I.5: 文案 sweep（路段 → 景观公路 / 驾驶段）

**Files:**
- Multiple（搜出来的所有匹配）

- [ ] **Step 1: 全 codebase 搜**

```bash
grep -rn "路段" app/ spec/ config/ README.md CLAUDE.md docs/ --include="*.rb" --include="*.js" --include="*.jsx" --include="*.md"
```

- [ ] **Step 2: 分类并替换**

每个匹配按上下文判断：
- 出现在 `kind=road` / `KIND_OPTIONS` / 景观公路语境 → `景观公路`
- 出现在 `route_leg` 语境 → `驾驶段`
- 文档里讨论"路段"概念的历史性描述 → 保留原词但加个"现称景观公路/驾驶段"的注脚

具体替换用 Edit（或 sed 手动逐个核查）。**不要盲目 replace_all**——两种语境不能一刀切。

- [ ] **Step 3: 跑测试**

```bash
bin/rspec
npm test
```

Expected: 全绿（有 spec 可能断言了"路段"字样，改为新词）。

- [ ] **Step 4: 提交**

```bash
git add .
git commit -m "docs: 术语 sweep 路段 → 景观公路 / 驾驶段"
```

---

### Task I.6: 测试与 factory 清理

**Files:**
- Modify: various test files

- [ ] **Step 1: 扫 factory 里的 road default**

```bash
grep -rn ":road" spec/factories/
```

若有 factory 默认造 `kind: :road` 且不是 tier_one —— 改为 tier_one 或加 trait。

- [ ] **Step 2: 扫测试里所有 `kind: :road` 用例**

```bash
grep -rn "kind: :road\|kind: 'road'" spec/
```

检查每个是否用 `:scenic_road` trait 或显式 tier_one。不合规的改正。

- [ ] **Step 3: 跑完整后端测试**

```bash
bin/rspec
```

Expected: 全绿。

- [ ] **Step 4: 跑完整前端测试**

```bash
npm test
```

Expected: 全绿。

- [ ] **Step 5: Lint + 安全扫描**

```bash
bin/rubocop -f github
bin/brakeman --no-pager
npm audit
```

全部通过。

- [ ] **Step 6: 提交 + 开 PR 2**

```bash
git add .
git commit -m "chore(test): 清理 road factory / spec 使用 scenic_road trait"
gh pr create --title "chore: 地点选择 + 路段概念合流重构 PR2 (清理)" --body "$(cat <<'EOF'
## Summary
- DB check constraint 锁 kind=road ↔ tier_one
- 删 DayColumn 低 tier road 分支
- 删 RoadConnector activity-backed variant
- 删 PoiSearchCombobox
- 文案 sweep: 路段 → 景观公路 / 驾驶段
- 测试 / factory 清理

## Test plan
- [ ] bin/rspec 全绿
- [ ] npm test 全绿
- [ ] bin/rubocop / brakeman / npm audit 通过
- [ ] 手动：生产 spot check 没有回归
EOF
)"
```

- [ ] **Step 7: User merges PR 2, deploy**

最后按 `deploy_workflow.md` deploy。

---

## 完成标准

整轮完成后应满足：

- [ ] `Activity.where(kind: :road).where.not(citizen_level: :tier_one).count == 0`
- [ ] `Day#driving_minutes_total` 在只有 route_leg 的日子里返回非 0
- [ ] Planner 上所有 dashed line 可点开编辑 override
- [ ] 新建/编辑抽屉里搜索结果显示省·市·区
- [ ] 地图缩略图支持拖钉微调坐标
- [ ] 景观公路抽屉双 POI 搜索并自动预填 km/drive_min
- [ ] `kind=road` activity 在数据库 check constraint 保护下只能 tier_one
- [ ] `PoiSearchCombobox.jsx` 文件不存在
- [ ] Codebase 里"路段"只用来指 `route_leg`（现称"驾驶段"），景观公路一律用"景观公路"
- [ ] bin/rspec / npm test / bin/rubocop / bin/brakeman / npm audit 全绿
