RubyLLM.configure do |config|
  config.openai_api_key = ENV.fetch("OPENAI_API_KEY", "lm-studio")
  config.openai_api_base = ENV.fetch("OPENAI_API_BASE", "http://localhost:1234/v1")
  config.request_timeout = Rails.env.production? ? 120 : 60
  config.logger = Rails.logger
end
