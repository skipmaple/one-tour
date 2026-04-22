# Activity Clone Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a 克隆 button to `ActivityDetailDrawer` that creates a new Activity copying identity fields from the source, clears `planned_start_at`, inserts at `source.position + 1` within the same day/backlog, and shifts subsequent siblings — so users can re-enter the same hotel on an A→B→A itinerary without retyping.

**Architecture:** Backend adds `POST /activities/:id/clone` delegating to `Activity#clone_for_same_day!` (transactional: shift siblings → create copy → copy explicit participants). Frontend adds a button in the drawer header that `fetch`s the endpoint, reloads Inertia's `activities` prop, and pushes a delete-based undo onto the existing `undoStack`.

**Tech Stack:** Rails 7 / RSpec / FactoryBot / React / Inertia / Mantine / Vitest + Testing Library.

**Design reference:** [2026-04-22-activity-clone-design.md](../specs/2026-04-22-activity-clone-design.md)

---

## File Structure

**Backend (3 files)**
- Modify `config/routes.rb` — add `post :clone, on: :member` inside existing `resources :activities` block (line ~45)
- Modify `app/controllers/activities_controller.rb` — add `#clone` action
- Modify `app/models/activity.rb` — add `#clone_for_same_day!` instance method

**Frontend (2 files)**
- Modify `app/javascript/components/planner/ActivityDetailDrawer.jsx` — add `onClone` prop; render `[克隆]` button in `DetailHeaderSection` Group
- Modify `app/javascript/pages/Tour/Show.jsx` — add `handleCloneActivity` callback; pass as `onClone` prop

**Tests (3 files)**
- Modify `spec/models/activity_spec.rb` — new `describe "#clone_for_same_day!"` block
- Modify `spec/requests/activities_spec.rb` — new `describe "POST /activities/:id/clone"` block
- Modify `app/javascript/components/planner/__tests__/ActivityDetailDrawer.test.jsx` — extend "header meta + actions" describe block

---

## Task 1: Model — Basic Field Copy

**Files:**
- Modify: `app/models/activity.rb`
- Test: `spec/models/activity_spec.rb`

- [ ] **Step 1: Append the failing test**

Add this block at the end of `spec/models/activity_spec.rb`, immediately before the final `end` that closes `RSpec.describe Activity`:

```ruby
  describe "#clone_for_same_day!" do
    let(:tour) { create(:tour) }
    let(:day)  { create(:day, tour: tour, day_index: 2) }

    def build_source
      create(:activity,
        tour: tour,
        day: day,
        name: "万豪酒店",
        kind: :stay,
        citizen_level: :tier_one,
        lat: 29.65,
        lng: 91.13,
        address: "拉萨市城关区",
        desc: "市中心，地铁站口",
        planned_start_at: "14:00",
        planned_duration_min: 120,
        details: { "altitude" => 3650, "need_reservation" => true },
      )
    end

    it "copies name, kind, citizen_level, coords, address, desc, duration, details" do
      src = build_source
      clone = src.clone_for_same_day!

      expect(clone.name).to eq("万豪酒店")
      expect(clone.kind).to eq("stay")
      expect(clone.citizen_level).to eq("tier_one")
      expect(clone.lat).to eq(src.lat)
      expect(clone.lng).to eq(src.lng)
      expect(clone.address).to eq("拉萨市城关区")
      expect(clone.desc).to eq("市中心，地铁站口")
      expect(clone.planned_duration_min).to eq(120)
      expect(clone.details).to eq("altitude" => 3650, "need_reservation" => true)
      expect(clone.tour_id).to eq(tour.id)
      expect(clone.day_id).to eq(day.id)
    end

    it "clears planned_start_at on the clone" do
      src = build_source
      clone = src.clone_for_same_day!

      expect(clone.planned_start_at).to be_nil
      expect(src.reload.planned_start_at.strftime("%H:%M")).to eq("14:00")
    end

    it "deep_dups details so mutating the clone doesn't affect the source" do
      src = build_source
      clone = src.clone_for_same_day!

      clone.details["altitude"] = 9999
      clone.save!
      expect(src.reload.details["altitude"]).to eq(3650)
    end
  end
```

- [ ] **Step 2: Run test to verify it fails**

Run: `mise exec -- bundle exec rspec spec/models/activity_spec.rb -e "clone_for_same_day"`

Expected: FAIL with `NoMethodError: undefined method 'clone_for_same_day!'`.

