require "rails_helper"

RSpec.describe "Sessions", type: :request do
  before do
    OmniAuth.config.test_mode = true
  end

  describe "GET /auth/github/callback" do
    before do
      OmniAuth.config.mock_auth[:github] = OmniAuth::AuthHash.new(
        provider: "github",
        uid: "12345",
        info: {
          email: "user@example.com",
          name: "GitHub User",
          image: "https://avatars.example.com/u/12345"
        },
        credentials: {
          token: "mock_token"
        }
      )
    end

    it "creates a new user and oauth identity on first login" do
      expect {
        get "/auth/github/callback"
      }.to change(User, :count).by(1)
        .and change(OauthIdentity, :count).by(1)

      user = User.last
      expect(user.email).to eq "user@example.com"
      expect(user.name).to eq "GitHubUser"
      expect(response).to redirect_to(root_path)
    end

    it "reuses existing user when email matches" do
      existing = create(:user, email: "user@example.com")

      expect {
        get "/auth/github/callback"
      }.to change(User, :count).by(0)
        .and change(OauthIdentity, :count).by(1)

      expect(OauthIdentity.last.user).to eq existing
    end

    it "reuses existing oauth identity on subsequent logins" do
      get "/auth/github/callback"

      expect {
        get "/auth/github/callback"
      }.to change(User, :count).by(0)
        .and change(OauthIdentity, :count).by(0)
    end

    it "sets the session" do
      get "/auth/github/callback"
      expect(session[:user_id]).to eq User.last.id
    end
  end

  describe "DELETE /logout" do
    it "clears the session" do
      user = create(:user)
      post "/login_test", params: { user_id: user.id }
      delete "/logout"
      expect(session[:user_id]).to be_nil
      expect(response).to redirect_to(root_path)
    end
  end
end
