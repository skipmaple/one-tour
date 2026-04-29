# Seeds: intentionally empty after Tour remodel. Add Tour seeds when needed.

if Rails.env.development?
  User.first&.update!(role: :admin)
end

if Rails.env.staging?
  # PWA E2E 测试用户。固定 email + name(staging-e2e@example.com /
  # StagingE2E),Playwright 通过 /login_test POST `user_id` = 这个 user 的
  # id 拿登录 session,spec / wrapper script 通过 ENV STAGING_TEST_USER_ID
  # 拿这个 id(取法见 scripts/pwa-e2e-staging.sh 头注释)。
  User.find_or_create_by!(email: "staging-e2e@example.com") do |u|
    u.name = "StagingE2E"
  end
end
