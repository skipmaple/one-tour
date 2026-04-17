if ENV["SENTRY_DSN_BACKEND"].present?
  Sentry.init do |config|
    config.dsn = ENV["SENTRY_DSN_BACKEND"]
    config.breadcrumbs_logger = [ :active_support_logger, :http_logger ]

    # PII filter — AI chat message bodies must never leave our servers.
    config.send_default_pii = false

    # Errors always 100%; traces scaled down in prod to protect free-tier quota.
    config.traces_sample_rate = Rails.env.production? ? 0.1 : 1.0

    config.environment = Rails.env
    config.enabled_environments = %w[ development production ]
    config.release = ENV["KAMAL_VERSION"] || "dev"
  end
end
