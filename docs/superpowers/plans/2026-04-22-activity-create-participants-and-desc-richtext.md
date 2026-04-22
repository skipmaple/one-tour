# Activity Create-time Participants + Desc Rich Text Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let users pick participants when creating a new Activity (atomic POST), replace the participants Tab with a default-collapsed inline section in the 基础 tab, collapse 类型细节 by default, and add a minimal Markdown toolbar + renderer for the `desc` field.

**Architecture:** Pull the `ActivityParticipant` upsert logic into `Activity#assign_participants!` (model) so both `ActivitiesController#create`/`#update` and the existing `ActivityParticipantsController#update` share one atomic, locked implementation. Frontend introduces three small components — `CollapsibleSection`, `MarkdownEditor`, `MarkdownView` — plus a controlled `ParticipantsSection` extracted from the old Tab. `ActivityDrawer` owns a `participantUserIds` state that rides along on every save payload.

**Tech Stack:** Rails 8 + Inertia.js + React + Mantine v9 + `@tabler/icons-react`. RSpec + Vitest. `react-markdown` + `remark-gfm` (already installed) + `remark-breaks` (new).

**Spec:** `docs/superpowers/specs/2026-04-22-activity-create-participants-and-desc-richtext-design.md`

---

## File Structure

**Ruby — modify:**
- `app/models/activity.rb` — add `DESC_MAX_BYTES` + validation; add `assign_participants!` method
- `app/controllers/activities_controller.rb` — `create` + `update` accept optional top-level `user_ids`; wrap in transaction
- `app/controllers/activity_participants_controller.rb` — `update` delegates to `Activity#assign_participants!`
- `spec/models/activity_spec.rb` — add contexts for `desc` size + `assign_participants!`
- `spec/requests/activities_spec.rb` — add cases for `user_ids` on create/update + `desc` size 422
- `spec/requests/activity_participants_spec.rb` — no behavior change; test still passes

**JS — create:**
- `app/javascript/components/activity-editor/CollapsibleSection.jsx`
- `app/javascript/components/activity-editor/MarkdownEditor.jsx`
- `app/javascript/components/activity-editor/ParticipantsSection.jsx`
- `app/javascript/components/MarkdownView.jsx`
- `app/javascript/components/activity-editor/__tests__/CollapsibleSection.test.jsx`
- `app/javascript/components/activity-editor/__tests__/MarkdownEditor.test.jsx`
- `app/javascript/components/activity-editor/__tests__/ParticipantsSection.test.jsx`
- `app/javascript/components/__tests__/MarkdownView.test.jsx`

**JS — modify:**
- `app/javascript/components/activity-editor/DetailsFields.jsx` — drop internal `<Title>"类型细节"</Title>`
- `app/javascript/components/activity-editor/CommonFields.jsx` — wrap `DetailsFields` in `CollapsibleSection`; replace `Textarea` with `MarkdownEditor`; add `ParticipantsSection` inside `CollapsibleSection`
- `app/javascript/components/activity-editor/ActivityDrawer.jsx` — add `participantUserIds` state; remove participants Tab + inner `ParticipantsTab`; merge `user_ids` into POST + PATCH payloads
- `app/javascript/components/planner/ActivityDetailDrawer.jsx` — `DetailDescSection` uses `MarkdownView`
- `app/javascript/components/activity-editor/__tests__/ActivityDrawer.test.jsx` — update for new UI + payload shape
- `package.json` — add `remark-breaks`

---

## Task 1: Add `Activity#assign_participants!` model method

Extract the controller's locking + whitelist + `delete_all` + `upsert_all` logic into the `Activity` model so both the activities controller and the participants controller can share a single atomic implementation.

**Files:**
- Modify: `app/models/activity.rb` (add method)
- Modify: `spec/models/activity_spec.rb` (add context)

- [ ] **Step 1.1: Write the failing tests**

Append to `spec/models/activity_spec.rb` (at the end, before the final `end`):

```ruby
  describe "#assign_participants!" do
    let(:author) { create(:user) }
    let(:editor) { create(:user) }
    let(:reader) { create(:user) }
    let(:bystander) { create(:user) }
    let(:tour)   { create(:tour, author: author) }
    let(:activity) { create(:activity, tour: tour) }

    before do
      create(:tour_membership, tour: tour, user: editor, role: :editor)
      create(:tour_membership, tour: tour, user: reader, role: :reader)
    end

    it "creates ActivityParticipant rows for given tour members" do
      activity.assign_participants!([ editor.id, reader.id ])
      expect(activity.activity_participants.pluck(:user_id))
        .to contain_exactly(editor.id, reader.id)
    end

    it "replaces existing participants (not additive)" do
      create(:activity_participant, activity: activity, user: editor)
      activity.assign_participants!([ reader.id ])
      expect(activity.activity_participants.pluck(:user_id)).to eq([ reader.id ])
    end

    it "clears participants when given an empty array" do
      create(:activity_participant, activity: activity, user: editor)
      activity.assign_participants!([])
      expect(activity.activity_participants).to be_empty
    end

    it "silently drops user_ids that are not tour members" do
      activity.assign_participants!([ editor.id, bystander.id ])
      expect(activity.activity_participants.pluck(:user_id)).to eq([ editor.id ])
    end

    it "deduplicates user_ids" do
      activity.assign_participants!([ editor.id, editor.id ])
      expect(activity.activity_participants.pluck(:user_id)).to eq([ editor.id ])
    end

    it "accepts nil (same as empty — clears the set)" do
      create(:activity_participant, activity: activity, user: editor)
      activity.assign_participants!(nil)
      expect(activity.activity_participants).to be_empty
    end
  end
```

- [ ] **Step 1.2: Run tests to verify they fail**

```
mise exec -- bundle exec rspec spec/models/activity_spec.rb -e "#assign_participants!"
```

Expected: FAIL with `NoMethodError: undefined method 'assign_participants!'`.

- [ ] **Step 1.3: Implement the method**

