require "rails_helper"

RSpec.describe Tour::ConstitutionCheck do
  it "returns empty array for a fresh tour with no days" do
    tour = create(:tour)
    expect(described_class.for(tour)).to eq([])
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
      day = create(:day, tour: tour, day_index: 1)
      create(:activity, tour: tour, day: day, kind: :road, details: { "drive_min" => 300 })
      violations = described_class.for(tour)
      expect(violations.map(&:rule)).not_to include(:max_daily_driving_minutes)
    end
  end

  describe "#check_tier_one_per_day" do
    let(:tour) { create(:tour) }

    it "flags soft violation when tier_one count reaches limit (default 3)" do
      day = create(:day, tour: tour, day_index: 2)
      3.times { create(:activity, tour: tour, day: day, citizen_level: :tier_one) }
      violations = described_class.for(tour)
      v = violations.find { |x| x.rule == :max_tier_one_per_day }
      expect(v).not_to be_nil
      expect(v.level).to eq(:soft)
    end
  end
end
