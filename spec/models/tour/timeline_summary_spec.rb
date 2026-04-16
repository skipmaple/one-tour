require "rails_helper"

RSpec.describe Tour::TimelineSummary do
  describe ".for" do
    let(:tour) { create(:tour) }

    it "returns zero counts for an empty tour" do
      result = described_class.for(tour)
      expect(result[:day_count]).to eq(0)
      expect(result[:activity_count]).to eq(0)
      expect(result[:tier_one_total]).to eq(0)
      expect(result[:buffer_count]).to eq(0)
      expect(result[:hard_count]).to eq(0)
      # A fresh tour always has 1 soft violation (min_buffer_days) — ConstitutionCheck
      # documents this explicitly: "returns min_buffer_days violation for a fresh tour with no days"
      expect(result[:soft_count]).to eq(1)
    end

    it "counts days, activities, buffer days and tier_one total" do
      d1 = create(:day, tour: tour, day_index: 1, buffer_day: true)
      d2 = create(:day, tour: tour, day_index: 2)
      create(:activity, tour: tour, day: d2, citizen_level: :tier_one, position: 1)
      create(:activity, tour: tour, day: d2, citizen_level: :tier_one, position: 2)
      create(:activity, tour: tour, day: d2, citizen_level: :tier_three, position: 3)

      result = described_class.for(tour)
      expect(result[:day_count]).to eq(2)
      expect(result[:activity_count]).to eq(3)
      expect(result[:tier_one_total]).to eq(2)
      expect(result[:buffer_count]).to eq(1)
    end

    it "reads tier_one_limit and buffer_min from constitution" do
      result = described_class.for(tour)
      expect(result[:tier_one_limit]).to eq(tour.constitution["max_tier_one_per_day"])
      expect(result[:buffer_min]).to eq(tour.constitution["min_buffer_days"])
    end

    it "counts hard and soft violations separately" do
      day = create(:day, tour: tour, day_index: 1)
      # tier_one over limit (3 by default) → hard
      4.times { |i| create(:activity, tour: tour, day: day, citizen_level: :tier_one, position: i + 1) }
      # buffer days 0 < default min 1 → soft (if constitution default min_buffer_days >= 1)

      result = described_class.for(tour)
      expect(result[:hard_count]).to be >= 1
      expect(result[:hard_count] + result[:soft_count]).to be > 0
    end
  end
end
