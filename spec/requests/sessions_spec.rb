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

    it "sets Clear-Site-Data header so browser purges SW Cache Storage" do
      # 防设备共享时前一用户的 inertia-pages / active-storage-blobs cache
      # 被下一用户离线访问看到(privacy)。
      user = create(:user)
      post "/login_test", params: { user_id: user.id }
      delete "/logout"
      expect(response.headers["Clear-Site-Data"]).to eq('"cache", "storage"')
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

      it "valid secret 不计数(E2E 跑 100 次合法登入也不被限)" do
        # 50 次合法 secret 全 200,不撞限(模拟 E2E suite 100x staging 登入)
        50.times do
          post "/login_test", params: { user_id: user.id }, headers: { "X-Staging-Login-Secret" => secret }
          expect(response).to have_http_status(:ok)
        end
      end

      it "wrong-secret 5 次后 429(brute force defense)" do
        # 5 次错 secret 都返 404(staging gate 没通过)
        5.times do
          post "/login_test", params: { user_id: user.id }, headers: { "X-Staging-Login-Secret" => "wrong#{rand(1000)}" }
          expect(response).to have_http_status(:not_found)
        end
        # 第 6 次错 secret → 429,counter 已 trip
        post "/login_test", params: { user_id: user.id }, headers: { "X-Staging-Login-Secret" => "still-wrong" }
        expect(response).to have_http_status(:too_many_requests)
      end

      it "counter trip 后 valid secret 仍能登入(只 ban 失败请求)" do
        # 6 次错 secret → counter 已超 5,后续错请求会被 ban
        6.times do
          post "/login_test", params: { user_id: user.id }, headers: { "X-Staging-Login-Secret" => "wrong" }
        end
        # 但带 valid secret 进来仍能成功 —— 这是这次改造核心:合法 secret 不
        # 进 counter 计数,也不被 IP-ban 扫到。爆破方拿到正确 secret 才能登入,
        # 那时跟合法 user 一样,无差别。
        post "/login_test", params: { user_id: user.id }, headers: { "X-Staging-Login-Secret" => secret }
        expect(response).to have_http_status(:ok)
        expect(session[:user_id]).to eq(user.id)
      end
    end
  end
end
