# omniauth-feishu uses user_id as uid, but user_id is nil for users outside the
# app's tenant. open_id is always present and is the correct OAuth identifier.
OmniAuth::Strategies::Feishu.class_eval do
  uid { raw_info["open_id"] || raw_info["user_id"] }
end

Rails.application.config.middleware.use OmniAuth::Builder do
  if Rails.env.development?
    provider :developer, fields: [ :name, :email ], uid_field: :email
  end

  provider :github, ENV["GITHUB_CLIENT_ID"], ENV["GITHUB_CLIENT_SECRET"], scope: "user:email"
  provider :google_oauth2, ENV["GOOGLE_CLIENT_ID"], ENV["GOOGLE_CLIENT_SECRET"]
  provider :feishu, ENV["FEISHU_APP_ID"], ENV["FEISHU_APP_SECRET"]
end

OmniAuth.config.on_failure = Proc.new { |env|
  OmniAuth::FailureEndpoint.new(env).redirect_to_failure
}

# Developer strategy requires GET to serve its login form
if Rails.env.development?
  OmniAuth.config.allowed_request_methods = [ :post, :get ]
end
