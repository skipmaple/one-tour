class SessionsController < ApplicationController
  def new
    render inertia: "Auth/Login"
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
    raise ActionController::RoutingError, "Not Found" unless Rails.env.test?
    session[:user_id] = params[:user_id]
    head :ok
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
      if user = User.find_by(email: auth.info.email)
        user
      else
        User.create!(
          email: auth.info.email,
          name: auth.info.name,
          avatar_url: auth.info.image
        )
      end
    end
end
