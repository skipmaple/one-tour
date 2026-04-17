# Tour / Day / Activity 重建模 — 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 one-tour 从"AI + Markdown 路书编辑器"重建为"可视化 trip planner"。新增 Tour/Day/Activity 三级实体、宪法机器校验、AI tool-calling 系统；同一 PR 内删除老 Guidebook 路径。

**Architecture:** Rails 8 + Postgres jsonb + Inertia + React。数据层四张新表（tours / tour_memberships / days / activities），activities 用 `kind` 枚举 + `details` jsonb 表达 5 类子类型。宪法层 `Constitution::DEFAULTS` + `tours.constitution`（每程独立拷贝）+ `Tour::ConstitutionCheck` PORO。AI 层 `AITools::*`（RubyLLM::Tool 子类）替换 markdown-diff 管线。前端单页 Planner（backlog / map / days / chat 四区）+ React DnD 拖拽。

**Tech Stack:** Rails 8.0、Postgres (jsonb)、RubyLLM tool-use、Inertia Rails、React、ActionCable、AMAP v5/place/text、RSpec、Vitest、WebMock、@dnd-kit/core。

**数据前提：** 生产仅 5 个 guidebook 无真实用户数据；采用一次性硬切，不做数据迁移，同 PR 删除老代码。

**参考 spec：** `docs/superpowers/specs/2026-04-15-tour-day-activity-remodel-design.md` + 配套原型 `*-wireframes.html`。

---

## 执行约定

- **TDD 严格：** 每个有行为的 task 按 "先写测试 → 验证失败 → 实现 → 验证通过 → commit" 节奏。
- **常用命令：**
  - Ruby 测试：`mise exec -- bundle exec rspec <path>`
  - 整个 RSpec：`mise exec -- bundle exec rspec`
  - Rubocop：`bin/rubocop -f github`
  - Brakeman：`bin/brakeman --no-pager`
  - JS 测试：`npm test`
- **每个 Phase 末 checkpoint：** 运行全量测试 + `bin/rubocop` + `bin/brakeman`，全绿后 commit `chore: phase N checkpoint`。
- **commit 规范：** 参考 repo 现有风格（短 subject + 可选 body）；不要 `--amend`，失败后新 commit。

---

## 路线图

| Phase | 主题 | Tasks | 结束后能做什么 |
|---|---|---|---|
| 0 | 基础设施 | 2 | Zeitwerk AI acronym + `app/ai_tools/` 目录就绪 |
| 1 | 数据模型 + 宪法 | 23 | 4 张表建好、4 个 model、Constitution 校验全绿 |
| 2 | AI tools + Job | 18 | 12 个 tool + ChatStreamJob 新实现全绿 |
| 3 | Controllers + Routes | 11 | Request specs 全绿 |
| 4 | 前端 UI | 14 | 浏览器可走完端到端 |
| 5 | 清理老代码 | 8 | 删除 Guidebook 所有痕迹 |
| 6 | 最终验证 | 3 | CI 工具链全绿 + 手工 E2E |

---

## Phase 0 — 基础设施

### Task 0.1: 开分支 + 空 commit 起点

**Files:** 无

- [ ] **Step 1: 开分支**

```bash
cd /Users/drewlee/work/personal/one-tour
git checkout main
git pull
git checkout -b feature/tour-day-activity-remodel
```

- [ ] **Step 2: 空 commit 建立起点**

```bash
git commit --allow-empty -m "chore: start tour/day/activity remodel"
```

---

### Task 0.2: Zeitwerk AI acronym + `app/ai_tools/` 目录

**Files:**
- Modify: `config/initializers/inflections.rb`
- Create: `app/ai_tools/.keep`

- [ ] **Step 1: 编辑 inflections.rb**

```ruby
# config/initializers/inflections.rb
ActiveSupport::Inflector.inflections(:en) do |inflect|
  inflect.acronym "AI"
end
```

- [ ] **Step 2: 建空目录 keep 文件**

```bash
mkdir -p app/ai_tools
touch app/ai_tools/.keep
```

- [ ] **Step 3: 验证 Rails console 能识别 AITools 命名空间**

Run:
```bash
mise exec -- bundle exec rails runner 'p "AITools" == "ai_tools".camelize'
```

Expected: 打印 `true`

- [ ] **Step 4: Commit**

```bash
git add config/initializers/inflections.rb app/ai_tools/.keep
git commit -m "chore: register AI acronym + scaffold app/ai_tools"
```

---

## Phase 1 — 数据模型 + 宪法

### Task 1.1: Migration — 创建 tours 表

**Files:**
- Create: `db/migrate/<TS>_create_tours.rb`

- [ ] **Step 1: 生成 migration**

```bash
mise exec -- bin/rails generate migration CreateTours
```

- [ ] **Step 2: 填写 migration 内容**

```ruby
class CreateTours < ActiveRecord::Migration[8.0]
  def change
    create_table :tours do |t|
      t.references :author, null: false, foreign_key: { to_table: :users }
      t.string  :title, null: false
      t.string  :date_range
      t.string  :vehicle
      t.integer :team_size
      t.string  :trip_style
      t.string  :budget_per_person
      t.jsonb   :constitution, default: {}, null: false
      t.jsonb   :constraint_overrides, default: [], null: false
      t.boolean :archived, default: false, null: false
      t.timestamps
    end
  end
end
```

- [ ] **Step 3: 运行 migration**

```bash
mise exec -- bin/rails db:migrate
```

Expected: `db/schema.rb` 新增 `tours` 表；无报错。

- [ ] **Step 4: Commit**

```bash
git add db/migrate/*create_tours.rb db/schema.rb
git commit -m "db: create tours table"
```

---

### Task 1.2: Migration — 创建 tour_memberships 表

**Files:**
- Create: `db/migrate/<TS>_create_tour_memberships.rb`

- [ ] **Step 1: 生成 migration**

```bash
mise exec -- bin/rails generate migration CreateTourMemberships
```

- [ ] **Step 2: 填写内容**

```ruby
class CreateTourMemberships < ActiveRecord::Migration[8.0]
  def change
    create_table :tour_memberships do |t|
      t.references :tour, null: false, foreign_key: true
      t.references :user, null: false, foreign_key: true
      t.integer    :role, default: 0, null: false  # reader=0, editor=1
      t.timestamps
      t.index [:tour_id, :user_id], unique: true
    end
  end
end
```

- [ ] **Step 3: Migrate + Commit**

```bash
mise exec -- bin/rails db:migrate
git add db/migrate/*create_tour_memberships.rb db/schema.rb
git commit -m "db: create tour_memberships table"
```

---

### Task 1.3: Migration — 创建 days 表

**Files:**
- Create: `db/migrate/<TS>_create_days.rb`

- [ ] **Step 1: 生成 + 填写**

```bash
mise exec -- bin/rails generate migration CreateDays
```

```ruby
class CreateDays < ActiveRecord::Migration[8.0]
  def change
    create_table :days do |t|
      t.references :tour, null: false, foreign_key: true
      t.integer :day_index, null: false
      t.date    :date
      t.string  :title
      t.text    :theme
      t.integer :intensity  # green=0, yellow=1, red=2
      t.boolean :buffer_day, default: false, null: false
      t.timestamps
      t.index [:tour_id, :day_index], unique: true
    end
  end
end
```

- [ ] **Step 2: Migrate + Commit**

```bash
mise exec -- bin/rails db:migrate
git add db/migrate/*create_days.rb db/schema.rb
git commit -m "db: create days table"
```

---

### Task 1.4: Migration — 创建 activities 表

**Files:**
- Create: `db/migrate/<TS>_create_activities.rb`

- [ ] **Step 1: 生成 + 填写**

```bash
mise exec -- bin/rails generate migration CreateActivities
```

```ruby
class CreateActivities < ActiveRecord::Migration[8.0]
  def change
    create_table :activities do |t|
      t.references :tour, null: false, foreign_key: true
      t.references :day, null: true, foreign_key: true
      t.integer :position, null: false

      t.integer :citizen_level, null: false, default: 2   # tier_one=0, tier_two=1, tier_three=2, infrastructure=3
      t.integer :kind, null: false                         # scenic=0, road=1, food=2, stay=3, fuel=4, other=5

      t.string  :name, null: false
      t.decimal :lat, precision: 9, scale: 6
      t.decimal :lng, precision: 9, scale: 6
      t.string  :address

      t.time    :planned_start_at
      t.integer :planned_duration_min

      t.text    :desc
      t.text    :tips

      t.jsonb   :details, default: {}, null: false

      t.timestamps
      t.index [:tour_id, :day_id, :position]
      t.index [:tour_id, :kind, :citizen_level]
    end
  end
end
```

- [ ] **Step 2: Migrate + Commit**

```bash
mise exec -- bin/rails db:migrate
git add db/migrate/*create_activities.rb db/schema.rb
git commit -m "db: create activities table"
```

---

### Task 1.5: Migration — conversations 指向 tour 而非 guidebook

**Files:**
- Create: `db/migrate/<TS>_point_conversations_to_tour.rb`

> 数据前提：生产 5 条数据可接受清空。新 tour 上线前先清 conversations/messages。

- [ ] **Step 1: 生成 + 填写**

```bash
mise exec -- bin/rails generate migration PointConversationsToTour
```

```ruby
class PointConversationsToTour < ActiveRecord::Migration[8.0]
  def up
    execute "DELETE FROM messages"
    execute "DELETE FROM conversations"

    remove_reference :conversations, :guidebook, foreign_key: true
    add_reference :conversations, :tour, null: false, foreign_key: true
    add_index :conversations, [:tour_id, :user_id], unique: true, name: "index_conversations_on_tour_id_and_user_id"
  end

  def down
    remove_reference :conversations, :tour, foreign_key: true
    add_reference :conversations, :guidebook, null: false, foreign_key: true
    add_index :conversations, [:guidebook_id, :user_id], unique: true
  end
end
```

- [ ] **Step 2: Migrate + Commit**

```bash
mise exec -- bin/rails db:migrate
git add db/migrate/*point_conversations_to_tour.rb db/schema.rb
git commit -m "db: point conversations to tours (drop guidebook_id)"
```

---

### Task 1.6: Tour model 骨架 + factory

**Files:**
- Create: `app/models/tour.rb`
- Create: `spec/factories/tours.rb`

- [ ] **Step 1: 写 Tour 模型骨架**

```ruby
# app/models/tour.rb
class Tour < ApplicationRecord
  belongs_to :author, class_name: "User"
  has_many :tour_memberships, dependent: :destroy
  has_many :members, through: :tour_memberships, source: :user
  has_many :days, -> { order(:day_index) }, dependent: :destroy
  has_many :activities, dependent: :destroy
  has_many :conversations, dependent: :destroy

  validates :title, presence: true

  before_create :seed_constitution_defaults

  private
    def seed_constitution_defaults
      self.constitution = Constitution::DEFAULTS.deep_stringify_keys if constitution.blank?
    end
end
```

- [ ] **Step 2: 写 factory**

```ruby
# spec/factories/tours.rb
FactoryBot.define do
  factory :tour do
    sequence(:title) { |n| "Tour #{n}" }
    association :author, factory: :user
  end
end
```

- [ ] **Step 3: Commit**

```bash
git add app/models/tour.rb spec/factories/tours.rb
git commit -m "model: Tour scaffold + factory"
```

---

### Task 1.7: Constitution::DEFAULTS module

**Files:**
- Create: `app/models/concerns/constitution.rb`
- Create: `spec/models/concerns/constitution_spec.rb`

- [ ] **Step 1: 写测试**

```ruby
# spec/models/concerns/constitution_spec.rb
require "rails_helper"

RSpec.describe Constitution do
  it "defines 8 required default rules" do
    expect(Constitution::DEFAULTS.keys).to contain_exactly(
      :max_daily_driving_minutes,
      :max_mountain_road_minutes,
      :max_tier_one_per_day,
      :min_buffer_days,
      :min_daily_buffer_minutes,
      :max_tier_two_food_per_tour,
      :max_fuel_emergency_per_tour,
      :max_yurt_nights
    )
  end

  it "freezes the DEFAULTS constant" do
    expect(Constitution::DEFAULTS).to be_frozen
  end

  it "sets the canonical default values" do
    expect(Constitution::DEFAULTS[:max_daily_driving_minutes]).to eq(420)
    expect(Constitution::DEFAULTS[:max_tier_one_per_day]).to eq(3)
    expect(Constitution::DEFAULTS[:min_buffer_days]).to eq(1)
  end
end
```

- [ ] **Step 2: 运行测试验证失败**

Run: `mise exec -- bundle exec rspec spec/models/concerns/constitution_spec.rb`
Expected: FAIL（`uninitialized constant Constitution`）

- [ ] **Step 3: 实现 Constitution module**

```ruby
# app/models/concerns/constitution.rb
module Constitution
  DEFAULTS = {
    max_daily_driving_minutes:     420,
    max_mountain_road_minutes:     240,
    max_tier_one_per_day:          3,
    min_buffer_days:               1,
    min_daily_buffer_minutes:      90,
    max_tier_two_food_per_tour:    3,
    max_fuel_emergency_per_tour:   1,
    max_yurt_nights:               1
  }.freeze
end
```

- [ ] **Step 4: 运行测试验证通过**

Run: `mise exec -- bundle exec rspec spec/models/concerns/constitution_spec.rb`
Expected: 3 examples, 0 failures

- [ ] **Step 5: Commit**

```bash
git add app/models/concerns/constitution.rb spec/models/concerns/constitution_spec.rb
git commit -m "model: Constitution::DEFAULTS module"
```

---

### Task 1.8: Tour#constitution seed on create

**Files:**
- Modify: `app/models/tour.rb` (已在 1.6 就位 `seed_constitution_defaults`)
- Create: `spec/models/tour_spec.rb`

- [ ] **Step 1: 写测试**

```ruby
# spec/models/tour_spec.rb
require "rails_helper"

RSpec.describe Tour do
  describe "defaults" do
    it "deep-copies Constitution::DEFAULTS into constitution on create" do
      tour = create(:tour)
      expect(tour.constitution["max_daily_driving_minutes"]).to eq(420)
      expect(tour.constitution["max_tier_one_per_day"]).to eq(3)
    end

    it "is independent per tour (changing one does not affect DEFAULTS)" do
      tour = create(:tour)
      tour.constitution["max_daily_driving_minutes"] = 360
      tour.save!
      expect(Constitution::DEFAULTS[:max_daily_driving_minutes]).to eq(420)
    end
  end
end
```

- [ ] **Step 2: 运行 → 应通过（因 1.6 已实现 seed）**

Run: `mise exec -- bundle exec rspec spec/models/tour_spec.rb`
Expected: 2 examples, 0 failures

- [ ] **Step 3: Commit**

```bash
git add spec/models/tour_spec.rb
git commit -m "spec: Tour seeds constitution defaults"
```

---

### Task 1.9: Tour 权限方法 (owned_by? / editable_by? / visible_to?)

**Files:**
- Modify: `app/models/tour.rb`
- Modify: `spec/models/tour_spec.rb`

- [ ] **Step 1: 追加测试**

