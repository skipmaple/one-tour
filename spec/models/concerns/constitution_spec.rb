require "rails_helper"

RSpec.describe Constitution do
  it "defines 7 required default rules" do
    expect(Constitution::DEFAULTS.keys).to contain_exactly(
      :max_daily_driving_minutes,
      :max_mountain_road_minutes,
      :max_tier_one_per_day,
      :min_buffer_days,
      :min_daily_buffer_minutes,
      :max_tier_two_food_per_tour,
      :max_fuel_emergency_per_tour
    )
  end

  it "freezes the DEFAULTS constant" do
    expect(Constitution::DEFAULTS).to be_frozen
  end

  it "sets the canonical default values" do
    expect(Constitution::DEFAULTS[:max_daily_driving_minutes]).to eq(420)
    expect(Constitution::DEFAULTS[:max_tier_one_per_day]).to eq(3)
    expect(Constitution::DEFAULTS[:min_buffer_days]).to eq(1)
  end
end
