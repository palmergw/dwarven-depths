# Shuttergate production scene package

This package is the Issue #286 composability gate. It is presentation-only and is not integrated into the web client. No coordinate, layer, or label in this package defines simulation truth.

## Contents

- `sources/shuttergate-clean-plate-master.png`: original full-resolution, character/UI-free environment source.
- `exports/environment/`: opaque 1280×720 clean plate.
- `exports/entities/`: independently addressable alpha Warden and mine-raider states required by the truth-screen fixture.
- `exports/effects/`: separate selection/faction rings and Shield Slam impact.
- `exports/occlusion/`: grayscale architecture mask and environment-only foreground pixels.
- `exports/lighting/`: entity/UI-free alpha lighting overlay.
- `exports/hud/`: top/bottom frame, portrait, health/status, target-policy, Shield Slam, and pause controls.
- `metadata/scene-contract.json`: safe areas, camera, route, anchors, depth order, HUD regions, and later crop policy.
- `metadata/reconstruction.json`: exact representative layer recipe and region-isolation proof paths.
- `metadata/layer-manifest.json`: generated dimensions, modes, alpha semantics, region contributions, and SHA-256 digests.
- `metadata/provenance.json` and `generation-log.md`: source, prompt/settings, license, and reference-use boundary.
- `docs/visual-evidence/production-scene/`: bounded composability review packet only; no client screenshots.

## Deterministic build and verification

Run:

`uv run --with pillow python3 assets/game-art/production-scene/build_scene.py --reproducible`

The builder clears stale exports/evidence, rebuilds all derived files, validates strict manifest shape, dimensions, alpha semantics, exact entity counts, and hashes, then rebuilds in an isolated temporary root and rejects byte-level manifest drift. To verify committed files without rewriting them:

`uv run --with pillow python3 assets/game-art/production-scene/build_scene.py --verify`

The clean plate remains opaque. Every character, effect, foreground, lighting, and HUD runtime layer uses straight alpha; `architecture-mask.png` is a grayscale mask. The removed-entity reconstruction starts from the same clean-plate bytes, so removing either entity does not mutate environment pixels.
