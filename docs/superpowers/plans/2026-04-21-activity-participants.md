# Activity Participants Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give each Activity its own participant set (author + editors manage via new "参与人" tab in ActivityDrawer), wire it into expense split prefill, and retire the zero-consumer `TourMembership#participating_day_ids` column.

**Architecture:** New join table `activity_participants` (activity_id, user_id). Empty set = 全员 via `Activity#effective_participant_ids`. Single PUT endpoint replaces the whole set. Frontend re-uses one `effectiveParticipants` utility across ActivityDrawer tab, ActivityCard display, and expense form prefill.

**Tech Stack:** Rails 8 + Inertia.js + React + Mantine. RSpec + Vitest. Postgres (jsonb removal).

**Spec:** `docs/superpowers/specs/2026-04-21-activity-participants-design.md`

---

## File Structure

**Ruby — create:**
- `db/migrate/20260421120000_create_activity_participants_and_drop_participating_day_ids.rb`
- `app/models/activity_participant.rb`
- `app/controllers/activity_participants_controller.rb`
- `spec/factories/activity_participants.rb`
- `spec/models/activity_participant_spec.rb`
- `spec/requests/activity_participants_spec.rb`

**Ruby — modify:**
- `app/models/activity.rb` (add associations + `effective_participant_ids`)
- `app/models/user.rb` (add `has_many :activity_participants`)
- `app/models/tour_membership.rb` (drop `participates_in_day?` + validation; add `after_destroy` cleanup)
- `app/controllers/tours_controller.rb` (remove `participating_day_ids` from members; add `participant_user_ids` to activities)
- `app/controllers/tour_memberships_controller.rb` (drop `participating_day_ids` params)
- `config/routes.rb` (nest `resource :participants` under activities)
- `spec/models/tour_membership_spec.rb` (delete day-participation blocks; add destroy-cleanup block)
- `spec/models/activity_spec.rb` or new `spec/models/activity_spec.rb` (add `effective_participant_ids`)

**JS — create:**
- `app/javascript/lib/effectiveParticipants.js`
- `app/javascript/lib/__tests__/effectiveParticipants.test.js`

**JS — modify:**
- `app/javascript/components/activity-editor/ActivityDrawer.jsx` (new tab + `ParticipantsTab` sub-component; accepts new `author`, `members` props)
- `app/javascript/components/activity-editor/__tests__/ActivityDrawer.test.jsx`
- `app/javascript/pages/Tour/Show.jsx` (pass `author`, `members` into ActivityDrawer)
- `app/javascript/components/planner/ActivityCard.jsx` (Avatar group for explicit subset)
- `app/javascript/components/planner/AddExpenseDialog.jsx` (prefill `participantIds` from `effectiveParticipants`)
- `app/javascript/components/planner/MembershipDrawer.jsx` (delete `ParticipatingDays` + call site; add "改 Activity 参与人" row to permission matrix)

---

## Task 1: Pre-migration cleanup — remove `participating_day_ids` references

No new feature yet; purge the zero-consumer column's callers so later migration drops cleanly. Do this as a single commit — each referenced file is touched together so HEAD stays green.

**Files:**
- Modify: `app/controllers/tours_controller.rb:41` (remove `participating_day_ids:` line from member hash)
- Modify: `app/controllers/tour_memberships_controller.rb:25-27` (remove `if params.key?(:participating_day_ids) ... end` block)
- Modify: `app/models/tour_membership.rb:8,10-16,19-27` (remove `participates_in_day?`, `participating_day_ids_belong_to_tour`, and the `validate` call)
- Modify: `spec/models/tour_membership_spec.rb:25-60` (remove `describe "participating_day_ids"` + `describe "#participates_in_day?"` blocks)
- Modify: `app/javascript/components/planner/MembershipDrawer.jsx:108-110,117-160` (remove `ParticipatingDays` call site + component definition)

- [ ] **Step 1.1: Remove `participating_day_ids` from tours_controller payload**

Edit `app/controllers/tours_controller.rb` — delete line 41 so the members hash becomes:

```ruby
members: @tour.tour_memberships.includes(user: { avatar_attachment: :blob }).filter_map { |m|
  next unless m.user
  {
    id: m.id,
    user_id: m.user_id,
    email: m.user.email,
    name: m.user.name,
    avatar_url: m.user.display_avatar_url,
    role: m.role
  }
},
```

- [ ] **Step 1.2: Remove `participating_day_ids` params handling from tour_memberships_controller**

Edit `app/controllers/tour_memberships_controller.rb#update` so it becomes:

```ruby
def update
  membership = @tour.tour_memberships.find(params[:id])

  attrs = {}
  if params.key?(:role)
    head :unprocessable_entity and return unless ALLOWED_ROLES.include?(params[:role])
    attrs[:role] = params[:role]
  end

  membership.update!(attrs)
  redirect_to @tour
end
```

- [ ] **Step 1.3: Remove `participates_in_day?` + validation from TourMembership model**

Edit `app/models/tour_membership.rb`. The file after edit should be:

```ruby
class TourMembership < ApplicationRecord
  belongs_to :tour
  belongs_to :user

  enum :role, reader: 0, editor: 1

  validates :user_id, uniqueness: { scope: :tour_id, message: "already a member of this tour" }
end
```

(Note: the `after_destroy :cleanup_activity_participants` callback is added in Task 5 — do not add it here.)

- [ ] **Step 1.4: Remove day-participation specs from tour_membership_spec.rb**

Edit `spec/models/tour_membership_spec.rb` — delete the `describe "participating_day_ids"` block (lines 25-44) and the `describe "#participates_in_day?"` block (lines 46-60). Do NOT delete the uniqueness spec above them. After edit the file should only contain the uniqueness describe block.

- [ ] **Step 1.5: Remove ParticipatingDays from MembershipDrawer**

Edit `app/javascript/components/planner/MembershipDrawer.jsx`:

1. Delete lines 108-110 (the `{days.length > 0 && isAuthor && <ParticipatingDays ... />}` call inside `CurrentMembers`)
2. Delete the entire `ParticipatingDays` function definition (lines 117-160)

After edit, `CurrentMembers` members.map block is just the outer Group with UserLabel + role Select + 移除 Button — no inner ParticipatingDays. The `days` prop is still received by `MembershipDrawer` and `CurrentMembers` but no longer used inside; leave the prop in the signature (Show.jsx still passes it — will be a separate cleanup later if desired; out of scope here).

- [ ] **Step 1.6: Run specs + lint to verify cleanup is green**

Run:

```
mise exec -- bundle exec rspec spec/models/tour_membership_spec.rb spec/requests/tour_memberships_spec.rb
bin/rubocop app/controllers/tours_controller.rb app/controllers/tour_memberships_controller.rb app/models/tour_membership.rb -f github
npm test -- --run app/javascript/components/planner
```

