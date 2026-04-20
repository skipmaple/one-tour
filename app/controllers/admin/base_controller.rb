module Admin
  class BaseController < ApplicationController
    before_action :require_admin!
    before_action :log_admin_access

    private

    def require_admin!
      unless current_user&.admin?
        raise ActionController::RoutingError.new("Not Found")
      end
    end

    def log_admin_access
      Rails.logger.info(
        "[admin] user=#{current_user.id} " \
        "action=#{controller_name}##{action_name} " \
        "params=#{request.filtered_parameters.except('controller', 'action')}"
      )
      Sentry.add_breadcrumb(
        Sentry::Breadcrumb.new(
          category: "admin",
          message: "#{controller_name}##{action_name}",
          level: "info"
        )
      )
    end
  end
end
