require "rails_helper"

RSpec.describe TourMembership do
  it "has role enum with reader=0, editor=1" do
    expect(TourMembership.roles).to eq("reader" => 0, "editor" => 1)
  end

  it "is unique on (tour_id, user_id)" do
    tour = create(:tour)
    user = create(:user)
    create(:tour_membership, tour: tour, user: user)
    expect {
      create(:tour_membership, tour: tour, user: user)
    }.to raise_error(ActiveRecord::RecordNotUnique)
  end
end