Edit `app/models/activity.rb`. Add this method **before** the `private` keyword (so it's public):

```ruby
  # Replace this activity's participant set with the given user_ids. Pass `nil`
  # or `[]` to clear (restores 默认全员 via isFullRoster convention).
  #
  # Concurrency: SELECT FOR UPDATE on the activity row serializes concurrent
  # writers on the same activity. Freshly re-reads member_user_ids inside the
  # lock to narrow the race window; ActivityParticipantsController's comment
  # has the full rationale.
  def assign_participants!(requested_user_ids)
    with_lock do
      fresh_member_ids = Tour.find(tour_id).member_user_ids
      ids = Array(requested_user_ids).map(&:to_i).uniq & fresh_member_ids

      activity_participants.delete_all
      return if ids.empty?
      now = Time.current
      rows = ids.map { |uid|
        { activity_id: id, user_id: uid, created_at: now, updated_at: now }
      }
      ActivityParticipant.upsert_all(rows, unique_by: %i[activity_id user_id])
    end
  end
```

- [ ] **Step 1.4: Run tests to verify they pass**

```
mise exec -- bundle exec rspec spec/models/activity_spec.rb -e "#assign_participants!"
```

Expected: PASS (6 examples).

- [ ] **Step 1.5: Commit**

```bash
git add app/models/activity.rb spec/models/activity_spec.rb
git commit -m "feat(activity): add assign_participants! model method

Extracts locking/whitelist/upsert logic into the model so
ActivitiesController and ActivityParticipantsController can share one
atomic implementation.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: Refactor `ActivityParticipantsController#update` to use the new method

Verify the existing endpoint still behaves identically after delegating to `Activity#assign_participants!`.

**Files:**
- Modify: `app/controllers/activity_participants_controller.rb:6-40`
- Run: `spec/requests/activity_participants_spec.rb` (unchanged — should stay green)

- [ ] **Step 2.1: Replace the `update` method**

Edit `app/controllers/activity_participants_controller.rb`. Replace the entire `update` method (lines 6-40) with:

```ruby
  def update
    @activity.assign_participants!(params[:user_ids])
    redirect_to @activity.tour
  end
```

The long concurrency comment that was inline is no longer needed here — `Activity#assign_participants!` has its own summary comment and `ActivityParticipantsController` no longer owns the logic.

- [ ] **Step 2.2: Run the participants request spec**

```
mise exec -- bundle exec rspec spec/requests/activity_participants_spec.rb
```

Expected: PASS (all existing examples still pass — behavior unchanged).

- [ ] **Step 2.3: Commit**

```bash
git add app/controllers/activity_participants_controller.rb
git commit -m "refactor(activity_participants): delegate to Activity#assign_participants!

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: `ActivitiesController#create` accepts atomic `user_ids`

Extend the create endpoint to handle participants in the same transaction as the Activity row itself.

**Files:**
- Modify: `app/controllers/activities_controller.rb:4-19`
- Modify: `spec/requests/activities_spec.rb` (add cases)

- [ ] **Step 3.1: Write failing tests**

Append to `spec/requests/activities_spec.rb`, before the final `end`:

```ruby
  describe "POST create with user_ids" do
    let(:editor)   { create(:user) }
    let(:reader)   { create(:user) }
    let(:bystander) { create(:user) }

    before do
      create(:tour_membership, tour: tour, user: editor, role: :editor)
      create(:tour_membership, tour: tour, user: reader, role: :reader)
    end

    it "assigns participants atomically when creating in a day" do
      day = create(:day, tour: tour, day_index: 1)
      login_as(author)
      post tour_day_activities_path(tour, day), params: {
        activity: { name: "午餐", kind: "food", citizen_level: "tier_two" },
        user_ids: [ editor.id, reader.id ],
      }
      a = Activity.last
      expect(a.activity_participants.pluck(:user_id)).to contain_exactly(editor.id, reader.id)
    end

    it "creates with no participants (默认全员) when user_ids is absent" do
      day = create(:day, tour: tour, day_index: 1)
      login_as(author)
      post tour_day_activities_path(tour, day), params: {
        activity: { name: "加油", kind: "fuel", citizen_level: "tier_three" },
      }
      expect(Activity.last.activity_participants).to be_empty
    end

    it "creates with no participants when user_ids is an empty array" do
      login_as(author)
      post tour_backlog_activities_path(tour), params: {
        activity: { name: "待定", kind: "scenic", citizen_level: "tier_three" },
        user_ids: [],
      }
      expect(Activity.last.activity_participants).to be_empty
    end

    it "silently drops non-member user_ids" do
      login_as(author)
      post tour_backlog_activities_path(tour), params: {
        activity: { name: "待定", kind: "scenic", citizen_level: "tier_three" },
        user_ids: [ editor.id, bystander.id ],
      }
      expect(Activity.last.activity_participants.pluck(:user_id)).to eq([ editor.id ])
    end
  end
```

- [ ] **Step 3.2: Run tests to verify they fail**

```
mise exec -- bundle exec rspec spec/requests/activities_spec.rb -e "POST create with user_ids"
```

Expected: FAIL — participants are not created (first two of the new examples pass trivially because they assert empty/absent; but the first and fourth assertions fail because user_ids is ignored).

- [ ] **Step 3.3: Update the controller**

Edit `app/controllers/activities_controller.rb`. Replace the entire `create` method (lines 4-19) with:

```ruby
  def create
    if params[:day_id]
      day = Day.find(params[:day_id])
      tour = day.tour
      head :forbidden and return unless tour.editable_by?(current_user)
      ActiveRecord::Base.transaction do
        @activity = tour.activities.create!(activity_params.merge(day: day, position: next_position(tour, day)))
        @activity.assign_participants!(params[:user_ids]) if params.key?(:user_ids)
      end
    else
      tour = Tour.find(params[:tour_id])
      head :forbidden and return unless tour.editable_by?(current_user)
      ActiveRecord::Base.transaction do
        @activity = tour.activities.create!(activity_params.merge(day: nil, position: next_position(tour, nil)))
        @activity.assign_participants!(params[:user_ids]) if params.key?(:user_ids)
      end
    end
    respond_to do |format|
      format.json { render json: { id: @activity.id, position: @activity.position } }
      format.html { redirect_to @activity.tour }
    end
  end
```

- [ ] **Step 3.4: Run tests to verify they pass**

```
mise exec -- bundle exec rspec spec/requests/activities_spec.rb
```

Expected: PASS (all original examples + 4 new ones).

- [ ] **Step 3.5: Commit**

```bash
git add app/controllers/activities_controller.rb spec/requests/activities_spec.rb
git commit -m "feat(activities): atomic create with user_ids

POST accepts optional top-level user_ids; wrapped in a transaction so
partial state (Activity without its intended participants) cannot leak.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: `ActivitiesController#update` accepts `user_ids`

Same pattern for the edit path so ActivityDrawer edit + create can share one save call.

**Files:**
- Modify: `app/controllers/activities_controller.rb:21-26`
- Modify: `spec/requests/activities_spec.rb` (add cases)

- [ ] **Step 4.1: Write failing tests**

Append to `spec/requests/activities_spec.rb`:

```ruby
  describe "PATCH update with user_ids" do
    let(:editor) { create(:user) }
    let(:reader) { create(:user) }

    before do
      create(:tour_membership, tour: tour, user: editor, role: :editor)
      create(:tour_membership, tour: tour, user: reader, role: :reader)
    end

    it "replaces participant set on update" do
      a = create(:activity, tour: tour)
      create(:activity_participant, activity: a, user: editor)
      login_as(author)
      patch activity_path(a), params: {
        activity: { name: "新名" },
        user_ids: [ reader.id ],
      }
      a.reload
      expect(a.name).to eq("新名")
      expect(a.activity_participants.pluck(:user_id)).to eq([ reader.id ])
    end

    it "leaves participants untouched when user_ids is absent" do
      a = create(:activity, tour: tour)
      create(:activity_participant, activity: a, user: editor)
      login_as(author)
      patch activity_path(a), params: {
        activity: { name: "仅改名" },
      }
      expect(a.reload.activity_participants.pluck(:user_id)).to eq([ editor.id ])
    end

    it "clears participants when user_ids is empty" do
      a = create(:activity, tour: tour)
      create(:activity_participant, activity: a, user: editor)
      login_as(author)
      patch activity_path(a), params: {
        activity: { name: a.name },
        user_ids: [],
      }
      expect(a.reload.activity_participants).to be_empty
    end
  end
```

- [ ] **Step 4.2: Run tests to verify they fail**

```
mise exec -- bundle exec rspec spec/requests/activities_spec.rb -e "PATCH update with user_ids"
```

Expected: FAIL on the replace + clear cases (currently update ignores `user_ids`).

- [ ] **Step 4.3: Update the controller**

Edit `app/controllers/activities_controller.rb`. Replace the `update` method (lines 21-26) with:

```ruby
  def update
    activity = Activity.find(params[:id])
    head :forbidden and return unless activity.tour.editable_by?(current_user)
    ActiveRecord::Base.transaction do
      activity.update!(activity_params)
      activity.assign_participants!(params[:user_ids]) if params.key?(:user_ids)
    end
    redirect_to activity.tour
  end
```

- [ ] **Step 4.4: Run tests to verify they pass**

```
mise exec -- bundle exec rspec spec/requests/activities_spec.rb
```

Expected: PASS (all).

- [ ] **Step 4.5: Commit**

```bash
git add app/controllers/activities_controller.rb spec/requests/activities_spec.rb
git commit -m "feat(activities): PATCH accepts user_ids

Lets ActivityDrawer save attrs + participants atomically on edit as well,
so the independent PUT /activities/:id/participants endpoint becomes an
optional secondary path (kept for AI tools).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 5: Add `DESC_MAX_BYTES` validation on `Activity`

Guard server-side against oversized `desc` (50 KB cap aligns with the frontend counter; ~16K CJK chars).

**Files:**
- Modify: `app/models/activity.rb:2,32`
- Modify: `spec/models/activity_spec.rb`
- Modify: `spec/requests/activities_spec.rb` (add one 422 case for completeness)

- [ ] **Step 5.1: Write failing model tests**

Append to `spec/models/activity_spec.rb` (near the other `describe "details"` blocks, before the final `end`):

```ruby
  describe "desc size validation" do
    let(:activity) { build(:activity, tour: create(:tour)) }

    it "is valid when desc is blank" do
      activity.desc = ""
      expect(activity).to be_valid
    end

    it "is valid at the byte limit" do
      activity.desc = "x" * Activity::DESC_MAX_BYTES
      expect(activity).to be_valid
    end

    it "is invalid when desc exceeds the byte limit" do
      activity.desc = "x" * (Activity::DESC_MAX_BYTES + 1)
      expect(activity).not_to be_valid
      expect(activity.errors[:desc].join).to match(/上限/)
    end

    it "counts bytes (not characters) for CJK" do
      # 中 is 3 bytes in UTF-8; 20_000 chars = 60_000 bytes > 50_000
      activity.desc = "中" * 20_000
      expect(activity).not_to be_valid
    end
  end
```

- [ ] **Step 5.2: Run tests to verify they fail**

```
mise exec -- bundle exec rspec spec/models/activity_spec.rb -e "desc size validation"
```

Expected: FAIL — `NameError: uninitialized constant Activity::DESC_MAX_BYTES`.

- [ ] **Step 5.3: Add the constant + validation**

Edit `app/models/activity.rb`. Just after `DETAILS_MAX_BYTES = 10_000` (line 2), add:

```ruby
  DESC_MAX_BYTES = 50_000
```

Find the `validate :details_size_within_limit` line (around line 33) and add immediately below it:

```ruby
  validate :desc_size_within_limit
```

Then add the private method alongside the other private validators (e.g., after `details_numeric_bounds`):

```ruby
    def desc_size_within_limit
      return if desc.blank?
      return if desc.bytesize <= DESC_MAX_BYTES
      errors.add(:desc, "备注过长（上限 #{DESC_MAX_BYTES} 字节）")
    end
```

- [ ] **Step 5.4: Run tests to verify they pass**

```
mise exec -- bundle exec rspec spec/models/activity_spec.rb
```

Expected: PASS (new + all existing).

- [ ] **Step 5.5: Add the request spec 422 case**

Append to `spec/requests/activities_spec.rb`:

```ruby
  it "PATCH rejects desc exceeding the byte limit" do
    a = create(:activity, tour: tour)
    login_as(author)
    expect {
      patch activity_path(a), params: {
        activity: { desc: "x" * (Activity::DESC_MAX_BYTES + 1) }
      }
    }.to raise_error(ActiveRecord::RecordInvalid, /备注过长/)
  end
```

Note: `activity.update!` raises on failure → request spec catches via `raise_error`. Existing specs in this file use the same pattern (cf. the 没有 explicit 422 test — controllers use `!`).

- [ ] **Step 5.6: Run the request spec**

```
mise exec -- bundle exec rspec spec/requests/activities_spec.rb
```

Expected: PASS.

- [ ] **Step 5.7: Commit**

```bash
git add app/models/activity.rb spec/models/activity_spec.rb spec/requests/activities_spec.rb
git commit -m "feat(activity): enforce 50_000-byte cap on desc

Symmetric with DETAILS_MAX_BYTES (10 KB). Counted in bytes so CJK gets a
~16K-char budget.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 6: Install `remark-breaks`

Newlines in GFM otherwise require two trailing spaces — not what Chinese users expect in a 备注 field.

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`

- [ ] **Step 6.1: Install the dependency**

```
npm install remark-breaks
```

- [ ] **Step 6.2: Verify it was added**

```
grep -n remark-breaks package.json
```

Expected: exactly one match in `dependencies`.

- [ ] **Step 6.3: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: add remark-breaks for GFM line breaks in MarkdownView

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 7: Create `CollapsibleSection` component

Generic wrapper used three times in the basic tab (备注 stays open; 类型细节 and 参与人 collapse by default).

**Files:**
- Create: `app/javascript/components/activity-editor/CollapsibleSection.jsx`
- Create: `app/javascript/components/activity-editor/__tests__/CollapsibleSection.test.jsx`

- [ ] **Step 7.1: Write the failing tests**

Create `app/javascript/components/activity-editor/__tests__/CollapsibleSection.test.jsx`:

```jsx
import { render, screen, fireEvent } from '@testing-library/react'
import { MantineProvider } from '@mantine/core'
import { describe, it, expect } from 'vitest'
import CollapsibleSection from '../CollapsibleSection'

function wrap(el) {
  return render(<MantineProvider>{el}</MantineProvider>)
}

describe('CollapsibleSection', () => {
  it('renders the title and summary', () => {
    wrap(
      <CollapsibleSection title="参与人" summary="默认全员 · 3 人">
        <div>body</div>
      </CollapsibleSection>
    )
    expect(screen.getByText('参与人')).toBeInTheDocument()
    expect(screen.getByText('默认全员 · 3 人')).toBeInTheDocument()
  })

  it('starts closed by default and hides body content from accessibility tree', () => {
    wrap(
      <CollapsibleSection title="类型细节">
        <div>hidden body</div>
      </CollapsibleSection>
    )
    const header = screen.getByRole('button')
    expect(header).toHaveAttribute('aria-expanded', 'false')
  })

  it('starts open when defaultOpen=true', () => {
    wrap(
      <CollapsibleSection title="类型细节" defaultOpen>
        <div>visible body</div>
      </CollapsibleSection>
    )
    const header = screen.getByRole('button')
    expect(header).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByText('visible body')).toBeInTheDocument()
  })

  it('toggles open/closed on header click', () => {
    wrap(
      <CollapsibleSection title="参与人">
        <div>toggle body</div>
      </CollapsibleSection>
    )
    const header = screen.getByRole('button')
    expect(header).toHaveAttribute('aria-expanded', 'false')
    fireEvent.click(header)
    expect(header).toHaveAttribute('aria-expanded', 'true')
    fireEvent.click(header)
    expect(header).toHaveAttribute('aria-expanded', 'false')
  })
})
```

- [ ] **Step 7.2: Run tests to verify they fail**

```
npm test -- CollapsibleSection
```

Expected: FAIL (module not found).

- [ ] **Step 7.3: Implement the component**

Create `app/javascript/components/activity-editor/CollapsibleSection.jsx`:

```jsx
import { useState } from 'react'
import { Collapse, Group, Text, UnstyledButton } from '@mantine/core'
import { IconChevronDown } from '@tabler/icons-react'

