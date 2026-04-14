require "rails_helper"

RSpec.describe "Email verification sessions", type: :request do
  include ActiveJob::TestHelper

  describe "POST /auth/email/send" do
    it "creates an EmailVerification and enqueues a mailer" do
      expect {
        post "/auth/email/send", params: { email: "new@example.com" }, as: :json
      }.to change(EmailVerification, :count).by(1)
        .and have_enqueued_mail(EmailVerificationMailer, :code_email)

      expect(response).to have_http_status(:ok)
      expect(response.parsed_body["ok"]).to be true
    end

    it "normalizes the email (downcase + strip)" do
      post "/auth/email/send", params: { email: " User@Example.COM " }, as: :json
      expect(EmailVerification.last.email).to eq "user@example.com"
    end

    it "returns 429 when sending twice within 60 seconds" do
      post "/auth/email/send", params: { email: "a@b.com" }, as: :json
      post "/auth/email/send", params: { email: "a@b.com" }, as: :json

      expect(response).to have_http_status(:too_many_requests)
      expect(response.parsed_body["error"]).to match(/秒后再试/)
    end

    it "returns 422 for malformed email" do
      post "/auth/email/send", params: { email: "not-an-email" }, as: :json
      expect(response).to have_http_status(:unprocessable_entity)
    end
  end

  describe "POST /auth/email/verify" do
    let(:email) { "user@example.com" }

    def issue_code_for(email)
      _record, code = EmailVerification.issue!(email: email, ip: "127.0.0.1")
      code
    end

    it "creates a new user and sets session on first successful verification" do
      code = issue_code_for(email)

      expect {
        post "/auth/email/verify", params: { email: email, code: code }, as: :json
      }.to change(User, :count).by(1)

      expect(response).to have_http_status(:ok)
      expect(response.parsed_body["ok"]).to be true
      expect(response.parsed_body["redirect"]).to eq "/"
      expect(session[:user_id]).to eq User.last.id

      user = User.last
      expect(user.email).to eq email
      expect(user.name).to eq "user"
    end

    it "reuses an existing user matching the email" do
      existing = create(:user, email: email)
      code = issue_code_for(email)

      expect {
        post "/auth/email/verify", params: { email: email, code: code }, as: :json
      }.not_to change(User, :count)

      expect(session[:user_id]).to eq existing.id
    end

    it "returns 401 with '验证码错误' for wrong code" do
      issue_code_for(email)
      post "/auth/email/verify", params: { email: email, code: "000000" }, as: :json
      expect(response).to have_http_status(:unauthorized)
      expect(response.parsed_body["error"]).to eq "验证码错误"
    end

    it "returns 401 with 'not found' message when no pending code" do
      post "/auth/email/verify", params: { email: email, code: "123456" }, as: :json
      expect(response).to have_http_status(:unauthorized)
      expect(response.parsed_body["error"]).to match(/已过期/)
    end

    it "invalidates other pending codes for the same email after success" do
      _code1 = issue_code_for(email)
      travel_to(61.seconds.from_now) do
        code2 = issue_code_for(email)
        post "/auth/email/verify", params: { email: email, code: code2 }, as: :json
        expect(response).to have_http_status(:ok)
      end

      expect(EmailVerification.where(email: email, used_at: nil).count).to eq 0
    end
  end
end
