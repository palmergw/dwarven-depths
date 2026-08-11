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
  --env DD_CAPTURE_DESKTOP_EVIDENCE="${DD_CAPTURE_DESKTOP_EVIDENCE:-0}" \
  --env DD_DESKTOP_EVIDENCE_DIRECTORY="${DD_DESKTOP_EVIDENCE_DIRECTORY:-docs/visual-evidence/release-closeout/wip-01/desktop}" \
  --env DD_DESKTOP_DOWNLOAD_DIRECTORY=/tmp/home/Downloads \
  --volume "$ROOT:/work" \
  --tmpfs /work/node_modules:rw,exec,mode=1777 \
  --workdir /work \
  "$IMAGE" \
  bash -c 'mkdir -p "$CARGO_HOME" "$CARGO_TARGET_DIR" .ddh/desktop-package "$DD_DESKTOP_DOWNLOAD_DIRECTORY" "$HOME/.config" && printf '\''XDG_DOWNLOAD_DIR="%s"\n'\'' "$DD_DESKTOP_DOWNLOAD_DIRECTORY" > "$HOME/.config/user-dirs.dirs" && pnpm install --frozen-lockfile && pnpm --filter @dwarven-depths/desktop desktop:build && evidence_args=() && if [[ "$DD_CAPTURE_DESKTOP_EVIDENCE" == "1" ]]; then evidence_args=("$DD_DESKTOP_EVIDENCE_DIRECTORY"); fi && xvfb-run --auto-servernum --server-args="-screen 0 1600x1000x24" dbus-run-session -- node scripts/smoke-desktop-runtime.mjs "$CARGO_TARGET_DIR/release/dwarven-depths-desktop" "${evidence_args[@]}" && rm -rf .ddh/desktop-package/* && cp "$CARGO_TARGET_DIR"/release/bundle/deb/*.deb .ddh/desktop-package/'
