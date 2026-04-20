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

  describe "after_destroy" do
    let(:tour)       { create(:tour) }
    let(:other_tour) { create(:tour) }
    let(:user)       { create(:user) }

    before do
      create(:tour_membership, tour: other_tour, user: user, role: :editor)
    end

    it "removes the user's ActivityParticipant rows in the same tour only" do
      membership = create(:tour_membership, tour: tour, user: user, role: :editor)
      activity_a = create(:activity, tour: tour)
      activity_b = create(:activity, tour: other_tour)

      ActivityParticipant.create!(activity: activity_a, user: user)
      ActivityParticipant.create!(activity: activity_b, user: user)

      expect {
        membership.destroy!
      }.to change { ActivityParticipant.where(user: user).count }.from(2).to(1)

      expect(ActivityParticipant.where(activity: activity_b, user: user)).to exist
    end
  end
end
