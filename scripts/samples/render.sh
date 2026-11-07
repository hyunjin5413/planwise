#!/bin/sh
# SVG 샘플 도면을 PNG(4961×3508, 300dpi)와 A3 PDF로 변환한다. Chrome 필요.
set -e
CH="${CHROME:-/Applications/Google Chrome.app/Contents/MacOS/Google Chrome}"
DIR="$(cd "$(dirname "$0")/../../public/samples" && pwd)"
PROFILE="$(mktemp -d)"
for svg in "$DIR"/*.svg; do
  id="$(basename "$svg" .svg)"
  "$CH" --headless=new --disable-gpu --hide-scrollbars --user-data-dir="$PROFILE" \
    --window-size=4961,3508 --force-device-scale-factor=1 --virtual-time-budget=3000 \
    --screenshot="$DIR/$id.png" "file://$svg" >/dev/null 2>&1
  html="$PROFILE/$id.html"
  printf '<!doctype html><html><head><meta charset="utf-8"><style>@page{size:420mm 297mm;margin:0}html,body{margin:0}img{width:420mm;height:297mm;display:block}</style></head><body><img src="file://%s"></body></html>' "$svg" > "$html"
  "$CH" --headless=new --disable-gpu --user-data-dir="$PROFILE" --no-pdf-header-footer \
    --virtual-time-budget=3000 --print-to-pdf="$DIR/$id.pdf" "file://$html" >/dev/null 2>&1
  echo "rendered $id"
done
rm -rf "$PROFILE"
