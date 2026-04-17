require "rails_helper"

RSpec.describe "Conversations::Messages", type: :request do
  def login_as(user)
    post "/login_test", params: { user_id: user.id }
  end

  let(:user) { create(:user) }

  it "POST creates user message and enqueues ChatStreamJob" do
    tour = create(:tour, author: user)
    login_as(user)
    expect {
      post tour_conversation_messages_path(tour), params: { content: "hello" }
    }.to change(Message, :count).by(1).and have_enqueued_job(ChatStreamJob)
    body = JSON.parse(response.body)
    expect(body["message"]["content"]).to eq("hello")
  end

  it "non-editor is forbidden" do
    tour = create(:tour)
    login_as(user)
    post tour_conversation_messages_path(tour), params: { content: "x" }
    expect(response).to have_http_status(:forbidden)
  end
end
