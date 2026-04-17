require "rails_helper"

RSpec.describe AITools::UpdateActivity do
  let(:tour) { create(:tour) }

  it "updates name and details" do
    activity = create(:activity, tour: tour)
    result = described_class.new(tour: tour).execute(
      activity_id: activity.id,
      patch: { "name" => "新名字", "details" => { "best_light" => "清晨" } }
    )
    expect(result[:ok]).to be true
    expect(activity.reload.name).to eq("新名字")
    expect(activity.reload.details["best_light"]).to eq("清晨")
  end

  it "ignores unknown fields" do
    activity = create(:activity, tour: tour)
    result = described_class.new(tour: tour).execute(activity_id: activity.id, patch: { "unknown_field" => "x" })
    expect(result[:ok]).to be true
    expect(result[:updated_fields]).not_to include("unknown_field")
  end

  it "returns error when activity not found" do
    result = described_class.new(tour: tour).execute(activity_id: 999_999, patch: { "name" => "x" })
    expect(result[:ok]).to be false
    expect(result[:error][:code]).to eq("activity_not_found")
  end

  it "refuses to update an activity that belongs to a different tour (BUG #6)" do
    other_tour = create(:tour)
    foreign    = create(:activity, tour: other_tour)
    original   = foreign.name
    result = described_class.new(tour: tour).execute(activity_id: foreign.id, patch: { "name" => "pwn" })
    expect(result[:ok]).to be false
    expect(result[:error][:code]).to eq("activity_not_found")
    expect(foreign.reload.name).to eq(original)
  end
end