- [ ] **Step 3: Write minimal implementation**

In `app/models/activity.rb`, after the `effective_participant_ids` method (around line 53, before the `private` keyword on line 54), add:

```ruby
  # Creates a sibling activity that copies identity fields from `self` and
  # inserts it at `position + 1` in the same (tour, day) scope. `planned_start_at`
  # is the only identity-like field NOT copied — the A→B→A use case (revisit the
  # same hotel later) demands a fresh time slot. Images, expenses, and
  # tour_budgets are explicitly NOT copied (instance-specific, not template
  # material). Explicit activity_participants rows ARE copied; default-全员
  # (empty rows) stays empty.
  def clone_for_same_day!
    transaction do
      tour.activities.create!(
        day_id: day_id,
        position: position + 1,
        name: name,
        kind: kind,
        citizen_level: citizen_level,
        lat: lat,
        lng: lng,
        address: address,
        desc: desc,
        planned_duration_min: planned_duration_min,
        planned_start_at: nil,
        details: details.is_a?(Hash) ? details.deep_dup : details,
      )
    end
  end
```

- [ ] **Step 4: Run test to verify it passes**

Run: `mise exec -- bundle exec rspec spec/models/activity_spec.rb -e "clone_for_same_day"`

Expected: 3 examples, 0 failures.

- [ ] **Step 5: Commit**

```bash
git add app/models/activity.rb spec/models/activity_spec.rb
git commit -m "$(cat <<'EOF'
feat(activity): clone_for_same_day! copies identity fields

Basic field copy — name, kind, citizen_level, coords, address, desc,
duration, details (deep_dup). Clears planned_start_at.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Model — Position + Sibling Shift

**Files:**
- Modify: `app/models/activity.rb`
- Test: `spec/models/activity_spec.rb`

- [ ] **Step 1: Append the failing tests**

Inside the `describe "#clone_for_same_day!"` block, before its closing `end`, add:

```ruby
    it "assigns position = source.position + 1" do
      src = create(:activity, tour: tour, day: day, position: 3)
      clone = src.clone_for_same_day!

      expect(clone.position).to eq(4)
    end

    it "shifts siblings whose position > source.position by +1 (same day)" do
      a1 = create(:activity, tour: tour, day: day, position: 1)
      src = create(:activity, tour: tour, day: day, position: 2)
      a3 = create(:activity, tour: tour, day: day, position: 3)
      a4 = create(:activity, tour: tour, day: day, position: 4)

      clone = src.clone_for_same_day!

      expect(a1.reload.position).to eq(1)  # before source, untouched
      expect(src.reload.position).to eq(2) # source itself, untouched
      expect(clone.position).to eq(3)      # inserted right after source
      expect(a3.reload.position).to eq(4)  # shifted +1
      expect(a4.reload.position).to eq(5)  # shifted +1
    end
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `mise exec -- bundle exec rspec spec/models/activity_spec.rb -e "clone_for_same_day"`

Expected: 2 failures. The "assigns position" test fails because multiple activities at the same `day_id` cause an autoincrement collision on the `sequence(:position)` factory default; the shift test fails because no shift logic exists.

- [ ] **Step 3: Extend implementation to shift siblings**

Replace the body of `clone_for_same_day!` in `app/models/activity.rb` with:

```ruby
  def clone_for_same_day!
    transaction do
      tour.activities
          .where(day_id: day_id)
          .where("position > ?", position)
          .update_all("position = position + 1")

      tour.activities.create!(
        day_id: day_id,
        position: position + 1,
        name: name,
        kind: kind,
        citizen_level: citizen_level,
        lat: lat,
        lng: lng,
        address: address,
        desc: desc,
        planned_duration_min: planned_duration_min,
        planned_start_at: nil,
        details: details.is_a?(Hash) ? details.deep_dup : details,
      )
    end
  end
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `mise exec -- bundle exec rspec spec/models/activity_spec.rb -e "clone_for_same_day"`

Expected: 5 examples, 0 failures.

- [ ] **Step 5: Commit**

```bash
git add app/models/activity.rb spec/models/activity_spec.rb
git commit -m "$(cat <<'EOF'
feat(activity): clone_for_same_day! shifts siblings and inserts at +1

Wraps in transaction. Same (tour, day) scope siblings with
position > source.position get position += 1 before insert.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Model — Scope Correctness (Other Day + Backlog)

