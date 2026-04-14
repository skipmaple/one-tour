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
        User.create!(
          email: email,
          name: auth.info.name.presence || auth.info.nickname || "User",
          avatar_url: auth.info.image
        )
      end
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
