require "rails_helper"

RSpec.describe AITools::AcknowledgeViolation do
  it "appends an override entry" do
    tour = create(:tour)
    described_class.new.execute(
      tour_id: tour.id,
      rule: "max_daily_driving_minutes",
      scope: { "day_index" => 3 },
      reason: "独库必走"
    )
    expect(tour.reload.constraint_overrides.size).to eq(1)
    expect(tour.constraint_overrides.first["rule"]).to eq("max_daily_driving_minutes")
    expect(tour.constraint_overrides.first["reason"]).to eq("独库必走")
  end

  it "defaults scope to empty hash" do
    tour = create(:tour)
    described_class.new.execute(tour_id: tour.id, rule: "min_buffer_days", reason: "短途")
    expect(tour.reload.constraint_overrides.first["scope"]).to eq({})
  end

  it "returns error when tour not found" do
    result = described_class.new.execute(tour_id: 999_999, rule: "x", reason: "y")
    expect(result[:ok]).to be false
    expect(result[:error][:code]).to eq("tour_not_found")
  end

  it "dedupes by (rule, scope): second call with same rule+scope replaces first" do
    tour = create(:tour)
    described_class.new.execute(tour_id: tour.id, rule: "max_daily_driving_minutes",
                                scope: { "day_index" => 3 }, reason: "first")
    described_class.new.execute(tour_id: tour.id, rule: "max_daily_driving_minutes",
                                scope: { "day_index" => 3 }, reason: "second")
    overrides = tour.reload.constraint_overrides
    expect(overrides.size).to eq(1)
    expect(overrides.first["reason"]).to eq("second")
  end

  it "keeps separate entries when scope differs" do
    tour = create(:tour)
    described_class.new.execute(tour_id: tour.id, rule: "max_daily_driving_minutes",
                                scope: { "day_index" => 3 }, reason: "a")
    described_class.new.execute(tour_id: tour.id, rule: "max_daily_driving_minutes",
                                scope: { "day_index" => 5 }, reason: "b")
    expect(tour.reload.constraint_overrides.size).to eq(2)
  end
end
