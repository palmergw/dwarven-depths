#!/usr/bin/env bash
set -euo pipefail

IMAGE="mcr.microsoft.com/playwright:v1.61.1-noble"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

if [[ "${DD_SKIP_BUILD:-0}" == "1" ]]; then
  TEST_COMMAND='./node_modules/.bin/vitest run --config vitest.browser.config.ts'
else
  TEST_COMMAND='./node_modules/.bin/tsc -b --pretty false && ./node_modules/.bin/vitest run --config vitest.browser.config.ts'
fi

if (( $# > 0 )); then
  printf -v TEST_ARGUMENTS ' %q' "$@"
  TEST_COMMAND+="$TEST_ARGUMENTS"
fi

if (( $# == 0 )); then
  TEST_COMMAND+=' && node scripts/test-web-offline.mjs'
fi

docker run --rm \
  --user "$(id -u):$(id -g)" \
  --env HOME=/tmp \
  --volume "$ROOT:/work" \
  --workdir /work \
  "$IMAGE" \
  bash -lc "$TEST_COMMAND"
