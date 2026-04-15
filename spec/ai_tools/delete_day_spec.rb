require "rails_helper"

RSpec.describe AITools::DeleteDay do
  let(:tour) { create(:tour) }

  it "destroys day and moves its activities to backlog" do
    day = create(:day, tour: tour)
    activity = create(:activity, tour: tour, day: day)
    described_class.new(tour: tour).execute(day_id: day.id)
    expect(Day.exists?(day.id)).to be false
    expect(activity.reload.day_id).to be_nil
  end

  it "returns error when day not found" do
    result = described_class.new(tour: tour).execute(day_id: 999_999)
    expect(result[:ok]).to be false
    expect(result[:error][:code]).to eq("day_not_found")
  end

  it "refuses to delete a day that belongs to a different tour (BUG #6)" do
    other_tour = create(:tour)
    foreign    = create(:day, tour: other_tour)
    result = described_class.new(tour: tour).execute(day_id: foreign.id)
    expect(result[:ok]).to be false
    expect(result[:error][:code]).to eq("day_not_found")
    expect(Day.exists?(foreign.id)).to be true
  end
end
