#!/usr/bin/env bash
# Generate test fixture images. Run from repo root: ./tests/e2e/fixtures/generate.sh
set -euo pipefail

cd "$(dirname "$0")"

# Prefer IMv7 `magick`; fall back to legacy `convert` for IMv6.
if command -v magick >/dev/null 2>&1; then
  IM=magick
elif command -v convert >/dev/null 2>&1; then
  IM=convert
else
  echo "ImageMagick not found. brew install imagemagick" >&2
  exit 1
fi

# 200KB JPEG (case 2 - 不压缩跳过阈值之下)
# plasma 噪声 + 量化让 JPEG 真到 ~200KB(纯色 xc:steelblue 只有 3KB)
$IM -size 1200x900 plasma: -quality 80 200kb.jpg

# 5MB JPEG (主力压缩用例) — plasma 高熵 + 调过 size/quality 使输出在 ~5MB
# 实测:4500x3000 quality 93 → ~5.0MB(plasma 噪声,quality 微调到 93 是 ~5MB sweet spot)
$IM -size 4500x3000 plasma: -quality 93 5mb.jpg

# 6MB JPEG (case 7 - 大于历史 5MB receipt 限,压缩后通过)
# 实测:4800x3200 quality 93 → ~5.7MB(略低于 6MB 名,但满足 "压完仍通过 5MB 限" 的测试意图)
$IM -size 4800x3200 plasma: -quality 93 6mb.jpg

# 60MB 假大文件(case 4 - 拒绝)
dd if=/dev/urandom of=60mb.jpg bs=1M count=60 status=none

# Animated GIF (case 3)
$IM -size 200x200 \( xc:red \) \( xc:blue \) \( xc:green \) -delay 50 -loop 0 animated.gif

# 1MB PNG (case 10 - PNG → WebP)
$IM -size 2000x2000 plasma: photo.png

echo "Fixtures generated:"
ls -lh *.jpg *.png *.gif
