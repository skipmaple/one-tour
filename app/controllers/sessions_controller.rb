class SessionsController < ApplicationController
  # /login_test 是 test + staging E2E 的自动化 backdoor —— 外部 POST 没 CSRF
  # token,Rails 默认 protect_from_forgery 拦掉返 422。test env 跑 spec 时
  # 默认 allow_forgery_protection = false 不踩,但 staging env 的 forgery
  # protection 是开的,所以 E2E 自动化必须显式 skip。安全等价:test_login
  # 内部已经用 X-Staging-Login-Secret header 严格 gate,header 对了 CSRF
  # 也没必要;header 错了直接 head :not_found,不会到 mutation 路径。
  skip_before_action :verify_authenticity_token, only: :test_login

  # Brute-force defense:同 IP 每分钟最多 5 次 /login_test 尝试,超出 429。
  # 64-byte STAGING_LOGIN_SECRET keyspace 已经实质不可能爆破,这条是 defense
  # in depth + 防 log noise / 容器 CPU。
  #
  # 用手动 cache.increment(同 RouteLegsController#throttle!)而不是 Rails 8
  # `rate_limit` 宏,因为后者在 class load 时把 Rails.cache 实例 capture 进
  # before_action 闭包,spec 替换 Rails.cache 后宏的 store 还指向原 :null_store
  # 不可测。手动 throttle per-request 取 Rails.cache.increment,可测。
  before_action :throttle_test_login!, only: :test_login

  def new
    render inertia: "Auth/Login", props: {
      dev_login_enabled: Rails.env.development?,
      # Staging 公开 URL,但 OAuth/Resend secrets 没 push 进 staging container,
      # 真 OAuth + email-code 都走不通。Login UI 在 staging 显示一个 secret-gate
      # form,team 成员从 .env.staging 拿 STAGING_LOGIN_SECRET 粘贴 + user_id
      # 即登入。Form 内部 POST /login_test 走同一条 header gate(secure_compare
      # + 长度判,brute force 不可行)。Prod 永远 false。
      # 同时要求 STAGING_LOGIN_SECRET 真有值 —— 没配 secret 时 form 显示但
      # 所有 submit 都会被 controller 内部 `expected.empty?` 拒,UI 会让人
      # 困惑找半天。直接不显示,顺带省掉无效请求。
      staging_login_enabled: Rails.env.staging? && ENV["STAGING_LOGIN_SECRET"].present?
    }
  end

  def create
    auth = request.env["omniauth.auth"]
    identity = find_or_create_identity(auth)
    session[:user_id] = identity.user.id
    redirect_to root_path
  end

  def destroy
    session.delete(:user_id)
    redirect_to root_path
  end

  def failure
    redirect_to login_path, alert: "Authentication failed: #{params[:message]}"
  end

  def send_code
    email = params[:email].to_s.strip
    EmailVerification::RateLimit.check_send!(email: email, ip: request.remote_ip)
    _record, code = EmailVerification.issue!(email: email, ip: request.remote_ip)
    EmailVerificationMailer.code_email(email: email, code: code).deliver_later
    render json: { ok: true }
  rescue EmailVerification::RateLimit::Error => e
    render json: { ok: false, error: e.message }, status: :too_many_requests
  rescue ActiveRecord::RecordInvalid
    render json: { ok: false, error: "邮箱格式不正确" }, status: :unprocessable_entity
  end

  def verify_code
    EmailVerification::RateLimit.check_verify!(ip: request.remote_ip)
    result, _rec = EmailVerification.verify!(email: params[:email], code: params[:code].to_s.strip)
    case result
    when :ok
      user = find_or_create_user_by_email(params[:email])
      session[:user_id] = user.id
      render json: { ok: true, redirect: root_path }
    when :invalid
      render json: { ok: false, error: "验证码错误" }, status: :unauthorized
    when :exhausted
      render json: { ok: false, error: "错误次数过多，请重新获取验证码" }, status: :unauthorized
    when :not_found
      render json: { ok: false, error: "验证码已过期或不存在，请重新获取" }, status: :unauthorized
    end
  rescue EmailVerification::RateLimit::Error => e
    render json: { ok: false, error: e.message }, status: :too_many_requests
  end

  # Test helper —— test env 跑 request spec 用(无 gate),staging env 给
  # PWA E2E 自动化用(必须带 X-Staging-Login-Secret header 才能用,值在
  # ENV 里;生产没人知道这值,加上 routes.rb 也只在 staging.rb 挂这条 route,
  # 双层 gate)。
  def test_login
    if Rails.env.test?
      session[:user_id] = params[:user_id]
      head :ok
    elsif Rails.env.staging? && staging_login_secret_valid?
      user = User.find_by(id: params[:user_id])
      if user
        session[:user_id] = user.id
        head :ok
      else
        head :not_found
      end
    else
      # 公开 staging 上 /login_test 总是被扫描器探测,raise RoutingError
      # 会每次产 error-level stack(放大 log noise + 轻 DoS)。直接 head :not_found
      # 同等 404 响应,不抛 exception。production 命中此分支也走这条。
      head :not_found
    end
  end

  private

    TEST_LOGIN_RATE_LIMIT = 5
    TEST_LOGIN_RATE_WINDOW = 1.minute

    def throttle_test_login!
      key = "throttle:login_test:#{request.remote_ip}"
      count = Rails.cache.increment(key, 1, expires_in: TEST_LOGIN_RATE_WINDOW)
      head :too_many_requests if count && count > TEST_LOGIN_RATE_LIMIT
    end

    def staging_login_secret_valid?
      expected = ENV["STAGING_LOGIN_SECRET"].to_s
      return false if expected.empty? # 没配 secret 直接拒,默认拒
      provided = request.headers["X-Staging-Login-Secret"].to_s
      # secure_compare 要求两边等长才是 constant-time,长度不等的实现可能直接
      # raise(老 Ruby) 或泄漏 timing(差长度的早期退出)。先长度判,再 compare。
      return false unless provided.bytesize == expected.bytesize
      ActiveSupport::SecurityUtils.secure_compare(provided, expected)
    end

    def find_or_create_user_by_email(raw_email)
      email = EmailVerification.normalize_email(raw_email)
      User.find_by(email: email) || User.create!(
        email: email,
        name:  sanitize_name(email.split("@").first, fallback: "user")
      )
    end

    def find_or_create_identity(auth)
      identity = OauthIdentity.find_by(provider: auth.provider, uid: auth.uid)
      credentials = auth.credentials ? auth.credentials.to_h : {}

      if identity
        identity.update(credentials: credentials)
        identity
      else
        user = find_or_create_user(auth)
        user.oauth_identities.create!(
          provider: auth.provider,
          uid: auth.uid,
          credentials: credentials
        )
      end
    end

    def find_or_create_user(auth)
      email = auth.info.email.presence || fallback_email(auth)
      if user = User.find_by(email: email)
        user
      else
        raw_name = auth.info.name.presence || auth.info.nickname
        User.create!(
          email: email,
          name: sanitize_name(raw_name, fallback: "user"),
          avatar_url: auth.info.image
        )
      end
    end

    def sanitize_name(raw, fallback:)
      cleaned = raw.to_s.gsub(/[^A-Za-z0-9\u4e00-\u9fff]/, "")[0, 30]
      cleaned.presence || fallback
    end

    def fallback_email(auth)
      case auth.provider
      when "github"
        "#{auth.uid}+#{auth.info.nickname}@users.noreply.github.com"
      when "feishu"
        "#{auth.uid}@feishu.noreply.lark.com"
      else
        raise "No email returned from #{auth.provider}"
      end
    end
end
