# Shuttergate production scene package

This package is the Issue #286 composability gate. It is presentation-only and is not integrated into the web client. No coordinate, layer, or label in this package defines simulation truth.

## Contents

- `sources/shuttergate-clean-plate-master.png`: original full-resolution, character/UI-free environment source.
- `exports/environment/`: opaque 1280×720 clean plate.
- `exports/entities/`: independently addressable alpha Warden and mine-raider states required by the bounded truth-screen fixture. These two poses per character are not a production animation set; Issue #273 owns complete movement, combat, hit, and death animation production.
- `exports/effects/`: separate selection/faction rings and Shield Slam impact.
- `exports/occlusion/`: grayscale architecture mask and environment-only foreground pixels.
- `exports/lighting/`: entity/UI-free alpha lighting overlay.
- `exports/hud/`: structural top/bottom frames plus separately replaceable fortress/wave/ore status, Warden nameplate/portrait/health, target-policy, Shield Slam, and pause layers.
- `metadata/scene-contract.json`: safe areas, camera, route, anchors, depth order, HUD regions, and later crop policy.
- `metadata/reconstruction.json`: exact representative layer recipe and region-isolation proof paths.
- `metadata/layer-manifest.json`: generated dimensions, modes, alpha semantics, region contributions, and SHA-256 digests.
- `metadata/provenance.json` and `generation-log.md`: source, prompt/settings, license, and reference-use boundary.
- `docs/visual-evidence/production-scene/`: bounded composability review packet only; no client screenshots.

## Deterministic build and verification

Run:

`uv run --with pillow python3 assets/game-art/production-scene/build_scene.py --reproducible`

The builder clears stale exports/evidence, rebuilds all derived files, validates strict nested contract shape and geometry, canonical layer order/placement, dimensions, alpha semantics, exact entity counts, metadata/image hashes, and recomposed reconstruction/isolation pixels, then rebuilds in an isolated temporary root and rejects byte-level manifest drift. To verify committed files without rewriting them:

`uv run --with pillow python3 assets/game-art/production-scene/build_scene.py --verify`

The clean plate remains opaque. Every character, effect, foreground, lighting, and HUD runtime layer uses straight alpha; `architecture-mask.png` is a grayscale mask. The removed-entity reconstruction starts from the same clean-plate bytes, so removing either entity does not mutate environment pixels.

The reconstruction uses the selected middle scale from `docs/visual-evidence/production-scene/character-scale-study.png`: 104 px for the Warden and 92 px for the raider at the 1280×720 review frame. That scale leaves the route and chokepoints readable while reserving room for later multi-combatant staging; final animation coverage and bounded scale tuning remain with #273.