Expected: PASS. If any spec references `participating_day_ids` elsewhere, grep and remove.

- [ ] **Step 1.7: Commit**

```bash
git add app/controllers/tours_controller.rb app/controllers/tour_memberships_controller.rb \
        app/models/tour_membership.rb spec/models/tour_membership_spec.rb \
        app/javascript/components/planner/MembershipDrawer.jsx
git commit -m "$(cat <<'EOF'
chore: remove zero-consumer participating_day_ids references

预备 activity_participants 迁移前的清理——TourMembership#participating_day_ids
整个代码库无消费者（expense splitting 由表单直传 participant_ids 驱动），
同步删除 controller payload/params、model 方法/校验、spec、MembershipDrawer 的
ParticipatingDays 子组件。下一步 migration 会 remove_column。

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Migration — create `activity_participants` + drop `participating_day_ids`

**Files:**
- Create: `db/migrate/20260421120000_create_activity_participants_and_drop_participating_day_ids.rb`
- Modify: `db/schema.rb` (auto-generated by `db:migrate`)

- [ ] **Step 2.1: Generate migration file**

Run:

```
mise exec -- bundle exec bin/rails generate migration CreateActivityParticipantsAndDropParticipatingDayIds
```

This creates a new file under `db/migrate/` with a timestamp prefix. Rename it (if needed) to end in `_create_activity_participants_and_drop_participating_day_ids.rb`.

- [ ] **Step 2.2: Write migration contents**

Edit the generated file so its body is:

```ruby
class CreateActivityParticipantsAndDropParticipatingDayIds < ActiveRecord::Migration[8.0]
  def change
    create_table :activity_participants do |t|
      t.references :activity, null: false, foreign_key: true, index: true
      t.references :user,     null: false, foreign_key: true, index: true
      t.timestamps
    end
    add_index :activity_participants, [ :activity_id, :user_id ], unique: true

    remove_column :tour_memberships, :participating_day_ids, :jsonb, default: [], null: false
  end
end
```

(Including the original `:jsonb, default: [], null: false` in `remove_column` makes the migration reversible.)

- [ ] **Step 2.3: Run migration**

Run:

```
mise exec -- bundle exec bin/rails db:migrate
```

Expected output: `== CreateActivityParticipantsAndDropParticipatingDayIds: migrated` — and `db/schema.rb` updates to add `activity_participants` and drop the `participating_day_ids` column on `tour_memberships`.

- [ ] **Step 2.4: Also migrate test DB**

Run:

```
mise exec -- bundle exec bin/rails db:migrate RAILS_ENV=test
```

- [ ] **Step 2.5: Verify schema**

Open `db/schema.rb` and confirm:
1. New block `create_table "activity_participants"` with references + unique composite index
2. `tour_memberships` block no longer has `t.jsonb "participating_day_ids"`

- [ ] **Step 2.6: Commit**

```bash
git add db/migrate/20260421120000_create_activity_participants_and_drop_participating_day_ids.rb db/schema.rb
git commit -m "$(cat <<'EOF'
db: create activity_participants + drop participating_day_ids

新 join 表承载 activity 级参与关系；同时 drop TourMembership 上的 jsonb 列
（零消费者）。Unique index (activity_id, user_id) 防止重复插入。

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: `ActivityParticipant` model + factory + spec

TDD: write failing spec first, then implement model.

**Files:**
- Create: `spec/factories/activity_participants.rb`
- Create: `spec/models/activity_participant_spec.rb`
- Create: `app/models/activity_participant.rb`

- [ ] **Step 3.1: Write factory**

Create `spec/factories/activity_participants.rb`:

```ruby
FactoryBot.define do
  factory :activity_participant do
    association :activity
    association :user

    # When used with `create(:activity_participant, activity: some_activity)`,
    # the default factory generates a fresh User that is NOT in the tour. The
    # model validator rejects this — callers should either add the user to
    # the tour first, or pass an explicit `user:` already in the membership set.
  end
end
```

- [ ] **Step 3.2: Write failing model spec**

Create `spec/models/activity_participant_spec.rb`:

```ruby
require "rails_helper"

RSpec.describe ActivityParticipant, type: :model do
  describe "associations" do
    it { should belong_to(:activity) }
    it { should belong_to(:user) }
  end

  describe "validations" do
    let(:tour)     { create(:tour) }
    let(:activity) { create(:activity, tour: tour) }
    let(:member)   { create(:user) }

    before do
      create(:tour_membership, tour: tour, user: member, role: :editor)
    end

    it "is valid when user is the tour author" do
      p = ActivityParticipant.new(activity: activity, user: tour.author)
      expect(p).to be_valid
    end

    it "is valid when user is a tour member" do
      p = ActivityParticipant.new(activity: activity, user: member)
      expect(p).to be_valid
    end

    it "rejects users not in the tour" do
      outsider = create(:user)
      p = ActivityParticipant.new(activity: activity, user: outsider)
      expect(p).not_to be_valid
      expect(p.errors[:user_id].first).to match(/不属于本行程成员/)
    end

    it "rejects duplicate (activity, user)" do
      ActivityParticipant.create!(activity: activity, user: member)
      dup = ActivityParticipant.new(activity: activity, user: member)
      expect(dup).not_to be_valid
      expect(dup.errors[:user_id].first).to match(/taken|unique/i)
    end
  end
end
```

- [ ] **Step 3.3: Run spec (expect all failing — model does not exist)**

Run:

```
mise exec -- bundle exec rspec spec/models/activity_participant_spec.rb
```

Expected: errors on `ActivityParticipant` constant not found.

- [ ] **Step 3.4: Write minimal model**

Create `app/models/activity_participant.rb`:

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

- [ ] **Step 3.5: Run spec (expect all passing)**

Run:

```
mise exec -- bundle exec rspec spec/models/activity_participant_spec.rb
```

Expected: all 5 examples pass.

- [ ] **Step 3.6: Commit**

```bash
git add app/models/activity_participant.rb spec/models/activity_participant_spec.rb spec/factories/activity_participants.rb
git commit -m "$(cat <<'EOF'
feat: add ActivityParticipant model with tour-membership validation

新 join 表的 AR 模型；校验 user 必须属于 activity 所在 tour 的 author 或 member
（白名单），unique scope (activity_id, user_id) 防重复。

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: `Activity` associations + `effective_participant_ids`

TDD.

**Files:**
- Modify: `app/models/activity.rb:14-18` (add associations near existing `has_many` block)
- Create or modify: `spec/models/activity_spec.rb`

- [ ] **Step 4.1: Check whether activity_spec.rb exists**

Run:

```
ls spec/models/activity_spec.rb
```

If it exists, append; if not, create with the block below.

- [ ] **Step 4.2: Write failing spec for `effective_participant_ids`**

Append to (or create) `spec/models/activity_spec.rb`:

```ruby
require "rails_helper"

