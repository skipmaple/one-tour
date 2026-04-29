# Seeds: intentionally empty after Tour remodel. Add Tour seeds when needed.

if Rails.env.development?
  User.first&.update!(role: :admin)
end

if Rails.env.staging?
  # PWA E2E 测试用户。固定 email + name,Playwright 通过 /login_test
  # POST `user_id` = 这个 user 的 id 拿登录 session(spec 启动前会
  # 通过 ENV STAGING_TEST_USER_EMAIL 反查 id)。
  User.find_or_create_by!(email: "staging-e2e@example.com") do |u|
    u.name = "StagingE2E"
  end
end
