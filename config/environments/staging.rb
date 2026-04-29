require "active_support/core_ext/integer/time"

# Staging environment — 跑在 Vultr 45.63.23.136(老 prod box,与 Bitwarden +
# 自建 docker registry mirror 共享)。专门给 PWA E2E iOS Sim + Android
# Emu 用,不接 OSS / Resend / Sentry,不跑 background jobs。资源紧:1.9G RAM
# 共享,所以全部 in-process(memory_store + async queue + async cable)。
Rails.application.configure do
  config.enable_reloading = false
  config.eager_load = true
  config.consider_all_requests_local = false
  config.action_controller.perform_caching = true
  config.public_file_server.headers = { "cache-control" => "public, max-age=#{1.year.to_i}" }

  # 本地 Active Storage —— 不接 OSS。staging 测的是 PWA cache 行为,
  # 不是 OSS 真实 round-trip。挂在 /rails/storage(deploy.staging.yml
  # volume 持久化)。
  config.active_storage.service = :local

  # production.rb 用 :rails_storage_proxy 是为了绕 OSS SigV4 验签 quirk;
  # local service 没这个问题,但保持一致行为(blob URL 走 server 转发)
  # 也方便 PWA cache rule `/rails/active_storage/blobs/proxy/...` 命中。
  config.active_storage.resolve_model_to_route = :rails_storage_proxy

  config.assume_ssl = true
  config.force_ssl = true

  config.log_tags = [ :request_id ]
  config.logger   = ActiveSupport::TaggedLogging.logger(STDOUT)
  config.log_level = ENV.fetch("RAILS_LOG_LEVEL", "info")
  config.silence_healthcheck_path = "/up"
  config.active_support.report_deprecations = false

  # In-process 替代 solid_* 三件套 —— staging RAM 紧,不部 SolidCache /
  # SolidQueue / SolidCable 单独 DB,也不需要 background job 跑。
  config.cache_store = :memory_store
  config.active_job.queue_adapter = :async
  config.action_cable.allowed_request_origins = [ "https://staging.tour.skipmaple.com" ]

  # Mailer 在 staging 不真发(没 RESEND_API_KEY)。test 模式 deliveries 进
  # ActionMailer::Base.deliveries 数组,不会去打 SMTP。
  config.action_mailer.delivery_method = :test
  config.action_mailer.raise_delivery_errors = false
  config.action_mailer.default_url_options = { host: "staging.tour.skipmaple.com", protocol: "https" }

  config.i18n.fallbacks = true
  config.active_record.dump_schema_after_migration = false
  config.active_record.attributes_for_inspect = [ :id ]

  # DNS rebinding protection —— 只允许 staging 域名。
  config.hosts << "staging.tour.skipmaple.com"
  config.host_authorization = { exclude: ->(request) { request.path == "/up" } }
end
