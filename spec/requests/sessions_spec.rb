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

  describe "POST /login_test (staging gate)" do
    # Rails.env 在 spec 下是 'test',默认走 test 分支(无 gate);staging 分支
    # 在 prod 部署里才执行。spec 通过 stub Rails.env 来覆盖这条 gate 路径。
    let(:user) { create(:user) }
    let(:secret) { "s3cr3t-staging-token-xyz" }

    before do
      allow(Rails).to receive(:env).and_return(ActiveSupport::StringInquirer.new("staging"))
      stub_const("ENV", ENV.to_h.merge("STAGING_LOGIN_SECRET" => secret))
    end

    it "succeeds with correct X-Staging-Login-Secret header" do
      post "/login_test", params: { user_id: user.id }, headers: { "X-Staging-Login-Secret" => secret }
      expect(response).to have_http_status(:ok)
      expect(session[:user_id]).to eq(user.id)
    end

    it "rejects with wrong header(404,不泄漏 endpoint 存在)" do
      post "/login_test", params: { user_id: user.id }, headers: { "X-Staging-Login-Secret" => "wrong" }
      expect(response).to have_http_status(:not_found)
      expect(session[:user_id]).to be_nil
    end

    it "rejects without header" do
      post "/login_test", params: { user_id: user.id }
      expect(response).to have_http_status(:not_found)
      expect(session[:user_id]).to be_nil
    end

    it "rejects when STAGING_LOGIN_SECRET ENV unset(默认拒)" do
      stub_const("ENV", ENV.to_h.merge("STAGING_LOGIN_SECRET" => ""))
      post "/login_test", params: { user_id: user.id }, headers: { "X-Staging-Login-Secret" => "anything" }
      expect(response).to have_http_status(:not_found)
    end

    it "secret 对但 user_id 不存在 → 404" do
      post "/login_test", params: { user_id: 999_999 }, headers: { "X-Staging-Login-Secret" => secret }
      expect(response).to have_http_status(:not_found)
      expect(session[:user_id]).to be_nil
    end

    context "rate_limit (brute-force defense)" do
      # Rails 8 rate_limit 用 Rails.cache 做计数。test env 默认 :null_store 不
      # 累积,要测限流必须换真 cache。沿用 spec/requests/route_legs_spec.rb 同
      # 一模式,around 临时换 MemoryStore。
      around do |example|
        original = Rails.cache
        Rails.cache = ActiveSupport::Cache::MemoryStore.new
        example.run
      ensure
        Rails.cache = original
      end

      it "rate limits to 5 attempts per minute per IP (6th 返 429)" do
        # 5 次合法 secret 应都返 200(每次都成功登入)
        5.times do
          post "/login_test", params: { user_id: user.id }, headers: { "X-Staging-Login-Secret" => secret }
          expect(response).to have_http_status(:ok)
        end
        # 第 6 次同分钟同 IP → 429,不再走到 controller
        post "/login_test", params: { user_id: user.id }, headers: { "X-Staging-Login-Secret" => secret }
        expect(response).to have_http_status(:too_many_requests)
      end

      it "wrong-secret attempts also count toward limit (防 brute force)" do
        5.times do
          post "/login_test", params: { user_id: user.id }, headers: { "X-Staging-Login-Secret" => "wrong#{rand(1000)}" }
          expect(response).to have_http_status(:not_found)
        end
        post "/login_test", params: { user_id: user.id }, headers: { "X-Staging-Login-Secret" => secret }
        expect(response).to have_http_status(:too_many_requests)
      end
    end
  end
end
