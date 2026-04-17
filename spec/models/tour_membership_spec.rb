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
end