// Generic collapsible section used in the ActivityDrawer basic tab. Default
// state is driven by `defaultOpen` at mount; once the user clicks, local state
// wins (no re-syncing from the prop) — keeps the interaction feel local.
export default function CollapsibleSection({ title, summary, defaultOpen = false, children }) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div>
      <UnstyledButton
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        style={{ width: '100%', padding: '4px 0' }}
      >
        <Group justify="space-between" wrap="nowrap">
          <Group gap="xs" wrap="nowrap">
            <IconChevronDown
              size={16}
              style={{
                transition: 'transform 150ms',
                transform: open ? 'rotate(0deg)' : 'rotate(-90deg)',
              }}
            />
            <Text fw={500} size="sm">{title}</Text>
          </Group>
          {summary && <Text size="xs" c="dimmed">{summary}</Text>}
        </Group>
      </UnstyledButton>
      <Collapse in={open}>
        <div style={{ paddingTop: 8 }}>{children}</div>
      </Collapse>
    </div>
  )
}
```

- [ ] **Step 7.4: Run tests to verify they pass**

```
npm test -- CollapsibleSection
```

Expected: PASS (4 examples).

- [ ] **Step 7.5: Commit**

```bash
git add app/javascript/components/activity-editor/CollapsibleSection.jsx app/javascript/components/activity-editor/__tests__/CollapsibleSection.test.jsx
git commit -m "feat(activity-editor): add CollapsibleSection primitive

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 8: Create `MarkdownView` component

