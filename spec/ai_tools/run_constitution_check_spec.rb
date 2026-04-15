require "rails_helper"

RSpec.describe AITools::RunConstitutionCheck do
  it "returns violations hash" do
    tour = create(:tour)
    day = create(:day, tour: tour, day_index: 1)
    create(:activity, tour: tour, day: day, kind: :road, details: { "drive_min" => 500 })
    result = described_class.new.execute(tour_id: tour.id)
    expect(result[:violations]).to be_an(Array)
    expect(result[:violations].first[:rule]).to eq(:max_daily_driving_minutes)
  end

  it "returns empty violations for clean tour" do
    tour = create(:tour)
    create(:day, tour: tour, day_index: 1, buffer_day: true)   # satisfies min_buffer_days
    result = described_class.new.execute(tour_id: tour.id)
    expect(result[:ok]).to be true
    expect(result[:violations]).to eq([])
  end

  it "returns error when tour not found" do
    result = described_class.new.execute(tour_id: 999_999)
    expect(result[:ok]).to be false
    expect(result[:error][:code]).to eq("tour_not_found")
  end
end
