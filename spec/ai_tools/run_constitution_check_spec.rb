require "rails_helper"

RSpec.describe AITools::RunConstitutionCheck do
  it "returns violations hash" do
    tour = create(:tour)
    day = create(:day, tour: tour, day_index: 1)
    create(:activity, tour: tour, day: day, kind: :road, details: { "drive_min" => 500 })
    result = described_class.new(tour: tour).execute
    expect(result[:violations]).to be_an(Array)
    expect(result[:violations].first[:rule]).to eq(:max_daily_driving_minutes)
  end

  it "returns empty violations for clean tour" do
    tour = create(:tour)
    create(:day, tour: tour, day_index: 1, buffer_day: true)   # satisfies min_buffer_days
    result = described_class.new(tour: tour).execute
    expect(result[:ok]).to be true
    expect(result[:violations]).to eq([])
  end

  it "bails with tour_context_missing when constructed without a tour" do
    result = described_class.new.execute
    expect(result[:ok]).to be false
    expect(result[:error][:code]).to eq("tour_context_missing")
  end
end
