#!/usr/bin/env bash
set -euo pipefail

IMAGE="dwarven-depths-tauri-evaluation:1"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

docker build --tag "$IMAGE" "$ROOT/infra/desktop"
docker run --rm \
  --user "$(id -u):$(id -g)" \
  --env CI=true \
  --env HOME=/tmp/home \
  --env CARGO_HOME=/work/.ddh/desktop-cargo \
  --env CARGO_TARGET_DIR=/work/.ddh/desktop-target \
  --volume "$ROOT:/work" \
  --tmpfs /work/node_modules:rw,exec,mode=1777 \
  --workdir /work \
  "$IMAGE" \
  bash -c 'mkdir -p "$CARGO_HOME" "$CARGO_TARGET_DIR" .ddh/desktop-package && pnpm install --frozen-lockfile && pnpm --filter @dwarven-depths/desktop desktop:build && xvfb-run --auto-servernum --server-args="-screen 0 1280x800x24" dbus-run-session -- node scripts/smoke-desktop-runtime.mjs "$CARGO_TARGET_DIR/release/dwarven-depths-desktop" && rm -rf .ddh/desktop-package/* && cp "$CARGO_TARGET_DIR"/release/bundle/deb/*.deb .ddh/desktop-package/'
