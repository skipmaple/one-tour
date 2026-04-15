class ApplicationController < ActionController::Base
  inertia_share flash: -> { { alert: flash[:alert], notice: flash[:notice] } }
  inertia_share current_user: -> { current_user&.as_json(only: [ :id, :name, :email, :avatar_url ]) }
  # Expose AMAP web JS key to the frontend. AMAP protects it with a domain
  # allowlist configured in the AMAP console; leaking it in page source is
  # expected (same model as Google Maps API keys).
  inertia_share amap_api_key: -> { ENV["AMAP_API_KEY"] }

  helper_method :current_user, :logged_in?

  def current_user
    if session[:user_id]
      @current_user ||= User.find_by(id: session[:user_id])
    end
  end

  def logged_in?
    current_user.present?
  end

  private
    def require_login
      unless logged_in?
        redirect_to login_path
      end
    end
end
