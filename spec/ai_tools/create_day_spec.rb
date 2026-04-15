require "rails_helper"

RSpec.describe AITools::CreateDay do
  it "creates a day" do
    tour = create(:tour)
    result = described_class.new.execute(tour_id: tour.id, day_index: 1, title: "抵达")
    expect(result[:ok]).to be true
    expect(Day.find(result[:day_id]).title).to eq("抵达")
  end

  it "fails on duplicate day_index" do
    tour = create(:tour)
    create(:day, tour: tour, day_index: 1)
    result = described_class.new.execute(tour_id: tour.id, day_index: 1)
    expect(result[:ok]).to be false
    expect(result[:error][:code]).to eq("validation")
  end

  it "returns error when tour not found" do
    result = described_class.new.execute(tour_id: 9_999, day_index: 1)
    expect(result[:ok]).to be false
    expect(result[:error][:code]).to eq("tour_not_found")
  end
end
