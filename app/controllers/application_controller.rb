class ApplicationController < ActionController::Base
  inertia_share flash: -> { { alert: flash[:alert], notice: flash[:notice] } }
  inertia_share current_user: -> { current_user&.as_json(only: [ :id, :name, :email, :avatar_url ]) }
  # Expose AMAP Web JS credentials to the frontend. AMAP 2.0 requires BOTH
  # the key and the security code to be set before the SDK script runs; both
  # are domain-allowlist protected in the AMAP console, so leaking them in
  # page source is the intended model (same as Google Maps API keys).
  # The REST key (ENV["AMAP_API_KEY"]) stays server-side only, used by
  # PoiSearch; never shared to the browser.
  inertia_share amap_js_api_key:       -> { ENV["AMAP_JS_API_KEY"] }
  inertia_share amap_js_security_code: -> { ENV["AMAP_JS_API_SECURITY_CODE"] }

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
