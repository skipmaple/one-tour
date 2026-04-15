require "rails_helper"

RSpec.describe AITools::UpdateActivity do
  it "updates name and details" do
    activity = create(:activity)
    result = described_class.new.execute(
      activity_id: activity.id,
      patch: { "name" => "新名字", "details" => { "best_light" => "清晨" } }
    )
    expect(result[:ok]).to be true
    expect(activity.reload.name).to eq("新名字")
    expect(activity.reload.details["best_light"]).to eq("清晨")
  end

  it "ignores unknown fields" do
    activity = create(:activity)
    result = described_class.new.execute(activity_id: activity.id, patch: { "unknown_field" => "x" })
    expect(result[:ok]).to be true
    expect(result[:updated_fields]).not_to include("unknown_field")
  end

  it "returns error when activity not found" do
    result = described_class.new.execute(activity_id: 999_999, patch: { "name" => "x" })
    expect(result[:ok]).to be false
    expect(result[:error][:code]).to eq("activity_not_found")
  end
end
