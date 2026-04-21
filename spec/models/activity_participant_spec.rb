require "rails_helper"

RSpec.describe ActivityParticipant, type: :model do
  describe "associations" do
    it "belongs to activity" do
      association = described_class.reflect_on_association(:activity)
      expect(association.macro).to eq :belongs_to
    end

    it "belongs to user" do
      association = described_class.reflect_on_association(:user)
      expect(association.macro).to eq :belongs_to
    end
  end

  describe "validations" do
    let(:tour)     { create(:tour) }
    let(:activity) { create(:activity, tour: tour) }
    let(:member)   { create(:user) }

    before do
      create(:tour_membership, tour: tour, user: member, role: :editor)
    end

    it "is valid when user is the tour author" do
      p = ActivityParticipant.new(activity: activity, user: tour.author)
      expect(p).to be_valid
    end

    it "is valid when user is a tour member" do
      p = ActivityParticipant.new(activity: activity, user: member)
      expect(p).to be_valid
    end

    it "rejects users not in the tour" do
      outsider = create(:user)
      p = ActivityParticipant.new(activity: activity, user: outsider)
      expect(p).not_to be_valid
      expect(p.errors[:user_id].first).to match(/不属于本行程成员/)
    end

    it "rejects duplicate (activity, user)" do
      ActivityParticipant.create!(activity: activity, user: member)
      dup = ActivityParticipant.new(activity: activity, user: member)
      expect(dup).not_to be_valid
      expect(dup.errors[:user_id].first).to match(/taken|unique/i)
    end
  end
end
