#!/usr/bin/env bash
# Kamal staging wrapper —— 强制 `-c config/staging/deploy.yml` 模式 +
# pre-flight prod host 白名单检查 + 隔离 secrets-common(避免 prod env 漏过来)。
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
# 3. 临时挪开 .kamal/secrets-common(prod 专用密码源),kamal staging 只 source
#    .kamal/staging/secrets(staging 自包含)
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
SECRETS_FILE=".kamal/staging/secrets"
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

# ---- 2. 临时挪开 secrets-common(避免 prod env 漏入 staging container)----
SC_DISABLED=""
if [[ -f .kamal/secrets-common ]]; then
  # 上次运行如果异常中断,可能留下 .staging-shielded 残骸,直接 mv 会覆盖它
  # 丢真实 secrets-common(那是 prod 密码总源)。检测到就 abort 让人手清。
  if [[ -e .kamal/secrets-common.staging-shielded ]]; then
    echo "❌ .kamal/secrets-common.staging-shielded 已存在 —— 上次运行可能崩溃留下"
    echo "    手动核对两个文件内容,删旧的(or rename),然后重跑。"
    echo "    diff .kamal/secrets-common .kamal/secrets-common.staging-shielded"
    exit 1
  fi
  mv .kamal/secrets-common .kamal/secrets-common.staging-shielded
  SC_DISABLED="yes"
fi
trap '
  if [[ "$SC_DISABLED" == "yes" && -f .kamal/secrets-common.staging-shielded ]]; then
    mv .kamal/secrets-common.staging-shielded .kamal/secrets-common
  fi
' EXIT

# ---- 3. Source staging secrets 进 env ----
if [[ ! -f "$SECRETS_FILE" ]]; then
  echo "❌ $SECRETS_FILE 不存在"
  exit 1
fi
set -a
# shellcheck disable=SC1091
source "$SECRETS_FILE"
set +a

# ---- 4. Run kamal ----
echo "==> bin/kamal $* -c $CONFIG"
bin/kamal "$@" -c "$CONFIG"
