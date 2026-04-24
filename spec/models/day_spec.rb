require "rails_helper"

RSpec.describe Day do
  it "requires day_index unique per tour" do
    tour = create(:tour) # D1 seeded by callback
    duplicate = build(:day, tour: tour, day_index: 1)
    expect(duplicate).not_to be_valid
  end

  it "allows same day_index across different tours" do
    # Both tours already have D1 seeded by callback — nothing to prove by creating more
    tour_a = create(:tour)
    tour_b = create(:tour)
    expect(tour_a.days.first.day_index).to eq(1)
    expect(tour_b.days.first.day_index).to eq(1)
  end

  it "has intensity enum green/yellow/red" do
    expect(Day.intensities.keys).to eq(%w[green yellow red])
  end

  describe "#driving_minutes_total" do
    let(:tour) { create(:tour) }
    let(:day) { create(:day, tour: tour, day_index: 2) }

    it "sums route_leg duration (effective) across this day's activities" do
      a1 = create(:activity, tour: tour, day: day, lat: 36.0, lng: 103.0, position: 1)
      a2 = create(:activity, tour: tour, day: day, lat: 37.0, lng: 104.0, position: 2)
      RouteLeg.create!(tour: tour, from_activity: a1, to_activity: a2,
                       mode: :driving, distance_m: 100_000, duration_s: 7200,
                       polyline: { "coords" => [] })
      expect(day.driving_minutes_total).to eq(120)  # 7200s / 60
    end

    it "uses duration_s_override when set (via effective)" do
      a1 = create(:activity, tour: tour, day: day, lat: 36.0, lng: 103.0, position: 1)
      a2 = create(:activity, tour: tour, day: day, lat: 37.0, lng: 104.0, position: 2)
      RouteLeg.create!(tour: tour, from_activity: a1, to_activity: a2,
                       mode: :driving, distance_m: 100_000, duration_s: 7200,
                       duration_s_override: 10_800, overridden_at: Time.current,
                       polyline: { "coords" => [] })
      expect(day.driving_minutes_total).to eq(180)  # 10800 / 60
    end

    it "adds tier_one scenic road's details.drive_min on top of legs" do
      a1 = create(:activity, tour: tour, day: day, lat: 36.0, lng: 103.0, position: 1)
      scenic = create(:activity, :scenic_road, tour: tour, day: day, position: 2)
      # Leg prev → scenic exists, contributes 60 min
      RouteLeg.create!(tour: tour, from_activity: a1, to_activity: scenic,
                       mode: :driving, distance_m: 50_000, duration_s: 3600,
                       polyline: { "coords" => [] })
      # Scenic itself contributes its own drive_min (180 from trait)
      expect(day.driving_minutes_total).to eq(60 + 180)
    end

    it "returns 0 when no activities and no legs" do
      expect(day.driving_minutes_total).to eq(0)
    end
  end

  describe "#tier_one_count" do
    let(:tour) { create(:tour) }
    let(:day) { create(:day, tour: tour, day_index: 2) }

    it "counts activities with citizen_level=tier_one in this day" do
      create(:activity, tour: tour, day: day, citizen_level: :tier_one)
      create(:activity, tour: tour, day: day, citizen_level: :tier_one)
      create(:activity, tour: tour, day: day, citizen_level: :tier_two)
      expect(day.tier_one_count).to eq(2)
    end
  end

  describe "#intensity_derived" do
    let(:tour) { create(:tour) }
    let(:day) { create(:day, tour: tour, day_index: 3) }

    it "returns :green when buffer_day=true regardless of violations" do
      day.update!(buffer_day: true)
      violations = [ { level: :hard, rule: :max_daily_driving_minutes, scope: { day_index: 3 } } ]
      expect(day.intensity_derived(violations)).to eq(:green)
    end

    it "returns :red when a hard violation matches by day_index" do
      violations = [ { level: :hard, rule: :max_daily_driving_minutes, scope: { day_index: 3 } } ]
      expect(day.intensity_derived(violations)).to eq(:red)
    end

    it "ignores soft violations for intensity" do
      violations = [ { level: :soft, rule: :min_buffer_days, scope: {} } ]
      expect(day.intensity_derived(violations)).to eq(:green)
    end

    it "returns :green when driving < 120 min and no violations" do
      create(:activity, tour: tour, day: day, kind: :road, citizen_level: :tier_one, details: { "drive_min" => 90 })
      expect(day.intensity_derived([])).to eq(:green)
    end

    it "returns :yellow when driving is 120-360 min" do
      create(:activity, tour: tour, day: day, kind: :road, citizen_level: :tier_one, details: { "drive_min" => 240 })
      expect(day.intensity_derived([])).to eq(:yellow)
    end

    it "returns :red when driving > 360 min" do
      create(:activity, tour: tour, day: day, kind: :road, citizen_level: :tier_one, details: { "drive_min" => 400 })
      expect(day.intensity_derived([])).to eq(:red)
    end

    it "accepts violations with string keys (from Inertia JSON round-trip)" do
      violations = [ { "level" => "hard", "rule" => "max_daily_driving_minutes", "scope" => { "day_index" => 3 } } ]
      expect(day.intensity_derived(violations)).to eq(:red)
    end
  end
end
