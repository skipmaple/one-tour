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
