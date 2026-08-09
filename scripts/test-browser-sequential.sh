#!/usr/bin/env bash
set -euo pipefail

for browser in chromium firefox webkit; do
  ./node_modules/.bin/vitest run \
    --config vitest.browser.config.ts \
    --browser="$browser" \
    "$@"
done