```ruby
# 追加到 spec/models/tour_spec.rb 的 describe Tour 块内
describe "#owned_by?" do
  let(:author) { create(:user) }
  let(:tour) { create(:tour, author: author) }

  it "returns true for author" do
    expect(tour.owned_by?(author)).to be true
  end

  it "returns false for non-author" do
    other = create(:user)
    expect(tour.owned_by?(other)).to be false
  end

  it "returns false for nil user" do
    expect(tour.owned_by?(nil)).to be false
  end
end

describe "#editable_by?" do
  let(:tour) { create(:tour) }
  let(:editor) { create(:user) }
  let(:reader) { create(:user) }

  before do
    create(:tour_membership, tour: tour, user: editor, role: :editor)
    create(:tour_membership, tour: tour, user: reader, role: :reader)
  end

  it "allows author" do
    expect(tour.editable_by?(tour.author)).to be true
  end

  it "allows editor member" do
    expect(tour.editable_by?(editor)).to be true
  end

  it "denies reader member" do
    expect(tour.editable_by?(reader)).to be false
  end

  it "denies non-member" do
    expect(tour.editable_by?(create(:user))).to be false
  end

  it "denies nil" do
    expect(tour.editable_by?(nil)).to be false
  end
end

describe "#visible_to?" do
  let(:tour) { create(:tour) }

  it "allows author" do
    expect(tour.visible_to?(tour.author)).to be true
  end

  it "allows any member" do
    reader = create(:user)
    create(:tour_membership, tour: tour, user: reader, role: :reader)
    expect(tour.visible_to?(reader)).to be true
  end

  it "denies non-member" do
    expect(tour.visible_to?(create(:user))).to be false
  end
end
```

- [ ] **Step 2: 运行 → 失败（没 TourMembership factory）**

Run: `mise exec -- bundle exec rspec spec/models/tour_spec.rb`
Expected: FAIL (`TourMembership` not defined)

- [ ] **Step 3: 先建 TourMembership factory + model**

```ruby
# app/models/tour_membership.rb
class TourMembership < ApplicationRecord
  belongs_to :tour
  belongs_to :user

  enum :role, reader: 0, editor: 1
end
```

```ruby
# spec/factories/tour_memberships.rb
FactoryBot.define do
  factory :tour_membership do
    tour
    user
    role { :reader }
  end
end
```

- [ ] **Step 4: 实现 Tour 权限方法**

```ruby
# 追加到 app/models/tour.rb（在 private 前面）
def owned_by?(user)
  if user
    author_id == user.id
  else
    false
  end
end

def editable_by?(user)
  if user
    owned_by?(user) || editor_member?(user)
  else
    false
  end
end

def visible_to?(user)
  if user
    owned_by?(user) || member?(user)
  else
    false
  end
end

private
  def editor_member?(user)
    tour_memberships.exists?(user: user, role: :editor)
  end

  def member?(user)
    tour_memberships.exists?(user: user)
  end
```

（注意保留 Task 1.6 里的 `seed_constitution_defaults` 在 private 块内）

- [ ] **Step 5: 运行测试验证通过**

Run: `mise exec -- bundle exec rspec spec/models/tour_spec.rb`
Expected: 11 examples, 0 failures

- [ ] **Step 6: Commit**

```bash
git add app/models/tour.rb app/models/tour_membership.rb spec/factories/tour_memberships.rb spec/models/tour_spec.rb
git commit -m "model: Tour permission predicates + TourMembership"
```

---

### Task 1.10: TourMembership spec

**Files:**
- Create: `spec/models/tour_membership_spec.rb`

- [ ] **Step 1: 写测试**

```ruby
require "rails_helper"

RSpec.describe TourMembership do
  it "has role enum with reader=0, editor=1" do
    expect(TourMembership.roles).to eq("reader" => 0, "editor" => 1)
  end

  it "is unique on (tour_id, user_id)" do
    tour = create(:tour)
    user = create(:user)
    create(:tour_membership, tour: tour, user: user)
    expect {
      create(:tour_membership, tour: tour, user: user)
    }.to raise_error(ActiveRecord::RecordNotUnique)
  end
end
```

- [ ] **Step 2: 运行**

Run: `mise exec -- bundle exec rspec spec/models/tour_membership_spec.rb`
Expected: 2 examples, 0 failures

- [ ] **Step 3: Commit**

```bash
git add spec/models/tour_membership_spec.rb
git commit -m "spec: TourMembership enum + unique"
```

---

### Task 1.11: Day model + spec

**Files:**
- Create: `app/models/day.rb`
- Create: `spec/factories/days.rb`
- Create: `spec/models/day_spec.rb`

- [ ] **Step 1: Day model**

```ruby
# app/models/day.rb
class Day < ApplicationRecord
  belongs_to :tour
  has_many :activities, -> { order(:position) }, dependent: :nullify

  enum :intensity, green: 0, yellow: 1, red: 2

  validates :day_index, presence: true, uniqueness: { scope: :tour_id }
end
```

- [ ] **Step 2: Factory**

```ruby
# spec/factories/days.rb
FactoryBot.define do
  factory :day do
    tour
    sequence(:day_index) { |n| n }
    title { "Day #{day_index}" }
    intensity { :green }
  end
end
```

- [ ] **Step 3: Spec**

```ruby
# spec/models/day_spec.rb
require "rails_helper"

RSpec.describe Day do
  it "requires day_index unique per tour" do
    tour = create(:tour)
    create(:day, tour: tour, day_index: 1)
    duplicate = build(:day, tour: tour, day_index: 1)
    expect(duplicate).not_to be_valid
  end

  it "allows same day_index across different tours" do
    create(:day, tour: create(:tour), day_index: 1)
    other = build(:day, tour: create(:tour), day_index: 1)
    expect(other).to be_valid
  end

  it "has intensity enum green/yellow/red" do
    expect(Day.intensities.keys).to eq(%w[green yellow red])
  end
end
```

- [ ] **Step 4: 运行 + Commit**

Run: `mise exec -- bundle exec rspec spec/models/day_spec.rb`
Expected: 3 examples, 0 failures

```bash
git add app/models/day.rb spec/factories/days.rb spec/models/day_spec.rb
git commit -m "model: Day + spec"
```

---

### Task 1.12: Activity model scaffold + enums

**Files:**
- Create: `app/models/activity.rb`
- Create: `spec/factories/activities.rb`
- Create: `spec/models/activity_spec.rb`

- [ ] **Step 1: 写 Activity 骨架**

```ruby
# app/models/activity.rb
class Activity < ApplicationRecord
  belongs_to :tour
  belongs_to :day, optional: true  # nil = backlog

  enum :kind, scenic: 0, road: 1, food: 2, stay: 3, fuel: 4, other: 5
  enum :citizen_level, tier_one: 0, tier_two: 1, tier_three: 2, infrastructure: 3

  validates :name, presence: true
  validates :position, presence: true
end
```

- [ ] **Step 2: Factory**

```ruby
# spec/factories/activities.rb
FactoryBot.define do
  factory :activity do
    tour
    day { nil }   # default backlog
    sequence(:position) { |n| n }
    sequence(:name) { |n| "Activity #{n}" }
    kind { :scenic }
    citizen_level { :tier_three }
  end
end
```

- [ ] **Step 3: Spec**

```ruby
# spec/models/activity_spec.rb
require "rails_helper"

RSpec.describe Activity do
  describe "enums" do
    it "has kind with 6 values" do
      expect(Activity.kinds.keys).to eq(%w[scenic road food stay fuel other])
    end

    it "has citizen_level with 4 values" do
      expect(Activity.citizen_levels.keys).to eq(%w[tier_one tier_two tier_three infrastructure])
    end
  end

  describe "backlog membership" do
    it "is in backlog when day is nil" do
      activity = create(:activity, day: nil)
      expect(activity.day_id).to be_nil
    end

    it "can belong to a day" do
      tour = create(:tour)
      day = create(:day, tour: tour)
      activity = create(:activity, tour: tour, day: day)
      expect(activity.day).to eq(day)
    end
  end

  describe "validations" do
    it "requires name" do
      activity = build(:activity, name: nil)
      expect(activity).not_to be_valid
    end
  end
end
```

- [ ] **Step 4: 运行 + Commit**

Run: `mise exec -- bundle exec rspec spec/models/activity_spec.rb`
Expected: 5 examples, 0 failures

```bash
git add app/models/activity.rb spec/factories/activities.rb spec/models/activity_spec.rb
git commit -m "model: Activity + enums + backlog support"
```

---

### Task 1.13: Day#driving_minutes_total & #tier_one_count

**Files:**
- Modify: `app/models/day.rb`
- Modify: `spec/models/day_spec.rb`

- [ ] **Step 1: 追加测试**

```ruby
# 追加到 spec/models/day_spec.rb
describe "#driving_minutes_total" do
  let(:tour) { create(:tour) }
  let(:day) { create(:day, tour: tour) }

  it "sums drive_min across road activities of this day" do
    create(:activity, tour: tour, day: day, kind: :road, details: { "drive_min" => 120 })
    create(:activity, tour: tour, day: day, kind: :road, details: { "drive_min" => 90 })
    create(:activity, tour: tour, day: day, kind: :scenic, details: { "foo" => 1 })
    expect(day.driving_minutes_total).to eq(210)
  end

  it "returns 0 when no road activities" do
    create(:activity, tour: tour, day: day, kind: :scenic)
    expect(day.driving_minutes_total).to eq(0)
  end
end

describe "#tier_one_count" do
  let(:tour) { create(:tour) }
  let(:day) { create(:day, tour: tour) }

  it "counts activities with citizen_level=tier_one in this day" do
    create(:activity, tour: tour, day: day, citizen_level: :tier_one)
    create(:activity, tour: tour, day: day, citizen_level: :tier_one)
    create(:activity, tour: tour, day: day, citizen_level: :tier_two)
    expect(day.tier_one_count).to eq(2)
  end
end
```

- [ ] **Step 2: 运行 → FAIL**

Run: `mise exec -- bundle exec rspec spec/models/day_spec.rb`
Expected: undefined method errors

- [ ] **Step 3: 实现**

```ruby
# 追加到 app/models/day.rb
def driving_minutes_total
  activities.where(kind: :road).sum("COALESCE((details->>'drive_min')::int, 0)")
end

def tier_one_count
  activities.where(citizen_level: :tier_one).count
end
```

- [ ] **Step 4: 运行 → PASS + Commit**

Run: `mise exec -- bundle exec rspec spec/models/day_spec.rb`
Expected: 5 examples, 0 failures

```bash
git add app/models/day.rb spec/models/day_spec.rb
git commit -m "model: Day driving_minutes_total + tier_one_count"
```

---

### Task 1.14: Tour 聚合方法 (tier_two_food_count / buffer_days_count)

**Files:**
- Modify: `app/models/tour.rb`
- Modify: `spec/models/tour_spec.rb`

- [ ] **Step 1: 追加测试**

```ruby
describe "#tier_two_food_count" do
  let(:tour) { create(:tour) }

  it "counts food activities with citizen_level=tier_two" do
    create(:activity, tour: tour, kind: :food, citizen_level: :tier_two)
    create(:activity, tour: tour, kind: :food, citizen_level: :tier_two)
    create(:activity, tour: tour, kind: :food, citizen_level: :tier_three)
    create(:activity, tour: tour, kind: :scenic, citizen_level: :tier_two)
    expect(tour.tier_two_food_count).to eq(2)
  end
end

describe "#buffer_days_count" do
  let(:tour) { create(:tour) }

  it "counts days marked buffer_day=true" do
    create(:day, tour: tour, day_index: 1, buffer_day: true)
    create(:day, tour: tour, day_index: 2, buffer_day: false)
    create(:day, tour: tour, day_index: 3, buffer_day: true)
    expect(tour.buffer_days_count).to eq(2)
  end
end
```

- [ ] **Step 2: 实现 + 运行**

```ruby
# 追加到 app/models/tour.rb（public 段）
def tier_two_food_count
  activities.where(kind: :food, citizen_level: :tier_two).count
end

def buffer_days_count
  days.where(buffer_day: true).count
end
```

Run: `mise exec -- bundle exec rspec spec/models/tour_spec.rb`
Expected: 新增 2 examples pass

- [ ] **Step 3: Commit**

```bash
git add app/models/tour.rb spec/models/tour_spec.rb
git commit -m "model: Tour aggregate counts"
```

---

### Task 1.15: ConstitutionCheck 骨架 + Violation struct

**Files:**
- Create: `app/models/tour/constitution_check.rb`
- Create: `spec/models/tour/constitution_check_spec.rb`

- [ ] **Step 1: 写骨架 + spec setup**

```ruby
# app/models/tour/constitution_check.rb
class Tour::ConstitutionCheck
  Violation = Struct.new(:level, :rule, :scope, :message, :suggestion, keyword_init: true)

  def self.for(tour)
    new(tour).violations
  end

  def initialize(tour)
    @tour  = tour
    @rules = tour.constitution.deep_symbolize_keys
  end

  def violations
    [].flatten.compact.reject { |v| overridden?(v) }
  end

  private
    def overridden?(violation)
      @tour.constraint_overrides.any? { |o| same_scope?(o, violation) }
    end

    def same_scope?(override, violation)
      override["rule"].to_s == violation.rule.to_s &&
        (override["scope"] || {}).deep_symbolize_keys == (violation.scope || {})
    end
end
```

```ruby
# spec/models/tour/constitution_check_spec.rb
require "rails_helper"

RSpec.describe Tour::ConstitutionCheck do
  it "returns empty array for a fresh tour with no days" do
    tour = create(:tour)
    expect(described_class.for(tour)).to eq([])
  end
end
```

- [ ] **Step 2: 运行 + Commit**

Run: `mise exec -- bundle exec rspec spec/models/tour/constitution_check_spec.rb`
Expected: 1 example, 0 failures

```bash
git add app/models/tour/constitution_check.rb spec/models/tour/constitution_check_spec.rb
git commit -m "model: Tour::ConstitutionCheck scaffold"
```

---

### Task 1.16: ConstitutionCheck#check_daily_driving

**Files:**
- Modify: `app/models/tour/constitution_check.rb`
- Modify: `spec/models/tour/constitution_check_spec.rb`

- [ ] **Step 1: 追加测试**

```ruby
describe "#check_daily_driving" do
  let(:tour) { create(:tour) }

  it "flags hard violation when a day exceeds max_daily_driving_minutes" do
    day = create(:day, tour: tour, day_index: 3)
    create(:activity, tour: tour, day: day, kind: :road, details: { "drive_min" => 480 })

    violations = described_class.for(tour)
    v = violations.find { |x| x.rule == :max_daily_driving_minutes }
    expect(v).not_to be_nil
    expect(v.level).to eq(:hard)
    expect(v.scope).to eq(day_index: 3)
    expect(v.message).to include("480")
  end

  it "no violation when within limit" do
    day = create(:day, tour: tour, day_index: 1)
    create(:activity, tour: tour, day: day, kind: :road, details: { "drive_min" => 300 })
    violations = described_class.for(tour)
    expect(violations.map(&:rule)).not_to include(:max_daily_driving_minutes)
  end
end
```

- [ ] **Step 2: 实现**

