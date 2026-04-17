require "rails_helper"

RSpec.describe AITools::CreateDay do
  it "creates a day on the bound tour" do
    tour = create(:tour) # D1 seeded by callback
    result = described_class.new(tour: tour).execute(day_index: 2, title: "抵达")
    expect(result[:ok]).to be true
    day = Day.find(result[:day_id])
    expect(day.title).to eq("抵达")
    expect(day.tour_id).to eq(tour.id)
  end

  it "fails on duplicate day_index" do
    tour = create(:tour) # D1 already seeded by callback
    result = described_class.new(tour: tour).execute(day_index: 1)
    expect(result[:ok]).to be false
    expect(result[:error][:code]).to eq("validation")
  end

  it "bails with tour_context_missing when constructed without a tour" do
    result = described_class.new.execute(day_index: 1)
    expect(result[:ok]).to be false
    expect(result[:error][:code]).to eq("tour_context_missing")
  end
end
