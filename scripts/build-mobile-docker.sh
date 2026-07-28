#!/usr/bin/env bash
set -euo pipefail

IMAGE="dwarven-depths-capacitor-evaluation:1"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

docker build --tag "$IMAGE" "$ROOT/infra/mobile"
docker run --rm \
  --user "$(id -u):$(id -g)" \
  --env CI=true \
  --env HOME=/tmp/home \
  --env GRADLE_USER_HOME=/work/.ddh/mobile-gradle \
  --volume "$ROOT:/work" \
  --tmpfs /work/node_modules:rw,exec,mode=1777 \
  --workdir /work \
  "$IMAGE" \
  bash -c 'mkdir -p "$HOME" "$GRADLE_USER_HOME" .ddh/mobile-package && pnpm install --frozen-lockfile && pnpm check:mobile-package && pnpm --filter @dwarven-depths/mobile mobile:build && rm -rf .ddh/mobile-package/* && cp apps/mobile/android/app/build/outputs/apk/debug/app-debug.apk .ddh/mobile-package/dwarven-depths-debug.apk'
