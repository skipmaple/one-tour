require "rails_helper"

RSpec.describe "Conversation Messages", type: :request do
  let(:owner) { create(:user) }
  let(:guidebook) { create(:guidebook, author: owner) }
  let(:conversation) { create(:conversation, guidebook: guidebook, user: owner) }

  def login_as(user)
    post "/login_test", params: { user_id: user.id }
  end

  describe "POST /guidebooks/:guidebook_id/conversations/:conversation_id/messages" do
    it "creates a user message and enqueues ChatStreamJob" do
      login_as(owner)

      expect {
        post "/guidebooks/#{guidebook.id}/conversations/#{conversation.id}/messages",
          params: { content: "规划一个 3 天的北京旅行" }
      }.to change(Message, :count).by(1)
        .and have_enqueued_job(ChatStreamJob).with(conversation.id, guidebook.id, owner.id, "ask")

      expect(response).to have_http_status(:created)
      data = JSON.parse(response.body)
      expect(data["message"]["role"]).to eq "user"
      expect(data["message"]["content"]).to eq "规划一个 3 天的北京旅行"
    end

    it "denies access to another user's conversation" do
      other_user = create(:user)
      create(:guidebook_membership, guidebook: guidebook, user: other_user, role: :editor)
      login_as(other_user)

      post "/guidebooks/#{guidebook.id}/conversations/#{conversation.id}/messages",
        params: { content: "Hello" }
      expect(response).to have_http_status(:forbidden)
    end

    it "redirects unauthenticated users to login" do
      post "/guidebooks/#{guidebook.id}/conversations/#{conversation.id}/messages",
        params: { content: "Hello" }
      expect(response).to redirect_to(login_path)
    end
  end
end
