require "rails_helper"

RSpec.describe AITools::DeleteActivity do
  let(:tour) { create(:tour) }

  it "deletes the activity" do
    activity = create(:activity, tour: tour)
    result = described_class.new(tour: tour).execute(activity_id: activity.id)
    expect(result[:ok]).to be true
    expect(Activity.exists?(activity.id)).to be false
  end

  it "returns error when activity not found" do
    result = described_class.new(tour: tour).execute(activity_id: 999_999)
    expect(result[:ok]).to be false
    expect(result[:error][:code]).to eq("activity_not_found")
  end

  it "refuses to delete an activity that belongs to a different tour (BUG #6)" do
    other_tour = create(:tour)
    foreign    = create(:activity, tour: other_tour)
    result = described_class.new(tour: tour).execute(activity_id: foreign.id)
    expect(result[:ok]).to be false
    expect(result[:error][:code]).to eq("activity_not_found")
    expect(Activity.exists?(foreign.id)).to be true
  end
end
