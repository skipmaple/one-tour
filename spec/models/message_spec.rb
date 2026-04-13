require "rails_helper"

RSpec.describe Message, type: :model do
  describe "associations" do
    it "belongs to a conversation" do
      association = described_class.reflect_on_association(:conversation)
      expect(association.macro).to eq :belongs_to
    end
  end

  describe "role enum" do
    let(:conversation) { create(:conversation) }

    it "supports user role" do
      message = create(:message, conversation: conversation, role: :user)
      expect(message).to be_user
    end

    it "supports assistant role" do
      message = create(:message, conversation: conversation, role: :assistant)
      expect(message).to be_assistant
    end

    it "supports system role" do
      message = create(:message, conversation: conversation, role: :system)
      expect(message).to be_system
    end
  end
end