Safe, styled markdown renderer used by `ActivityDetailDrawer.DetailDescSection`. No `rehype-raw` — any embedded HTML is escaped.

**Files:**
- Create: `app/javascript/components/MarkdownView.jsx`
- Create: `app/javascript/components/__tests__/MarkdownView.test.jsx`

- [ ] **Step 8.1: Write the failing tests**

Create `app/javascript/components/__tests__/MarkdownView.test.jsx`:

```jsx
import { render, screen } from '@testing-library/react'
import { MantineProvider } from '@mantine/core'
import { describe, it, expect } from 'vitest'
import MarkdownView from '../MarkdownView'

function wrap(el) {
  return render(<MantineProvider>{el}</MantineProvider>)
}

describe('MarkdownView', () => {
  it('renders bold as <strong>', () => {
    wrap(<MarkdownView source="这是 **加粗** 文字" />)
    expect(screen.getByText('加粗').tagName.toLowerCase()).toBe('strong')
  })

  it('renders italic as <em>', () => {
    wrap(<MarkdownView source="这是 *斜体* 文字" />)
    expect(screen.getByText('斜体').tagName.toLowerCase()).toBe('em')
  })

  it('renders unordered list items', () => {
    const { container } = wrap(<MarkdownView source="- 一\n- 二" />)
    const lis = container.querySelectorAll('li')
    expect(lis.length).toBe(2)
    expect(lis[0].textContent).toBe('一')
    expect(lis[1].textContent).toBe('二')
  })

  it('renders links with target=_blank and rel=noopener', () => {
    wrap(<MarkdownView source="[百度](https://baidu.com)" />)
    const link = screen.getByRole('link', { name: '百度' })
    expect(link).toHaveAttribute('target', '_blank')
    expect(link).toHaveAttribute('rel', expect.stringContaining('noopener'))
  })

  it('escapes embedded HTML (XSS safe)', () => {
    const { container } = wrap(<MarkdownView source="<script>alert(1)</script>" />)
    expect(container.querySelector('script')).toBeNull()
    // The literal text should appear (escaped into the DOM, not executed)
    expect(container.textContent).toContain('<script>')
  })

  it('treats a single newline as a line break (remark-breaks)', () => {
    const { container } = wrap(<MarkdownView source="line 1\nline 2" />)
    expect(container.querySelectorAll('br').length).toBeGreaterThanOrEqual(1)
  })

  it('renders nothing for empty source', () => {
    const { container } = wrap(<MarkdownView source="" />)
    expect(container.textContent).toBe('')
  })
})
```

- [ ] **Step 8.2: Run tests to verify they fail**

```
npm test -- MarkdownView
```

Expected: FAIL (module not found).

- [ ] **Step 8.3: Implement the component**

Create `app/javascript/components/MarkdownView.jsx`:

```jsx
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import remarkBreaks from 'remark-breaks'
import { Text } from '@mantine/core'

// Safe Markdown renderer: react-markdown escapes HTML by default (no
// rehype-raw here). Used for Activity#desc and potentially similar free-text
// fields elsewhere.
const components = {
  a: ({ node, ...props }) => <a {...props} target="_blank" rel="noopener noreferrer" />,
  h1: ({ children }) => <Text fw={600} size="md" my={4}>{children}</Text>,
  h2: ({ children }) => <Text fw={600} size="sm" my={4}>{children}</Text>,
  h3: ({ children }) => <Text fw={600} size="sm" my={4}>{children}</Text>,
  p:  ({ children }) => <Text size="sm" my={2}>{children}</Text>,
  ul: ({ children }) => <Text component="ul" size="sm" my={2} pl="md">{children}</Text>,
  ol: ({ children }) => <Text component="ol" size="sm" my={2} pl="md">{children}</Text>,
  li: ({ children }) => <Text component="li" size="sm">{children}</Text>,
}

export default function MarkdownView({ source }) {
  if (!source) return null
  return (
    <ReactMarkdown
      remarkPlugins={[ remarkGfm, remarkBreaks ]}
      components={components}
    >
      {source}
    </ReactMarkdown>
  )
}
```

- [ ] **Step 8.4: Run tests to verify they pass**

```
npm test -- MarkdownView
```

Expected: PASS (7 examples).

- [ ] **Step 8.5: Commit**

```bash
git add app/javascript/components/MarkdownView.jsx app/javascript/components/__tests__/MarkdownView.test.jsx
git commit -m "feat: add MarkdownView safe renderer for desc

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 9: Create `MarkdownEditor` component

Minimal toolbar (Bold / Italic / UL / Link / H3) wrapping a Mantine `Textarea`. Operates on the native `setRangeText` so browser undo still works.

**Files:**
- Create: `app/javascript/components/activity-editor/MarkdownEditor.jsx`
- Create: `app/javascript/components/activity-editor/__tests__/MarkdownEditor.test.jsx`

- [ ] **Step 9.1: Write the failing tests**

Create `app/javascript/components/activity-editor/__tests__/MarkdownEditor.test.jsx`:

```jsx
import { render, screen, fireEvent } from '@testing-library/react'
import { MantineProvider } from '@mantine/core'
import { describe, it, expect, vi } from 'vitest'
import MarkdownEditor from '../MarkdownEditor'

function wrap(el) {
  return render(<MantineProvider>{el}</MantineProvider>)
}

// Helper: select a range in the textarea (jsdom supports setSelectionRange)
function select(textarea, start, end) {
  textarea.focus()
  textarea.setSelectionRange(start, end)
}

describe('MarkdownEditor', () => {
  it('wraps selection with ** on Bold click', () => {
    const onChange = vi.fn()
    wrap(<MarkdownEditor value="hello world" onChange={onChange} />)
    const textarea = screen.getByRole('textbox')
    select(textarea, 6, 11) // "world"
    fireEvent.click(screen.getByLabelText('粗体'))
    expect(onChange).toHaveBeenLastCalledWith('hello **world**')
  })

  it('inserts **粗体** with selection when no range is selected on Bold click', () => {
    const onChange = vi.fn()
    wrap(<MarkdownEditor value="" onChange={onChange} />)
    fireEvent.click(screen.getByLabelText('粗体'))
    expect(onChange).toHaveBeenLastCalledWith('**粗体**')
  })

  it('wraps selection with * on Italic click', () => {
    const onChange = vi.fn()
    wrap(<MarkdownEditor value="hello world" onChange={onChange} />)
    const textarea = screen.getByRole('textbox')
    select(textarea, 6, 11)
    fireEvent.click(screen.getByLabelText('斜体'))
    expect(onChange).toHaveBeenLastCalledWith('hello *world*')
  })

  it('prefixes the current line with "- " on List click', () => {
    const onChange = vi.fn()
    wrap(<MarkdownEditor value="一\n二\n三" onChange={onChange} />)
    const textarea = screen.getByRole('textbox')
    select(textarea, 2, 2) // caret at start of second line
    fireEvent.click(screen.getByLabelText('无序列表'))
    expect(onChange).toHaveBeenLastCalledWith('一\n- 二\n三')
  })

  it('prefixes every selected line with "- " when List click spans multiple lines', () => {
    const onChange = vi.fn()
    wrap(<MarkdownEditor value="一\n二\n三" onChange={onChange} />)
    const textarea = screen.getByRole('textbox')
    select(textarea, 0, 5) // covers "一\n二\n三"
    fireEvent.click(screen.getByLabelText('无序列表'))
    expect(onChange).toHaveBeenLastCalledWith('- 一\n- 二\n- 三')
  })

  it('wraps selection as [text](url) on Link click', () => {
    const onChange = vi.fn()
    wrap(<MarkdownEditor value="visit baidu now" onChange={onChange} />)
    const textarea = screen.getByRole('textbox')
    select(textarea, 6, 11) // "baidu"
    fireEvent.click(screen.getByLabelText('链接'))
    expect(onChange).toHaveBeenLastCalledWith('visit [baidu](url) now')
  })

  it('inserts [](url) template with no selection on Link click', () => {
    const onChange = vi.fn()
    wrap(<MarkdownEditor value="" onChange={onChange} />)
    fireEvent.click(screen.getByLabelText('链接'))
    expect(onChange).toHaveBeenLastCalledWith('[](url)')
  })

  it('prefixes the current line with "### " on Heading click', () => {
    const onChange = vi.fn()
    wrap(<MarkdownEditor value="标题" onChange={onChange} />)
    const textarea = screen.getByRole('textbox')
    select(textarea, 0, 0)
    fireEvent.click(screen.getByLabelText('标题'))
    expect(onChange).toHaveBeenLastCalledWith('### 标题')
  })

  it('shows a character counter with / 50000 suffix', () => {
    wrap(<MarkdownEditor value="你好" onChange={() => {}} />)
    expect(screen.getByText(/\/ 50000/)).toBeInTheDocument()
    expect(screen.getByText(/^2/)).toBeInTheDocument()
  })
})
```

- [ ] **Step 9.2: Run tests to verify they fail**

```
npm test -- MarkdownEditor
```

Expected: FAIL (module not found).

- [ ] **Step 9.3: Implement the component**

Create `app/javascript/components/activity-editor/MarkdownEditor.jsx`:

```jsx
import { useRef } from 'react'
import { ActionIcon, Group, Stack, Textarea, Text } from '@mantine/core'
import {
  IconBold, IconItalic, IconList, IconLink, IconHeading,
} from '@tabler/icons-react'