```ruby
# 替换 app/models/tour/constitution_check.rb 的 violations 和 private 段
def violations
  [
    check_daily_driving
  ].flatten.compact.reject { |v| overridden?(v) }
end

private
  def check_daily_driving
    limit = @rules[:max_daily_driving_minutes]
    @tour.days.map do |day|
      total = day.driving_minutes_total
      next if total <= limit
      Violation.new(
        level: :hard,
        rule: :max_daily_driving_minutes,
        scope: { day_index: day.day_index },
        message: "D#{day.day_index} 驾驶 #{total} min > #{limit} min 上限",
        suggestion: "考虑把部分行程拆到相邻日"
      )
    end
  end

  # overridden? / same_scope? 保留（见 Task 1.15）
```

- [ ] **Step 3: 运行 + Commit**

Run: `mise exec -- bundle exec rspec spec/models/tour/constitution_check_spec.rb`
Expected: 3 examples, 0 failures

```bash
git add app/models/tour/constitution_check.rb spec/models/tour/constitution_check_spec.rb
git commit -m "model: ConstitutionCheck check_daily_driving"
```

---

### Task 1.17: ConstitutionCheck#check_tier_one_per_day

**Files:**
- Modify: `app/models/tour/constitution_check.rb`
- Modify: `spec/models/tour/constitution_check_spec.rb`

- [ ] **Step 1: 追加测试**

```ruby
describe "#check_tier_one_per_day" do
  let(:tour) { create(:tour) }

  it "flags soft violation when tier_one count reaches limit (default 3)" do
    day = create(:day, tour: tour, day_index: 2)
    3.times { create(:activity, tour: tour, day: day, citizen_level: :tier_one) }
    violations = described_class.for(tour)
    v = violations.find { |x| x.rule == :max_tier_one_per_day }
    expect(v).not_to be_nil
    expect(v.level).to eq(:soft)
  end
end
```

- [ ] **Step 2: 实现**

```ruby
# 在 violations 数组里加 check_tier_one_per_day
def violations
  [
    check_daily_driving,
    check_tier_one_per_day
  ].flatten.compact.reject { |v| overridden?(v) }
end

# private 段追加
def check_tier_one_per_day
  limit = @rules[:max_tier_one_per_day]
  @tour.days.map do |day|
    count = day.tier_one_count
    next if count < limit
    level = count > limit ? :hard : :soft
    Violation.new(
      level: level,
      rule: :max_tier_one_per_day,
      scope: { day_index: day.day_index },
      message: "D#{day.day_index} 一等公民 #{count} 个（#{level == :hard ? "超过" : "达"}每日 #{limit} 上限）",
      suggestion: "拆到其他日或降级为二等/三等"
    )
  end
end
```

- [ ] **Step 3: 运行 + Commit**

Run: `mise exec -- bundle exec rspec spec/models/tour/constitution_check_spec.rb`
Expected: 4 examples, 0 failures

```bash
git add app/models/tour/constitution_check.rb spec/models/tour/constitution_check_spec.rb
git commit -m "model: ConstitutionCheck check_tier_one_per_day"
```

---

### Task 1.18: ConstitutionCheck#check_buffer_days

**Files:**
- Modify: `app/models/tour/constitution_check.rb`
- Modify: `spec/models/tour/constitution_check_spec.rb`

- [ ] **Step 1: 测试**

```ruby
describe "#check_buffer_days" do
  let(:tour) { create(:tour) }

  it "flags soft violation when buffer_days < min_buffer_days (default 1)" do
    create(:day, tour: tour, day_index: 1, buffer_day: false)
    create(:day, tour: tour, day_index: 2, buffer_day: false)
    violations = described_class.for(tour)
    v = violations.find { |x| x.rule == :min_buffer_days }
    expect(v).not_to be_nil
    expect(v.level).to eq(:soft)
    expect(v.scope).to eq({})
  end

  it "no violation when at or above min_buffer_days" do
    create(:day, tour: tour, day_index: 1, buffer_day: true)
    violations = described_class.for(tour)
    expect(violations.map(&:rule)).not_to include(:min_buffer_days)
  end
end
```

- [ ] **Step 2: 实现**

```ruby
# violations 数组加入 check_buffer_days
def check_buffer_days
  limit = @rules[:min_buffer_days]
  actual = @tour.buffer_days_count
  return nil if actual >= limit
  Violation.new(
    level: :soft,
    rule: :min_buffer_days,
    scope: {},
    message: "整程 #{actual} 个机动日（建议 ≥ #{limit}）",
    suggestion: "新增一个 buffer_day=true 的 Day"
  )
end
```

- [ ] **Step 3: 运行 + Commit**

Run: `mise exec -- bundle exec rspec spec/models/tour/constitution_check_spec.rb`
Expected: 6 examples, 0 failures

```bash
git add app/models/tour/constitution_check.rb spec/models/tour/constitution_check_spec.rb
git commit -m "model: ConstitutionCheck check_buffer_days"
```

---

### Task 1.19: ConstitutionCheck 剩余 3 个检查

**Files:**
- Modify: `app/models/tour/constitution_check.rb`
- Modify: `spec/models/tour/constitution_check_spec.rb`

- [ ] **Step 1: 追加 3 组测试（check_tier_two_food / check_yurt_nights / check_fuel_emergency）**

```ruby
describe "#check_tier_two_food" do
  let(:tour) { create(:tour) }

  it "flags soft violation when tier_two food count > limit (default 3)" do
    4.times { create(:activity, tour: tour, kind: :food, citizen_level: :tier_two) }
    v = described_class.for(tour).find { |x| x.rule == :max_tier_two_food_per_tour }
    expect(v).not_to be_nil
    expect(v.level).to eq(:soft)
  end
end

describe "#check_yurt_nights" do
  let(:tour) { create(:tour) }

  it "flags soft violation when yurt stays > max_yurt_nights (default 1)" do
    2.times do
      create(:activity, tour: tour, kind: :stay,
             details: { "sanitation" => "yurt" })
    end
    v = described_class.for(tour).find { |x| x.rule == :max_yurt_nights }
    expect(v).not_to be_nil
  end
end
```

- [ ] **Step 2: 实现**

```ruby
# 追加到 violations 数组：check_tier_two_food, check_yurt_nights
def check_tier_two_food
  limit = @rules[:max_tier_two_food_per_tour]
  count = @tour.tier_two_food_count
  return nil if count <= limit
  Violation.new(
    level: :soft,
    rule: :max_tier_two_food_per_tour,
    scope: {},
    message: "整程二等餐厅 #{count} 家（上限 #{limit}）",
    suggestion: "降级部分餐厅到三等"
  )
end

def check_yurt_nights
  limit = @rules[:max_yurt_nights]
  count = @tour.activities.where(kind: :stay).where("details->>'sanitation' = ?", "yurt").count
  return nil if count <= limit
  Violation.new(
    level: :soft,
    rule: :max_yurt_nights,
    scope: {},
    message: "整程毡房 #{count} 晚（上限 #{limit}）",
    suggestion: "改订普通住宿"
  )
end
```

- [ ] **Step 3: 运行 + Commit**

Run: `mise exec -- bundle exec rspec spec/models/tour/constitution_check_spec.rb`
Expected: 8 examples, 0 failures

```bash
git add app/models/tour/constitution_check.rb spec/models/tour/constitution_check_spec.rb
git commit -m "model: ConstitutionCheck tier_two_food + yurt_nights"
```

> Note: `check_fuel_emergency` 依赖 "油量紧急升级次数" 的追踪机制，超出本 spec 范围（无对应字段），留白等后续。

---

### Task 1.20: ConstitutionCheck 的 constraint_overrides 过滤

**Files:**
- Modify: `spec/models/tour/constitution_check_spec.rb`
- `overridden?` / `same_scope?` 已在 1.15 就位；此 task 仅加测试锁定行为

- [ ] **Step 1: 测试**

```ruby
describe "constraint_overrides filtering" do
  let(:tour) { create(:tour) }

  it "suppresses violation matching an override with same rule + scope" do
    day = create(:day, tour: tour, day_index: 3)
    create(:activity, tour: tour, day: day, kind: :road, details: { "drive_min" => 480 })
    tour.update!(constraint_overrides: [{
      "rule" => "max_daily_driving_minutes",
      "scope" => { "day_index" => 3 },
      "reason" => "独库必走",
      "acknowledged_at" => Time.current.iso8601
    }])

    violations = described_class.for(tour)
    expect(violations.map(&:rule)).not_to include(:max_daily_driving_minutes)
  end

  it "does not suppress when scope differs" do
    day = create(:day, tour: tour, day_index: 3)
    create(:activity, tour: tour, day: day, kind: :road, details: { "drive_min" => 480 })
    tour.update!(constraint_overrides: [{
      "rule" => "max_daily_driving_minutes",
      "scope" => { "day_index" => 5 },  # 不匹配
      "reason" => "xxx"
    }])
    expect(described_class.for(tour).map(&:rule)).to include(:max_daily_driving_minutes)
  end
end
```

- [ ] **Step 2: 运行 + Commit**

Run: `mise exec -- bundle exec rspec spec/models/tour/constitution_check_spec.rb`
Expected: 10 examples, 0 failures

```bash
git add spec/models/tour/constitution_check_spec.rb
git commit -m "spec: ConstitutionCheck overrides filtering"
```

---

### Task 1.21: PoiSearch — AMAP place/text 客户端

**Files:**
- Create: `app/models/poi_search.rb`
- Create: `spec/models/poi_search_spec.rb`

- [ ] **Step 1: 写测试（WebMock stub）**

```ruby
# spec/models/poi_search_spec.rb
require "rails_helper"

RSpec.describe PoiSearch do
  let(:api_key) { "test-amap-key" }

  before { stub_const("ENV", ENV.to_hash.merge("AMAP_API_KEY" => api_key)) }

  describe "#search" do
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
              { name: "赛里木湖", location: "81.20,44.55", address: "博州", type: "风景名胜" }
            ]
          }.to_json,
          headers: { "Content-Type" => "application/json" }
        )

      results = described_class.new.search("赛里木湖")
      expect(results).to be_an(Array)
      expect(results.first[:name]).to eq("赛里木湖")
      expect(results.first[:lat]).to eq(44.55)
      expect(results.first[:lng]).to eq(81.20)
      expect(results.first[:address]).to eq("博州")
    end

    it "supports region_hint to narrow search" do
      stub_request(:get, "https://restapi.amap.com/v5/place/text")
        .with(query: hash_including("region" => "伊犁"))
        .to_return(
          status: 200,
          body: { status: "1", pois: [] }.to_json,
          headers: { "Content-Type" => "application/json" }
        )
      described_class.new.search("某地", region_hint: "伊犁")
    end

    it "raises PoiSearch::Error on AMAP error status" do
      stub_request(:get, "https://restapi.amap.com/v5/place/text")
        .to_return(status: 200, body: { status: "0", info: "INVALID_PARAMS" }.to_json)
      expect {
        described_class.new.search("bad")
      }.to raise_error(PoiSearch::Error, /INVALID_PARAMS/)
    end
  end
end
```

- [ ] **Step 2: 实现**

```ruby
# app/models/poi_search.rb
class PoiSearch
  Error = Class.new(StandardError)

  AMAP_ENDPOINT = "https://restapi.amap.com/v5/place/text"

  def search(keywords, region_hint: nil, near_lat: nil, near_lng: nil)
    params = {
      "key"      => ENV.fetch("AMAP_API_KEY"),
      "keywords" => keywords,
      "output"   => "JSON"
    }
    params["region"]   = region_hint if region_hint
    params["location"] = "#{near_lng},#{near_lat}" if near_lng && near_lat

    response = connection.get(AMAP_ENDPOINT, params)
    data = JSON.parse(response.body)

    if data["status"] != "1"
      raise Error, "AMAP error: #{data['info']}"
    end

    Array(data["pois"]).map do |poi|
      lng, lat = poi["location"].to_s.split(",").map(&:to_f)
      {
        name:    poi["name"],
        lat:     lat,
        lng:     lng,
        address: poi["address"],
        type:    poi["type"]
      }
    end
  end

  private
    def connection
      @connection ||= Faraday.new do |f|
        f.request :url_encoded
        f.response :raise_error
      end
    end
end
```

- [ ] **Step 3: 运行 + Commit**

Run: `mise exec -- bundle exec rspec spec/models/poi_search_spec.rb`
Expected: 3 examples, 0 failures

```bash
git add app/models/poi_search.rb spec/models/poi_search_spec.rb
git commit -m "model: PoiSearch AMAP client"
```

---

### Task 1.22: Conversation / Message model 改造

**Files:**
- Modify: `app/models/conversation.rb`
- Modify: `app/models/message.rb`
- Modify: `spec/factories/conversations.rb` / `messages.rb`

- [ ] **Step 1: 改 Conversation 模型**

```ruby
# app/models/conversation.rb
class Conversation < ApplicationRecord
  belongs_to :tour
  belongs_to :user
  has_many :messages, dependent: :destroy

  validates :tour_id, uniqueness: { scope: :user_id }
end
```

- [ ] **Step 2: 改 Message — 新增 tool 角色**

```ruby
# app/models/message.rb
class Message < ApplicationRecord
  belongs_to :conversation

  enum :role, user: 0, assistant: 1, system: 2, tool: 3
end
```

- [ ] **Step 3: 改 factories**

```ruby
# spec/factories/conversations.rb
FactoryBot.define do
  factory :conversation do
    tour
    user
  end
end
```

```ruby
# spec/factories/messages.rb
FactoryBot.define do
  factory :message do
    conversation
    role { :user }
    content { "Hello" }
  end
end
```

- [ ] **Step 4: 运行所有 model specs + Commit**

```bash
mise exec -- bundle exec rspec spec/models
```

Expected: 全绿（Guidebook specs 这时还没删会报错，不碰 Guidebook 路径的话 allow 失败；可临时在 `spec/spec_helper.rb` 或单独 exclude 老 specs，见 Phase 5）

```bash
git add app/models/conversation.rb app/models/message.rb spec/factories/conversations.rb spec/factories/messages.rb
git commit -m "model: Conversation→Tour + Message tool role"
```

---

### Task 1.23: Phase 1 checkpoint

- [ ] **Step 1: 运行所有新 model specs**

```bash
mise exec -- bundle exec rspec spec/models/tour_spec.rb spec/models/tour_membership_spec.rb spec/models/day_spec.rb spec/models/activity_spec.rb spec/models/tour/constitution_check_spec.rb spec/models/poi_search_spec.rb spec/models/concerns/constitution_spec.rb
```

Expected: 全绿 (~30 examples)

- [ ] **Step 2: Rubocop + Brakeman**

```bash
bin/rubocop -f github app/models spec/models config/initializers/inflections.rb
bin/brakeman --no-pager
```

Expected: 无新 offense / 新 warning

- [ ] **Step 3: Commit checkpoint**

```bash
git commit --allow-empty -m "chore: phase 1 checkpoint — data model + constitution"
```

---

## Phase 2 — AI Tools + ChatStreamJob

### Task 2.1: AITools::Base 抽象类

**Files:**
- Create: `app/ai_tools/base.rb`

- [ ] **Step 1: 写 Base（薄封装 RubyLLM::Tool）**

```ruby
# app/ai_tools/base.rb
module AITools
  class Base < RubyLLM::Tool
    # 子类可 override；约定 run(**kwargs) 返回 hash（会被 serialize 回 LLM）
    def self.inherited(subclass)
      super
      # 未来可统一注册
    end

    protected
      def ok(data = {})
        { ok: true }.merge(data)
      end

      def fail(message, code: "generic_error")
        { ok: false, error: { code: code, message: message } }
      end
  end
end
```

