#!/usr/bin/env bash
# Kamal staging wrapper —— 强制 `-c config/staging/deploy.yml` 模式 +
# pre-flight prod host 白名单检查 + 注入 staging secrets。
#
# ## 为什么不用 `kamal -d staging`
#
# `kamal -d <dest>` 实际是 `deploy.yml deep-merge deploy.<dest>.yml`,**不是
# 替换**。prod 的 `servers.web: [43.103.50.22]` 不会被 staging 的
# `[45.63.23.136]` 替换 —— 实测 kamal 同时把命令送到两台 host。如果不及时
# Ctrl+C,下一步 `app boot` 会以 staging tag 在 prod 起容器,RAILS_ENV=staging
# 接管 prod 流量,prod 当场炸。
#
# 这个 wrapper 强制:
# 1. `-c config/staging/deploy.yml` 单文件模式(kamal 不 merge deploy.yml)
# 2. pre-flight grep prod IP — resolved config 里看到立刻 abort
# 3. 把 `.kamal/staging/secrets` 拷到 `.kamal/secrets` —— kamal source 顺序里
#    secrets-common 先(prod 共享:KAMAL_REGISTRY_PASSWORD / RAILS_MASTER_KEY
#    在这),`.kamal/secrets` 后(staging override:ONE_TOUR_DATABASE_PASSWORD
#    等共享 key 被 staging 值覆盖,也加了新 STAGING_LOGIN_SECRET)。后 source
#    胜,staging container 拿到正确的 staging 密码。trap 退出清掉 .kamal/secrets,
#    不污染 prod 部署。
#
# ## 用法
#
#   scripts/kamal-staging.sh setup       # 首次部署
#   scripts/kamal-staging.sh deploy      # 后续部署
#   scripts/kamal-staging.sh app exec --reuse "bin/rails db:seed"
#   scripts/kamal-staging.sh logs

set -euo pipefail

cd "$(dirname "$0")/.."

CONFIG="config/staging/deploy.yml"
STAGING_SECRETS=".kamal/staging/secrets"
KAMAL_SECRETS=".kamal/secrets"
PROD_HOST_PATTERN='43\.103\.50\.22'   # 阿里云 prod IP — 永远不能在 staging resolved config 里出现

# ---- 1. Pre-flight: resolved config 不能含 prod IP ----
echo "==> Pre-flight: resolved config host whitelist..."
RESOLVED=$(bin/kamal config -c "$CONFIG" 2>&1) || {
  echo "❌ kamal config -c $CONFIG 失败"
  echo "$RESOLVED" | tail -20
  exit 1
}
if echo "$RESOLVED" | grep -qE "$PROD_HOST_PATTERN"; then
  echo "❌ FATAL: prod host 匹配 $PROD_HOST_PATTERN 在 resolved staging config 里"
  echo "    继续会动到 prod。abort。"
  echo "$RESOLVED" | grep -E "$PROD_HOST_PATTERN" | head -5
  exit 1
fi
echo "    ✓ resolved config 干净,只含 staging host"

# ---- 2. 注入 staging secrets 到 .kamal/secrets ----
# kamal source 顺序:secrets-common(prod 共享)→ .kamal/secrets(staging override)
# 共享 key(ONE_TOUR_DATABASE_PASSWORD 等)会被 staging 值覆盖,新 key
# (STAGING_LOGIN_SECRET)由 staging secrets 引入。
if [[ -e "$KAMAL_SECRETS" ]]; then
  # 上次运行如果异常中断,可能留下 .staging-bak 残骸,直接 mv 会覆盖它丢
  # 真实文件。检测到就 abort 让人手清。
  if [[ -e "$KAMAL_SECRETS.staging-bak" ]]; then
    echo "❌ $KAMAL_SECRETS.staging-bak 已存在 —— 上次运行可能崩溃留下"
    echo "    手动核对两个文件内容,删旧的(or rename),然后重跑。"
    echo "    diff $KAMAL_SECRETS $KAMAL_SECRETS.staging-bak"
    exit 1
  fi
  mv "$KAMAL_SECRETS" "$KAMAL_SECRETS.staging-bak"
fi
cp "$STAGING_SECRETS" "$KAMAL_SECRETS"
trap 'rm -f "$KAMAL_SECRETS"; if [[ -e "$KAMAL_SECRETS.staging-bak" ]]; then mv "$KAMAL_SECRETS.staging-bak" "$KAMAL_SECRETS"; fi' EXIT

# ---- 3. Run kamal ----
echo "==> bin/kamal $* -c $CONFIG"
bin/kamal "$@" -c "$CONFIG"