const MAX_LENGTH = 50_000

// Light-weight markdown editor: 5-button toolbar over a Mantine Textarea.
// Operations use the native `setRangeText` so the browser's built-in undo
// stack keeps working. Never introduces an editor framework.
//
// Toolbar actions:
//   Bold      — wraps selection with **; no selection → inserts **粗体** (selected)
//   Italic    — wraps selection with *;  no selection → inserts *斜体*   (selected)
//   List      — prefixes each line touched by selection with "- "
//   Link      — [selection](url); no selection → [](url) and caret between []
//   Heading   — prefixes current line with "### " (H3)
export default function MarkdownEditor({ value, onChange, maxLength = MAX_LENGTH }) {
  const ref = useRef(null)

  const apply = (fn) => {
    const ta = ref.current
    if (!ta) return
    const start = ta.selectionStart
    const end = ta.selectionEnd
    const { next, selStart, selEnd } = fn({ value: value || '', start, end })
    onChange(next)
    // Restore selection after React applies the new value in the next tick.
    requestAnimationFrame(() => {
      if (!ref.current) return
      ref.current.focus()
      ref.current.setSelectionRange(selStart, selEnd)
    })
  }

  const wrap = (marker, placeholder) => ({ value, start, end }) => {
    if (start === end) {
      const insert = `${marker}${placeholder}${marker}`
      const next = value.slice(0, start) + insert + value.slice(end)
      return { next, selStart: start + marker.length, selEnd: start + marker.length + placeholder.length }
    }
    const selected = value.slice(start, end)
    const next = value.slice(0, start) + marker + selected + marker + value.slice(end)
    return { next, selStart: start, selEnd: end + marker.length * 2 }
  }

  const prefixLines = (prefix) => ({ value, start, end }) => {
    // Expand to line boundaries.
    const lineStart = value.lastIndexOf('\n', start - 1) + 1
    const lineEnd = (() => {
      const nl = value.indexOf('\n', end)
      return nl === -1 ? value.length : nl
    })()
    const block = value.slice(lineStart, lineEnd)
    const prefixed = block.split('\n').map((ln) => prefix + ln).join('\n')
    const next = value.slice(0, lineStart) + prefixed + value.slice(lineEnd)
    const delta = prefixed.length - block.length
    return { next, selStart: start + prefix.length, selEnd: end + delta }
  }

  const insertLink = () => ({ value, start, end }) => {
    if (start === end) {
      const insert = '[](url)'
      const next = value.slice(0, start) + insert + value.slice(end)
      return { next, selStart: start + 1, selEnd: start + 1 }
    }
    const selected = value.slice(start, end)
    const insert = `[${selected}](url)`
    const next = value.slice(0, start) + insert + value.slice(end)
    const urlStart = start + selected.length + 3 // "[selected]("
    return { next, selStart: urlStart, selEnd: urlStart + 3 } // select "url"
  }

  const len = (value || '').length
  const counterColor = len > maxLength ? 'red' : len > maxLength * 0.9 ? 'orange' : 'dimmed'

  return (
    <Stack gap={4}>
      <Group gap={4} wrap="nowrap">
        <ActionIcon variant="subtle" aria-label="粗体" onClick={() => apply(wrap('**', '粗体'))}>
          <IconBold size={16} />
        </ActionIcon>
        <ActionIcon variant="subtle" aria-label="斜体" onClick={() => apply(wrap('*', '斜体'))}>
          <IconItalic size={16} />
        </ActionIcon>
        <ActionIcon variant="subtle" aria-label="无序列表" onClick={() => apply(prefixLines('- '))}>
          <IconList size={16} />
        </ActionIcon>
        <ActionIcon variant="subtle" aria-label="链接" onClick={() => apply(insertLink())}>
          <IconLink size={16} />
        </ActionIcon>
        <ActionIcon variant="subtle" aria-label="标题" onClick={() => apply(prefixLines('### '))}>
          <IconHeading size={16} />
        </ActionIcon>
      </Group>
      <Textarea
        ref={ref}
        value={value || ''}
        onChange={(e) => onChange(e.currentTarget.value)}
        autosize
        minRows={3}
        maxRows={30}
        maxLength={maxLength}
      />
      <Text size="xs" c={counterColor} ta="right">{len} / {maxLength}</Text>
    </Stack>
  )
}
```

- [ ] **Step 9.4: Run tests to verify they pass**

```
npm test -- MarkdownEditor
```

Expected: PASS (9 examples).

- [ ] **Step 9.5: Commit**

```bash
git add app/javascript/components/activity-editor/MarkdownEditor.jsx app/javascript/components/activity-editor/__tests__/MarkdownEditor.test.jsx
git commit -m "feat(activity-editor): add MarkdownEditor (toolbar + textarea)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 10: Create `ParticipantsSection` component (controlled, extracted from Tab)

A controlled version of the old `ParticipantsTab` sub-component inside `ActivityDrawer` — no router calls; just `value`/`onChange`. The old Tab's UI (checkbox list, Alert, UserLabel) is preserved.

**Files:**
- Create: `app/javascript/components/activity-editor/ParticipantsSection.jsx`
- Create: `app/javascript/components/activity-editor/__tests__/ParticipantsSection.test.jsx`

- [ ] **Step 10.1: Write the failing tests**

Create `app/javascript/components/activity-editor/__tests__/ParticipantsSection.test.jsx`:

```jsx
import { render, screen, fireEvent } from '@testing-library/react'
import { MantineProvider } from '@mantine/core'
import { describe, it, expect, vi } from 'vitest'
import ParticipantsSection from '../ParticipantsSection'

const AUTHOR = { user_id: 1, name: '作者', avatar_url: null, email: 'a@x.com' }
const MEMBERS = [
  { user_id: 2, name: '甲', avatar_url: null, email: 'b@x.com' },
  { user_id: 3, name: '乙', avatar_url: null, email: 'c@x.com' },
]

function wrap(el) {
  return render(<MantineProvider>{el}</MantineProvider>)
}

describe('ParticipantsSection', () => {
  it('shows 默认全员 alert and all checkboxes checked when value=null', () => {
    wrap(
      <ParticipantsSection author={AUTHOR} members={MEMBERS} canEdit value={null} onChange={() => {}} />
    )
    expect(screen.getByText(/默认全员/)).toBeInTheDocument()
    const boxes = screen.getAllByRole('checkbox')
    expect(boxes).toHaveLength(3)
    boxes.forEach((b) => expect(b).toBeChecked())
  })

  it('unchecks the clicked user and calls onChange with explicit list (not null)', () => {
    const onChange = vi.fn()
    wrap(
      <ParticipantsSection author={AUTHOR} members={MEMBERS} canEdit value={null} onChange={onChange} />
    )
    // Uncheck "甲" (user 2)
    fireEvent.click(screen.getByLabelText(/甲/))
    expect(onChange).toHaveBeenCalledWith([ 1, 3 ])
  })

  it('checks the clicked user and calls onChange with null when that makes everyone selected', () => {
    const onChange = vi.fn()
    wrap(
      <ParticipantsSection
        author={AUTHOR} members={MEMBERS} canEdit
        value={[ 1, 2 ]}
        onChange={onChange}
      />
    )
    // Check "乙" (user 3) → all three checked → normalize to null
    fireEvent.click(screen.getByLabelText(/乙/))
    expect(onChange).toHaveBeenCalledWith(null)
  })

  it('passes null when unchecking results in empty selection', () => {
    const onChange = vi.fn()
    wrap(
      <ParticipantsSection
        author={AUTHOR} members={MEMBERS} canEdit
        value={[ 2 ]}
        onChange={onChange}
      />
    )
    fireEvent.click(screen.getByLabelText(/甲/)) // uncheck user 2
    expect(onChange).toHaveBeenCalledWith(null)
  })

  it('disables checkboxes when canEdit=false', () => {
    wrap(
      <ParticipantsSection author={AUTHOR} members={MEMBERS} canEdit={false} value={null} onChange={() => {}} />
    )
    screen.getAllByRole('checkbox').forEach((b) => expect(b).toBeDisabled())
  })
})
```

- [ ] **Step 10.2: Run tests to verify they fail**

```
npm test -- ParticipantsSection
```

Expected: FAIL (module not found).

- [ ] **Step 10.3: Implement the component**

Create `app/javascript/components/activity-editor/ParticipantsSection.jsx`:

```jsx
import { Alert, Checkbox, Group, Stack } from '@mantine/core'
import UserLabel from '../planner/UserLabel'

// Controlled participant picker. Shared between create + edit flows in
// ActivityDrawer (rendered inside a CollapsibleSection in the basic tab).
//
// value semantics:
//   null       = 默认全员 (no explicit set; server stores 0 AP rows)
//   number[]   = explicit subset
//
// onChange always emits the normalized form: an explicit list that would
// include every candidate collapses back to `null`, and an empty list
// collapses to `null` (保底回落 — we never emit "no one participates").
export default function ParticipantsSection({ author, members, canEdit, value, onChange }) {
  const candidates = [
    { user_id: author.user_id, name: author.name, avatar_url: author.avatar_url, email: author.email, isAuthor: true },
    ...members.map((m) => ({
      user_id: m.user_id, name: m.name, avatar_url: m.avatar_url, email: m.email, isAuthor: false,
    })),
  ]
  const allIds = candidates.map((c) => c.user_id)
  const isFullTrip = value === null
  const selected = new Set(isFullTrip ? allIds : value)

  const normalize = (ids) => {
    if (ids.length === 0) return null
    if (ids.length === allIds.length) return null
    return ids
  }

  const toggle = (userId, checked) => {
    const base = isFullTrip ? allIds : value
    const next = checked
      ? [ ...base, userId ]
      : base.filter((id) => id !== userId)
    onChange(normalize(next))
  }

  return (
    <Stack gap="sm">
      {isFullTrip && (
        <Alert color="blue" variant="light">
          默认全员参与。取消勾选某人即切换为"仅列出成员参与"模式。
        </Alert>
      )}
      {candidates.map((c) => {
        const checked = selected.has(c.user_id)
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

- [ ] **Step 10.4: Run tests to verify they pass**

```
npm test -- ParticipantsSection
```

Expected: PASS (5 examples).

- [ ] **Step 10.5: Commit**

```bash
git add app/javascript/components/activity-editor/ParticipantsSection.jsx app/javascript/components/activity-editor/__tests__/ParticipantsSection.test.jsx
git commit -m "feat(activity-editor): add controlled ParticipantsSection

Extracts the participant-picker UI from ActivityDrawer's internal
ParticipantsTab so it can be reused inline in the basic tab.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 11: Drop the internal `<Title>"类型细节"</Title>` from `DetailsFields`

The title is about to move to the `CollapsibleSection` header in Task 12 — remove the internal one so we don't render it twice.

**Files:**
- Modify: `app/javascript/components/activity-editor/DetailsFields.jsx:1,92-94`

- [ ] **Step 11.1: Edit DetailsFields**

In `app/javascript/components/activity-editor/DetailsFields.jsx`:

Change the import line (line 1):

```jsx
import { TextInput, NumberInput, Checkbox, Select, Autocomplete, Group, Stack } from '@mantine/core'
```

(i.e., drop `Title`)

Then remove the `<Title order={6} c="dimmed">类型细节</Title>` line (currently line 94).

- [ ] **Step 11.2: Run existing tests to verify no regression**

```
npm test -- DetailsFields
```

Expected: PASS (existing examples).

- [ ] **Step 11.3: Commit**

```bash
git add app/javascript/components/activity-editor/DetailsFields.jsx
git commit -m "refactor(details-fields): drop internal '类型细节' title

Will be surfaced by the CollapsibleSection header in CommonFields.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 12: Wrap `DetailsFields` and the 备注/参与人 sections in `CommonFields`

Integrate all three new pieces into `CommonFields`. This is one commit because the sections need to render together for the layout to make sense.

**Files:**
- Modify: `app/javascript/components/activity-editor/CommonFields.jsx` (full rewrite of body; signature changes)

- [ ] **Step 12.1: Rewrite CommonFields**

Replace the entire contents of `app/javascript/components/activity-editor/CommonFields.jsx` with:

```jsx
import { TextInput, Select, Radio, Group, SimpleGrid, Stack, Text, NumberInput, Divider } from '@mantine/core'
import { TimeInput } from '@mantine/dates'
import { KIND_OPTIONS, CITIZEN_LEVEL_OPTIONS, DURATION_PRESET_CHIPS, KIND_SCHEMA } from './detailsSchema'
import PoiSearchCombobox from './PoiSearchCombobox'
import PresetChips from './PresetChips'
import DetailsFields from './DetailsFields'
import CollapsibleSection from './CollapsibleSection'
import MarkdownEditor from './MarkdownEditor'
import ParticipantsSection from './ParticipantsSection'

function countFilledDetails(kind, details) {
  const schema = KIND_SCHEMA[kind] || []
  return schema.reduce((n, f) => {
    const v = details?.[f.key]
    if (v == null || v === '' || v === false) return n
    return n + 1
  }, 0)
}

function participantSummary(value, memberCount) {
  if (value === null) return `默认全员 · ${memberCount} 人`
  return `${value.length} / ${memberCount} 人`
}