RSpec.describe Activity, type: :model do
  describe "#effective_participant_ids" do
    let(:tour)     { create(:tour) }
    let(:member1)  { create(:user) }
    let(:member2)  { create(:user) }
    let(:activity) { create(:activity, tour: tour) }

    before do
      create(:tour_membership, tour: tour, user: member1, role: :editor)
      create(:tour_membership, tour: tour, user: member2, role: :reader)
    end

    it "returns [author_id, ...member_ids] when no explicit participants" do
      expect(activity.effective_participant_ids).to contain_exactly(
        tour.author_id, member1.id, member2.id
      )
    end

    it "returns explicit participant user_ids when set" do
      ActivityParticipant.create!(activity: activity, user: member1)
      expect(activity.effective_participant_ids).to contain_exactly(member1.id)
    end

    it "returns an empty-fallback (full roster) when all explicit rows are removed" do
      ap = ActivityParticipant.create!(activity: activity, user: member1)
      ap.destroy
      expect(activity.effective_participant_ids).to contain_exactly(
        tour.author_id, member1.id, member2.id
      )
    end
  end

  describe "associations" do
    it { should have_many(:activity_participants).dependent(:destroy) }
    it { should have_many(:participants).through(:activity_participants).source(:user) }
  end
end
```

- [ ] **Step 4.3: Run spec (expect failure — method/associations missing)**

Run:

```
mise exec -- bundle exec rspec spec/models/activity_spec.rb
```

- [ ] **Step 4.4: Add associations and method to Activity**

Edit `app/models/activity.rb`. After line 18 (`has_many :tour_budgets, dependent: :destroy`), add:

```ruby
  has_many :activity_participants, dependent: :destroy
  has_many :participants, through: :activity_participants, source: :user
```

And before the `private` keyword (around line 45), add:

```ruby
  def effective_participant_ids
    explicit = activity_participants.pluck(:user_id)
    return explicit if explicit.any?
    [ tour.author_id, *tour.tour_memberships.pluck(:user_id) ]
  end
```

- [ ] **Step 4.5: Run spec (expect pass)**

Run:

```
mise exec -- bundle exec rspec spec/models/activity_spec.rb
```

Expected: all examples pass.

- [ ] **Step 4.6: Commit**

```bash
git add app/models/activity.rb spec/models/activity_spec.rb
git commit -m "$(cat <<'EOF'
feat: Activity#effective_participant_ids + activity_participants association

单源语义出口：空集合回退到 [author, ...members]，有显式行则原样返回。
这一点被分账预填、前端展示、未来 AI 上下文都会读。

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: `TourMembership` destroy cleanup + `User` association

**Files:**
- Modify: `app/models/tour_membership.rb` (add `after_destroy` callback)
- Modify: `app/models/user.rb` (add `has_many :activity_participants`)
- Modify: `spec/models/tour_membership_spec.rb` (add destroy-cleanup describe)

- [ ] **Step 5.1: Write failing destroy-callback spec**

Append to `spec/models/tour_membership_spec.rb`:

```ruby
  describe "after_destroy" do
    let(:tour)       { create(:tour) }
    let(:other_tour) { create(:tour) }
    let(:user)       { create(:user) }

    before do
      create(:tour_membership, tour: other_tour, user: user, role: :editor)
    end

    it "removes the user's ActivityParticipant rows in the same tour only" do
      membership = create(:tour_membership, tour: tour, user: user, role: :editor)
      activity_a = create(:activity, tour: tour)
      activity_b = create(:activity, tour: other_tour)

      ActivityParticipant.create!(activity: activity_a, user: user)
      ActivityParticipant.create!(activity: activity_b, user: user)

      expect {
        membership.destroy!
      }.to change { ActivityParticipant.where(user: user).count }.from(2).to(1)

      expect(ActivityParticipant.where(activity: activity_b, user: user)).to exist
    end
  end
```

- [ ] **Step 5.2: Run spec (expect failure — callback does not exist)**

Run:

```
mise exec -- bundle exec rspec spec/models/tour_membership_spec.rb
```

- [ ] **Step 5.3: Add `after_destroy` callback to TourMembership**

Edit `app/models/tour_membership.rb`:

```ruby
class TourMembership < ApplicationRecord
  belongs_to :tour
  belongs_to :user

  enum :role, reader: 0, editor: 1

  validates :user_id, uniqueness: { scope: :tour_id, message: "already a member of this tour" }

  after_destroy :cleanup_activity_participants

  private
    def cleanup_activity_participants
      ActivityParticipant
        .joins(:activity)
        .where(user_id: user_id, activities: { tour_id: tour_id })
        .delete_all
    end
end
```

- [ ] **Step 5.4: Add `has_many :activity_participants` to User**

Edit `app/models/user.rb`. Near existing `has_many` declarations (around line 5-6), add:

```ruby
  has_many :activity_participants, dependent: :destroy
```

- [ ] **Step 5.5: Run specs (expect pass)**

Run:

```
mise exec -- bundle exec rspec spec/models/tour_membership_spec.rb spec/models/activity_participant_spec.rb spec/models/activity_spec.rb
```

Expected: all pass.

- [ ] **Step 5.6: Commit**

```bash
git add app/models/tour_membership.rb app/models/user.rb spec/models/tour_membership_spec.rb
git commit -m "$(cat <<'EOF'
feat: cleanup ActivityParticipant on TourMembership#destroy

成员离队时同步删除该 user 在本 tour 所有 activity 的参与记录；
限定 tour_id 避免误删其他 tour 里的参与。User has_many
:activity_participants, dependent: :destroy 走 AR 级联处理"user
被完全删除"这条路径。

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: Tour/Show payload — expose `participant_user_ids` on activities

**Files:**
- Modify: `app/controllers/tours_controller.rb:24` (replace `as_json` with mapped hash)
- Modify or create: `spec/requests/tours_spec.rb` (assert field present)

- [ ] **Step 6.1: Find/verify tours request spec**

Run:

```
ls spec/requests/tours_spec.rb
```

If it exists, read it to see an existing `GET /tours/:id` example. If none, create a minimal one.

- [ ] **Step 6.2: Write failing assertion in request spec**

Append a describe block to `spec/requests/tours_spec.rb` (or create it):

```ruby
  describe "GET /tours/:id — payload" do
    it "includes participant_user_ids on each activity" do
      tour   = create(:tour)
      member = create(:user)
      create(:tour_membership, tour: tour, user: member, role: :editor)
      activity = create(:activity, tour: tour)
      ActivityParticipant.create!(activity: activity, user: member)

      login_as(tour.author)
      get tour_path(tour)

      expect(response).to be_successful
      # Inertia shared props arrive as JSON in the response body when
      # X-Inertia is sent, otherwise embedded in data-page attr of HTML.
      # Pull the activities payload via inertia helper if available; otherwise
      # assert the raw HTML body includes the field:
      expect(response.body).to include("participant_user_ids")
    end
  end
