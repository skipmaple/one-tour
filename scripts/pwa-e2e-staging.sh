#!/usr/bin/env bash
# Run PWA E2E against staging.tour.skipmaple.com via Playwright 移动 device
# profile(Pixel 5 + iPhone 15)。
#
# 前置:
# 1. PR #58 merged + `kamal -d staging setup` 跑过
# 2. `kamal -d staging app exec --reuse "bin/rails db:seed"` 创建测试用户
# 3. `.env.staging` 含 STAGING_LOGIN_SECRET
# 4. 取 staging test user id:
#    kamal -d staging app exec --reuse "bin/rails runner 'puts User.find_by(email: %{staging-e2e@example.com}).id'"
#    然后填进 .env.staging:STAGING_TEST_USER_ID=<id>
#
# 用:`scripts/pwa-e2e-staging.sh`

set -euo pipefail

cd "$(dirname "$0")/.."

# 注入 staging secrets
if [[ -f .env.staging ]]; then
  set -a
  # shellcheck disable=SC1091
  source .env.staging
  set +a
fi

: "${STAGING_LOGIN_SECRET:?need STAGING_LOGIN_SECRET in .env.staging}"
: "${STAGING_TEST_USER_ID:?need STAGING_TEST_USER_ID in .env.staging — kamal app exec runner User.find_by(email:).id}"

export STAGING_URL="${STAGING_URL:-https://staging.tour.skipmaple.com}"

echo "==> Running PWA E2E against $STAGING_URL"
echo "==> Profiles: Pixel 5 (Android Chrome 模拟) + iPhone 15 (WebKit 模拟)"
echo

npx playwright test --config playwright.config.staging.js "$@"
