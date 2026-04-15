require "rails_helper"

RSpec.describe AITools::UpdateConstitution do
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

  it "returns error when tour not found" do
    result = described_class.new.execute(tour_id: 999_999, patch: { "max_tier_one_per_day" => 4 })
    expect(result[:ok]).to be false
    expect(result[:error][:code]).to eq("tour_not_found")
  end
end
