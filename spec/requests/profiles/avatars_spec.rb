require "rails_helper"

RSpec.describe "DELETE /profile/avatar", type: :request do
  let(:user) { create(:user) }

  def login_as(u)
    post "/login_test", params: { user_id: u.id }
  end

  def attach_fixture(u)
    u.avatar.attach(
      io: File.open(Rails.root.join("spec/fixtures/files/avatar.png")),
      filename: "avatar.png",
      content_type: "image/png"
    )
  end

  it "redirects to /login when not logged in" do
    delete "/profile/avatar"
    expect(response).to redirect_to(login_path)
  end

  describe "when logged in" do
    before { login_as(user) }

    it "enqueues ActiveStorage::PurgeJob when an avatar is attached" do
      attach_fixture(user)
      expect {
        delete "/profile/avatar"
      }.to have_enqueued_job(ActiveStorage::PurgeJob)
    end

    it "is a harmless no-op when no avatar attached" do
      expect {
        delete "/profile/avatar"
      }.not_to raise_error
      expect(response).to have_http_status(:redirect)
    end
  end
end