- [ ] **Step 2: Commit**

```bash
git add app/ai_tools/base.rb
git commit -m "ai-tools: Base abstract class"
```

---

### Task 2.2: AITools::AddActivity

**Files:**
- Create: `app/ai_tools/add_activity.rb`
- Create: `spec/ai_tools/add_activity_spec.rb`

- [ ] **Step 1: 测试**

```ruby
# spec/ai_tools/add_activity_spec.rb
require "rails_helper"

RSpec.describe AITools::AddActivity do
  let(:tour) { create(:tour) }

  it "creates activity in backlog when day_index is :backlog" do
    result = described_class.new.execute(
      tour_id: tour.id,
      day_index: "backlog",
      kind: "scenic",
      citizen_level: "tier_one",
      name: "赛里木湖",
      lat: 44.55,
      lng: 81.20,
      planned_duration_min: 240,
      details: { "best_light" => "傍晚" }
    )

    expect(result[:ok]).to be true
    activity = Activity.find(result[:activity_id])
    expect(activity.day_id).to be_nil
    expect(activity.name).to eq("赛里木湖")
    expect(activity.citizen_level).to eq("tier_one")
    expect(activity.details["best_light"]).to eq("傍晚")
  end

  it "creates activity in a specific day when day_index is a positive int" do
    day = create(:day, tour: tour, day_index: 2)
    result = described_class.new.execute(
      tour_id: tour.id,
      day_index: 2,
      kind: "food",
      citizen_level: "tier_three",
      name: "早餐店",
      details: {}
    )
    expect(result[:ok]).to be true
    expect(Activity.find(result[:activity_id]).day_id).to eq(day.id)
  end

  it "fails with ok:false when day_index not found" do
    result = described_class.new.execute(
      tour_id: tour.id,
      day_index: 99,
      kind: "scenic",
      citizen_level: "tier_three",
      name: "x"
    )
    expect(result[:ok]).to be false
    expect(result[:error][:code]).to eq("day_not_found")
  end
end
```

- [ ] **Step 2: 运行 → FAIL**

Run: `mise exec -- bundle exec rspec spec/ai_tools/add_activity_spec.rb`
Expected: uninitialized constant

- [ ] **Step 3: 实现**

```ruby
# app/ai_tools/add_activity.rb
module AITools
  class AddActivity < Base
    description "向 Tour 添加一条行（activity）。day_index 为 'backlog' 则放入 backlog，否则放入对应 Day。"

    param :tour_id,              type: :integer, desc: "Tour ID"
    param :day_index,            desc: "目标日的 day_index 整数，或 'backlog'"
    param :kind,                 desc: "scenic / road / food / stay / fuel / other"
    param :citizen_level,        desc: "tier_one / tier_two / tier_three / infrastructure"
    param :name,                 type: :string, desc: "活动名称"
    param :lat,                  type: :number, desc: "纬度", required: false
    param :lng,                  type: :number, desc: "经度", required: false
    param :planned_start_at,     type: :string, desc: "HH:MM", required: false
    param :planned_duration_min, type: :integer, required: false
    param :details,              type: :object, desc: "kind 对应的子类字段 hash", required: false

    def execute(tour_id:, day_index:, kind:, citizen_level:, name:, lat: nil, lng: nil,
                planned_start_at: nil, planned_duration_min: nil, details: {})
      tour = Tour.find_by(id: tour_id)
      return fail("Tour not found", code: "tour_not_found") unless tour

      day =
        if day_index.to_s == "backlog"
          nil
        else
          tour.days.find_by(day_index: day_index.to_i)
        end
      return fail("Day not found", code: "day_not_found") if day_index.to_s != "backlog" && day.nil?

      position = (day ? tour.activities.where(day_id: day.id).maximum(:position) : tour.activities.where(day_id: nil).maximum(:position)).to_i + 1

      activity = tour.activities.create!(
        day: day,
        position: position,
        kind: kind,
        citizen_level: citizen_level,
        name: name,
        lat: lat,
        lng: lng,
        planned_start_at: planned_start_at,
        planned_duration_min: planned_duration_min,
        details: details || {}
      )

      ok(activity_id: activity.id, position: activity.position)
    end
  end
end
```

- [ ] **Step 4: 运行 + Commit**

Run: `mise exec -- bundle exec rspec spec/ai_tools/add_activity_spec.rb`
Expected: 3 examples, 0 failures

```bash
git add app/ai_tools/add_activity.rb spec/ai_tools/add_activity_spec.rb
git commit -m "ai-tools: AddActivity"
```

---

### Task 2.3: AITools::MoveActivity

**Files:**
- Create: `app/ai_tools/move_activity.rb`
- Create: `spec/ai_tools/move_activity_spec.rb`

**Test skeleton:**

```ruby
# spec/ai_tools/move_activity_spec.rb
require "rails_helper"

RSpec.describe AITools::MoveActivity do
  let(:tour)  { create(:tour) }
  let(:day1)  { create(:day, tour: tour, day_index: 1) }
  let(:day2)  { create(:day, tour: tour, day_index: 2) }
  let(:activity) { create(:activity, tour: tour, day: day1, position: 1) }

  it "moves activity to another day at specified position" do
    result = described_class.new.execute(activity_id: activity.id, to_day_index: 2, to_position: 1)
    expect(result[:ok]).to be true
    expect(activity.reload.day_id).to eq(day2.id)
    expect(activity.position).to eq(1)
  end

  it "moves activity to backlog" do
    result = described_class.new.execute(activity_id: activity.id, to_day_index: "backlog", to_position: 1)
    expect(result[:ok]).to be true
    expect(activity.reload.day_id).to be_nil
  end

  it "fails when activity missing" do
    result = described_class.new.execute(activity_id: 999, to_day_index: 1, to_position: 1)
    expect(result[:ok]).to be false
    expect(result[:error][:code]).to eq("activity_not_found")
  end
end
```

- [ ] **Step 1: 写测试（上方）**
- [ ] **Step 2: 实现：**

```ruby
# app/ai_tools/move_activity.rb
module AITools
  class MoveActivity < Base
    description "把一条 activity 移到指定日和位置；to_day_index 为 'backlog' 则移入 backlog"

    param :activity_id,  type: :integer
    param :to_day_index, desc: "目标 day_index 或 'backlog'"
    param :to_position,  type: :integer

    def execute(activity_id:, to_day_index:, to_position:)
      activity = Activity.find_by(id: activity_id)
      return fail("Activity not found", code: "activity_not_found") unless activity

      target_day = to_day_index.to_s == "backlog" ? nil : activity.tour.days.find_by(day_index: to_day_index.to_i)
      return fail("Day not found", code: "day_not_found") if to_day_index.to_s != "backlog" && target_day.nil?

      Activity.transaction do
        activity.update!(day: target_day, position: to_position)
        # 简化：不重排其他条目的 position（由前端管理）。生产真实实现要细化 —— 见 plan 末尾 Open Issues。
      end
      ok(activity_id: activity.id, day_id: activity.day_id, position: activity.position)
    end
  end
end
```

- [ ] **Step 3: 运行 + Commit**

```bash
mise exec -- bundle exec rspec spec/ai_tools/move_activity_spec.rb
git add app/ai_tools/move_activity.rb spec/ai_tools/move_activity_spec.rb
git commit -m "ai-tools: MoveActivity"
```

---

### Task 2.4-2.12: 剩余 9 个 AI 工具

> 每个工具 = 相同的 TDD 模式 + 一个 `<name>_spec.rb` + 一个 `app/ai_tools/<name>.rb`。下方给出每个工具的**完整实现代码**。每个 task 的步骤统一：(a) 写 spec、(b) 运行 FAIL、(c) 实现、(d) 运行 PASS、(e) commit。

#### Task 2.4: UpdateActivity

```ruby
# app/ai_tools/update_activity.rb
module AITools
  class UpdateActivity < Base
    description "更新某条 activity 的字段（部分更新）"
    param :activity_id, type: :integer
    param :patch,       type: :object, desc: "要更新的字段 hash（name/desc/tips/lat/lng/planned_start_at/planned_duration_min/details…）"

    UPDATABLE = %w[name desc tips lat lng address planned_start_at planned_duration_min kind citizen_level details].freeze

    def execute(activity_id:, patch:)
      activity = Activity.find_by(id: activity_id)
      return fail("Activity not found", code: "activity_not_found") unless activity

      safe = (patch || {}).stringify_keys.slice(*UPDATABLE)
      activity.update!(safe)
      ok(activity_id: activity.id, updated_fields: safe.keys)
    end
  end
end
```

**Spec 核心：**

```ruby
it "updates name and details" do
  activity = create(:activity)
  result = described_class.new.execute(
    activity_id: activity.id,
    patch: { "name" => "新名字", "details" => { "best_light" => "清晨" } }
  )
  expect(result[:ok]).to be true
  expect(activity.reload.name).to eq("新名字")
end

it "ignores unknown fields" do
  activity = create(:activity)
  result = described_class.new.execute(activity_id: activity.id, patch: { "unknown_field" => "x" })
  expect(result[:ok]).to be true
  expect(result[:updated_fields]).not_to include("unknown_field")
end
```

- [ ] Write spec → FAIL → impl → PASS → commit `ai-tools: UpdateActivity`

#### Task 2.5: DeleteActivity

```ruby
# app/ai_tools/delete_activity.rb
module AITools
  class DeleteActivity < Base
    description "删除一条 activity"
    param :activity_id, type: :integer

    def execute(activity_id:)
      activity = Activity.find_by(id: activity_id)
      return fail("Activity not found", code: "activity_not_found") unless activity
      activity.destroy!
      ok(deleted_activity_id: activity_id)
    end
  end
end
```

**Spec 核心:**

```ruby
it "deletes the activity" do
  activity = create(:activity)
  result = described_class.new.execute(activity_id: activity.id)
  expect(result[:ok]).to be true
  expect(Activity.exists?(activity.id)).to be false
end
```

- [ ] Write spec → impl → commit `ai-tools: DeleteActivity`

#### Task 2.6: ReorderDay

```ruby
# app/ai_tools/reorder_day.rb
module AITools
  class ReorderDay < Base
    description "按给定 activity_ids 顺序重排一个 Day"
    param :day_id,        type: :integer
    param :activity_ids,  type: :array, desc: "activity id 列表（决定新 position 顺序）"

    def execute(day_id:, activity_ids:)
      day = Day.find_by(id: day_id)
      return fail("Day not found", code: "day_not_found") unless day

      Activity.transaction do
        activity_ids.each_with_index do |aid, idx|
          activity = day.activities.find_by(id: aid)
          next unless activity
          activity.update!(position: idx + 1)
        end
      end
      ok(day_id: day_id, count: activity_ids.size)
    end
  end
end
```

**Spec 核心:**

```ruby
it "assigns position by given order" do
  tour = create(:tour)
  day = create(:day, tour: tour)
  a = create(:activity, tour: tour, day: day, position: 1)
  b = create(:activity, tour: tour, day: day, position: 2)
  c = create(:activity, tour: tour, day: day, position: 3)
  described_class.new.execute(day_id: day.id, activity_ids: [c.id, a.id, b.id])
  expect(c.reload.position).to eq(1)
  expect(a.reload.position).to eq(2)
  expect(b.reload.position).to eq(3)
end
```

- [ ] Write spec → impl → commit `ai-tools: ReorderDay`

#### Task 2.7: CreateDay

```ruby
# app/ai_tools/create_day.rb
module AITools
  class CreateDay < Base
    description "向 Tour 新增一天"
    param :tour_id,     type: :integer
    param :day_index,   type: :integer
    param :title,       type: :string, required: false
    param :date,        type: :string, required: false
    param :buffer_day,  type: :boolean, required: false

    def execute(tour_id:, day_index:, title: nil, date: nil, buffer_day: false)
      tour = Tour.find_by(id: tour_id)
      return fail("Tour not found", code: "tour_not_found") unless tour
      day = tour.days.create!(
        day_index: day_index, title: title, date: date, buffer_day: buffer_day
      )
      ok(day_id: day.id)
    rescue ActiveRecord::RecordInvalid => e
      fail(e.message, code: "validation")
    end
  end
end
```

**Spec 核心:**

```ruby
it "creates a day" do
  tour = create(:tour)
  result = described_class.new.execute(tour_id: tour.id, day_index: 1, title: "抵达")
  expect(result[:ok]).to be true
  expect(Day.find(result[:day_id]).title).to eq("抵达")
end

it "fails on duplicate day_index" do
  tour = create(:tour)
  create(:day, tour: tour, day_index: 1)
  result = described_class.new.execute(tour_id: tour.id, day_index: 1)
  expect(result[:ok]).to be false
end
```

- [ ] Write spec → impl → commit `ai-tools: CreateDay`

#### Task 2.8: UpdateDay

```ruby
# app/ai_tools/update_day.rb
module AITools
  class UpdateDay < Base
    description "更新 Day 元数据"
    param :day_id, type: :integer
    param :patch,  type: :object

    UPDATABLE = %w[title theme intensity buffer_day date].freeze

    def execute(day_id:, patch:)
      day = Day.find_by(id: day_id)
      return fail("Day not found", code: "day_not_found") unless day
      safe = (patch || {}).stringify_keys.slice(*UPDATABLE)
      day.update!(safe)
      ok(day_id: day_id, updated_fields: safe.keys)
    end
  end
end
```

**Spec 核心:**

```ruby
it "updates title and buffer_day" do
  day = create(:day)
  described_class.new.execute(day_id: day.id, patch: { "title" => "新标题", "buffer_day" => true })
  expect(day.reload.title).to eq("新标题")
  expect(day.buffer_day).to be true
end
```

- [ ] Write spec → impl → commit `ai-tools: UpdateDay`

#### Task 2.9: DeleteDay

```ruby
# app/ai_tools/delete_day.rb
module AITools
  class DeleteDay < Base
    description "删除一天。该日下的 activity 自动移到 backlog。"
    param :day_id, type: :integer

    def execute(day_id:)
      day = Day.find_by(id: day_id)
      return fail("Day not found", code: "day_not_found") unless day
      # 自动 nullify 依赖 Day has_many :activities, dependent: :nullify
      day.destroy!
      ok(deleted_day_id: day_id)
    end
  end
end
```

**Spec 核心:**

```ruby
it "destroys day and moves its activities to backlog" do
  tour = create(:tour)
  day = create(:day, tour: tour)
  activity = create(:activity, tour: tour, day: day)
  described_class.new.execute(day_id: day.id)
  expect(Day.exists?(day.id)).to be false
  expect(activity.reload.day_id).to be_nil
end
```

- [ ] Write spec → impl → commit `ai-tools: DeleteDay`

#### Task 2.10: RunConstitutionCheck

```ruby
# app/ai_tools/run_constitution_check.rb
module AITools
  class RunConstitutionCheck < Base
    description "对某 Tour 跑一次宪法校验，返回违反列表"
    param :tour_id, type: :integer

    def execute(tour_id:)
      tour = Tour.find_by(id: tour_id)
      return fail("Tour not found", code: "tour_not_found") unless tour
      violations = Tour::ConstitutionCheck.for(tour).map do |v|
        { level: v.level, rule: v.rule, scope: v.scope, message: v.message, suggestion: v.suggestion }
      end
      ok(violations: violations)
    end
  end
end
```