```

(If the existing tours_spec has inertia helpers like `inertia_props`, prefer those. The substring check is a cheap smoke test.)

Run to confirm it fails:

```
mise exec -- bundle exec rspec spec/requests/tours_spec.rb
```

- [ ] **Step 6.3: Replace `activities: @tour.activities.as_json` with enriched mapping**

Edit `app/controllers/tours_controller.rb:24`. Change:

```ruby
activities: @tour.activities.as_json,
```

to:

```ruby
activities: @tour.activities.includes(:activity_participants).map { |a|
  a.as_json.merge("participant_user_ids" => a.activity_participants.map(&:user_id))
},
```

(Using `includes` avoids N+1 when the show page has many activities.)

- [ ] **Step 6.4: Run spec (expect pass)**

Run:

```
mise exec -- bundle exec rspec spec/requests/tours_spec.rb
```

- [ ] **Step 6.5: Commit**

```bash
git add app/controllers/tours_controller.rb spec/requests/tours_spec.rb
git commit -m "$(cat <<'EOF'
feat: expose participant_user_ids on activities in Tour/Show payload

前端 ActivityDrawer "参与人" tab、ActivityCard 头像组、AddExpenseDialog
预填都读这一字段；空数组语义 = "默认全员"（由前端 effectiveParticipants
工具函数应用）。用 includes 避免 N+1。

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: Routes + `ActivityParticipantsController`

**Files:**
- Modify: `config/routes.rb` (add nested `resource :participants`)
- Create: `app/controllers/activity_participants_controller.rb`
- Create: `spec/requests/activity_participants_spec.rb`

- [ ] **Step 7.1: Locate existing activities routes**

Run:

```
grep -n "resources :activities" config/routes.rb
```

Note the line number of the current `resources :activities` block.

- [ ] **Step 7.2: Write failing request spec**

Create `spec/requests/activity_participants_spec.rb`:

```ruby
require "rails_helper"

RSpec.describe "ActivityParticipants", type: :request do
  let(:tour)     { create(:tour) }
  let(:editor)   { create(:user) }
  let(:reader)   { create(:user) }
  let(:bystander) { create(:user) }  # not in tour
  let(:activity) { create(:activity, tour: tour) }

  before do
    create(:tour_membership, tour: tour, user: editor, role: :editor)
    create(:tour_membership, tour: tour, user: reader, role: :reader)
  end

  def login_as(user)
    post "/login_test", params: { user_id: user.id }
  end

  describe "PUT /activities/:activity_id/participants" do
    it "replaces the participant set for the author" do
      login_as(tour.author)
      put "/activities/#{activity.id}/participants",
          params: { user_ids: [ editor.id, reader.id ] }

      expect(response).to have_http_status(:found)  # redirect
      expect(activity.activity_participants.pluck(:user_id))
        .to contain_exactly(editor.id, reader.id)
    end

    it "allows editors to replace the set" do
      login_as(editor)
      put "/activities/#{activity.id}/participants",
          params: { user_ids: [ editor.id ] }

      expect(response).to have_http_status(:found)
      expect(activity.activity_participants.pluck(:user_id)).to eq([ editor.id ])
    end

    it "forbids readers" do
      login_as(reader)
      put "/activities/#{activity.id}/participants",
          params: { user_ids: [ reader.id ] }

      expect(response).to have_http_status(:forbidden)
      expect(activity.activity_participants).to be_empty
    end

    it "silently drops user_ids that are not tour members" do
      login_as(tour.author)
      put "/activities/#{activity.id}/participants",
          params: { user_ids: [ editor.id, bystander.id ] }

      expect(response).to have_http_status(:found)
      expect(activity.activity_participants.pluck(:user_id))
        .to contain_exactly(editor.id)
    end

    it "accepts empty array (= 默认全员)" do
      ActivityParticipant.create!(activity: activity, user: editor)

      login_as(tour.author)
      put "/activities/#{activity.id}/participants",
          params: { user_ids: [] }

      expect(response).to have_http_status(:found)
      expect(activity.activity_participants).to be_empty
    end

    it "is idempotent — repeating the same payload yields the same state" do
      login_as(tour.author)
      2.times do
        put "/activities/#{activity.id}/participants",
            params: { user_ids: [ editor.id ] }
      end
      expect(activity.activity_participants.pluck(:user_id)).to eq([ editor.id ])
    end
  end
end
```

- [ ] **Step 7.3: Run spec (expect routing error)**

Run:

```
mise exec -- bundle exec rspec spec/requests/activity_participants_spec.rb
```

Expected: `ActionController::RoutingError` (no route for `PUT /activities/:id/participants`).

- [ ] **Step 7.4: Add route**

Edit `config/routes.rb`. Find the `resources :activities` block (from step 7.1) — it should look like:

```ruby
resources :activities, only: [ :create, :update, :destroy ]
```

or a variant. Change it to nest participants:

```ruby
resources :activities, only: [ :create, :update, :destroy ] do
  resource :participants, only: [ :update ], controller: :activity_participants
end
```

- [ ] **Step 7.5: Create controller**

Create `app/controllers/activity_participants_controller.rb`:

```ruby
class ActivityParticipantsController < ApplicationController
  before_action :require_login
  before_action :set_activity
  before_action :require_editable

  def update
    ids = Array(params[:user_ids]).map(&:to_i).uniq
    ids &= candidate_user_ids

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

- [ ] **Step 7.6: Run spec (expect pass)**

Run:

```
mise exec -- bundle exec rspec spec/requests/activity_participants_spec.rb
```

Expected: all 6 examples pass.

- [ ] **Step 7.7: Commit**

```bash
git add config/routes.rb app/controllers/activity_participants_controller.rb spec/requests/activity_participants_spec.rb
git commit -m "$(cat <<'EOF'
feat: ActivityParticipantsController#update — replace participant set

单 PUT 端点整份替换（和 participating_day_ids 原交互同构）；author + editor
可改（tour.editable_by?），reader 返回 403；非 tour 成员的 user_id 被白名单
过滤静默丢弃；空数组合法（回到"默认全员"状态）。

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 8: `effectiveParticipants` utility (frontend)

**Files:**
- Create: `app/javascript/lib/effectiveParticipants.js`
- Create: `app/javascript/lib/__tests__/effectiveParticipants.test.js`

