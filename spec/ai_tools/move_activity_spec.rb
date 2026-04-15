require "rails_helper"

RSpec.describe AITools::MoveActivity do
  let(:tour)  { create(:tour) }
  let(:day1)  { create(:day, tour: tour, day_index: 1) }
  let(:day2)  { create(:day, tour: tour, day_index: 2) }
  let(:activity) { create(:activity, tour: tour, day: day1, position: 1) }

  before do
    tour
    day1
    day2
    activity
  end

  it "moves activity to another day at specified position" do
    result = described_class.new(tour: tour).execute(activity_id: activity.id, to_day_index: 2, to_position: 1)
    expect(result[:ok]).to be true
    expect(activity.reload.day_id).to eq(day2.id)
    expect(activity.position).to eq(1)
  end

  it "moves activity to backlog" do
    result = described_class.new(tour: tour).execute(activity_id: activity.id, to_day_index: "backlog", to_position: 1)
    expect(result[:ok]).to be true
    expect(activity.reload.day_id).to be_nil
  end

  it "fails when activity missing" do
    result = described_class.new(tour: tour).execute(activity_id: 999, to_day_index: 1, to_position: 1)
    expect(result[:ok]).to be false
    expect(result[:error][:code]).to eq("activity_not_found")
  end

  it "refuses to move an activity that belongs to a different tour (BUG #6)" do
    other_tour = create(:tour)
    foreign    = create(:activity, tour: other_tour, position: 1)
    result = described_class.new(tour: tour).execute(activity_id: foreign.id, to_day_index: 1, to_position: 1)
    expect(result[:ok]).to be false
    expect(result[:error][:code]).to eq("activity_not_found")
    expect(foreign.reload.tour_id).to eq(other_tour.id)
  end
end
