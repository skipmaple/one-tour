require "rails_helper"

RSpec.describe Tour::ConstitutionCheck do
  it "returns min_buffer_days violation for a fresh tour with no days" do
    tour = create(:tour)
    violations = described_class.for(tour)
    expect(violations.length).to eq(1)
    expect(violations.first.rule).to eq(:min_buffer_days)
  end

  describe "#check_daily_driving" do
    let(:tour) { create(:tour) }

    it "flags hard violation when a day exceeds max_daily_driving_minutes" do
      day = create(:day, tour: tour, day_index: 3)
      create(:activity, tour: tour, day: day, kind: :road, details: { "drive_min" => 480 })

      violations = described_class.for(tour)
      v = violations.find { |x| x.rule == :max_daily_driving_minutes }
      expect(v).not_to be_nil
      expect(v.level).to eq(:hard)
      expect(v.scope).to eq(day_index: 3)
      expect(v.message).to include("480")
    end

    it "no violation when within limit" do
      day = tour.days.first # D1 seeded by callback
      create(:activity, tour: tour, day: day, kind: :road, details: { "drive_min" => 300 })
      violations = described_class.for(tour)
      expect(violations.map(&:rule)).not_to include(:max_daily_driving_minutes)
    end
  end

  describe "#check_tier_one_per_day" do
    let(:tour) { create(:tour) }

    it "no violation when count equals limit (at-cap is OK)" do
      day = create(:day, tour: tour, day_index: 2)
      3.times { create(:activity, tour: tour, day: day, citizen_level: :tier_one) }
      violations = described_class.for(tour)
      expect(violations.map(&:rule)).not_to include(:max_tier_one_per_day)
    end

    it "flags hard violation when count exceeds limit (default 3)" do
      day = create(:day, tour: tour, day_index: 2)
      4.times { create(:activity, tour: tour, day: day, citizen_level: :tier_one) }
      violations = described_class.for(tour)
      v = violations.find { |x| x.rule == :max_tier_one_per_day }
      expect(v).not_to be_nil
      expect(v.level).to eq(:hard)
    end
  end

  describe "#check_buffer_days" do
    let(:tour) { create(:tour) }

    it "flags soft violation when buffer_days < min_buffer_days (default 1)" do
      # D1 seeded by callback has buffer_day=false by default
      create(:day, tour: tour, day_index: 2, buffer_day: false)
      violations = described_class.for(tour)
      v = violations.find { |x| x.rule == :min_buffer_days }
      expect(v).not_to be_nil
      expect(v.level).to eq(:soft)
      expect(v.scope).to eq({})
    end

    it "no violation when at or above min_buffer_days" do
      tour.days.first.update!(buffer_day: true)
      violations = described_class.for(tour)
      expect(violations.map(&:rule)).not_to include(:min_buffer_days)
    end
  end

  describe "#check_tier_two_food" do
    let(:tour) { create(:tour) }

    it "flags soft violation when tier_two food count > limit (default 3)" do
      4.times { create(:activity, tour: tour, kind: :food, citizen_level: :tier_two) }
      v = described_class.for(tour).find { |x| x.rule == :max_tier_two_food_per_tour }
      expect(v).not_to be_nil
      expect(v.level).to eq(:soft)
    end
  end

  describe "constraint_overrides filtering" do
    let(:tour) { create(:tour) }

    it "suppresses violation matching an override with same rule + scope" do
      day = create(:day, tour: tour, day_index: 3)
      create(:activity, tour: tour, day: day, kind: :road, details: { "drive_min" => 480 })
      tour.update!(constraint_overrides: [ {
        "rule" => "max_daily_driving_minutes",
        "scope" => { "day_index" => 3 },
        "reason" => "独库必走",
        "acknowledged_at" => Time.current.iso8601
      } ])

      violations = described_class.for(tour)
      expect(violations.map(&:rule)).not_to include(:max_daily_driving_minutes)
    end

    it "does not suppress when scope differs" do
      day = create(:day, tour: tour, day_index: 3)
      create(:activity, tour: tour, day: day, kind: :road, details: { "drive_min" => 480 })
      tour.update!(constraint_overrides: [ {
        "rule" => "max_daily_driving_minutes",
        "scope" => { "day_index" => 5 },
        "reason" => "xxx"
      } ])
      expect(described_class.for(tour).map(&:rule)).to include(:max_daily_driving_minutes)
    end
  end
end