export default function CommonFields({
  form, onPoiPick, kind, details, onDetailsChange,
  author, members, canEdit,
  participantUserIds, onParticipantsChange,
}) {
  const filledCount = countFilledDetails(kind, details)
  const totalMembers = 1 + (members?.length || 0)
  const hasExplicitParticipants = Array.isArray(participantUserIds)

  return (
    <Stack gap="md">
      {/* 段 1：位置 */}
      <Divider label="位置" labelPosition="left" />
      <PoiSearchCombobox onPick={onPoiPick} />
      <TextInput
        label="名称"
        required
        maxLength={80}
        {...form.getInputProps('name')}
      />
      {form.values.address && (
        <Text size="xs" c="dimmed">地址：{form.values.address}</Text>
      )}

      {/* 段 2：分类与时间 */}
      <Divider label="分类与时间" labelPosition="left" />
      <Select
        label="类型"
        data={KIND_OPTIONS}
        allowDeselect={false}
        {...form.getInputProps('kind')}
      />
      <Radio.Group label="公民等级" {...form.getInputProps('citizen_level')}>
        <SimpleGrid cols={2} spacing="xs" mt={4}>
          {CITIZEN_LEVEL_OPTIONS.map(o => (
            <Radio key={o.value} value={o.value} label={o.label} />
          ))}
        </SimpleGrid>
      </Radio.Group>
      <Group grow align="flex-end">
        <TimeInput
          label="开始时间"
          {...form.getInputProps('planned_start_at')}
        />
        <Stack gap={0} data-testid="duration-field">
          <NumberInput
            label="时长"
            min={0}
            value={form.values.planned_duration_min === '' ? '' : Number(form.values.planned_duration_min)}
            onChange={v => form.setFieldValue('planned_duration_min', v === '' ? '' : v)}
            rightSection={<span style={{ fontSize: 12, color: 'var(--mantine-color-gray-6)', paddingRight: 8 }}>分钟</span>}
            rightSectionWidth={46}
          />
          <PresetChips
            values={DURATION_PRESET_CHIPS}
            onPick={v => form.setFieldValue('planned_duration_min', v)}
            ariaLabelPrefix="时长"
          />
        </Stack>
      </Group>

      {/* 段 3：备注（保持展开） */}
      <Divider label="备注" labelPosition="left" />
      <MarkdownEditor
        value={form.values.desc}
        onChange={(v) => form.setFieldValue('desc', v)}
      />

      {/* 段 4：类型细节（默认折叠；有值则展开） */}
      <CollapsibleSection
        title="类型细节"
        summary={filledCount > 0 ? `${filledCount} 项已填` : '未填写'}
        defaultOpen={filledCount > 0}
      >
        <DetailsFields kind={kind} details={details} onChange={onDetailsChange} />
      </CollapsibleSection>

      {/* 段 5：参与人（默认折叠；edit 模式下有显式名单则展开） */}
      <CollapsibleSection
        title="参与人"
        summary={participantSummary(participantUserIds, totalMembers)}
        defaultOpen={hasExplicitParticipants}
      >
        <ParticipantsSection
          author={author}
          members={members}
          canEdit={canEdit}
          value={participantUserIds}
          onChange={onParticipantsChange}
        />
      </CollapsibleSection>
    </Stack>
  )
}
```

- [ ] **Step 12.2: Verify no test regresses (some may still fail because ActivityDrawer still passes the old props — Task 13 fixes that)**

```
npm test -- CommonFields
```

Expected: PASS for any direct CommonFields tests, or no CommonFields test file (then skip). ActivityDrawer tests will break temporarily — they're fixed in Task 13.

- [ ] **Step 12.3: Commit (even if ActivityDrawer tests are red — Task 13 closes the loop)**

```bash
git add app/javascript/components/activity-editor/CommonFields.jsx
git commit -m "refactor(common-fields): wrap details/desc/participants in new primitives

Uses MarkdownEditor for desc, CollapsibleSection for 类型细节 and 参与人.
ActivityDrawer updates follow in the next commit.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 13: Update `ActivityDrawer` — state, payload, remove Tab

Wires `participantUserIds` through `CommonFields`, removes the old Tab + inner `ParticipantsTab`, and merges `user_ids` into both POST and PATCH payloads.

**Files:**
- Modify: `app/javascript/components/activity-editor/ActivityDrawer.jsx` (multiple edits)
- Modify: `app/javascript/components/activity-editor/__tests__/ActivityDrawer.test.jsx`

- [ ] **Step 13.1: Rewrite ActivityDrawer (focused edits)**

Open `app/javascript/components/activity-editor/ActivityDrawer.jsx` and apply these changes:

1. **Drop the `Alert`, `Checkbox` imports** (they moved to `ParticipantsSection` / `CollapsibleSection`). Drop `UserLabel` import too. Drop `isFullRoster` import.
   Keep everything else in the existing import block.

   Replace:
   ```jsx
   import { Alert, Checkbox, Drawer, Button, Group, Stack, Tabs } from '@mantine/core'
   ```
   with:
   ```jsx
   import { Drawer, Button, Group, Stack, Tabs } from '@mantine/core'
   ```

   Remove these two lines entirely:
   ```jsx
   import UserLabel from '../planner/UserLabel'
   import { isFullRoster } from '../../lib/effectiveParticipants'
   ```

2. **Add `useState` for participants** right after the `undoStack` line:

   ```jsx
     const [participantUserIds, setParticipantUserIds] = useState(null)
   ```

3. **Initialize it in the existing `useEffect`**. Replace the whole `useEffect` body (approx lines 53-77) with:

   ```jsx
     useEffect(() => {
       if (opened && isEdit && activity) {
         form.setValues({
           name: activity.name || '',
           kind: activity.kind || 'scenic',
           citizen_level: activity.citizen_level || 'tier_three',
           lat: activity.lat ?? '',
           lng: activity.lng ?? '',
           address: activity.address || '',
           planned_start_at: activity.planned_start_at || '',
           planned_duration_min: activity.planned_duration_min ?? '',
           desc: activity.desc || '',
         })
         setDetails(activity.details || {})
         const ids = activity.participant_user_ids
         setParticipantUserIds(Array.isArray(ids) && ids.length > 0 ? ids : null)
         form.resetDirty()
         poiFilledName.current = ''
       }
       if (opened && !isEdit) {
         form.setValues(EMPTY_FORM_VALUES)
         form.resetDirty()
         setDetails({})
         setParticipantUserIds(null)
         poiFilledName.current = ''
       }
       if (opened) setActiveTab('basic')
     }, [opened, isEdit, activity?.id]) // eslint-disable-line react-hooks/exhaustive-deps
   ```

4. **Extend the save payload** — in `handleSave`, locate `const payload = { activity: { ... } }` and replace with:

   ```jsx
       const payload = {
         activity: {
           ...form.values,
           planned_duration_min: form.values.planned_duration_min === '' ? null : Number(form.values.planned_duration_min),
           lat: form.values.lat === '' ? null : Number(form.values.lat),
           lng: form.values.lng === '' ? null : Number(form.values.lng),
           details: cleanDetails,
         },
         user_ids: participantUserIds ?? [],
       }
   ```

5. **Remove the participants Tab and its panel**. Delete:
   - The `<Tabs.Tab value="participants">参与人</Tabs.Tab>` line
   - The entire `{isEdit && (<Tabs.Panel value="participants">...</Tabs.Panel>)}` block
   (approx lines 278 and 315-322 in the current file)

6. **Remove the `function ParticipantsTab(...)` definition** at the bottom of the file (lines 349-408).

7. **Pass the new props to `CommonFields`**. Replace the existing `<CommonFields ... />` call with:

   ```jsx
             <CommonFields
               form={formWithKindHook}
               onPoiPick={handlePoiPick}
               kind={form.values.kind}
               details={details}
               onDetailsChange={setDetails}
               author={author}
               members={members}
               canEdit={canEdit}
               participantUserIds={participantUserIds}
               onParticipantsChange={setParticipantUserIds}
             />
   ```

- [ ] **Step 13.2: Update ActivityDrawer.test.jsx**

Open `app/javascript/components/activity-editor/__tests__/ActivityDrawer.test.jsx`.

**Change A — add `canEdit` to `renderDrawer` defaults** (so collapsible + checkbox enable).