**Spec 核心:**

```ruby
it "returns violations hash" do
  tour = create(:tour)
  day = create(:day, tour: tour, day_index: 1)
  create(:activity, tour: tour, day: day, kind: :road, details: { "drive_min" => 500 })
  result = described_class.new.execute(tour_id: tour.id)
  expect(result[:violations]).to be_an(Array)
  expect(result[:violations].first[:rule]).to eq(:max_daily_driving_minutes)
end
```

- [ ] Write spec → impl → commit `ai-tools: RunConstitutionCheck`

#### Task 2.11: AcknowledgeViolation

```ruby
# app/ai_tools/acknowledge_violation.rb
module AITools
  class AcknowledgeViolation < Base
    description "承认一条宪法违反，写入 constraint_overrides"
    param :tour_id, type: :integer
    param :rule,    type: :string
    param :scope,   type: :object, required: false
    param :reason,  type: :string

    def execute(tour_id:, rule:, scope: {}, reason:)
      tour = Tour.find_by(id: tour_id)
      return fail("Tour not found", code: "tour_not_found") unless tour

      overrides = Array(tour.constraint_overrides) + [{
        "rule"              => rule.to_s,
        "scope"             => (scope || {}).stringify_keys,
        "reason"            => reason,
        "acknowledged_at"   => Time.current.iso8601
      }]
      tour.update!(constraint_overrides: overrides)
      ok(overrides_count: overrides.size)
    end
  end
end
```

**Spec 核心:**

```ruby
it "appends an override entry" do
  tour = create(:tour)
  described_class.new.execute(
    tour_id: tour.id,
    rule: "max_daily_driving_minutes",
    scope: { "day_index" => 3 },
    reason: "独库必走"
  )
  expect(tour.reload.constraint_overrides.size).to eq(1)
  expect(tour.constraint_overrides.first["rule"]).to eq("max_daily_driving_minutes")
end
```

- [ ] Write spec → impl → commit `ai-tools: AcknowledgeViolation`

#### Task 2.12: UpdateConstitution

```ruby
# app/ai_tools/update_constitution.rb
module AITools
  class UpdateConstitution < Base
    description "修订本程宪法"
    param :tour_id, type: :integer
    param :patch,   type: :object

    def execute(tour_id:, patch:)
      tour = Tour.find_by(id: tour_id)
      return fail("Tour not found", code: "tour_not_found") unless tour

      allowed = Constitution::DEFAULTS.keys.map(&:to_s)
      safe = (patch || {}).stringify_keys.slice(*allowed)

      tour.update!(constitution: tour.constitution.merge(safe))
      ok(tour_id: tour.id, updated_fields: safe.keys)
    end
  end
end
```

**Spec 核心:**

```ruby
it "merges allowed keys into tour.constitution" do
  tour = create(:tour)
  described_class.new.execute(tour_id: tour.id, patch: { "max_mountain_road_minutes" => 300 })
  expect(tour.reload.constitution["max_mountain_road_minutes"]).to eq(300)
end

it "ignores unknown keys" do
  tour = create(:tour)
  described_class.new.execute(tour_id: tour.id, patch: { "bogus_key" => 999 })
  expect(tour.reload.constitution).not_to have_key("bogus_key")
end
```

- [ ] Write spec → impl → commit `ai-tools: UpdateConstitution`

---

### Task 2.13: AITools::SearchPoi

**Files:**
- Create: `app/ai_tools/search_poi.rb`
- Create: `spec/ai_tools/search_poi_spec.rb`

- [ ] **Step 1: 测试（stub PoiSearch）**

```ruby
# spec/ai_tools/search_poi_spec.rb
require "rails_helper"

RSpec.describe AITools::SearchPoi do
  it "delegates to PoiSearch and returns candidates" do
    fake_poi = [{ name: "赛里木湖", lat: 44.55, lng: 81.20, address: "博州" }]
    allow_any_instance_of(PoiSearch).to receive(:search).with("赛里木湖", region_hint: "伊犁", near_lat: nil, near_lng: nil).and_return(fake_poi)

    result = described_class.new.execute(query: "赛里木湖", region_hint: "伊犁")
    expect(result[:ok]).to be true
    expect(result[:candidates]).to eq(fake_poi)
  end

  it "returns empty list when PoiSearch raises" do
    allow_any_instance_of(PoiSearch).to receive(:search).and_raise(PoiSearch::Error, "INVALID_PARAMS")
    result = described_class.new.execute(query: "x")
    expect(result[:ok]).to be false
    expect(result[:error][:code]).to eq("poi_search_failed")
  end
end
```

- [ ] **Step 2: 实现**

```ruby
# app/ai_tools/search_poi.rb
module AITools
  class SearchPoi < Base
    description "AMAP 模糊搜索 POI 候选（不创建 Activity，只返候选集）"
    param :query,       type: :string
    param :region_hint, type: :string, required: false
    param :near_lat,    type: :number, required: false
    param :near_lng,    type: :number, required: false

    def execute(query:, region_hint: nil, near_lat: nil, near_lng: nil)
      candidates = PoiSearch.new.search(query, region_hint: region_hint, near_lat: near_lat, near_lng: near_lng)
      ok(candidates: candidates)
    rescue PoiSearch::Error => e
      fail(e.message, code: "poi_search_failed")
    end
  end
end
```

- [ ] **Step 3: 运行 + Commit**

```bash
mise exec -- bundle exec rspec spec/ai_tools/search_poi_spec.rb
git add app/ai_tools/search_poi.rb spec/ai_tools/search_poi_spec.rb
git commit -m "ai-tools: SearchPoi"
```

---

### Task 2.14: AITools::Schema.to_prompt_description

**Files:**
- Create: `app/ai_tools/schema.rb`
- Create: `spec/ai_tools/schema_spec.rb`

- [ ] **Step 1: 测试**

```ruby
# spec/ai_tools/schema_spec.rb
require "rails_helper"

RSpec.describe AITools::Schema do
  it "returns a string listing all tools with their descriptions" do
    text = described_class.to_prompt_description
    expect(text).to include("AddActivity")
    expect(text).to include("MoveActivity")
    expect(text).to include("SearchPoi")
    expect(text).to include("RunConstitutionCheck")
  end
end
```

- [ ] **Step 2: 实现**

```ruby
# app/ai_tools/schema.rb
module AITools
  module Schema
    TOOLS = %w[
      AddActivity MoveActivity UpdateActivity DeleteActivity
      ReorderDay CreateDay UpdateDay DeleteDay
      RunConstitutionCheck AcknowledgeViolation UpdateConstitution
      SearchPoi
    ].freeze

    module_function

    def all
      TOOLS.map { |name| AITools.const_get(name) }
    end

    def to_prompt_description
      lines = ["# 可用工具"]
      all.each do |klass|
        lines << ""
        lines << "## #{klass.name.demodulize}"
        lines << klass.description.to_s
        lines << "参数：" + klass.parameters.map { |p| p[:name] }.join(", ") if klass.respond_to?(:parameters)
      end
      lines.join("\n")
    end
  end
end
```

- [ ] **Step 3: 运行 + Commit**

```bash
mise exec -- bundle exec rspec spec/ai_tools/schema_spec.rb
git add app/ai_tools/schema.rb spec/ai_tools/schema_spec.rb
git commit -m "ai-tools: Schema.to_prompt_description"
```

---

### Task 2.15: ChatStreamJob 重写

**Files:**
- Modify: `app/jobs/chat_stream_job.rb`
- Create: `spec/jobs/chat_stream_job_spec.rb`

- [ ] **Step 1: 测试（stub RubyLLM）**

```ruby
# spec/jobs/chat_stream_job_spec.rb
require "rails_helper"

RSpec.describe ChatStreamJob do
  let(:user) { create(:user) }
  let(:tour) { create(:tour, author: user) }
  let(:conversation) { create(:conversation, tour: tour, user: user) }

  before do
    user_message = create(:message, conversation: conversation, role: :user, content: "加个赛里木湖")
    @user_message_id = user_message.id
  end

  it "broadcasts tool_call_start/result and assistant_text events + persists assistant message" do
    fake_chat = instance_double(RubyLLM::Chat)
    allow(RubyLLM).to receive(:chat).and_return(fake_chat)
    allow(fake_chat).to receive(:with_instructions).and_return(fake_chat)
    allow(fake_chat).to receive(:with_tool).and_return(fake_chat)
    allow(fake_chat).to receive(:with_tools).and_return(fake_chat)
    allow(fake_chat).to receive(:messages).and_return([])

    allow(fake_chat).to receive(:ask) do |_msg, &block|
      block.call(double("Event", type: :tool_call_start, name: "add_activity", arguments: {}, id: "tc1"))
      block.call(double("Event", type: :tool_call_result, id: "tc1", result: { ok: true }))
      block.call(double("Event", type: :text, delta: "已加入"))
      "已加入 D2"
    end

    expect {
      described_class.new.perform(conversation.id, tour.id, user.id)
    }.to change { conversation.reload.messages.count }.by(1)

    assistant_msg = conversation.messages.where(role: :assistant).last
    expect(assistant_msg.content).to include("已加入")
  end
end
```

- [ ] **Step 2: 实现**

```ruby
# app/jobs/chat_stream_job.rb
class ChatStreamJob < ApplicationJob
  queue_as :default

  def perform(conversation_id, tour_id, user_id)
    conversation = Conversation.find(conversation_id)
    tour         = Tour.find(tour_id)
    channel      = "chat_tour_#{tour_id}_user_#{user_id}"

    full_text = stream_response(conversation, tour, channel)
    save_assistant_message(conversation, full_text)
    broadcast(channel, type: "complete", content: full_text)
  rescue => e
    broadcast(channel, type: "error", message: e.message)
  end

  private
    def stream_response(conversation, tour, channel)
      chat = RubyLLM.chat(model: ENV.fetch("LLM_MODEL", "moonshotai/Kimi-K2-Instruct-0905"), provider: :openai, assume_model_exists: true)
      chat.with_instructions(system_prompt(tour))

      AITools::Schema.all.each { |tool| chat.with_tool(tool.new) }

      prior = conversation.messages.order(:created_at)[0..-2].to_a
      replay_history(chat, prior)

      latest = conversation.messages.order(:created_at).last.content
      full_text = "".dup

      chat.ask(latest) do |event|
        case event.type
        when :tool_call_start
          broadcast(channel, type: "tool_call_start", name: event.name, arguments: event.arguments, id: event.id)
        when :tool_call_result
          broadcast(channel, type: "tool_call_result", id: event.id, result: event.result)
        when :text
          full_text << event.delta
          broadcast(channel, type: "assistant_text", delta: event.delta)
        end
      end

      full_text
    end

    def replay_history(chat, prior_messages)
      prior_messages.each do |m|
        chat.messages << RubyLLM::Message.new(role: m.role.to_sym, content: m.content)
      end
    end

    def save_assistant_message(conversation, content)
      conversation.messages.create!(role: :assistant, content: content) if content.present?
    end

    def broadcast(channel, **payload)
      ActionCable.server.broadcast(channel, payload)
    end

    def system_prompt(tour)
      <<~PROMPT
        你是一个旅行规划助手。当前 Tour：#{tour.title}。
        你通过调用工具修改 Tour / Day / Activity，不要直接输出 JSON 或 Markdown。

        ## 宪法约束（本程独立）
        #{tour.constitution.map { |k, v| "- #{k}: #{v}" }.join("\n")}

        ## 工具
        #{AITools::Schema.to_prompt_description}

        ## 交互原则
        - 先调用工具修改状态，再用自然语言简要解释
        - 需要时调用 run_constitution_check 验证，违反硬约束要主动提议修正
        - 需要 POI 或坐标时调用 search_poi，不要编造经纬度；从返回的候选里选一条 add_activity
      PROMPT
    end
end
```

> **实现注意：** 上述 `RubyLLM::Chat.ask(&block)` 的 event shape 是按我们期望定的。若实际 gem API 不符，以 gem 为准调整。此步骤实现完成后，在实现阶段可能需要先跑一次手工冒烟（Rails console + 真实 LLM 请求）校验形状。

- [ ] **Step 3: 运行 + Commit**

```bash
mise exec -- bundle exec rspec spec/jobs/chat_stream_job_spec.rb
git add app/jobs/chat_stream_job.rb spec/jobs/chat_stream_job_spec.rb
git commit -m "job: ChatStreamJob tool-calling rewrite"
```

---

### Task 2.16: ChatChannel 重写

**Files:**
- Modify: `app/channels/chat_channel.rb`

- [ ] **Step 1: 重写 Channel**

```ruby
# app/channels/chat_channel.rb
class ChatChannel < ApplicationCable::Channel
  def subscribed
    tour = Tour.find_by(id: params[:tour_id])
    reject unless tour&.visible_to?(current_user)
    stream_from "chat_tour_#{tour.id}_user_#{current_user.id}"
  end
end
```

- [ ] **Step 2: Commit**

```bash
git add app/channels/chat_channel.rb
git commit -m "channel: ChatChannel tour_id + perms"
```

---

### Task 2.17: Message 新增 tool role 迁移文档

> Message.role enum 在 Task 1.22 已加入 `tool: 3`，此处只补测试。

**Files:**
- Modify: `spec/models/message_spec.rb` (创建)

- [ ] **Step 1: 建 spec**

```ruby
require "rails_helper"

RSpec.describe Message do
  it "supports tool role" do
    m = create(:message, role: :tool, content: "{result}")
    expect(m.role).to eq("tool")
  end
end
```

- [ ] **Step 2: 运行 + Commit**

```bash
mise exec -- bundle exec rspec spec/models/message_spec.rb
git add spec/models/message_spec.rb
git commit -m "spec: Message tool role"
```

---

### Task 2.18: Phase 2 checkpoint

- [ ] Run all new ai_tools + jobs specs: `mise exec -- bundle exec rspec spec/ai_tools spec/jobs spec/models/tour`
- [ ] Rubocop: `bin/rubocop -f github app/ai_tools app/jobs app/channels`
- [ ] Commit checkpoint: `git commit --allow-empty -m "chore: phase 2 checkpoint — AI tools + chat job"`

---

## Phase 3 — Controllers + Routes

### Task 3.1: 重写 config/routes.rb

**Files:**
- Modify: `config/routes.rb`

- [ ] **Step 1: 替换路由**

```ruby
# config/routes.rb
Rails.application.routes.draw do
  # 登录/OAuth 保持（不动）
  # 见现有 routes 里保留 session/auth/oauth 部分

  root "tours#index"

  resources :tours do
    resource  :constitution, only: [:show, :update], controller: "tours/constitutions"
    resources :members, controller: :tour_memberships, only: [:create, :update, :destroy]
    resources :days, only: [:create, :update, :destroy] do
      resources :activities, only: [:create]
    end
    resources :backlog_activities, only: [:create], controller: :activities
    resource  :conversation, only: [:show, :destroy] do
      resources :messages, only: [:create]
    end
  end

  resources :activities, only: [:update, :destroy] do
    resource :position, only: [:update], controller: :activity_positions
  end

  # Action Cable
  mount ActionCable.server => "/cable"

  # Test-only login route (保持)
  post "/login_test", to: "sessions#test_login" if Rails.env.test?
end
```

