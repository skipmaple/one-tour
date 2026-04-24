require "rails_helper"

RSpec.describe Activity do
  describe "#as_json" do
    let(:tour) { create(:tour) }

    it "formats planned_start_at as HH:MM string" do
      activity = create(:activity, tour: tour, planned_start_at: "14:30")
      expect(activity.as_json["planned_start_at"]).to eq("14:30")
    end

    it "leaves planned_start_at nil when unset" do
      activity = create(:activity, tour: tour, planned_start_at: nil)
      expect(activity.as_json["planned_start_at"]).to be_nil
    end

    it "zero-pads hours and minutes" do
      activity = create(:activity, tour: tour, planned_start_at: "09:05")
      expect(activity.as_json["planned_start_at"]).to eq("09:05")
    end

    it "honors :only option without forcing planned_start_at to appear" do
      activity = create(:activity, tour: tour, planned_start_at: "10:00", name: "X")
      expect(activity.as_json(only: [ :name ])).to eq("name" => "X")
    end
  end

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
      day = create(:day, tour: tour, day_index: 2)
      activity = create(:activity, tour: tour, day: day)
      expect(activity.day).to eq(day)
    end
  end

  describe "validations" do
    it "requires name" do
      activity = build(:activity, name: nil)
      expect(activity).not_to be_valid
    end

    it "rejects non-hash details" do
      activity = build(:activity, details: [ "not", "a", "hash" ])
      expect(activity).not_to be_valid
      expect(activity.errors[:details]).to include("must be a JSON object")
    end

    it "accepts nil or empty details" do
      expect(build(:activity, details: nil)).to be_valid
      expect(build(:activity, details: {})).to be_valid
    end

    it "rejects details larger than DETAILS_MAX_BYTES" do
      huge = { "notes" => "x" * (Activity::DETAILS_MAX_BYTES + 100) }
      activity = build(:activity, details: huge)
      expect(activity).not_to be_valid
      expect(activity.errors[:details].first).to match(/too large/)
    end

    describe "details numeric bounds (defense-in-depth vs. UI)" do
      it "accepts altitude within 0..9000" do
        expect(build(:activity, details: { "altitude" => 0 })).to be_valid
        expect(build(:activity, details: { "altitude" => 5000 })).to be_valid
        expect(build(:activity, details: { "altitude" => 9000 })).to be_valid
      end

      it "rejects altitude > 9000" do
        activity = build(:activity, details: { "altitude" => 10000 })
        expect(activity).not_to be_valid
        expect(activity.errors[:details]).to include(match(/altitude/)).and include(match(/9000/))
      end

      it "rejects negative numeric detail fields" do
        %w[altitude recommend_stay_min ticket_info price_pp km drive_min next_station_km].each do |key|
          activity = build(:activity, details: { key => -1 })
          expect(activity).not_to be_valid, "expected #{key}=-1 to be invalid"
          expect(activity.errors[:details]).to include(match(/#{key}.*负数/))
        end
      end

      it "rejects non-numeric values for numeric fields" do
        activity = build(:activity, details: { "altitude" => "高" })
        expect(activity).not_to be_valid
        expect(activity.errors[:details]).to include(match(/altitude.*必须为数字/))
      end

      it "allows nil and missing numeric keys" do
        expect(build(:activity, details: {})).to be_valid
        expect(build(:activity, details: { "altitude" => nil })).to be_valid
        expect(build(:activity, details: { "notes" => "自由文本" })).to be_valid
      end

      it "accepts valid combinations across multiple numeric fields" do
        activity = build(:activity, details: {
          "altitude" => 3000,
          "price_pp" => 120,
          "km" => 350,
          "drive_min" => 240,
          "recommend_stay_min" => 60
        })
        expect(activity).to be_valid
      end
    end
  end

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

    it "does not issue a SQL query when activity_participants is preloaded" do
      ActivityParticipant.create!(activity: activity, user: member1)
      preloaded = Activity.where(id: activity.id).includes(:activity_participants).first

      queries = []
      callback = ->(*, payload) { queries << payload[:sql] unless payload[:name] == "SCHEMA" }
      ActiveSupport::Notifications.subscribed(callback, "sql.active_record") do
        expect(preloaded.effective_participant_ids).to contain_exactly(member1.id)
      end

      expect(queries.select { |q| q.include?("activity_participants") }).to be_empty
    end
  end

  describe "associations" do
    it "has_many activity_participants with dependent: :destroy" do
      assoc = described_class.reflect_on_association(:activity_participants)
      expect(assoc.macro).to eq(:has_many)
      expect(assoc.options[:dependent]).to eq(:destroy)
    end

    it "has_many participants through activity_participants sourced from user" do
      assoc = described_class.reflect_on_association(:participants)
      expect(assoc.macro).to eq(:has_many)
      expect(assoc.options[:through]).to eq(:activity_participants)
      expect(assoc.options[:source]).to eq(:user)
    end
  end

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
      expect(activity.activity_participants.pluck(:user_id)).to contain_exactly(editor.id)
    end

    it "deduplicates user_ids" do
      activity.assign_participants!([ editor.id, editor.id ])
      expect(activity.activity_participants.pluck(:user_id)).to contain_exactly(editor.id)
    end

    it "accepts nil (same as empty — clears the set)" do
      create(:activity_participant, activity: activity, user: editor)
      activity.assign_participants!(nil)
      expect(activity.activity_participants).to be_empty
    end
  end

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

    # NOTE: PR1 窗口期内有 "allows editing existing low-tier road activity"
    # 测试覆盖 gate 设计（只在 new_record? || kind/citizen_level 变化时校验），
    # 但 PR2 加了 DB check constraint 后历史低 tier road 不再可能存在（无法
    # 用 save!(validate: false) 绕过 DB 层），该测试场景失效，删除。

    it "rejects switching an existing road activity's citizen_level away from tier_one" do
      a = create(:activity, :scenic_road, tour: tour, day: day, position: 1)
      a.citizen_level = :tier_two
      expect(a.save).to be false
      expect(a.errors[:citizen_level]).to include(/景观公路必须为 tier_one/)
    end

    it "rejects switching an existing non-road activity's kind to road without tier_one" do
      a = create(:activity, tour: tour, day: day, kind: :scenic, citizen_level: :tier_three, position: 1)
      a.kind = :road
      expect(a.save).to be false
      expect(a.errors[:citizen_level]).to include(/景观公路必须为 tier_one/)
    end
  end

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

      clone.details["altitude"] = 5000
      clone.save!
      expect(src.reload.details["altitude"]).to eq(3650)
    end

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
        img = ActivityImage.new(activity: src, uploaded_by: tour.author, position: 1)
        img.save!(validate: false)

        clone = src.clone_for_same_day!

        expect(clone.activity_images).to be_empty
      end
    end

    it "rolls back the shift and the new activity when participant copy fails" do
      editor_user = create(:user)
      create(:tour_membership, tour: tour, user: editor_user, role: :editor)

      src = create(:activity, tour: tour, day: day, position: 1)
      ActivityParticipant.create!(activity: src, user: editor_user)
      other = create(:activity, tour: tour, day: day, position: 2)

      # Force the participant copy to fail after the main activity is inserted.
      # The clone method calls new_activity.activity_participants.create!(user_id:),
      # which builds a new ActivityParticipant and calls save! on it.
      # We stub save! on any ActivityParticipant instance so the copy path raises.
      # The setup's ActivityParticipant.create! already ran before this stub.
      allow_any_instance_of(ActivityParticipant).to receive(:save!).and_raise(
        ActiveRecord::RecordInvalid.new(ActivityParticipant.new)
      )

      expect { src.clone_for_same_day! }.to raise_error(ActiveRecord::RecordInvalid)

      # No extra activity landed
      expect(tour.activities.reload.count).to eq(2)
      # The sibling shift was rolled back
      expect(other.reload.position).to eq(2)
    end
  end
end
