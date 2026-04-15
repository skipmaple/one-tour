require "rails_helper"

RSpec.describe Tour do
  describe "defaults" do
    it "deep-copies Constitution::DEFAULTS into constitution on create" do
      tour = create(:tour)
      expect(tour.constitution["max_daily_driving_minutes"]).to eq(420)
      expect(tour.constitution["max_tier_one_per_day"]).to eq(3)
    end

    it "is independent per tour (changing one does not affect DEFAULTS)" do
      tour = create(:tour)
      tour.constitution["max_daily_driving_minutes"] = 360
      tour.save!
      expect(Constitution::DEFAULTS[:max_daily_driving_minutes]).to eq(420)
    end
  end

  describe "#owned_by?" do
    let(:author) { create(:user) }
    let(:tour) { create(:tour, author: author) }

    it "returns true for author" do
      expect(tour.owned_by?(author)).to be true
    end

    it "returns false for non-author" do
      other = create(:user)
      expect(tour.owned_by?(other)).to be false
    end

    it "returns false for nil user" do
      expect(tour.owned_by?(nil)).to be false
    end
  end

  describe "#editable_by?" do
    let(:tour) { create(:tour) }
    let(:editor) { create(:user) }
    let(:reader) { create(:user) }

    before do
      create(:tour_membership, tour: tour, user: editor, role: :editor)
      create(:tour_membership, tour: tour, user: reader, role: :reader)
    end

    it "allows author" do
      expect(tour.editable_by?(tour.author)).to be true
    end

    it "allows editor member" do
      expect(tour.editable_by?(editor)).to be true
    end

    it "denies reader member" do
      expect(tour.editable_by?(reader)).to be false
    end

    it "denies non-member" do
      expect(tour.editable_by?(create(:user))).to be false
    end

    it "denies nil" do
      expect(tour.editable_by?(nil)).to be false
    end
  end

  describe "#visible_to?" do
    let(:tour) { create(:tour) }

    it "allows author" do
      expect(tour.visible_to?(tour.author)).to be true
    end

    it "allows any member" do
      reader = create(:user)
      create(:tour_membership, tour: tour, user: reader, role: :reader)
      expect(tour.visible_to?(reader)).to be true
    end

    it "denies non-member" do
      expect(tour.visible_to?(create(:user))).to be false
    end
  end

  describe "#tier_two_food_count" do
    let(:tour) { create(:tour) }

    it "counts food activities with citizen_level=tier_two" do
      create(:activity, tour: tour, kind: :food, citizen_level: :tier_two)
      create(:activity, tour: tour, kind: :food, citizen_level: :tier_two)
      create(:activity, tour: tour, kind: :food, citizen_level: :tier_three)
      create(:activity, tour: tour, kind: :scenic, citizen_level: :tier_two)
      expect(tour.tier_two_food_count).to eq(2)
    end
  end

  describe "#buffer_days_count" do
    let(:tour) { create(:tour) }

    it "counts days marked buffer_day=true" do
      create(:day, tour: tour, day_index: 1, buffer_day: true)
      create(:day, tour: tour, day_index: 2, buffer_day: false)
      create(:day, tour: tour, day_index: 3, buffer_day: true)
      expect(tour.buffer_days_count).to eq(2)
    end
  end
end
