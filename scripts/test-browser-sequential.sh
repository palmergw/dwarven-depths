#!/usr/bin/env bash
set -euo pipefail

heavy_tests=(
  apps/web/src/App.browser.test.tsx
  apps/web/src/run-evidence.browser.test.ts
  packages/runtime/src/shuttergate-attempt-telemetry.browser.test.ts
  packages/runtime/src/shuttergate-campaign-artifact.browser.test.ts
  packages/runtime/src/shuttergate-campaign.browser.test.ts
  packages/runtime/src/shuttergate-placement-sweep.browser.test.ts
  packages/runtime/src/shuttergate-reference-calibration.browser.test.ts
)

run_browser_tests() {
  local browser="$1"
  shift
  ./node_modules/.bin/vitest run \
    --config vitest.browser.config.ts \
    --browser="$browser" \
    "$@"
}

for browser in chromium firefox webkit; do
  if (( $# > 0 )); then
    run_browser_tests "$browser" "$@"
    continue
  fi

  exclude_args=()
  for test_file in "${heavy_tests[@]}"; do
    exclude_args+=("--exclude=$test_file")
  done
  run_browser_tests "$browser" "${exclude_args[@]}"
  for test_file in "${heavy_tests[@]}"; do
    run_browser_tests "$browser" "$test_file"
  done
done
