require "rails_helper"

RSpec.describe "Guidebook Conversations", type: :request do
  let(:owner) { create(:user) }
  let(:guidebook) { create(:guidebook, author: owner) }
  let(:stranger) { create(:user) }

  def login_as(user)
    post "/login_test", params: { user_id: user.id }
  end

  describe "POST /guidebooks/:guidebook_id/conversations" do
    it "creates a conversation for the owner" do
      login_as(owner)
      expect {
        post "/guidebooks/#{guidebook.id}/conversations"
      }.to change(Conversation, :count).by(1)

      expect(response).to have_http_status(:created)
      data = JSON.parse(response.body)
      expect(data["conversation"]["guidebook_id"]).to eq guidebook.id
    end

    it "returns existing conversation if one already exists" do
      login_as(owner)
      conversation = create(:conversation, guidebook: guidebook, user: owner)

      expect {
        post "/guidebooks/#{guidebook.id}/conversations"
      }.not_to change(Conversation, :count)

      expect(response).to have_http_status(:created)
      data = JSON.parse(response.body)
      expect(data["conversation"]["id"]).to eq conversation.id
    end

    it "allows an editor to create a conversation" do
      editor = create(:user)
      create(:guidebook_membership, guidebook: guidebook, user: editor, role: :editor)
      login_as(editor)

      post "/guidebooks/#{guidebook.id}/conversations"
      expect(response).to have_http_status(:created)
    end

    it "denies a stranger" do
      login_as(stranger)
      post "/guidebooks/#{guidebook.id}/conversations"
      expect(response).to have_http_status(:forbidden)
    end

    it "redirects unauthenticated users to login" do
      post "/guidebooks/#{guidebook.id}/conversations"
      expect(response).to redirect_to(login_path)
    end
  end

  describe "GET /guidebooks/:guidebook_id/conversations/:id" do
    it "returns conversation with messages" do
      login_as(owner)
      conversation = create(:conversation, guidebook: guidebook, user: owner)
      create(:message, conversation: conversation, role: :user, content: "Hello")
      create(:message, conversation: conversation, role: :assistant, content: "Hi there")

      get "/guidebooks/#{guidebook.id}/conversations/#{conversation.id}"

      expect(response).to have_http_status(:ok)
      data = JSON.parse(response.body)
      expect(data["messages"].length).to eq 2
      expect(data["messages"][0]["role"]).to eq "user"
      expect(data["messages"][1]["role"]).to eq "assistant"
    end

    it "denies access to another user's conversation" do
      login_as(owner)
      other_editor = create(:user)
      create(:guidebook_membership, guidebook: guidebook, user: other_editor, role: :editor)
      conversation = create(:conversation, guidebook: guidebook, user: other_editor)

      get "/guidebooks/#{guidebook.id}/conversations/#{conversation.id}"
      expect(response).to have_http_status(:forbidden)
    end
  end
end
