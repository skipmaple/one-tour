require "rails_helper"

RSpec.describe Conversation, type: :model do
  let(:user) { create(:user) }
  let(:tour) { create(:tour, author: user) }

  describe "associations" do
    it "belongs to a tour" do
      association = described_class.reflect_on_association(:tour)
      expect(association.macro).to eq :belongs_to
    end

    it "belongs to a user" do
      association = described_class.reflect_on_association(:user)
      expect(association.macro).to eq :belongs_to
    end

    it "has many messages" do
      association = described_class.reflect_on_association(:messages)
      expect(association.macro).to eq :has_many
      expect(association.options[:dependent]).to eq :destroy
    end
  end

  describe "validations" do
    it "enforces one conversation per tour per user" do
      create(:conversation, tour: tour, user: user)
      duplicate = build(:conversation, tour: tour, user: user)
      expect(duplicate).not_to be_valid
    end

    it "allows different users to have conversations on the same tour" do
      create(:conversation, tour: tour, user: user)
      other_user = create(:user)
      other_conversation = build(:conversation, tour: tour, user: other_user)
      expect(other_conversation).to be_valid
    end
  end
end