**Files:**
- Modify: `app/models/activity.rb` (no code change expected — this task verifies existing scope)
- Test: `spec/models/activity_spec.rb`

- [ ] **Step 1: Append the failing tests**

Inside `describe "#clone_for_same_day!"`, before its closing `end`, add:

```ruby
    it "does not shift activities in OTHER days" do
      other_day = create(:day, tour: tour, day_index: 3)
      src = create(:activity, tour: tour, day: day, position: 1)
      other_a = create(:activity, tour: tour, day: other_day, position: 1)
      other_b = create(:activity, tour: tour, day: other_day, position: 2)

      src.clone_for_same_day!

      expect(other_a.reload.position).to eq(1)
      expect(other_b.reload.position).to eq(2)
    end

    it "does not shift activities in OTHER tours" do
      other_tour = create(:tour)
      src = create(:activity, tour: tour, day: day, position: 1)
      foreign = create(:activity, tour: other_tour, day: nil, position: 1)

      src.clone_for_same_day!

      expect(foreign.reload.position).to eq(1)
    end

    it "clones a backlog source (day_id nil) and shifts only backlog siblings" do
      backlog_src = create(:activity, tour: tour, day: nil, position: 1)
      backlog_after = create(:activity, tour: tour, day: nil, position: 2)
      day_act = create(:activity, tour: tour, day: day, position: 1)

      clone = backlog_src.clone_for_same_day!

      expect(clone.day_id).to be_nil
      expect(clone.position).to eq(2)
      expect(backlog_after.reload.position).to eq(3)
      expect(day_act.reload.position).to eq(1)  # day scope untouched
    end
```

- [ ] **Step 2: Run tests to verify they pass**

Run: `mise exec -- bundle exec rspec spec/models/activity_spec.rb -e "clone_for_same_day"`

