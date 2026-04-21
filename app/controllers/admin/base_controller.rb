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

    # Navigation params we explicitly want logged. Everything else is
    # redacted to [FILTERED] — most notably `q`, which can contain user
    # emails when admins search the users list; Rails' default param
    # filter doesn't scrub `q`.
    LOGGED_PARAM_KEYS = %w[page sort range id].freeze

    def log_admin_access
      loggable = request.filtered_parameters
                        .except("controller", "action")
                        .each_with_object({}) do |(k, v), memo|
        memo[k] = LOGGED_PARAM_KEYS.include?(k) ? v : "[FILTERED]"
      end

      Rails.logger.info(
        "[admin] user=#{current_user.id} " \
        "action=#{controller_name}##{action_name} " \
        "params=#{loggable}"
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
