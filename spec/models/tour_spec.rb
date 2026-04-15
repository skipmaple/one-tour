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
