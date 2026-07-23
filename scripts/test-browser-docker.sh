#!/usr/bin/env bash
set -euo pipefail

IMAGE="mcr.microsoft.com/playwright:v1.61.1-noble"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

docker run --rm \
  --user "$(id -u):$(id -g)" \
  --env HOME=/tmp \
  --volume "$ROOT:/work" \
  --workdir /work \
  "$IMAGE" \
  bash -lc './node_modules/.bin/tsc -b --pretty false && ./node_modules/.bin/vitest run --config vitest.browser.config.ts'
