class ApplicationController < ActionController::Base
  inertia_share flash: -> { { alert: flash[:alert], notice: flash[:notice] } }

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
