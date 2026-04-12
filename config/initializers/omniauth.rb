Rails.application.config.middleware.use OmniAuth::Builder do
  if Rails.env.development?
    provider :developer, fields: [:name, :email], uid_field: :email
  end

  provider :github, ENV["GITHUB_CLIENT_ID"], ENV["GITHUB_CLIENT_SECRET"]
  provider :google_oauth2, ENV["GOOGLE_CLIENT_ID"], ENV["GOOGLE_CLIENT_SECRET"]
  provider :wechat, ENV["WECHAT_APP_ID"], ENV["WECHAT_APP_SECRET"]
  provider :feishu, ENV["FEISHU_APP_ID"], ENV["FEISHU_APP_SECRET"]
end

OmniAuth.config.on_failure = Proc.new { |env|
  OmniAuth::FailureEndpoint.new(env).redirect_to_failure
}
