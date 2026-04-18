require "rails_helper"

RSpec.describe TourMembership do
  it "has role enum with reader=0, editor=1" do
    expect(TourMembership.roles).to eq("reader" => 0, "editor" => 1)
  end

  it "is unique on (tour_id, user_id) at the model layer" do
    tour = create(:tour)
    user = create(:user)
    create(:tour_membership, tour: tour, user: user)
    dup = build(:tour_membership, tour: tour, user: user)
    expect(dup).not_to be_valid
    expect(dup.errors[:user_id]).to include("already a member of this tour")
  end

  it "allows the same user on a different tour" do
    user   = create(:user)
    tour_a = create(:tour)
    tour_b = create(:tour)
    create(:tour_membership, tour: tour_a, user: user)
    expect(build(:tour_membership, tour: tour_b, user: user)).to be_valid
  end

  describe "participating_day_ids" do
    let(:tour) { create(:tour) }

    it "defaults to [] (meaning 全程参与)" do
      m = create(:tour_membership, tour: tour)
      expect(m.participating_day_ids).to eq([])
    end

    it "accepts ids of days belonging to the tour" do
      m = build(:tour_membership, tour: tour, participating_day_ids: [ tour.days.first.id ])
      expect(m).to be_valid
    end

    it "rejects ids of days belonging to a different tour" do
      foreign = create(:tour).days.first.id
      m = build(:tour_membership, tour: tour, participating_day_ids: [ foreign ])
      expect(m).not_to be_valid
      expect(m.errors[:participating_day_ids].first).to match(/不属于本行程/)
    end
  end

  describe "#participates_in_day?" do
    let(:tour) { create(:tour) }
    let!(:day2) { create(:day, tour: tour, day_index: 2) }

    it "returns true for all days when participating_day_ids is empty" do
      m = create(:tour_membership, tour: tour)
      expect(m.participates_in_day?(tour.days.first.id)).to be true
      expect(m.participates_in_day?(day2.id)).to be true
    end

    it "returns true only for listed days when participating_day_ids is set" do
      m = create(:tour_membership, tour: tour, participating_day_ids: [ day2.id ])
      expect(m.participates_in_day?(tour.days.first.id)).to be false
      expect(m.participates_in_day?(day2.id)).to be true
    end
  end
end
