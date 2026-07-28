#!/usr/bin/env bash
set -euo pipefail

IMAGE="dwarven-depths-capacitor-evaluation:1"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

docker build --tag "$IMAGE" "$ROOT/infra/mobile"
docker run --rm \
  --user 0:0 \
  --env CI=true \
  --env HOME=/tmp/home \
  --env HOST_UID="$(id -u)" \
  --env HOST_GID="$(id -g)" \
  --env GRADLE_USER_HOME=/work/.ddh/mobile-gradle \
  --volume "$ROOT:/work" \
  --tmpfs /work/node_modules:rw,exec,mode=1777 \
  --workdir /work \
  "$IMAGE" \
  bash -c 'mkdir -p "$HOME" "$GRADLE_USER_HOME" .ddh/mobile-package && pnpm install --frozen-lockfile && pnpm check:mobile-package && pnpm --filter @dwarven-depths/mobile mobile:build && rm -rf .ddh/mobile-package/* && cp apps/mobile/android/app/build/outputs/apk/debug/app-debug.apk .ddh/mobile-package/dwarven-depths-debug.apk && node scripts/check-mobile-apk.mjs .ddh/mobile-package/dwarven-depths-debug.apk && chown -R "$HOST_UID:$HOST_GID" apps/web/dist apps/mobile/android/app/build apps/mobile/android/app/src/main/assets apps/mobile/android/capacitor-cordova-android-plugins .ddh/mobile-package'

docker run --rm \
  --user "$(id -u):$(id -g)" \
  --env HOME=/tmp \
  --volume "$ROOT:/work" \
  --workdir /work \
  mcr.microsoft.com/playwright:v1.61.1-noble \
  node scripts/smoke-mobile-runtime.mjs apps/mobile/android/app/src/main/assets/public
