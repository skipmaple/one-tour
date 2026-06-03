require "rails_helper"

RSpec.describe Tour do
  describe "default title (blank → unique per author)" do
    let(:author) { create(:user) }
    let(:mmdd) { Date.current.strftime("%m-%d") }

    it "assigns 未命名旅程 MM-DD when title is blank" do
      t = create(:tour, author: author, title: "")
      expect(t.title).to eq("未命名旅程 #{mmdd}")
    end

    it "suffixes (2), (3) for same-author same-day collisions" do
      create(:tour, author: author, title: "")
      t2 = create(:tour, author: author, title: "")
      t3 = create(:tour, author: author, title: "")
      expect(t2.title).to eq("未命名旅程 #{mmdd} (2)")
      expect(t3.title).to eq("未命名旅程 #{mmdd} (3)")
    end

    it "reuses the first free gap after a delete" do
      create(:tour, author: author, title: "")
      t2 = create(:tour, author: author, title: "")
      create(:tour, author: author, title: "")
      t2.destroy!
      t4 = create(:tour, author: author, title: "")
      expect(t4.title).to eq("未命名旅程 #{mmdd} (2)")
    end

    it "does not overwrite a provided title" do
      t = create(:tour, author: author, title: "新疆环线")
      expect(t.title).to eq("新疆环线")
    end

    it "is scoped per author (other authors don't bump the suffix)" do
      create(:tour, author: author, title: "")
      other = create(:tour, author: create(:user), title: "")
      expect(other.title).to eq("未命名旅程 #{mmdd}")
    end

    it "re-fills a blank title on update (user clears the field before accepting)" do
      t = create(:tour, author: author, title: "新疆")
      t.update!(title: "")
      expect(t.reload.title).to eq("未命名旅程 #{mmdd}")
    end
  end

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

    it "merges defaults under user-provided partial constitution" do
      tour = create(:tour, constitution: { "max_daily_driving_minutes" => 360 })
      expect(tour.constitution["max_daily_driving_minutes"]).to eq(360)
      expect(tour.constitution["max_tier_one_per_day"]).to eq(3)
    end
  end

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
      tour.days.first.update!(buffer_day: true) # D1 seeded by callback
      create(:day, tour: tour, day_index: 2, buffer_day: false)
      create(:day, tour: tour, day_index: 3, buffer_day: true)
      expect(tour.buffer_days_count).to eq(2)
    end
  end

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

  describe "after_create_commit :seed_first_day" do
    it "creates a Day with day_index=1 automatically on tour create" do
      tour = create(:tour)
      expect(tour.days.size).to eq(1)
      expect(tour.days.first.day_index).to eq(1)
    end

    it "is idempotent: calling seed_first_day again does not duplicate D1" do
      tour = create(:tour)
      expect { tour.send(:seed_first_day) }.not_to change(Day, :count)
      expect(tour.days.size).to eq(1)
    end
  end

  describe "#member_user_ids" do
    it "returns author_id + all tour_membership user_ids" do
      tour = create(:tour)
      m1 = create(:user)
      m2 = create(:user)
      create(:tour_membership, tour: tour, user: m1, role: :editor)
      create(:tour_membership, tour: tour, user: m2, role: :reader)

      expect(tour.member_user_ids).to contain_exactly(tour.author_id, m1.id, m2.id)
    end
  end

  describe "title presence validation" do
    # The onboarding flow lets users create a tour with no title and only
    # name it during step 1. Once the user has accepted the constitution,
    # the tour is live and a real title becomes mandatory.
    it "allows a blank title while constitution_accepted is false" do
      tour = build(:tour, title: "", constitution_accepted: false)
      expect(tour).to be_valid
    end

    it "allows a blank title on a brand-new record" do
      tour = Tour.new(author: create(:user), title: "")
      expect(tour).to be_valid
    end

    it "auto-fills blank title even when constitution_accepted is true" do
      tour = create(:tour, title: "伊犁", constitution_accepted: true)
      tour.update!(title: "")
      expect(tour.reload.title).to eq("未命名旅程 #{Date.current.strftime('%m-%d')}")
      expect(tour).to be_valid
    end
  end
end