> **实际操作：** 执行时先 cat 原 `config/routes.rb` 保留里面的 session / oauth 路由（从 `#oauth-login-setup-design` spec 存在，必须保留），只改 `resources :guidebooks ...` 那段。

- [ ] **Step 2: 运行 routes**

```bash
mise exec -- bin/rails routes | grep -E "tour|activit|member|conversation"
```

Expected: 看到 tours/constitution/memberships/days/activities/positions/conversations 路由

- [ ] **Step 3: Commit**

```bash
git add config/routes.rb
git commit -m "routes: tours/days/activities/constitution/memberships"
```

---

### Task 3.2: ToursController

**Files:**
- Create: `app/controllers/tours_controller.rb`
- Create: `spec/requests/tours_spec.rb`

- [ ] **Step 1: 测试**

```ruby
# spec/requests/tours_spec.rb
require "rails_helper"

RSpec.describe "Tours", type: :request do
  def login_as(user) = post("/login_test", params: { user_id: user.id })

  let(:user) { create(:user) }

  describe "GET /tours" do
    it "lists tours where user is author or member" do
      mine = create(:tour, author: user, title: "Mine")
      other = create(:tour, title: "Other")
      member_tour = create(:tour, title: "Member")
      create(:tour_membership, tour: member_tour, user: user, role: :reader)

      login_as(user)
      get "/tours"
      expect(response).to have_http_status(:ok)
      body = response.body
      expect(body).to include("Mine")
      expect(body).to include("Member")
      expect(body).not_to include("Other")
    end
  end

  describe "POST /tours" do
    it "creates a tour and redirects to its constitution page" do
      login_as(user)
      expect {
        post "/tours", params: { tour: { title: "新伊犁" } }
      }.to change(Tour, :count).by(1)
      tour = Tour.last
      expect(response).to redirect_to(tour_constitution_path(tour))
    end
  end

  describe "GET /tours/:id" do
    it "allows author to view" do
      tour = create(:tour, author: user)
      login_as(user)
      get "/tours/#{tour.id}"
      expect(response).to have_http_status(:ok)
    end

    it "denies non-member" do
      tour = create(:tour)
      login_as(user)
      get "/tours/#{tour.id}"
      expect(response).to have_http_status(:not_found)
    end
  end
end
```

- [ ] **Step 2: 实现**

```ruby
# app/controllers/tours_controller.rb
class ToursController < ApplicationController
  before_action :require_login
  before_action :set_tour, only: [:show, :update, :destroy]

  def index
    @tours = Tour
      .left_joins(:tour_memberships)
      .where("tours.author_id = :uid OR tour_memberships.user_id = :uid", uid: current_user.id)
      .distinct
    render inertia: "Tour/Index", props: { tours: @tours.as_json }
  end

  def show
    head :not_found and return unless @tour.visible_to?(current_user)
    render inertia: "Tour/Show", props: {
      tour: @tour.as_json,
      days: @tour.days.as_json,
      activities: @tour.activities.as_json,
      violations: Tour::ConstitutionCheck.for(@tour).map(&:to_h)
    }
  end

  def create
    @tour = Tour.create!(author: current_user, **tour_params)
    redirect_to tour_constitution_path(@tour)
  end

  def update
    head :forbidden and return unless @tour.editable_by?(current_user)
    @tour.update!(tour_params)
    redirect_to @tour
  end

  def destroy
    head :forbidden and return unless @tour.owned_by?(current_user)
    @tour.destroy!
    redirect_to tours_path
  end

  private
    def set_tour = @tour = Tour.find_by(id: params[:id])
    def tour_params = params.require(:tour).permit(:title, :date_range, :vehicle, :team_size, :trip_style, :budget_per_person, :archived)
end
```

- [ ] **Step 3: 运行 + Commit**

Run: `mise exec -- bundle exec rspec spec/requests/tours_spec.rb`
Expected: 4 examples, 0 failures

```bash
git add app/controllers/tours_controller.rb spec/requests/tours_spec.rb
git commit -m "controller: ToursController"
```

---

### Task 3.3: Tours::ConstitutionsController

**Files:**
- Create: `app/controllers/tours/constitutions_controller.rb`
- Create: `spec/requests/tours/constitutions_spec.rb`

- [ ] **Step 1: 测试**

```ruby
# spec/requests/tours/constitutions_spec.rb
require "rails_helper"

RSpec.describe "Tours::Constitutions", type: :request do
  def login_as(user) = post("/login_test", params: { user_id: user.id })
  let(:user) { create(:user) }

  it "GET /tours/:id/constitution renders inertia page" do
    tour = create(:tour, author: user)
    login_as(user)
    get tour_constitution_path(tour)
    expect(response).to have_http_status(:ok)
  end

  it "PATCH updates constitution jsonb" do
    tour = create(:tour, author: user)
    login_as(user)
    patch tour_constitution_path(tour), params: { constitution: { max_mountain_road_minutes: 300 } }
    expect(response).to redirect_to(tour)
    expect(tour.reload.constitution["max_mountain_road_minutes"]).to eq(300)
  end

  it "PATCH denies non-author" do
    tour = create(:tour)
    login_as(user)
    patch tour_constitution_path(tour), params: { constitution: { max_tier_one_per_day: 4 } }
    expect(response).to have_http_status(:forbidden)
  end
end
```

- [ ] **Step 2: 实现**

```ruby
# app/controllers/tours/constitutions_controller.rb
class Tours::ConstitutionsController < ApplicationController
  before_action :require_login
  before_action :set_tour

  def show
    head :not_found and return unless @tour.visible_to?(current_user)
    render inertia: "Tour/Constitution", props: {
      tour: @tour.as_json,
      constitution: @tour.constitution,
      defaults: Constitution::DEFAULTS.deep_stringify_keys
    }
  end

  def update
    head :forbidden and return unless @tour.editable_by?(current_user)
    allowed = Constitution::DEFAULTS.keys.map(&:to_s)
    safe = params.require(:constitution).permit(*allowed).to_h
    @tour.update!(constitution: @tour.constitution.merge(safe))
    redirect_to @tour
  end

  private
    def set_tour = @tour = Tour.find_by(id: params[:tour_id])
end
```

- [ ] **Step 3: 运行 + Commit**

```bash
mise exec -- bundle exec rspec spec/requests/tours/constitutions_spec.rb
git add app/controllers/tours/constitutions_controller.rb spec/requests/tours/constitutions_spec.rb
git commit -m "controller: Tours::ConstitutionsController"
```

---

### Task 3.4: TourMembershipsController

**Files:**
- Create: `app/controllers/tour_memberships_controller.rb`
- Create: `spec/requests/tour_memberships_spec.rb`

**Test skeleton:**

```ruby
# spec/requests/tour_memberships_spec.rb
require "rails_helper"

RSpec.describe "TourMemberships", type: :request do
  def login_as(user) = post("/login_test", params: { user_id: user.id })
  let(:author) { create(:user) }
  let(:tour)   { create(:tour, author: author) }

  it "POST creates membership by email" do
    invitee = create(:user, email: "inv@example.com")
    login_as(author)
    post tour_members_path(tour), params: { email: "inv@example.com", role: "editor" }
    expect(response).to redirect_to(tour)
    expect(tour.members).to include(invitee)
  end

  it "PATCH updates role" do
    user = create(:user)
    m = create(:tour_membership, tour: tour, user: user, role: :reader)
    login_as(author)
    patch tour_member_path(tour, m), params: { role: "editor" }
    expect(m.reload.role).to eq("editor")
  end

  it "DELETE removes membership" do
    user = create(:user)
    m = create(:tour_membership, tour: tour, user: user)
    login_as(author)
    expect {
      delete tour_member_path(tour, m)
    }.to change(TourMembership, :count).by(-1)
  end

  it "non-author cannot manage" do
    other = create(:user)
    login_as(other)
    post tour_members_path(tour), params: { email: "x@example.com", role: "reader" }
    expect(response).to have_http_status(:forbidden)
  end
end
```

**Implementation:**

```ruby
# app/controllers/tour_memberships_controller.rb
class TourMembershipsController < ApplicationController
  before_action :require_login
  before_action :set_tour
  before_action :require_author

  def create
    user = User.find_by(email: params[:email])
    head :not_found and return unless user
    @tour.tour_memberships.create!(user: user, role: params[:role] || "reader")
    redirect_to @tour
  end

  def update
    membership = @tour.tour_memberships.find(params[:id])
    membership.update!(role: params[:role])
    redirect_to @tour
  end

  def destroy
    membership = @tour.tour_memberships.find(params[:id])
    membership.destroy!
    redirect_to @tour
  end

  private
    def set_tour = @tour = Tour.find(params[:tour_id])
    def require_author = head(:forbidden) unless @tour.owned_by?(current_user)
end
```

- [ ] Write spec → impl → commit `controller: TourMembershipsController`

---

### Task 3.5: DaysController

**Files:**
- Create: `app/controllers/days_controller.rb`
- Create: `spec/requests/days_spec.rb`

**Test skeleton:**

```ruby
it "POST /tours/:tour_id/days creates a day" do
  login_as(author)
  expect {
    post tour_days_path(tour), params: { day: { day_index: 1, title: "抵达" } }
  }.to change(Day, :count).by(1)
end

it "PATCH updates day" do
  day = create(:day, tour: tour)
  login_as(author)
  patch tour_day_path(tour, day), params: { day: { buffer_day: true } }
  expect(day.reload.buffer_day).to be true
end

it "DELETE destroys day and nullifies its activities" do
  day = create(:day, tour: tour)
  activity = create(:activity, tour: tour, day: day)
  login_as(author)
  delete tour_day_path(tour, day)
  expect(Day.exists?(day.id)).to be false
  expect(activity.reload.day_id).to be_nil
end
```

**Implementation:**

```ruby
# app/controllers/days_controller.rb
class DaysController < ApplicationController
  before_action :require_login
  before_action :set_tour
  before_action :require_editor

  def create
    day = @tour.days.create!(day_params)
    redirect_to @tour
  end

  def update
    day = @tour.days.find(params[:id])
    day.update!(day_params)
    redirect_to @tour
  end

  def destroy
    day = @tour.days.find(params[:id])
    day.destroy!
    redirect_to @tour
  end

  private
    def set_tour = @tour = Tour.find(params[:tour_id])
    def require_editor = head(:forbidden) unless @tour.editable_by?(current_user)
    def day_params = params.require(:day).permit(:day_index, :date, :title, :theme, :intensity, :buffer_day)
end
```

- [ ] Write spec → impl → commit `controller: DaysController`

---

### Task 3.6: ActivitiesController + ActivityPositionsController

**Files:**
- Create: `app/controllers/activities_controller.rb`
- Create: `app/controllers/activity_positions_controller.rb`
- Create: `spec/requests/activities_spec.rb`
- Create: `spec/requests/activity_positions_spec.rb`

**Activities impl:**

```ruby
# app/controllers/activities_controller.rb
class ActivitiesController < ApplicationController
  before_action :require_login

  # Create into a day
  def create
    if params[:day_id]
      day = Day.find(params[:day_id])
      tour = day.tour
      head :forbidden and return unless tour.editable_by?(current_user)
      activity = tour.activities.create!(activity_params.merge(day: day, position: next_position(tour, day)))
    else
      tour = Tour.find(params[:tour_id])
      head :forbidden and return unless tour.editable_by?(current_user)
      activity = tour.activities.create!(activity_params.merge(day: nil, position: next_position(tour, nil)))
    end
    redirect_to tour
  end

  def update
    activity = Activity.find(params[:id])
    head :forbidden and return unless activity.tour.editable_by?(current_user)
    activity.update!(activity_params)
    redirect_to activity.tour
  end

  def destroy
    activity = Activity.find(params[:id])
    head :forbidden and return unless activity.tour.editable_by?(current_user)
    activity.destroy!
    redirect_to activity.tour
  end

  private
    def activity_params = params.require(:activity).permit(
      :name, :kind, :citizen_level, :lat, :lng, :address, :planned_start_at, :planned_duration_min, :desc, :tips, details: {}
    )
    def next_position(tour, day)
      (day ? tour.activities.where(day_id: day.id) : tour.activities.where(day_id: nil)).maximum(:position).to_i + 1
    end
end
```

**ActivityPositions impl:**

```ruby
# app/controllers/activity_positions_controller.rb
class ActivityPositionsController < ApplicationController
  before_action :require_login

  def update
    activity = Activity.find(params[:activity_id])
    head :forbidden and return unless activity.tour.editable_by?(current_user)
    target_day = params[:to_day_id].present? ? activity.tour.days.find(params[:to_day_id]) : nil
    activity.update!(day: target_day, position: params.require(:to_position).to_i)
    head :ok
  end
end
```

**Request spec 核心（举例）:**

```ruby
it "PATCH /activities/:id/position moves between days" do
  tour = create(:tour, author: author)
  day1 = create(:day, tour: tour, day_index: 1)
  day2 = create(:day, tour: tour, day_index: 2)
  a = create(:activity, tour: tour, day: day1, position: 1)

  login_as(author)
  patch activity_position_path(a), params: { to_day_id: day2.id, to_position: 1 }
  expect(response).to have_http_status(:ok)
  expect(a.reload.day_id).to eq(day2.id)
end
```

- [ ] Write spec → impl → commit `controller: Activities + ActivityPositions`

---

### Task 3.7: ConversationsController + Messages

**Files:**
- Create: `app/controllers/conversations_controller.rb`
- Create: `app/controllers/conversations/messages_controller.rb`
- Create: `spec/requests/conversations_spec.rb`
- Create: `spec/requests/conversations/messages_spec.rb`

**Conversation impl:**

```ruby
# app/controllers/conversations_controller.rb
class ConversationsController < ApplicationController
  before_action :require_login

  def show
    tour = Tour.find(params[:tour_id])
    head :not_found and return unless tour.visible_to?(current_user)
    conversation = tour.conversations.find_or_create_by!(user: current_user)
    render json: {
      conversation: conversation.as_json,
      messages: conversation.messages.order(:created_at).as_json
    }
  end

  def destroy
    tour = Tour.find(params[:tour_id])
    head :forbidden and return unless tour.editable_by?(current_user)
    tour.conversations.where(user: current_user).destroy_all
    head :ok
  end
end
```

**Messages impl:**

```ruby
# app/controllers/conversations/messages_controller.rb
class Conversations::MessagesController < ApplicationController
  before_action :require_login

  def create
    tour = Tour.find(params[:tour_id])
    head :forbidden and return unless tour.editable_by?(current_user)
    conversation = tour.conversations.find_or_create_by!(user: current_user)
    message = conversation.messages.create!(role: :user, content: params.require(:content))
    ChatStreamJob.perform_later(conversation.id, tour.id, current_user.id)
    render json: { message: message.as_json }
  end
end
```

**Spec 核心:**

```ruby
it "POST creates message and enqueues ChatStreamJob" do
  tour = create(:tour, author: user)
  login_as(user)
  expect {
    post tour_conversation_messages_path(tour), params: { content: "hello" }
  }.to have_enqueued_job(ChatStreamJob)
end
```

