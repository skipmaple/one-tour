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

    it "sums drive_min across road activities of this day" do
      create(:activity, tour: tour, day: day, kind: :road, citizen_level: :tier_one, details: { "drive_min" => 120 })
      create(:activity, tour: tour, day: day, kind: :road, citizen_level: :tier_one, details: { "drive_min" => 90 })
      create(:activity, tour: tour, day: day, kind: :scenic, details: { "foo" => 1 })
      expect(day.driving_minutes_total).to eq(210)
    end

    it "returns 0 when no road activities" do
      create(:activity, tour: tour, day: day, kind: :scenic)
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
