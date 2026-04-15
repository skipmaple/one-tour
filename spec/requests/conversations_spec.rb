require "rails_helper"

RSpec.describe "Conversations", type: :request do
  def login_as(user)
    post "/login_test", params: { user_id: user.id }
  end

  let(:user) { create(:user) }

  it "GET show creates conversation if missing + returns messages" do
    tour = create(:tour, author: user)
    login_as(user)
    get tour_conversation_path(tour)
    expect(response).to have_http_status(:ok)
    body = JSON.parse(response.body)
    expect(body).to have_key("conversation")
    expect(body).to have_key("messages")
    expect(body["messages"]).to eq([])
  end

  it "DELETE destroys conversation + messages" do
    tour = create(:tour, author: user)
    conv = create(:conversation, tour: tour, user: user)
    create(:message, conversation: conv, content: "x")
    login_as(user)
    expect {
      delete tour_conversation_path(tour)
    }.to change(Conversation, :count).by(-1).and change(Message, :count).by(-1)
  end

  it "denies non-member" do
    tour = create(:tour)
    login_as(user)
    get tour_conversation_path(tour)
    expect(response).to have_http_status(:not_found)
  end
end