- [ ] Write spec → impl → commit `controller: Conversations + Messages`

---

### Task 3.8: Phase 3 checkpoint

- [ ] Run all request specs: `mise exec -- bundle exec rspec spec/requests`
- [ ] Rubocop: `bin/rubocop -f github app/controllers`
- [ ] Brakeman
- [ ] Commit checkpoint: `chore: phase 3 checkpoint — controllers + routes`

---

## Phase 4 — 前端 UI (Inertia + React)

> 注：本 plan 里前端 tasks 着重关键组件/数据契约。UI 细节（色彩、spacing 等）参照 `wireframes.html` 原型。

### Task 4.1: 安装前端依赖

**Files:**
- Modify: `package.json`

- [ ] **Step 1: 安装 @dnd-kit（拖拽）与 mantine（已有）**

```bash
npm install @dnd-kit/core @dnd-kit/sortable @dnd-kit/utilities
```

- [ ] **Step 2: 验证**

```bash
npm test -- --run
```

Expected: 现有测试继续通过

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "deps: @dnd-kit for drag-and-drop"
```

---

### Task 4.2: Tour/Index 页面

**Files:**
- Create: `app/javascript/pages/Tour/Index.jsx`
- Create: `app/javascript/pages/Tour/__tests__/Index.test.jsx`

- [ ] **Step 1: 写组件（列表 + 健康度 + 新建）**

```jsx
// app/javascript/pages/Tour/Index.jsx
import React from "react";
import { Head, router } from "@inertiajs/react";