- [ ] **Step 8.1: Write failing Vitest spec**

Create `app/javascript/lib/__tests__/effectiveParticipants.test.js`:

```js
import { describe, it, expect } from 'vitest'
import { effectiveParticipants } from '../effectiveParticipants'

describe('effectiveParticipants', () => {
  const author  = { user_id: 1, name: '作者' }
  const members = [
    { user_id: 2, name: '乙', role: 'editor' },
    { user_id: 3, name: '丙', role: 'reader' },
  ]

  it('returns [author, ...members] when participant_user_ids is empty', () => {
    const activity = { id: 10, participant_user_ids: [] }
    expect(effectiveParticipants(activity, { author, members })).toEqual([ 1, 2, 3 ])
  })

  it('returns [author, ...members] when participant_user_ids is undefined', () => {
    const activity = { id: 10 }
    expect(effectiveParticipants(activity, { author, members })).toEqual([ 1, 2, 3 ])
  })

  it('returns explicit participant_user_ids when non-empty', () => {
    const activity = { id: 10, participant_user_ids: [ 2 ] }
    expect(effectiveParticipants(activity, { author, members })).toEqual([ 2 ])
  })

  it('preserves order of explicit ids', () => {
    const activity = { id: 10, participant_user_ids: [ 3, 1 ] }
    expect(effectiveParticipants(activity, { author, members })).toEqual([ 3, 1 ])
  })
})
```

- [ ] **Step 8.2: Run test (expect failure — module missing)**

Run:

```
npm test -- --run app/javascript/lib/__tests__/effectiveParticipants.test.js
```

- [ ] **Step 8.3: Implement utility**

Create `app/javascript/lib/effectiveParticipants.js`:

```js
export function effectiveParticipants(activity, { author, members }) {
  const explicit = activity?.participant_user_ids || []
  if (explicit.length > 0) return explicit
  return [ author.user_id, ...members.map((m) => m.user_id) ]
}
```

- [ ] **Step 8.4: Run test (expect pass)**

Run:

```
npm test -- --run app/javascript/lib/__tests__/effectiveParticipants.test.js
```

Expected: 4 examples pass.

- [ ] **Step 8.5: Commit**