Expected: 8 examples, 0 failures. (These tests should already pass from Task 2's implementation — they verify the scope is already correct. If any fail, the scope clause is wrong; fix `where(day_id: day_id).where("position > ?", position)` inside the same tour association `tour.activities`.)

- [ ] **Step 3: Commit**

```bash
git add spec/models/activity_spec.rb
git commit -m "$(cat <<'EOF'
test(activity): clone scope correctness — other days and backlog

Verifies shift is bounded to same (tour, day_id) scope and backlog
(day_id IS NULL) cloning works independently from day-scoped cloning.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Model — Participants Copy

**Files:**
- Modify: `app/models/activity.rb`
- Test: `spec/models/activity_spec.rb`

- [ ] **Step 1: Append the failing tests**

Inside `describe "#clone_for_same_day!"`, before its closing `end`, add:

```ruby
    describe "activity_participants" do
      let(:editor_user) { create(:user) }
      let(:reader_user) { create(:user) }

      before do
        create(:tour_membership, tour: tour, user: editor_user, role: :editor)
        create(:tour_membership, tour: tour, user: reader_user, role: :reader)
      end

      it "copies explicit activity_participants rows" do
        src = create(:activity, tour: tour, day: day, position: 1)
        ActivityParticipant.create!(activity: src, user: editor_user)
        ActivityParticipant.create!(activity: src, user: reader_user)

        clone = src.clone_for_same_day!

        expect(clone.activity_participants.pluck(:user_id))
          .to contain_exactly(editor_user.id, reader_user.id)
      end

      it "leaves participants empty when source has none (default-全员 preserved)" do
        src = create(:activity, tour: tour, day: day, position: 1)
        expect(src.activity_participants).to be_empty

        clone = src.clone_for_same_day!

        expect(clone.activity_participants).to be_empty
      end

      it "does NOT copy activity_images" do
        src = create(:activity, tour: tour, day: day, position: 1)
        src.activity_images.create!(position: 1)  # minimal row — no blob needed

        clone = src.clone_for_same_day!

        expect(clone.activity_images).to be_empty
      end
    end
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `mise exec -- bundle exec rspec spec/models/activity_spec.rb -e "clone_for_same_day"`

Expected: "copies explicit activity_participants rows" fails with `expected empty to contain exactly ...`. Other two should pass already.

- [ ] **Step 3: Extend implementation to copy participants**

Replace the body of `clone_for_same_day!` in `app/models/activity.rb` with:

```ruby
  def clone_for_same_day!
    transaction do
      tour.activities
          .where(day_id: day_id)
          .where("position > ?", position)
          .update_all("position = position + 1")

      new_activity = tour.activities.create!(
        day_id: day_id,
        position: position + 1,
        name: name,
        kind: kind,
        citizen_level: citizen_level,
        lat: lat,
        lng: lng,
        address: address,
        desc: desc,
        planned_duration_min: planned_duration_min,
        planned_start_at: nil,
        details: details.is_a?(Hash) ? details.deep_dup : details,
      )

      activity_participants.find_each do |ap|
        new_activity.activity_participants.create!(user_id: ap.user_id)
      end

      new_activity
    end
  end
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `mise exec -- bundle exec rspec spec/models/activity_spec.rb -e "clone_for_same_day"`

Expected: 11 examples, 0 failures.

- [ ] **Step 5: Commit**

```bash
git add app/models/activity.rb spec/models/activity_spec.rb
git commit -m "$(cat <<'EOF'
feat(activity): clone_for_same_day! copies explicit participants

Explicit activity_participants rows are copied 1:1. Default-全员
(empty rows) stays empty — preserves the "means full roster"
semantic. Images are explicitly NOT copied.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: Model — Transaction Rollback

**Files:**
- Test: `spec/models/activity_spec.rb` (no implementation change — the transaction is already in place)

- [ ] **Step 1: Append the failing test**

Inside `describe "#clone_for_same_day!"`, before its closing `end`, add:

```ruby
    it "rolls back the shift and the new activity when participant copy fails" do
      editor_user = create(:user)
      create(:tour_membership, tour: tour, user: editor_user, role: :editor)

      src = create(:activity, tour: tour, day: day, position: 1)
      ActivityParticipant.create!(activity: src, user: editor_user)
      other = create(:activity, tour: tour, day: day, position: 2)

      # Force the participant copy to fail after the main activity is inserted.
      allow_any_instance_of(ActivityParticipant).to receive(:create!).and_wrap_original do |m, *args|
        # Only intercept creates destined for a NEW activity. We detect this by
        # inspecting args — but simpler: just raise unconditionally. The test
        # only runs this method in the clone path.
        raise ActiveRecord::RecordInvalid.new(ActivityParticipant.new)
      end

      expect { src.clone_for_same_day! }.to raise_error(ActiveRecord::RecordInvalid)

      # No extra activity landed
      expect(tour.activities.reload.count).to eq(2)
      # The sibling shift was rolled back
      expect(other.reload.position).to eq(2)
    end
```

Note: the stub uses `allow_any_instance_of` because the new `ActivityParticipant` is built via `new_activity.activity_participants.create!` — the receiver isn't known until runtime.

- [ ] **Step 2: Run test to verify it passes**

Run: `mise exec -- bundle exec rspec spec/models/activity_spec.rb -e "clone_for_same_day"`

Expected: 12 examples, 0 failures. Transaction rollback should work because `clone_for_same_day!` already wraps both the shift and the creates in `transaction do ... end` (Task 2).

- [ ] **Step 3: Commit**

```bash
git add spec/models/activity_spec.rb
git commit -m "$(cat <<'EOF'
test(activity): clone_for_same_day! rolls back on participant failure

Verifies atomicity — if participant copy raises, neither the new
activity nor the sibling position shift persists.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: Route + Controller Action + Request Tests

**Files:**
- Modify: `config/routes.rb`
- Modify: `app/controllers/activities_controller.rb`
- Test: `spec/requests/activities_spec.rb`

- [ ] **Step 1: Append the failing tests**

At the end of `spec/requests/activities_spec.rb`, before the final `end` that closes `RSpec.describe "Activities"`, add:

```ruby
  describe "POST /activities/:id/clone" do
    it "editor clones and returns JSON { id, position }" do
      day = create(:day, tour: tour, day_index: 2)
      src = create(:activity, tour: tour, day: day, position: 1, name: "酒店")
      login_as(author)

      expect {
        post clone_activity_path(src), headers: { "Accept" => "application/json" }
      }.to change(Activity, :count).by(1)

      expect(response).to have_http_status(:ok)
      body = JSON.parse(response.body)
      expect(body["id"]).to be_a(Integer)
      expect(body["position"]).to eq(2)

      clone = Activity.find(body["id"])
      expect(clone.name).to eq("酒店")
      expect(clone.day_id).to eq(day.id)
    end

    it "non-editor (reader) gets 403" do
      day = create(:day, tour: tour, day_index: 2)
      src = create(:activity, tour: tour, day: day)
      reader = create(:user)
      create(:tour_membership, tour: tour, user: reader, role: :reader)
      login_as(reader)

      post clone_activity_path(src), headers: { "Accept" => "application/json" }

      expect(response).to have_http_status(:forbidden)
      expect(Activity.count).to eq(1)  # no clone created
    end

    it "unauthenticated user gets redirected to login" do
      src = create(:activity, tour: tour)

      post clone_activity_path(src)

      expect(response).to have_http_status(:found)
      expect(response.location).to include("/login")
    end

    it "returns 404 when the source activity does not exist" do
      login_as(author)

      post "/activities/99999/clone", headers: { "Accept" => "application/json" }

      expect(response).to have_http_status(:not_found)
    end
  end
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `mise exec -- bundle exec rspec spec/requests/activities_spec.rb -e "clone"`

Expected: FAIL with `NameError: undefined local variable or method 'clone_activity_path'` (or similar routing error).

- [ ] **Step 3: Add the route**

In `config/routes.rb`, modify the existing block (around line 45):

```ruby
  resources :activities, only: [ :update, :destroy ] do
    post :clone, on: :member
    resource :position, only: [ :update ], controller: :activity_positions
    resources :images, only: [ :create ], controller: :activity_images
    resource :participants, only: [ :update ], controller: :activity_participants
  end
```

- [ ] **Step 4: Add the controller action**

In `app/controllers/activities_controller.rb`, add this method after `#destroy` (around line 33) and before `private` (around line 35):

```ruby
  def clone
    source = Activity.find(params[:id])
    head :forbidden and return unless source.tour.editable_by?(current_user)
    new_activity = source.clone_for_same_day!
    render json: { id: new_activity.id, position: new_activity.position }
  end
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `mise exec -- bundle exec rspec spec/requests/activities_spec.rb -e "clone"`

Expected: 4 examples, 0 failures.

- [ ] **Step 6: Commit**

```bash
git add config/routes.rb app/controllers/activities_controller.rb spec/requests/activities_spec.rb
git commit -m "$(cat <<'EOF'
feat(activities): POST /activities/:id/clone

Editors can clone an activity in-place; readers get 403; unknown id
returns 404. Response shape matches #create: { id, position }.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: Frontend — [克隆] Button in ActivityDetailDrawer

**Files:**
- Modify: `app/javascript/components/planner/ActivityDetailDrawer.jsx`
- Test: `app/javascript/components/planner/__tests__/ActivityDetailDrawer.test.jsx`

- [ ] **Step 1: Append the failing tests**

In `app/javascript/components/planner/__tests__/ActivityDetailDrawer.test.jsx`, inside the `describe('ActivityDetailDrawer – header meta + actions', ...)` block (starts at line 98), before its closing `})`, add these tests:

```jsx
  test('canEdit=true renders [克隆] header button', () => {
    renderDrawer({ canEdit: true })
    const header = screen.getByTestId('detail-header')
    expect(within(header).getByRole('button', { name: /克隆/ })).toBeInTheDocument()
  })

  test('canEdit=false hides [克隆] header button', () => {
    renderDrawer({ canEdit: false })
    expect(screen.queryByRole('button', { name: /克隆/ })).toBeNull()
  })

  test('backlog activity (day_id null) still shows [克隆] (candidates pool is cloneable)', () => {
    renderDrawer({ canEdit: true, activity: makeActivity({ day_id: null }) })
    const header = screen.getByTestId('detail-header')
    expect(within(header).getByRole('button', { name: /克隆/ })).toBeInTheDocument()
    // And it is NOT disabled (unlike [记一笔] which is disabled in backlog)
    const btn = within(header).getByRole('button', { name: /克隆/ })
    expect(btn).not.toBeDisabled()
  })

  test('clicking [克隆] calls onClone with activity id', () => {
    const onClone = vi.fn()
    renderDrawer({ onClone })
    const header = screen.getByTestId('detail-header')
    fireEvent.click(within(header).getByRole('button', { name: /克隆/ }))
    expect(onClone).toHaveBeenCalledWith(10)
  })
```

Also extend `renderDrawer`'s defaults (line 56) to include `onClone`:

```jsx
    onEdit: vi.fn(),
    onAddExpense: vi.fn(),
    onClone: vi.fn(),
    onFocusExpense: vi.fn(),
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- app/javascript/components/planner/__tests__/ActivityDetailDrawer.test.jsx`

Expected: 4 failures with "Unable to find an accessible element with the role 'button' and name `/克隆/`".

- [ ] **Step 3: Add IconCopy import**

In `app/javascript/components/planner/ActivityDetailDrawer.jsx`, extend the icon import (line 3):

```jsx
import { IconPlus, IconPencil, IconMapPin, IconCopy } from '@tabler/icons-react'
```

- [ ] **Step 4: Extend `DetailHeaderSection` signature + render the button**

In `app/javascript/components/planner/ActivityDetailDrawer.jsx`, update the function (around line 56):

```jsx
function DetailHeaderSection({ activity, days, canEdit, onEdit, onAddExpense, onClone }) {
```

Inside the `{canEdit && (...)}` Group (around lines 68-102), add a `[克隆]` Button as the last child, immediately after the `[编辑]` Button and before the closing `</Group>`:

```jsx
            <Button
              size="xs"
              variant="subtle"
              leftSection={<IconCopy size={14} />}
              onClick={() => onClone(activity.id)}
            >
              克隆
            </Button>
```

- [ ] **Step 5: Pass `onClone` through from the top-level drawer component**

At the bottom of `app/javascript/components/planner/ActivityDetailDrawer.jsx`, update the default-exported `ActivityDetailDrawer` component signature (around line 326) to accept `onClone`:

```jsx
export default function ActivityDetailDrawer({
  opened, onClose,
  tour, days, activity, activityImages, author, members, expenses,
  canEdit,
  onEdit, onAddExpense, onClone, onFocusExpense,
}) {
```

And pass it to `DetailHeaderSection` (around line 345):

```jsx
          <DetailHeaderSection
            activity={activity}
            days={days}
            canEdit={canEdit}
            onEdit={onEdit}
            onAddExpense={onAddExpense}
            onClone={onClone}
          />
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `npm test -- app/javascript/components/planner/__tests__/ActivityDetailDrawer.test.jsx`

Expected: all existing + 4 new tests pass.

- [ ] **Step 7: Commit**

```bash
git add app/javascript/components/planner/ActivityDetailDrawer.jsx app/javascript/components/planner/__tests__/ActivityDetailDrawer.test.jsx
git commit -m "$(cat <<'EOF'
feat(planner): [克隆] button in ActivityDetailDrawer

Editor-only button next to [编辑] in the header. Fires onClone(id);
enabled for both day-scoped and backlog activities (unlike [记一笔]).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 8: Frontend — Wire `handleCloneActivity` in Show.jsx

**Files:**
- Modify: `app/javascript/pages/Tour/Show.jsx`

No new test — this mirrors the existing fetch + reload + undoStack pattern at `app/javascript/components/activity-editor/ActivityDrawer.jsx:162-190`, which already has coverage. The design doc explicitly decides not to re-test it.

- [ ] **Step 1: Add `handleCloneActivity` callback**

In `app/javascript/pages/Tour/Show.jsx`, after `openExpenseById` (around line 184), add:

```jsx
  // User clicked [克隆] inside the detail drawer → POST /activities/:id/clone,
  // reload activities prop (Inertia pushes new array → Planner re-renders with
  // the clone appearing at source.position + 1), and push a delete-based undo.
  // Mirrors the fetch+reload pattern in ActivityDrawer.jsx CREATE path.
  const handleCloneActivity = async (activityId) => {
    const src = activities.find((a) => a.id === activityId)
    if (!src) return
    try {
      const res = await fetch(`/activities/${activityId}/clone`, {
        method: 'POST',
        headers: { 'Accept': 'application/json', 'X-CSRF-Token': csrfToken() },
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const { id: newId } = await res.json()
      router.reload({ only: [ 'activities', 'violations' ] })
      undoStack.push({
        label: `克隆 ${src.name}`,
        undoFn: () => fetch(`/activities/${newId}`, {
          method: 'DELETE',
          headers: { 'Accept': 'application/json', 'X-CSRF-Token': csrfToken() },
        }).then((r) => {
          if (!r.ok) throw new Error('删除失败')
          router.reload({ only: [ 'activities', 'violations' ] })
        }),
      })
    } catch (err) {
      notifications.show({ message: `克隆失败：${err.message}`, color: 'red' })
    }
  }
```

- [ ] **Step 2: Add the `csrfToken` import**

At the top of `app/javascript/pages/Tour/Show.jsx`, after the `usePlannerLayout` import (line 28), add:

```jsx
import { csrfToken } from '../../utils/csrf'
```

- [ ] **Step 3: Pass `onClone` to the drawer**

Update the `<ActivityDetailDrawer ... />` call (around lines 421-435). Add the `onClone` prop:

```jsx
      <ActivityDetailDrawer
        opened={detailViewer.open}
        onClose={closeDetail}
        tour={tour}
        days={days}
        activity={detailViewer.activityId ? displayActivities.find((a) => a.id === detailViewer.activityId) : null}
        activityImages={activity_images || []}
        author={author || { user_id: tour.author_id, name: '', email: '', avatar_url: null }}
        members={members || []}
        expenses={expenses || []}
        canEdit={canEdit}
        onEdit={openEditFromDetail}
        onAddExpense={openAddExpenseForActivity}
        onClone={handleCloneActivity}
        onFocusExpense={openExpenseById}
      />
```

- [ ] **Step 4: Run the full frontend test suite to confirm no regressions**

Run: `npm test`

Expected: all existing tests pass.

- [ ] **Step 5: Commit**

```bash
git add app/javascript/pages/Tour/Show.jsx
git commit -m "$(cat <<'EOF'
feat(show): wire handleCloneActivity to ActivityDetailDrawer

POSTs /activities/:id/clone, reloads activities+violations, pushes
delete-based undo. Mirrors ActivityDrawer create-path pattern.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 9: Full Verification

**Files:** none — this task runs the full CI-matching suite locally per CLAUDE.md.

- [ ] **Step 1: Run Ruby tests**

Run: `mise exec -- bundle exec rspec spec/models/activity_spec.rb spec/requests/activities_spec.rb`

Expected: 0 failures. If any Ruby test elsewhere fails, it must be unrelated — investigate but don't skip.

- [ ] **Step 2: Run JS tests**

Run: `npm test`

Expected: 0 failures.

- [ ] **Step 3: Run Rubocop**

Run: `bin/rubocop -f github`

Expected: no offenses. If offenses appear, fix inline — do NOT `rubocop -a` blindly.

- [ ] **Step 4: Run Brakeman**

Run: `bin/brakeman --no-pager`

Expected: no new warnings (existing warnings on other files are fine).

- [ ] **Step 5: Run npm audit**

Run: `npm audit`

Expected: no new high/critical vulnerabilities.

- [ ] **Step 6: Manual smoke test in dev server**

Since `bin/worktree-dev` is the secondary-worktree dev server pattern (per CLAUDE.md's "Starting a dev server in a secondary worktree" gotcha), run:

```bash
bin/worktree-dev up
```

Navigate to an existing tour with an activity. Click an activity card → drawer opens → click `[克隆]` → verify:

- Drawer stays on the source activity
- A new card appears right after the source in the same day column, same name, no cover image, no start time
- `Ctrl+Z` / the undo toast removes the clone

After verification:

```bash
bin/worktree-dev down
```

- [ ] **Step 7: No commit** — this task is pure verification.

---

## Self-Review

**Spec coverage:**

| Spec requirement | Task |
|---|---|
| 落位: source.position+1 + 位移 | Task 2 |
| 候选池同规则 | Task 3 |
| 复制字段（除 planned_start_at） | Tasks 1, 4 |
| details deep_dup | Task 1 |
| Participants 复制显式、保留默认全员 | Task 4 |
| 不复制 images / expenses / tour_budgets | Task 4 (images test) |
| 名称原样 | Task 6 (request spec asserts name match) |
| Route `POST /activities/:id/clone` | Task 6 |
| `tour.editable_by?` 授权 | Task 6 (403 test) |
| `#clone_for_same_day!` 在模型层 | Tasks 1-5 |
| Drawer `[克隆]` 按钮 canEdit gate | Task 7 |
| 候选池也允许克隆 | Task 7 (backlog test) |
| Show.jsx fetch + reload + undo | Task 8 |
| Rubocop / Brakeman / npm audit 本地跑 | Task 9 |

All spec decisions have a corresponding task. No gaps.

**Placeholder scan:** No "TBD" / "TODO" / "add appropriate error handling" — all tests and implementations are concrete.

**Type consistency:** Method name `clone_for_same_day!` used consistently. Prop name `onClone` used consistently. Route helper `clone_activity_path` is the Rails convention for `post :clone, on: :member` nested under `resources :activities`.
