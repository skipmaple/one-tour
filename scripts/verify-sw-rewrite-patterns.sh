#!/usr/bin/env bash
# CI gsub 护栏 —— 防 vite-plugin-pwa 升级静默 break SW。
#
# ServiceWorkersController#show 用 2 条 gsub 改 SW 内部相对路径
# 把它从 /vite/sw.js 提到 / scope:
#   define(["./workbox-XXX"], ...)  → define(["/vite/workbox-XXX"], ...)
#   url:"assets/foo"                → url:"/vite/assets/foo"
#
# Workbox / vite-plugin-pwa 的 bundle 输出格式不是 public API。任何
# 次版本升级都可能改 define() 的 import 写法或 precache 字段名 ——
# gsub 静默不命中 → SW 注册成功 + 浏览器 controller 设上 + Rails ETag
# 200 OK,**唯一症状是 cache 永远空**,Sentry / 浏览器 console 都没信号。
# 出行中触发就是离线打不开。
#
# 这个脚本在 prod build 后跑:确认 2 个 pattern 都还在 sw.js 里;
# 任一不命中 exit 1,CI 红。维护成本是改 controller 同步更新 pattern。

set -euo pipefail

SW_FILE="public/vite/sw.js"

if [[ ! -f "$SW_FILE" ]]; then
  echo "::error::SW file not found at $SW_FILE — 先跑 'npx vite build'"
  exit 1
fi

declare -a PATTERNS=(
  'define\(\["\./workbox-'
  'url:"assets/'
)

declare -a DESCRIPTIONS=(
  'workbox runtime chunk import: define(["./workbox-XXX"], ...)'
  'precache asset URL prefix: url:"assets/..."'
)

failed=0
for i in "${!PATTERNS[@]}"; do
  pattern="${PATTERNS[$i]}"
  desc="${DESCRIPTIONS[$i]}"
  if grep -qE "$pattern" "$SW_FILE"; then
    echo "✓ pattern intact: $desc"
  else
    echo "::error::pattern NOT matched: $desc"
    failed=1
  fi
done

if [[ $failed -eq 1 ]]; then
  echo ""
  echo "::error::ServiceWorkersController#show 的 gsub 重写依赖以上 pattern"
  echo "::error::Pattern 不命中 → SW 注册成功但 Workbox runtime 模块 404 → cache 永远空,无报错信号"
  echo "::error::常见原因:vite-plugin-pwa 升级改了 bundle 输出格式"
  echo "::error::修法:同步更新 app/controllers/service_workers_controller.rb 的 gsub regex,或锁回旧版 vite-plugin-pwa"
  exit 1
fi

# === Outbox SW handler 内联护栏 ===
#
# Workbox generateSW 只 serialize handler arrow function body,**不跟 named
# reference**。如果谁在 vite.config.ts 里再把 outbox 逻辑抽成 top-level helper
# (如 enqueueFromRequest / outboxHandler / outboxUrlPattern),Workbox 把 handler
# body serialize 出来时这些 name 变成 SW 上下文里 undefined 的 free variable —
# 第一次 offline mutation 触发就 ReferenceError。**症状无 Sentry / 无 console
# 错误**(SW 静默 swallow handler exception),用户看到的是请求挂死。
#
# 这里负向锚:三个 helper 名字一旦在 sw.js 里出现就 fail CI。正向锚 'one-tour-outbox'
# 确保 IDB enqueue 逻辑确实进了 build(若整个 outbox 路径误删,正向锚也会爆)。

declare -a OUTBOX_FORBIDDEN=(
  'enqueueFromRequest'
  'outboxHandler'
  'outboxUrlPattern'
)

for sym in "${OUTBOX_FORBIDDEN[@]}"; do
  if grep -q "$sym" "$SW_FILE"; then
    echo "::error::SW contains forbidden named reference: $sym"
    echo "::error::Workbox generateSW does not follow named references — they become ReferenceError at SW runtime."
    echo "::error::Inline the helper body directly inside the runtimeCaching handler arrow function."
    echo "::error::See vite.config.ts comment block above the outbox runtimeCaching entries."
    exit 1
  fi
done
echo "✓ outbox guard: no forbidden named refs in sw.js"

if grep -q "one-tour-outbox" "$SW_FILE"; then
  echo "✓ outbox guard: IDB enqueue logic present (one-tour-outbox 字面量出现在 sw.js)"
else
  echo "::error::SW does not contain 'one-tour-outbox' — IDB enqueue handler missing from build"
  echo "::error::Either the outbox runtimeCaching entries got removed, or generateSW 跳过了它们"
  echo "::error::检查 vite.config.ts 里 POST + PATCH 两条 outbox runtimeCaching 还在,且 handler body 完整 inline"
  exit 1
fi

# Inertia 兼容响应分流必须 inline。Copilot review item #1 关键修复:SW 返
# plain 202 时 Inertia router 会显错误 modal "All Inertia requests must receive
# a valid Inertia response"。修后用 X-Inertia: true 加 cached 页响应分流。
# 如果有人 refactor 把这部分抽 named helper,Workbox generateSW 序列化会丢,
# error modal 又会回来 — 这条护栏防 regression。
if grep -q "X-Inertia" "$SW_FILE"; then
  echo "✓ outbox guard: Inertia-aware response branch present (X-Inertia 字面量出现)"
else
  echo "::error::SW does not contain 'X-Inertia' — Inertia-compatible response branch missing"
  echo "::error::没这分支 SW 会返 plain 202,Inertia client 显错误 modal 给用户。"
  echo "::error::检查 vite.config.ts outboxHandler 里 X-Inertia 分流逻辑还在 + cache.match(referrer) 还在"
  exit 1
fi

echo ""
echo "All SW rewrite patterns intact + outbox handler inlining + Inertia branching verified."