export default function Index({ tours }) {
  return (
    <div style={{ padding: 24 }}>
      <Head title="我的旅行程" />
      <header style={{ display: "flex", justifyContent: "space-between" }}>
        <h1>我的旅行程</h1>
        <button onClick={() => router.post("/tours", { tour: { title: "新旅程" } })}>
          + 新建 Tour
        </button>
      </header>
      <table>
        <thead>
          <tr>
            <th>标题</th><th>日期 / 人数</th><th>进度</th><th>健康度</th><th>最近活动</th><th>我的角色</th><th></th>
          </tr>
        </thead>
        <tbody>
          {tours.map(t => (
            <tr key={t.id} style={{ opacity: t.archived ? 0.55 : 1 }}>
              <td>{t.title}</td>
              <td>{t.date_range} · {t.team_size} 人</td>
              <td>{t.days_count || 0} Day · {t.activities_count || 0} 行</td>
              <td>{formatHealth(t.health)}</td>
              <td>{t.last_activity_at || "—"}</td>
              <td>{t.my_role}</td>
              <td><a href={`/tours/${t.id}/constitution`}>打开 →</a></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function formatHealth(h) {
  if (!h) return "—";
  if (h.hard > 0) return `● ${h.hard} 硬违反`;
  if (h.soft > 0) return `● ${h.soft} 软提示`;
  return "● 全部符合 ✓";
}
```

- [ ] **Step 2: Vitest 最小测试**

```jsx
// app/javascript/pages/Tour/__tests__/Index.test.jsx
import { render, screen } from "@testing-library/react";
import Index from "../Index";

test("renders tour title", () => {
  render(<Index tours={[{ id: 1, title: "伊犁", team_size: 5, my_role: "author" }]} />);
  expect(screen.getByText("伊犁")).toBeInTheDocument();
});
```

- [ ] **Step 3: 运行 npm test + Commit**

```bash
npm test
git add app/javascript/pages/Tour/Index.jsx app/javascript/pages/Tour/__tests__/Index.test.jsx
git commit -m "frontend: Tour/Index page"
```

---

### Task 4.3: Tour/Constitution 页面

**Files:**
- Create: `app/javascript/pages/Tour/Constitution.jsx`
- Create: `app/javascript/pages/Tour/__tests__/Constitution.test.jsx`

**Component 核心（按 wireframe §2）：**

```jsx
// app/javascript/pages/Tour/Constitution.jsx
import React, { useState } from "react";
import { Head, router } from "@inertiajs/react";

export default function Constitution({ tour, constitution, defaults }) {
  const [c, setC] = useState(constitution);
  const dirty = Object.keys(defaults).some(k => String(c[k]) !== String(defaults[k]));

  function save() {
    router.patch(`/tours/${tour.id}/constitution`, { constitution: c });
  }

  function useDefaults() {
    router.patch(`/tours/${tour.id}/constitution`, { constitution: defaults }, {
      onSuccess: () => router.visit(`/tours/${tour.id}`)
    });
  }

  return (
    <div style={{ padding: 24, maxWidth: 820 }}>
      <Head title="确认宪法" />
      <h1>《本程宪法》</h1>

      <h3>关键约束</h3>
      <Row label="每天最多驾驶" unit="小时" field="max_daily_driving_minutes" c={c} setC={setC} scale={60} />
      <Row label="每天最多核心景点" unit="个" field="max_tier_one_per_day" c={c} setC={setC} />
      <Row label="整程至少机动日" unit="天" field="min_buffer_days" c={c} setC={setC} />

      <details>
        <summary>▾ 高级参数</summary>
        <Row label="单日山路驾驶上限" unit="小时" field="max_mountain_road_minutes" c={c} setC={setC} scale={60} />
        <Row label="每日机动时间下限" unit="分钟" field="min_daily_buffer_minutes" c={c} setC={setC} />
        <Row label="整程特色餐厅总数" unit="家" field="max_tier_two_food_per_tour" c={c} setC={setC} />
        <Row label="整程找油紧急升级" unit="次" field="max_fuel_emergency_per_tour" c={c} setC={setC} />
        <Row label="整程毡房/蒙古包" unit="晚" field="max_yurt_nights" c={c} setC={setC} />
      </details>

      <footer style={{ marginTop: 20, display: "flex", justifyContent: "space-between" }}>
        <button disabled={!dirty} onClick={() => confirmResetAndReload()}>↺ 恢复默认</button>
        <div>
          <a href={`/tours/${tour.id}/edit`}>← 返回基本信息</a>
          {dirty
            ? <button onClick={save}>保存修改并开始 →</button>
            : <button onClick={useDefaults}>使用默认宪法，直接开始 →</button>}
        </div>
      </footer>
    </div>
  );

  function confirmResetAndReload() {
    if (window.confirm("恢复默认会丢弃你刚才的修改。确认吗？")) setC({ ...defaults });
  }
}

function Row({ label, unit, field, c, setC, scale = 1 }) {
  const display = scale === 60 ? Math.round(c[field] / 60) : c[field];
  const options = scale === 60 ? [4, 5, 6, 7, 8] : rangeForField(field);
  return (
    <div style={{ display: "grid", gridTemplateColumns: "200px 140px 1fr", gap: 10, padding: "6px 0" }}>
      <label>{label}</label>
      <select value={display} onChange={e => setC({ ...c, [field]: Number(e.target.value) * scale })}>
        {options.map(o => <option key={o} value={o}>{o} {unit}</option>)}
      </select>
      <span style={{ color: "#999", fontSize: 11 }}>code: {field}</span>
    </div>
  );
}

function rangeForField(field) {
  const ranges = {
    max_tier_one_per_day: [1, 2, 3, 4],
    min_buffer_days: [0, 1, 2],
    min_daily_buffer_minutes: [60, 90, 120],
    max_tier_two_food_per_tour: [2, 3, 4],
    max_fuel_emergency_per_tour: [0, 1, 2],
    max_yurt_nights: [0, 1, 2]
  };
  return ranges[field] || [0, 1, 2, 3];
}
```

- [ ] Write spec (min) → component → npm test → commit `frontend: Tour/Constitution page`

---

### Task 4.4: Tour/Show (Planner) 骨架 + 三栏 layout

**Files:**
- Create: `app/javascript/pages/Tour/Show.jsx`
- Create: `app/javascript/components/planner/BacklogList.jsx`
- Create: `app/javascript/components/planner/DayColumn.jsx`
- Create: `app/javascript/components/planner/PlannerMap.jsx`
- Create: `app/javascript/components/planner/ChatPanel.jsx`

- [ ] **Step 1: Show.jsx 骨架**

```jsx
// app/javascript/pages/Tour/Show.jsx
import React, { useState } from "react";
import { Head } from "@inertiajs/react";
import { DndContext, closestCenter } from "@dnd-kit/core";
import BacklogList from "@/components/planner/BacklogList";
import DayColumn from "@/components/planner/DayColumn";
import PlannerMap from "@/components/planner/PlannerMap";
import ChatPanel from "@/components/planner/ChatPanel";

export default function Show({ tour, days, activities, violations }) {
  const [chatOpen, setChatOpen] = useState(true);
  const backlog = activities.filter(a => !a.day_id);
  const byDay = Object.fromEntries(days.map(d => [d.id, activities.filter(a => a.day_id === d.id)]));

  return (
    <div>
      <Head title={tour.title} />
      <DndContext collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <div style={{ display: "grid", gridTemplateColumns: `260px 1fr ${chatOpen ? 320 : 36}px`, gap: 10 }}>
          <BacklogList activities={backlog} />
          <div>
            <PlannerMap activities={activities} />
            <div style={{ display: "flex", gap: 8, overflowX: "auto" }}>
              {days.map(d => <DayColumn key={d.id} day={d} activities={byDay[d.id] || []} />)}
            </div>
          </div>
          <ChatPanel tour={tour} open={chatOpen} onToggle={() => setChatOpen(!chatOpen)} />
        </div>
      </DndContext>
    </div>
  );

  // Task 4.4 先给 no-op stub 让页面能编译；完整实现见 Task 4.8
  function handleDragEnd() { /* implemented in Task 4.8 */ }
}
```

- [ ] **Step 2: BacklogList / DayColumn / PlannerMap / ChatPanel 的骨架（最小可渲染）**

```jsx
// app/javascript/components/planner/BacklogList.jsx
export default function BacklogList({ activities }) {
  return (
    <div style={{ border: "1px solid #777", padding: 10 }}>
      <h4>Backlog（候选池）</h4>
      {activities.map(a => (
        <div key={a.id} style={{ border: "1px solid #bbb", padding: 6, marginBottom: 6 }}>
          <strong>{roleLabel(a.citizen_level)} · {kindLabel(a.kind)}</strong> {a.name}
        </div>
      ))}
    </div>
  );
}
function roleLabel(l) { return { tier_one:"一等", tier_two:"二等", tier_three:"三等", infrastructure:"基础" }[l] || l; }
function kindLabel(k) { return { scenic:"景", road:"路", food:"食", stay:"住", fuel:"油", other:"其他" }[k] || k; }
```

```jsx
// app/javascript/components/planner/DayColumn.jsx
export default function DayColumn({ day, activities }) {
  return (
    <div style={{ border: "1px solid #777", minWidth: 170 }}>
      <header style={{ background: "#f3f3f3", padding: "6px 8px" }}>
        <strong>D{day.day_index}</strong> · {day.date || "—"}
      </header>
      <div style={{ padding: 6, minHeight: 140 }}>
        {activities.map(a => <div key={a.id} style={{ border: "1px solid #bbb", padding: 4, marginBottom: 4 }}>{a.name}</div>)}
      </div>
      <footer style={{ padding: "4px 8px", fontSize: 10, borderTop: "1px dashed #ccc" }}>
        驾驶 ░░░░░░░ 0/7h · 核心 ░░░ 0/3
      </footer>
    </div>
  );
}
```

```jsx
// app/javascript/components/planner/PlannerMap.jsx
export default function PlannerMap({ activities }) {
  return (
    <div style={{ border: "1px solid #777", height: 260, background: "#fafafa", position: "relative" }}>
      <small style={{ position: "absolute", top: 4, left: 6 }}>地图占位 — 接入 AMAP SDK</small>
      {activities.filter(a => a.lat && a.lng).map(a => (
        <span key={a.id} style={{ position: "absolute", left: `${(a.lng - 80) * 8}%`, top: `${(46 - a.lat) * 8}%`, border: "1px dashed #999", padding: "2px 4px", fontSize: 11, background: "#fff" }}>
          {a.name}{a.day_id ? " Dn" : ""}
        </span>
      ))}
    </div>
  );
}
```

```jsx
// app/javascript/components/planner/ChatPanel.jsx
import useChat from "@/hooks/useChat";
export default function ChatPanel({ tour, open, onToggle }) {
  const { messages, send } = useChat({ tourId: tour.id });
  if (!open) {
    return (
      <div style={{ background: "#f3f3f3", cursor: "pointer" }} onClick={onToggle}>
        <span style={{ writingMode: "vertical-rl" }}>◂ 展开 AI 对话</span>
      </div>
    );
  }
  return (
    <div style={{ border: "1px solid #777" }}>
      <header style={{ background: "#f3f3f3", padding: "6px 8px" }}>
        AI 对话 <span style={{ float: "right", cursor: "pointer" }} onClick={onToggle}>收起 ▸</span>
      </header>
      <div style={{ padding: 6, maxHeight: 400, overflowY: "auto" }}>
        {messages.map((m, i) => <MessageBubble key={i} msg={m} />)}
      </div>
      <footer style={{ borderTop: "1px solid #ccc", padding: 6 }}>
        <ChatInput onSend={send} />
      </footer>
    </div>
  );
}
function MessageBubble({ msg }) { return <div><strong>{msg.role}:</strong> {msg.content}</div>; }
function ChatInput({ onSend }) { /* ... textarea + send button ... */ }
```

- [ ] **Step 3: Commit**

```bash
git add app/javascript/pages/Tour/Show.jsx app/javascript/components/planner/
git commit -m "frontend: Planner skeleton (4 panes)"
```

---

### Task 4.5: useChat hook（tool-call 事件 reducer）

**Files:**
- Create: `app/javascript/hooks/useChat.js`
- Create: `app/javascript/hooks/__tests__/useChat.test.jsx`

- [ ] **Step 1: 测试 reducer**

```jsx
import { renderHook, act } from "@testing-library/react";
import useChat, { reducer, INITIAL } from "../useChat";

test("tool_call_start adds a pending tool call to last assistant message", () => {
  const s = reducer(INITIAL, { type: "tool_call_start", id: "tc1", name: "search_poi", arguments: { q: "x" } });
  expect(s.pendingToolCalls["tc1"].name).toBe("search_poi");
});

test("tool_call_result attaches result to existing tool call", () => {
  let s = reducer(INITIAL, { type: "tool_call_start", id: "tc1", name: "search_poi", arguments: {} });
  s = reducer(s, { type: "tool_call_result", id: "tc1", result: { ok: true } });
  expect(s.pendingToolCalls["tc1"].result).toEqual({ ok: true });
});

test("assistant_text accumulates into current assistant message", () => {
  let s = reducer(INITIAL, { type: "assistant_text", delta: "Hel" });
  s = reducer(s, { type: "assistant_text", delta: "lo" });
  expect(s.messages[s.messages.length-1].content).toBe("Hello");
});
```

- [ ] **Step 2: 实现**

```js
// app/javascript/hooks/useChat.js
import { useEffect, useReducer, useRef } from "react";
import consumer from "@/channels/consumer";

export const INITIAL = {
  messages: [],
  streaming: false,
  pendingToolCalls: {}
};

export function reducer(state, action) {
  switch (action.type) {
    case "send_user":
      return { ...state, messages: [...state.messages, { role: "user", content: action.content }], streaming: true };
    case "tool_call_start":
      return { ...state, pendingToolCalls: { ...state.pendingToolCalls, [action.id]: { name: action.name, arguments: action.arguments } } };
    case "tool_call_result":
      return { ...state, pendingToolCalls: { ...state.pendingToolCalls, [action.id]: { ...state.pendingToolCalls[action.id], result: action.result } } };
    case "assistant_text":
      {
        const msgs = [...state.messages];
        const last = msgs[msgs.length - 1];
        if (last && last.role === "assistant") {
          msgs[msgs.length - 1] = { ...last, content: (last.content || "") + action.delta };
        } else {
          msgs.push({ role: "assistant", content: action.delta });
        }
        return { ...state, messages: msgs };
      }
    case "complete":
      return { ...state, streaming: false };
    case "error":
      return { ...state, streaming: false, error: action.message };
    default:
      return state;
  }
}

export default function useChat({ tourId }) {
  const [state, dispatch] = useReducer(reducer, INITIAL);
  const subRef = useRef();

  useEffect(() => {
    subRef.current = consumer.subscriptions.create(
      { channel: "ChatChannel", tour_id: tourId },
      { received: data => dispatch(data) }
    );
    return () => subRef.current?.unsubscribe();
  }, [tourId]);

  function send(content) {
    dispatch({ type: "send_user", content });
    fetch(`/tours/${tourId}/conversation/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-CSRF-Token": csrfToken() },
      body: JSON.stringify({ content })
    });
  }

  return { messages: state.messages, streaming: state.streaming, pendingToolCalls: state.pendingToolCalls, send };
}

function csrfToken() {
  return document.querySelector("meta[name=csrf-token]")?.getAttribute("content") || "";
}
```

- [ ] **Step 3: 运行 + Commit**

```bash
npm test
git add app/javascript/hooks/useChat.js app/javascript/hooks/__tests__/useChat.test.jsx
git commit -m "frontend: useChat reducer + ActionCable subscription"
```

---

### Task 4.6: ActivityCard（卡片通用组件）

**Files:**
- Create: `app/javascript/components/planner/ActivityCard.jsx`

```jsx
// app/javascript/components/planner/ActivityCard.jsx
export default function ActivityCard({ activity }) {
  const isRoadInfra = activity.kind === "road" && activity.citizen_level === "infrastructure";
  const isTierOne = activity.citizen_level === "tier_one";
  return (
    <div style={{
      border: isTierOne ? "1px solid var(--yellow,#c80)" : isRoadInfra ? "1px dashed #bbb" : "1px solid #bbb",
      background: isTierOne ? "#fffaf0" : isRoadInfra ? "#f5f5f5" : "#fafafa",
      fontStyle: isRoadInfra ? "italic" : "normal",
      padding: "4px 6px", marginBottom: 4, fontSize: 12
    }}>
      <strong>{levelLabel(activity.citizen_level)} · {kindLabel(activity.kind)}</strong> {activity.name}
      {activity.planned_start_at && <div style={{ fontSize: 10, color: "#888" }}>{activity.planned_start_at} · {activity.planned_duration_min} 分</div>}
    </div>
  );
}
// levelLabel/kindLabel 同 Task 4.4
```

- [ ] Commit `frontend: ActivityCard`

---

### Task 4.7: DayColumn 集成进度条 + citizen count

**Files:**
- Modify: `app/javascript/components/planner/DayColumn.jsx`

- [ ] 实现：计算 driving / tier_one，渲染进度条字符串（见 wireframe Task 4.4 footer）。

```jsx
function progressBar(value, max, width = 5) {
  const filled = Math.min(Math.round((value / max) * width), width);
  return "█".repeat(filled) + "░".repeat(width - filled);
}

// 在 footer 里：
const drivingH = day.driving_minutes_total / 60;
const tierOne = day.tier_one_count;
const maxH = 7;  // 从 props 传入 tour.constitution
<footer>
  驾驶 {progressBar(drivingH, maxH)} {drivingH}/{maxH}h
  {"\n"}核心 {progressBar(tierOne, 3, 3)} {tierOne}/3
  {day.buffer_day && " · buffer"}
</footer>
```

（实现细节：tour.constitution 需要从 props 穿透到 DayColumn，结构调整 props）

- [ ] Commit `frontend: DayColumn progress bars`

---

### Task 4.8: 拖拽功能（@dnd-kit 接入）

**Files:**
- Modify: `app/javascript/pages/Tour/Show.jsx`
- Modify: `app/javascript/components/planner/BacklogList.jsx`
- Modify: `app/javascript/components/planner/DayColumn.jsx`

- [ ] **Step 1: 包装 backlog 和 day 为 droppable，activity 为 draggable**

（遵循 @dnd-kit/core 最小示例）

- [ ] **Step 2: `handleDragEnd` 内 fetch PATCH activity_position_path**

```jsx
async function handleDragEnd({ active, over }) {
  if (!over) return;
  const activityId = active.id;
  const targetDayId = over.data?.current?.dayId || null;
  const toPosition = over.data?.current?.position || 1;

  await fetch(`/activities/${activityId}/position`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", "X-CSRF-Token": csrfToken() },
    body: JSON.stringify({ to_day_id: targetDayId, to_position: toPosition })
  });
  router.reload({ only: ["activities", "violations"] });
}
```

- [ ] Commit `frontend: drag-and-drop between backlog/days`

---

### Task 4.9: ConstitutionBanner

**Files:**
- Create: `app/javascript/components/planner/ConstitutionBanner.jsx`

```jsx
export default function ConstitutionBanner({ violations }) {
  if (!violations.length) return null;
  return (
    <div style={{ padding: 4 }}>
      {violations.map((v, i) => (
        <div key={i} style={{
          border: `1px solid ${v.level === "hard" ? "#c33" : "#c80"}`,
          background: v.level === "hard" ? "#fef0f0" : "#fef8e8",
          color: v.level === "hard" ? "#c33" : "#c80",
          padding: "6px 10px", margin: "4px 0", fontSize: 12
        }}>
          {v.level === "hard" ? "⛔ " : "⚠ "}{v.message}
          <div style={{ float: "right" }}>
            {v.level === "hard" && <button>帮我修正 →</button>}
            <button>{v.level === "hard" ? "承认此违反" : "知道了"}</button>
          </div>
        </div>
      ))}
    </div>
  );
}
```

- [ ] Place in `Show.jsx` 顶部；commit `frontend: ConstitutionBanner`

---

### Task 4.10: Toast + Undo

**Files:**
- Create: `app/javascript/components/Toast.jsx`
- Create: `app/javascript/hooks/useUndoToast.js`

- [ ] 实现：5 秒自动消失，点击 undo 触发回滚回调。

- [ ] Commit `frontend: undo toast`

---

### Task 4.11: 删除旧前端文件（一部分）

**Files:**
- Delete: `app/javascript/components/DiffModal.jsx` (旧)
- Delete: `app/javascript/components/ChatPanel.jsx` (旧 — 新版本已在新路径)

> 若 DiffModal.jsx 和 ChatPanel.jsx 已在 Task 4.4 `import` 新路径，这步只是删除老文件。

- [ ] `git rm ...` + Commit `frontend: remove old markdown-diff components`

---

### Task 4.12: Inertia 路由入口接入

**Files:**
- Modify: `app/javascript/entrypoints/application.js`（或 `inertia.js`，以 repo 现状为准）

- [ ] **Step 1: 在 `resolve` 回调里加上新 pages 的解析**

```js
// 部分示例（合并到现有 resolve 逻辑，不覆盖）
import { createInertiaApp } from "@inertiajs/react";

createInertiaApp({
  resolve: name => {
    const pages = import.meta.glob("./pages/**/*.jsx", { eager: true });
    return pages[`./pages/${name}.jsx`];
  },
  // setup: ... 保持现有
});
```

验证：`Tour/Index`、`Tour/Show`、`Tour/Constitution` 三个 page 能被解析。

- [ ] **Step 2: Commit**

```bash
git add app/javascript/entrypoints/application.js
git commit -m "frontend: wire inertia resolver for Tour pages"
```

### Task 4.13: Phase 4 checkpoint

- [ ] Run `npm test`
- [ ] 启动 `bin/dev`，手工打开 `/tours`，逐屏过 Screen 1 → 2 → 3 → 4 流程（不要求 AI / 真实 AMAP，只要页面能渲染、不 console error）
- [ ] Commit: `git commit --allow-empty -m "chore: phase 4 checkpoint — frontend skeleton"`

---

## Phase 5 — 清理老代码

### Task 5.1: 删除 Guidebook 模型

- [ ] `git rm app/models/guidebook.rb app/models/guidebook/generation.rb app/models/guidebook_membership.rb`
- [ ] Commit `cleanup: remove Guidebook models`

### Task 5.2: 删除 FrontmatterSchema / FrontmatterParser

- [ ] `git rm app/services/frontmatter_schema.rb app/services/frontmatter_parser.rb`
- [ ] Commit `cleanup: remove frontmatter services`

### Task 5.3: 删除 Geocoder + GeocodeTool，挪出 EmailVerification::RateLimit

**Files:**
- Move: `app/services/email_verification/rate_limit.rb` → `app/models/email_verification/rate_limit.rb`
- Delete: `app/services/geocoder.rb`
- Delete: `app/tools/geocode_tool.rb`
- Delete: `app/services/` 目录（已清空）
- Possibly modify: 搜索 `EmailVerification::RateLimit` 引用点并确认 Zeitwerk 能继续 resolve（同命名空间从 services 挪到 models 不影响常量解析）

- [ ] **Step 1: 挪 rate_limit.rb**

```bash
git mv app/services/email_verification/rate_limit.rb app/models/email_verification/rate_limit.rb
```

- [ ] **Step 2: 确认引用完整性**

```bash
mise exec -- bundle exec rspec spec/models/email_verification spec/requests/email_verifications 2>/dev/null || true
grep -rn "EmailVerification::RateLimit" app/ spec/ | head -20
```

Expected: 所有引用仍是 `EmailVerification::RateLimit`，无 file path 引用，Zeitwerk 自动 re-resolve。

- [ ] **Step 3: 删 Geocoder / GeocodeTool**

```bash
git rm app/services/geocoder.rb app/tools/geocode_tool.rb
rmdir app/services/email_verification 2>/dev/null
rmdir app/services 2>/dev/null
rmdir app/tools 2>/dev/null
```

- [ ] **Step 4: 运行测试确认没破坏**

```bash
mise exec -- bundle exec rspec
```

Expected: 全绿（若有 spec 仍引用 geocoder_spec.rb，在 Task 5.6 会一并删）

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "cleanup: remove Geocoder/GeocodeTool; move EmailVerification::RateLimit to models"
```

### Task 5.4: 删除 Guidebook controllers / views / pages

**Files (删除):**
- `app/controllers/guidebooks_controller.rb`
- `app/controllers/guidebook_memberships_controller.rb`
- `app/javascript/pages/Guidebook/` 整个目录（若存在）
- `app/javascript/components/DiffModal.jsx` （若还未在 Task 4.11 删）
- `app/views/guidebooks/`（若存在）

- [ ] **Step 1: 执行删除**

```bash
git rm app/controllers/guidebooks_controller.rb
git rm app/controllers/guidebook_memberships_controller.rb
git rm -r app/javascript/pages/Guidebook 2>/dev/null || true
git rm -r app/views/guidebooks 2>/dev/null || true
```

- [ ] **Step 2: 运行所有测试 + rubocop**

```bash
mise exec -- bundle exec rspec
bin/rubocop -f github
```

Expected: 无 controller 引用相关错误（Guidebook model 已在 5.1 删）

- [ ] **Step 3: Commit**

```bash
git commit -m "cleanup: remove guidebook controllers + pages"
```

### Task 5.5: 删除 guidebooks 表

- [ ] Create migration `DropGuidebooksAndMemberships`:

```ruby
def up
  drop_table :guidebook_memberships
  drop_table :guidebooks
end

def down
  raise ActiveRecord::IrreversibleMigration
end
```

- [ ] `bin/rails db:migrate` + Commit

### Task 5.6: 删除老 specs / factories

- [ ] `git rm spec/models/guidebook* spec/requests/guidebooks* spec/services/` (whole folder)
- [ ] `git rm spec/factories/guidebooks.rb spec/factories/guidebook_memberships.rb`
- [ ] Commit

### Task 5.7: 清理 routes

- [ ] 确认 `config/routes.rb` 已无 `resources :guidebooks`
- [ ] Commit if changed

### Task 5.8: Phase 5 checkpoint

- [ ] `mise exec -- bundle exec rspec` (全绿)
- [ ] `npm test` (全绿)
- [ ] Commit `chore: phase 5 checkpoint — legacy code removed`

---

## Phase 6 — 最终验证 + PR

### Task 6.1: 运行完整 CI 工具链

- [ ] `mise exec -- bundle exec rspec`
- [ ] `npm test`
- [ ] `bin/rubocop -f github`
- [ ] `bin/brakeman --no-pager`
- [ ] `bin/importmap audit`

Expected: 全部无 offense / 无 warning / 全绿

### Task 6.2: 手工端到端验证

- [ ] 启动 `bin/dev`
- [ ] 流程：登录 → 新建 Tour → 确认宪法 → AI 对话生成 backlog → 拖入 Days → 宪法 banner 正确显示 → 承认违反 → 年表视图验证
- [ ] 记录手工结果到 PR description

### Task 6.3: 创建 PR

- [ ] `git push -u origin feature/tour-day-activity-remodel`
- [ ] `gh pr create --title "Tour/Day/Activity remodel: planner + constitution + tool-calling"` 用 HEREDOC body 包含 Summary + Test plan
- [ ] 等待 CI 绿

---

## Open Issues / 实现中注意

1. **Activity position 重排细节** — Task 2.3 (MoveActivity) 当前实现不自动重排其他条目。真实 UX 下把 A 从 position=3 拖到 position=1 需要把原 1, 2 往后挤。实现阶段补充 `shift_positions!` helper。
2. **RubyLLM event API 实际形状** — Task 2.15 ChatStreamJob 里假设的 `event.type / .name / .arguments / .id / .result / .delta` 需要用实际 gem 版本验证，必要时适配。
3. **宪法 check_fuel_emergency** — 需要在 `activities.details` 里记录"升级事件"，当前字段不支持；本 plan 暂缓实现，ConstitutionCheck 里留位置。
4. **AMAP SDK 前端集成** — Task 4.4 PlannerMap 组件现在是占位，实际要接 AMAP JSAPI；实现阶段单独一次性接入。
5. **移动端 / 窄屏 fallback** — 按 wireframe Screen 0 的约定，`<1024px` 显示"请用桌面"引导页；本 plan 未单独列 task，在 Task 4.4 内做最小守卫即可。

---

## Execution Handoff

**"Plan complete and saved to `docs/superpowers/plans/2026-04-15-tour-day-activity-remodel.md`. Two execution options:**

1. **Subagent-Driven (recommended)** — 每个 Task 独立 subagent 实现 + 两阶段 review。适合大型 plan，隔离上下文避免串扰。
2. **Inline Execution** — 当前 session 按 Task 顺序批量执行，checkpoint 处 review。

**Which approach?"**
