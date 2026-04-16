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
  end
end
