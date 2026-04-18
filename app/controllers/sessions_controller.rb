class SessionsController < ApplicationController
  def new
    render inertia: "Auth/Login", props: { dev_login_enabled: Rails.env.development? }
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

  # Test-only action for setting session in request specs
  def test_login
    if Rails.env.test?
      session[:user_id] = params[:user_id]
      head :ok
    else
      raise ActionController::RoutingError, "Not Found"
    end
  end

  private
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
