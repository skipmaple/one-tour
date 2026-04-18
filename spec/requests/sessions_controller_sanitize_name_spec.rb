require "rails_helper"

RSpec.describe "Sessions controller name sanitization", type: :request do
  describe "email-code signup" do
    before do
      allow(EmailVerification::RateLimit).to receive(:check_send!)
      allow(EmailVerification::RateLimit).to receive(:check_verify!)
    end

    it "strips punctuation from the email prefix when creating a user" do
      email = "drew.lee+test@example.com"
      _record, code = EmailVerification.issue!(email: email, ip: "1.2.3.4")
      post "/auth/email/verify", params: { email: email, code: code }
      user = User.find_by(email: "drew.lee+test@example.com")
      expect(user).to be_present
      expect(user.name).to eq("drewleetest")
    end

    it "falls back to 'user' when sanitization produces empty string" do
      email = "+.+.@example.com"
      _record, code = EmailVerification.issue!(email: email, ip: "1.2.3.4")
      post "/auth/email/verify", params: { email: email, code: code }
      user = User.find_by(email: "+.+.@example.com")
      expect(user).to be_present
      expect(user.name).to eq("user")
    end
  end

  describe "OAuth signup" do
    before do
      OmniAuth.config.test_mode = true
      OmniAuth.config.mock_auth[:github] = OmniAuth::AuthHash.new(
        provider: "github",
        uid: "12345",
        info: { email: "drew@example.com", name: "Drew Lee", image: "https://example.com/a.png" },
        credentials: {}
      )
    end

    after  { OmniAuth.config.test_mode = false }

    it "strips spaces from the OAuth-provided name" do
      get "/auth/github/callback"
      user = User.find_by(email: "drew@example.com")
      expect(user).to be_present
      expect(user.name).to eq("DrewLee")
    end
  end
end
