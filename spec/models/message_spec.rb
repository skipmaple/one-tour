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

    it "supports tool role" do
      m = create(:message, role: :tool, content: "{result}")
      expect(m.role).to eq("tool")
    end

    it "has all 4 roles" do
      expect(Message.roles).to eq("user" => 0, "assistant" => 1, "system" => 2, "tool" => 3)
    end
  end

  describe "#as_json" do
    let(:conversation) { create(:conversation) }

    it "serializes role as string ('user'), not integer" do
      msg = conversation.messages.create!(role: :user, content: "hi")
      expect(msg.as_json["role"]).to eq("user")
    end

    it "serializes role 'assistant' as string" do
      msg = conversation.messages.create!(role: :assistant, content: "ok")
      expect(msg.as_json["role"]).to eq("assistant")
    end
  end
end