```bash
git add app/javascript/lib/effectiveParticipants.js app/javascript/lib/__tests__/effectiveParticipants.test.js
git commit -m "$(cat <<'EOF'
feat: effectiveParticipants utility — "空 = 全员"语义单源

统一 ActivityDrawer tab、ActivityCard 头像组、AddExpenseDialog
预填三处的"participant_user_ids 空数组即 [作者 + 所有成员]"约定。

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 9: ActivityDrawer — new "参与人" tab

**Files:**
- Modify: `app/javascript/components/activity-editor/ActivityDrawer.jsx` (add tab + sub-component; accept `author`, `members` props)
- Modify: `app/javascript/pages/Tour/Show.jsx:312-324` (pass new props)
- Modify: `app/javascript/components/activity-editor/__tests__/ActivityDrawer.test.jsx` (add tests; may need to update existing tests' render call)

- [ ] **Step 9.1: Extend ActivityDrawer signature to accept author + members**

Edit `app/javascript/components/activity-editor/ActivityDrawer.jsx:24`. Change:

```jsx
export default function ActivityDrawer({ tourId, opened, onClose, mode, activity, targetDayId, images, allActivities, days, routeLegs, canEdit }) {
```

to:

```jsx
export default function ActivityDrawer({ tourId, opened, onClose, mode, activity, targetDayId, images, allActivities, days, routeLegs, canEdit, author, members }) {
```

- [ ] **Step 9.2: Add `Tabs.Tab` for participants and `Tabs.Panel` rendering**

Still in `ActivityDrawer.jsx`, find the Tabs block (lines 271-310). Change:

```jsx
<Tabs.List>
  <Tabs.Tab value="basic">基础</Tabs.Tab>
  {isEdit && <Tabs.Tab value="images">图片{images?.length > 0 && ` (${images.length})`}</Tabs.Tab>}
  {isEdit && <Tabs.Tab value="route">路线</Tabs.Tab>}
</Tabs.List>
```

to:

```jsx
<Tabs.List>
  <Tabs.Tab value="basic">基础</Tabs.Tab>
  {isEdit && <Tabs.Tab value="images">图片{images?.length > 0 && ` (${images.length})`}</Tabs.Tab>}
  {isEdit && <Tabs.Tab value="route">路线</Tabs.Tab>}
  {isEdit && <Tabs.Tab value="participants">参与人</Tabs.Tab>}
</Tabs.List>
```

And after the existing `route` `Tabs.Panel` (after line 309 `</Tabs.Panel>`), add:

```jsx
{isEdit && (
  <Tabs.Panel value="participants" pt="md">
    <ParticipantsTab
      activity={activity}
      author={author}
      members={members}
      canEdit={canEdit}
    />
  </Tabs.Panel>
)}
```

- [ ] **Step 9.3: Add `ParticipantsTab` sub-component at the bottom of ActivityDrawer.jsx**

Append to the file (after the existing `ActivityDrawer` export):

```jsx
function ParticipantsTab({ activity, author, members, canEdit }) {
  const candidates = [
    { user_id: author.user_id, name: author.name, avatar_url: author.avatar_url, email: author.email, isAuthor: true },
    ...members.map((m) => ({
      user_id: m.user_id, name: m.name, avatar_url: m.avatar_url, email: m.email, isAuthor: false,
    })),
  ]
  const explicit = activity.participant_user_ids || []
  const isFullTrip = explicit.length === 0
  const selected = new Set(explicit)

  const persist = (userIdsNext) => {
    router.put(`/activities/${activity.id}/participants`, { user_ids: userIdsNext }, {
      preserveScroll: true,
      only: ['activities'],
    })
  }

  const toggle = (userId, checked) => {
    let next
    if (isFullTrip && !checked) {
      next = candidates.map((c) => c.user_id).filter((id) => id !== userId)
    } else if (!isFullTrip && checked) {
      next = [ ...selected, userId ]
    } else if (!isFullTrip && !checked) {
      next = [ ...selected ].filter((id) => id !== userId)
    } else {
      return
    }
    if (next.length === candidates.length) next = []
    persist(next)
  }

  return (
    <Stack gap="sm">
      {isFullTrip && (
        <Alert color="blue" variant="light">
          默认全员参与。取消勾选某人即切换为"仅列出成员参与"模式。
        </Alert>
      )}
      {candidates.map((c) => {
        const checked = isFullTrip || selected.has(c.user_id)
        return (
          <Checkbox
            key={c.user_id}
            checked={checked}
            disabled={!canEdit}
            onChange={(e) => toggle(c.user_id, e.currentTarget.checked)}
            label={
              <Group gap="xs" wrap="nowrap">
                <UserLabel user={c} isAuthor={c.isAuthor} size={22} fz="sm" />
              </Group>
            }
          />
        )
      })}
    </Stack>
  )
}
```

And add the new imports at the top of the file:

```jsx
import { Alert, Checkbox } from '@mantine/core'
import UserLabel from '../planner/UserLabel'
```

(If `Stack`, `Group` already imported for the outer component, don't re-import.)

- [ ] **Step 9.4: Pass `author`, `members` from Tour/Show.jsx**

Edit `app/javascript/pages/Tour/Show.jsx:312-324`. Change the `<ActivityDrawer ... />` element to include:

```jsx
<ActivityDrawer
  tourId={tour.id}
  opened={editor.open}
  onClose={closeEditor}
  mode={editor.mode}
  activity={editingActivity}
  targetDayId={editor.targetDayId}
  images={editingImages}
  allActivities={activities}
  days={days}
  routeLegs={route_legs || []}
  canEdit={canEdit}
  author={author || { user_id: tour.author_id, email: '' }}
  members={members || []}
/>
```

- [ ] **Step 9.5: Extend Inertia mock + `renderDrawer` defaults, add new tests**

Edit `app/javascript/components/activity-editor/__tests__/ActivityDrawer.test.jsx`.

First, add `put` to the existing Inertia router mock (lines 8-15 currently have only `post/patch/delete/reload`):

```jsx
vi.mock('@inertiajs/react', () => ({
  router: {
    post:   vi.fn((url, data, opts) => opts?.onSuccess?.()),
    patch:  vi.fn((url, data, opts) => opts?.onSuccess?.()),
    put:    vi.fn((url, data, opts) => opts?.onSuccess?.()),
    delete: vi.fn((url, opts) => opts?.onSuccess?.()),
    reload: vi.fn(),
  },
}))
```

And add `router.put.mockClear()` to the `beforeEach` block (lines 43-49).

Second, extend `renderDrawer` defaults (lines 52-68) to include `author` and `members`:

```jsx
function renderDrawer(props = {}) {
  const defaults = {
    tourId: 1,
    opened: true,
    onClose: vi.fn(),
    mode: 'create',
    activity: null,
    targetDayId: null,
    author:  { user_id: 1, name: '作者', email: 'a@x', avatar_url: null },
    members: [
      { user_id: 2, name: '乙', email: 'b@x', avatar_url: null, role: 'editor' },
      { user_id: 3, name: '丙', email: 'c@x', avatar_url: null, role: 'reader' },
    ],
  }
  return render(
    <MantineProvider>
      <ModalsProvider>
        <ActivityDrawer {...defaults} {...props} />
      </ModalsProvider>
    </MantineProvider>
  )
}
```

Third, append these tests at the bottom of the file:

```jsx
test('renders 参与人 tab in edit mode with default-全员 Alert + all-checked boxes', () => {
  renderDrawer({
    mode: 'edit',
    activity: { id: 42, name: 'X', kind: 'scenic', citizen_level: 'tier_three', participant_user_ids: [] },
  })
  fireEvent.click(screen.getByRole('tab', { name: '参与人' }))
  expect(screen.getByText(/默认全员参与/)).toBeInTheDocument()
  expect(screen.getAllByRole('checkbox')).toHaveLength(3)
  screen.getAllByRole('checkbox').forEach((cb) => expect(cb).toBeChecked())
})

test('unchecking a member sends "全员 minus that id" via PUT', async () => {
  const { router } = await import('@inertiajs/react')
  renderDrawer({
    mode: 'edit',
    activity: { id: 42, name: 'X', kind: 'scenic', citizen_level: 'tier_three', participant_user_ids: [] },
  })
  fireEvent.click(screen.getByRole('tab', { name: '参与人' }))
  const checkboxes = screen.getAllByRole('checkbox')
  fireEvent.click(checkboxes[2])  // uncheck 3rd = 丙 (user_id=3)
  expect(router.put).toHaveBeenCalledWith(
    '/activities/42/participants',
    { user_ids: [ 1, 2 ] },
    expect.objectContaining({ preserveScroll: true, only: [ 'activities' ] }),
  )
})

test('re-checking the last-missing user sends [] (回到全员)', async () => {
  const { router } = await import('@inertiajs/react')
  renderDrawer({
    mode: 'edit',
    activity: { id: 42, name: 'X', kind: 'scenic', citizen_level: 'tier_three', participant_user_ids: [ 1, 2 ] },
  })
  fireEvent.click(screen.getByRole('tab', { name: '参与人' }))
  const checkboxes = screen.getAllByRole('checkbox')
  fireEvent.click(checkboxes[2])  // check 丙 → now 3/3 → should send []
  expect(router.put).toHaveBeenCalledWith(
    '/activities/42/participants',
    { user_ids: [] },
    expect.any(Object),
  )
})

test('participants tab checkboxes are disabled when canEdit=false', () => {
  renderDrawer({
    mode: 'edit',
    canEdit: false,
    activity: { id: 42, name: 'X', kind: 'scenic', citizen_level: 'tier_three', participant_user_ids: [] },
  })
  fireEvent.click(screen.getByRole('tab', { name: '参与人' }))
  screen.getAllByRole('checkbox').forEach((cb) => expect(cb).toBeDisabled())
})
```

- [ ] **Step 9.6: Run frontend tests**

Run:

```
npm test -- --run app/javascript/components/activity-editor
```

If existing tests fail because of the new required props (`author`, `members`), update each test call site's render helper to include defaults for those props.

Expected: all tests pass, including the 4 new ones.

- [ ] **Step 9.7: Commit**

```bash
git add app/javascript/components/activity-editor/ActivityDrawer.jsx \
        app/javascript/components/activity-editor/__tests__/ActivityDrawer.test.jsx \
        app/javascript/pages/Tour/Show.jsx
git commit -m "$(cat <<'EOF'
feat: ActivityDrawer "参与人" tab — author/editor add/remove participants

新 tab 在 edit 模式下渲染；候选人池 = tour.author + members；每次 toggle
通过 PUT /activities/:id/participants 整份替换；默认全员状态下所有 checkbox
显示为勾选并附 Alert 提示；canEdit=false 时全部 disabled。

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 10: ActivityCard — Avatar group for explicit subset

**Files:**
- Modify: `app/javascript/components/planner/ActivityCard.jsx`
- Modify: `app/javascript/components/planner/__tests__/ActivityCard.test.jsx`

- [ ] **Step 10.1: Read existing ActivityCard to find where to inject avatars**

Run:

```
head -60 app/javascript/components/planner/ActivityCard.jsx
```

Identify where the card renders its footer/metadata row (usually near the end of the JSX). The new avatar group goes there.

- [ ] **Step 10.2: Verify ActivityCard receives `activity`, and that `members`/`author` are available**

Run:

```
grep -n "function ActivityCard\|export default" app/javascript/components/planner/ActivityCard.jsx
```

If `members`/`author` are not currently props, check the render site (DayColumn / Backlog) and add them. Otherwise reuse existing props.

- [ ] **Step 10.3: Write failing test**

Edit `app/javascript/components/planner/__tests__/ActivityCard.test.jsx`. The file already exports a `baseActivity` const and a `renderInDnd(ui)` helper wrapping `<DndContext>`. Reuse them. Append at the bottom:

```jsx
const AUTHOR  = { user_id: 1, name: '甲', avatar_url: null }
const MEMBERS = [
  { user_id: 2, name: '乙', avatar_url: null },
  { user_id: 3, name: '丙', avatar_url: null },
  { user_id: 4, name: '丁', avatar_url: null },
]

test('does not render participant avatar group when participant_user_ids is empty (默认全员)', () => {
  const { container } = renderInDnd(
    <ActivityCard
      activity={{ ...baseActivity, participant_user_ids: [] }}
      author={AUTHOR}
      members={MEMBERS}
    />
  )
  expect(container.querySelector('[data-testid="activity-participants"]')).toBeNull()
})

test('renders avatar group with overflow when 4 explicit participants', () => {
  const { container } = renderInDnd(
    <ActivityCard
      activity={{ ...baseActivity, participant_user_ids: [ 1, 2, 3, 4 ] }}
      author={AUTHOR}
      members={MEMBERS}
    />
  )
  expect(container.querySelector('[data-testid="activity-participants"]')).toBeInTheDocument()
  expect(screen.getByText('+1')).toBeInTheDocument()  // 4 explicit, 3 shown, "+1" overflow
})

test('renders avatar group without "+N" when exactly 3 explicit participants', () => {
  renderInDnd(
    <ActivityCard
      activity={{ ...baseActivity, participant_user_ids: [ 1, 2, 3 ] }}
      author={AUTHOR}
      members={MEMBERS}
    />
  )
  expect(screen.queryByText(/^\+\d+$/)).not.toBeInTheDocument()
})
```

Run to confirm failure:

```
npm test -- --run app/javascript/components/planner/__tests__/ActivityCard.test.jsx
```

- [ ] **Step 10.4: Add avatar group to ActivityCard (null-safe)**

Edit `app/javascript/components/planner/ActivityCard.jsx`. Import:

```jsx
import { Avatar, Tooltip } from '@mantine/core'
```

Accept `author` and `members` as optional props in the component signature. Add this render helper block near the top of the component body:

```jsx
const participantUserIds = activity.participant_user_ids || []
const isFullTrip = participantUserIds.length === 0
// Null-safe: existing call sites (tests, some planner contexts) may not yet
// pass author/members — render nothing rather than crash. The feature depends
// on Task 10.5 wiring the props through render sites.
const hasUserCtx = author && Array.isArray(members)
const allUsers = hasUserCtx
  ? [
      { user_id: author.user_id, name: author.name, avatar_url: author.avatar_url },
      ...members.map((m) => ({ user_id: m.user_id, name: m.name, avatar_url: m.avatar_url })),
    ]
  : []
const participantUsers = participantUserIds
  .map((id) => allUsers.find((u) => u.user_id === id))
  .filter(Boolean)
```

In the JSX (right before the card's closing `</Card>` / footer area), add:

```jsx
{hasUserCtx && !isFullTrip && participantUsers.length > 0 && (
  <Avatar.Group spacing="xs" data-testid="activity-participants">
    {participantUsers.slice(0, 3).map((u) => (
      <Tooltip key={u.user_id} label={u.name}>
        <Avatar src={u.avatar_url} size="xs" radius="xl">{(u.name || '?').slice(0, 1)}</Avatar>
      </Tooltip>
    ))}
    {participantUsers.length > 3 && (
      <Avatar size="xs" radius="xl">+{participantUsers.length - 3}</Avatar>
    )}
  </Avatar.Group>
)}
```

- [ ] **Step 10.5: Update ActivityCard render sites to pass `author` + `members`**

Run:

```
grep -rn "<ActivityCard" app/javascript/
```

Each call site needs `author={author} members={members}` added. Common call sites: `DayColumn.jsx`, `BacklogList.jsx`, `ActivityCardOverlay.jsx` (the drag overlay). Missing this makes the avatars silently not render.

- [ ] **Step 10.6: Run tests**

Run:

```
npm test -- --run app/javascript/components/planner
```

Expected: new tests pass, no existing test regressions.

- [ ] **Step 10.7: Commit**

```bash
git add app/javascript/components/planner/ActivityCard.jsx \
        app/javascript/components/planner/__tests__/ActivityCard.test.jsx \
        app/javascript/components/planner/DayColumn.jsx \
        app/javascript/components/planner/BacklogList.jsx \
        app/javascript/components/planner/ActivityCardOverlay.jsx
git commit -m "$(cat <<'EOF'
feat: ActivityCard 头像组 — 显示 activity 的显式参与人

默认全员状态下不渲染（视觉安静）；显式子集时叠放最多 3 个小头像 + "+N"
溢出指示。数据依然从 activity.participant_user_ids 派生。

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

(Adjust the `git add` list to the actual set of render sites found in step 10.5.)

---

## Task 11: AddExpenseDialog — prefill `participantIds` from activity

**Files:**
- Modify: `app/javascript/components/planner/AddExpenseDialog.jsx:137-191` (the initial-open useEffect)

- [ ] **Step 11.1: Add import for `effectiveParticipants`**

Edit `app/javascript/components/planner/AddExpenseDialog.jsx`. Near the top, add:

```jsx
import { effectiveParticipants } from '../../lib/effectiveParticipants'
```

- [ ] **Step 11.2: Replace create-mode participantIds default**

In the useEffect at line 137, in the else branch (create mode, starting at line 157), change:

```jsx
participantIds: allUsers.map((u) => u.user_id),
```

to:

```jsx
participantIds: (() => {
  const firstActivity = nonBacklogActivities[0]
  if (!firstActivity) return allUsers.map((u) => u.user_id)
  return effectiveParticipants(firstActivity, { author, members })
})(),
```

The default activity's participants pre-fill the expense form. User can still manually edit after dialog opens.

- [ ] **Step 11.3: Unit test deferred to `effectiveParticipants` + manual E2E**

No Vitest test file exists for `AddExpenseDialog` today and the dialog is 637 lines with wide dependencies (Mantine Modals/Notifications, Inertia router + usePage, file-upload state). Writing a fresh harness just to verify a one-line default replacement is disproportionate.

Coverage relies on:
1. `effectiveParticipants.test.js` (Task 8) — already proves the utility returns the right set
2. Manual E2E Task 13.10 — drive the real dialog in a browser to verify the prefill wires through

This is an explicit YAGNI choice, not a "TBD". Do NOT add a fresh dialog test harness under this plan.

- [ ] **Step 11.4: Smoke-run existing planner JS suite**

Run:

```
npm test -- --run app/javascript/components/planner
```

Expected: everything still green (no regressions from the import/effect edit).

- [ ] **Step 11.5: Commit**

```bash
git add app/javascript/components/planner/AddExpenseDialog.jsx \
        app/javascript/components/planner/__tests__/AddExpenseDialog.test.jsx
git commit -m "$(cat <<'EOF'
feat: prefill expense participants from activity on dialog open (create mode)

打开 AddExpenseDialog 创建 activity-scope expense 时，participantIds 初始化
为当前 activity 的 effective_participant_ids（空=全员）。用户切换 activity
不反向覆盖（effect 锁在 [opened, expense?.id]），保留"我手动改过就别管我"
的灵活。

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 12: Update PermissionMatrix

**Files:**
- Modify: `app/javascript/components/planner/MembershipDrawer.jsx:215-241`

- [ ] **Step 12.1: Add "改 Activity 参与人" row**

Edit the `PermissionMatrix` function in `MembershipDrawer.jsx`. Find the `<Table.Tbody>` block and insert a new row **before** "管理成员":

```jsx
<Table.Tr><Table.Td>改 Activity 参与人</Table.Td><Table.Td>{Y}</Table.Td><Table.Td>{Y}</Table.Td><Table.Td>{N}</Table.Td></Table.Tr>
```

Final table order:
1. 查看行程 (Y/Y/Y)
2. 编辑 Activity/Day (Y/Y/N)
3. **改 Activity 参与人** (Y/Y/N) — new
4. 管理成员 (Y/N/N)
5. 删除行程 (Y/N/N)

- [ ] **Step 12.2: Commit**

```bash
git add app/javascript/components/planner/MembershipDrawer.jsx
git commit -m "$(cat <<'EOF'
docs: add "改 Activity 参与人" row to permission matrix

反映 ActivityParticipantsController 的授权边界（author + editor 可改）。

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 13: CI local checks + manual E2E

The spec requires all 5 CI checks AND manual browser verification before claiming done.

- [ ] **Step 13.1: Run full Ruby suite**

Run:

```
mise exec -- bundle exec rspec
```

Expected: all green. If any spec outside this feature fails, investigate — likely an orphan reference to `participating_day_ids` that Task 1 missed.

- [ ] **Step 13.2: Run full JS suite**

Run:

```
npm test
```

Expected: all green.

- [ ] **Step 13.3: Run rubocop**

Run:

```
bin/rubocop -f github
```

Expected: no offenses. Fix any style issues inline.

- [ ] **Step 13.4: Run brakeman**

Run:

```
bin/brakeman --no-pager
```

Expected: no new warnings. ActivityParticipantsController does mass-assign user_ids but goes through explicit `Array(params[:user_ids]).map(&:to_i)` coercion + `&= candidate_user_ids` whitelist — should be clean.

- [ ] **Step 13.5: Run npm audit**

Run:

```
npm audit
```

Expected: no new high/critical vulnerabilities introduced (no new dependencies added in this plan).

- [ ] **Step 13.6: Start dev server for manual E2E**

Run (in this worktree):

```
bin/worktree-dev up
```

Note the worktree dev server URL/port printed (e.g., `http://localhost:3100`).

- [ ] **Step 13.7: Manual E2E path 1 — author flow**

In browser, logged in as a test user who is author of a tour with ≥2 members:

1. Open tour → open an activity for editing
2. Click "参与人" tab → verify Alert "默认全员参与" + all candidates shown as checked
3. Uncheck one member → verify Alert disappears; network tab shows `PUT /activities/:id/participants` with `{ user_ids: [N-1 ids] }`
4. Navigate back to planner view → verify ActivityCard shows Avatar group
5. Re-open activity → Participants tab → re-check the unchecked user → verify PUT `{ user_ids: [] }`; Alert returns; ActivityCard avatars disappear

Screenshot the 5 states via `mcp__plugin_playwright_playwright__browser_take_screenshot` or the local equivalent.

- [ ] **Step 13.8: Manual E2E path 2 — editor flow**

Switch browser session to a user who is an `editor` member (not author) of the same tour. Repeat steps 1-5 from 13.7. All should succeed identically.

- [ ] **Step 13.9: Manual E2E path 3 — reader flow**

Switch to a `reader` member. Open same activity → Participants tab → verify all checkboxes are disabled (greyed). Open DevTools console and manually fire:

```js
fetch('/activities/<id>/participants', {
  method: 'PUT',
  headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': document.querySelector('meta[name=csrf-token]').content },
  body: JSON.stringify({ user_ids: [] }),
}).then(r => console.log('status', r.status))
```

Expected: `status 403`.

- [ ] **Step 13.10: Manual E2E path 4 — expense prefill**

As author (or editor), set an activity to explicit subset (e.g., only member A). Open ExpenseDrawer → Add expense → pick scope=activity + that activity → verify the "分账参与人" section initializes with only A selected (not the full roster).

- [ ] **Step 13.11: Manual E2E path 5 — membership cascade**

1. Set a member as explicit participant on 2+ activities
2. Open MembershipDrawer → remove that member from the tour
3. Re-open each activity's Participants tab → verify the removed user no longer appears as candidate NOR in the participant list
4. Check DB (`mise exec -- bundle exec bin/rails runner 'puts ActivityParticipant.where(user_id: <removed_id>).count'`) — expect `0`

- [ ] **Step 13.12: Manual E2E path 6 — day-participation UI fully removed**

Open MembershipDrawer for any tour. Verify there is no "参与的日期" / `ParticipatingDays` row for any member. The row should be cleanly gone.

- [ ] **Step 13.13: Stop dev server**

```
bin/worktree-dev down
```

- [ ] **Step 13.14: If all green, create PR**

Follow CLAUDE.md's PR flow — push branch, `gh pr create` with a title under 70 chars and body summarizing: (1) new activity participants feature, (2) retired participating_day_ids column. Include the manual E2E screenshots as evidence.

---

## Done criteria

- [ ] All 13 tasks checked
- [ ] `bin/rubocop -f github` clean
- [ ] `mise exec -- bundle exec rspec` all green
- [ ] `npm test` all green
- [ ] `bin/brakeman --no-pager` no new warnings
- [ ] `npm audit` no new high/critical
- [ ] Manual E2E all 6 paths verified with screenshots/logs captured
