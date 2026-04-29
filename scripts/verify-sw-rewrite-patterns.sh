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

echo ""
echo "All SW rewrite patterns intact."
