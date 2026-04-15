require "rails_helper"

RSpec.describe AITools::DeleteDay do
  it "destroys day and moves its activities to backlog" do
    tour = create(:tour)
    day = create(:day, tour: tour)
    activity = create(:activity, tour: tour, day: day)
    described_class.new.execute(day_id: day.id)
    expect(Day.exists?(day.id)).to be false
    expect(activity.reload.day_id).to be_nil
  end

  it "returns error when day not found" do
    result = described_class.new.execute(day_id: 999_999)
    expect(result[:ok]).to be false
    expect(result[:error][:code]).to eq("day_not_found")
  end
end
