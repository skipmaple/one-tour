source "https://rubygems.org"

# Bundle edge Rails instead: gem "rails", github: "rails/rails", branch: "main"
gem "rails", "~> 8.0.4"
# The modern asset pipeline for Rails [https://github.com/rails/propshaft]
gem "propshaft"
# Use postgresql as the database for Active Record
gem "pg", "~> 1.1"
# Use the Puma web server [https://github.com/puma/puma]
gem "puma", ">= 5.0"

# Use Active Model has_secure_password [https://guides.rubyonrails.org/active_model_basics.html#securepassword]
# gem "bcrypt", "~> 3.1.7"

# Windows does not include zoneinfo files, so bundle the tzinfo-data gem
gem "tzinfo-data", platforms: %i[ mswin mingw jruby ]

# Use the database-backed adapters for Rails.cache, Active Job, and Action Cable
gem "solid_cache"
gem "solid_queue"
gem "solid_cable"

# Reduces boot times through caching; required in config/boot.rb
gem "bootsnap", require: false

# Deploy this application anywhere as a Docker container [https://kamal-deploy.org]
gem "kamal", require: false

# Add HTTP asset caching/compression and X-Sendfile acceleration to Puma [https://github.com/basecamp/thruster/]
gem "thruster", require: false

# Use Active Storage variants [https://guides.rubyonrails.org/active_storage_overview.html#transforming-images]
gem "image_processing", "~> 1.2"

# S3-compatible client for Active Storage with Cloudflare R2 backend
gem "aws-sdk-s3", require: false

# Inertia
gem "inertia_rails"

# Vite
gem "vite_rails", "~> 3.10"

# Auth
gem "omniauth", "~> 2.1"
gem "omniauth-rails_csrf_protection"
gem "omniauth-github", "~> 2.0"
gem "omniauth-google-oauth2", "~> 1.2"
gem "omniauth-feishu", "~> 0.1"

# LLM
gem "ruby_llm"

gem "dotenv-rails", groups: [ :development, :test ]

group :development, :test do
  # See https://guides.rubyonrails.org/debugging_rails_applications.html#debugging-with-the-debug-gem
  gem "debug", platforms: %i[ mri mswin mingw ], require: "debug/prelude"

  # Static analysis for security vulnerabilities [https://brakemanscanner.org/]
  gem "brakeman", require: false

  # Omakase Ruby styling [https://github.com/rails/rubocop-rails-omakase/]
  gem "rubocop-rails-omakase", require: false

  gem "rspec-rails", "~> 7.0"
  gem "factory_bot_rails"
  gem "webmock"
  gem "climate_control"
end

group :development do
  # Use console on exceptions pages [https://github.com/rails/web-console]
  gem "web-console"

  # Preview sent emails in the browser
  gem "letter_opener"
end