Locate the `defaults` object inside `renderDrawer` (currently sets `tourId`, `opened`, `onClose`, `mode`, `activity`, `targetDayId`, `author`, `members`). Add:

```jsx
    canEdit: true,
```

**Change B — delete any test block that asserted `router.put` was called by the participants Tab** (search for `router.put` / `/participants` / `getByRole('tab', { name: /参与人/ })`). These tests described behavior that no longer exists; they are not migrated 1:1 — the replacement is the two new payload-level tests below.

**Change C — add two new tests** near the bottom of the file (before the closing `})` if wrapped in a `describe`, or at top-level otherwise):

```jsx
test('create payload includes user_ids=[] when participants are untouched (默认全员)', async () => {
  global.fetch.mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ id: 999, position: 1 }) })
  renderDrawer({ targetDayId: 10 })
  fireEvent.change(screen.getByLabelText('名称', { exact: false }), { target: { value: '午餐' } })
  fireEvent.click(screen.getByRole('button', { name: '保存' }))
  await waitFor(() => expect(global.fetch).toHaveBeenCalled())
  const [, opts] = global.fetch.mock.calls[0]
  const body = JSON.parse(opts.body)
  expect(body.user_ids).toEqual([])
})

test('create payload carries explicit user_ids after unchecking a member', async () => {
  global.fetch.mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ id: 999, position: 1 }) })
  renderDrawer({ targetDayId: 10 })
  fireEvent.change(screen.getByLabelText('名称', { exact: false }), { target: { value: '午餐' } })
  // Open 参与人 collapsible — its header is a button with that accessible name.
  fireEvent.click(screen.getByRole('button', { name: /参与人/ }))
  // Uncheck "乙" (user 2 from the fixture).
  fireEvent.click(screen.getByLabelText(/乙/))
  fireEvent.click(screen.getByRole('button', { name: '保存' }))
  await waitFor(() => expect(global.fetch).toHaveBeenCalled())
  const [, opts] = global.fetch.mock.calls[0]
  const body = JSON.parse(opts.body)
  // All three candidates minus 乙 → [1, 3]. ParticipantsSection emits explicit
  // list (not null) because not everyone is selected.
  expect(body.user_ids).toEqual(expect.arrayContaining([ 1, 3 ]))
  expect(body.user_ids).toHaveLength(2)
})

test('edit payload preserves existing explicit participant_user_ids', async () => {
  const { router } = await import('@inertiajs/react')
  renderDrawer({
    mode: 'edit',
    activity: {
      id: 42, name: '赛里木湖', kind: 'scenic', citizen_level: 'tier_one',
      day_id: 5, details: {}, participant_user_ids: [ 1, 2 ],
    },
  })
  fireEvent.click(screen.getByRole('button', { name: '保存' }))
  await waitFor(() => expect(router.patch).toHaveBeenCalled())
  const [, data] = router.patch.mock.calls[0]
  expect(data.user_ids).toEqual([ 1, 2 ])
})
```

**Change D — update any pre-existing test that asserts on the participants Tab existing**. Replace assertions like:

```jsx
expect(screen.getByRole('tab', { name: /参与人/ })).toBeInTheDocument()
```

with:

```jsx
expect(screen.getByRole('button', { name: /参与人/ })).toBeInTheDocument()
```

Verify the following tabs remain: `基础`, `图片`, `路线`. No `参与人` tab.

- [ ] **Step 13.3: Run the tests**

```
npm test -- ActivityDrawer
```

Expected: PASS.

- [ ] **Step 13.4: Commit**

```bash
git add app/javascript/components/activity-editor/ActivityDrawer.jsx app/javascript/components/activity-editor/__tests__/ActivityDrawer.test.jsx
git commit -m "feat(activity-drawer): inline participants, drop Tab, atomic save

Replaces the dedicated 参与人 Tab with an inline CollapsibleSection in the
basic tab. Save payload carries user_ids; backend handles it atomically for
both create and update.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 14: Render `desc` as Markdown in `ActivityDetailDrawer`

Swap the `<Text whiteSpace="pre-wrap">` for `<MarkdownView>`.

**Files:**
- Modify: `app/javascript/components/planner/ActivityDetailDrawer.jsx:1-10,166-179`

- [ ] **Step 14.1: Add the import**

Near the top of `app/javascript/components/planner/ActivityDetailDrawer.jsx`, add after the existing imports:

```jsx
import MarkdownView from '../MarkdownView'
```

- [ ] **Step 14.2: Replace the rendering**

Replace the entire `DetailDescSection` body (lines 166-179) with:

```jsx
function DetailDescSection({ activity }) {
  if (!activity.desc) return null
  return (
    <>
      <Divider />
      <Stack gap={6}>
        <Text size="xs" c="dimmed">介绍</Text>
        <div data-testid="detail-desc">
          <MarkdownView source={activity.desc} />
        </div>
      </Stack>
    </>
  )
}
```

- [ ] **Step 14.3: Run the tests**

```
npm test -- ActivityDetailDrawer
```

Expected: PASS (the existing test that probes `data-testid="detail-desc"` should still find the node; any assertion on `whiteSpace: pre-wrap` needs dropping).

If a test asserts the raw text via `.textContent`, that still works — MarkdownView preserves the plain-text content.

- [ ] **Step 14.4: Commit**

```bash
git add app/javascript/components/planner/ActivityDetailDrawer.jsx
git commit -m "feat(activity-detail): render desc via MarkdownView

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 15: Full verification

Run every gate CI runs plus the full test suites.

- [ ] **Step 15.1: Ruby tests**

```
mise exec -- bundle exec rspec
```

Expected: all green.

- [ ] **Step 15.2: JS tests**

```
npm test
```

Expected: all green.

- [ ] **Step 15.3: Rubocop**

```
bin/rubocop -f github
```

Expected: no offenses (matches CI format).

- [ ] **Step 15.4: Brakeman**

```
bin/brakeman --no-pager
```

Expected: "No warnings found".

- [ ] **Step 15.5: npm audit**

```
npm audit
```

Expected: 0 high / critical vulnerabilities. If `remark-breaks` surfaces any, investigate; otherwise proceed.

- [ ] **Step 15.6: Manual UI verification**

Start an isolated dev server for this worktree:

```
bin/worktree-dev up
```

Then in the browser (URL printed by the script):

1. Create a new backlog activity → the "参与人" collapsible shows "默认全员 · N 人" and is closed by default. Click 保存.
2. Open the new activity's detail drawer → participants section shows "默认全员 · N 人".
3. Create another activity, open 参与人 collapsible, uncheck one member → summary updates to "(N-1) / N 人" → 保存 → detail drawer shows explicit list.
4. Open existing activity in edit mode with 类型细节 values present → 类型细节 is open by default; 参与人 is closed unless explicit list exists.
5. In 备注 → type `**粗体**`, click the Bold button with another selection, add a list; 保存; open detail drawer → formatting renders.
6. Paste or type HTML like `<script>alert(1)</script>` into 备注 → 保存 → detail drawer shows the literal text (escaped, no alert).
7. Stress test: paste >50 KB into 备注 → counter turns red; 保存 → server returns error; no partial state.

Run `bin/worktree-dev down` when finished.

- [ ] **Step 15.7: Final commit (if any touch-ups)**

If any lint/test fixes were needed, commit them now with a descriptive message. Otherwise skip.

---

## Summary of deliverables

- New backend method `Activity#assign_participants!` used by both activities + activity_participants controllers
- Atomic participant writes on `POST /activities` and `PATCH /activities/:id`
- `Activity` enforces 50 KB `desc` cap
- Three new FE primitives: `CollapsibleSection`, `MarkdownEditor`, `MarkdownView`
- Extracted `ParticipantsSection` (controlled variant of the retired Tab)
- `ActivityDrawer` unified save path; no more standalone PUT from the UI (endpoint retained for AI tools)
- `ActivityDetailDrawer` renders markdown safely (no HTML passthrough)
