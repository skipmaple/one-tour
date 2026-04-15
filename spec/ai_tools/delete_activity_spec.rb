require "rails_helper"

RSpec.describe AITools::DeleteActivity do
  it "deletes the activity" do
    activity = create(:activity)
    result = described_class.new.execute(activity_id: activity.id)
    expect(result[:ok]).to be true
    expect(Activity.exists?(activity.id)).to be false
  end

  it "returns error when activity not found" do
    result = described_class.new.execute(activity_id: 999_999)
    expect(result[:ok]).to be false
    expect(result[:error][:code]).to eq("activity_not_found")
  end
end
