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
  end
end
