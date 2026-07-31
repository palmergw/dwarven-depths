# Layered Shuttergate map proof of concept

This package tests a production-map authoring model in which route-crossing architecture is a canonical straight-alpha RGBA artifact rather than a polygon reconstructed after flattening.

## Scope

The proof deliberately favors a cleaner, more reusable map over exact reproduction of the previous Shuttergate plate while retaining the approved Dwarven Depths direction:

- elevated painterly 2.5D fortress presentation;
- dark basalt, carved stone, timber, and iron;
- cool cavern depth with warm entrance and gate light;
- one broad nonbranching route from hostile tunnel to defended shutter;
- approved 56 px Warden / 44 px raider scale.

It proves presentation composability only. It does not claim runtime integration, simulation authority, HUD approval, final animation, or overall issue #286 approval.

## Layer model

1. `environment-base`
2. world subjects behind route-crossing architecture
3. `entrance-shell`
4. `gantry-shell`
5. world subjects in front of route-crossing architecture
6. screen-space indicators
7. HUD

The clean plate retains the same pixels as the foreground shells. With no subject inserted, compositing both artifacts is an exact pixel no-op. The canonical authored alpha—not inferred geometry in the builder—defines each cutoff.

## Start-here evidence

1. [`evidence/layered-map-overview.png`](evidence/layered-map-overview.png) — cohesive full-frame map with approved-scale units.
2. [`evidence/foreground-artifact-isolation.png`](evidence/foreground-artifact-isolation.png) — checkerboard RGBA artifacts, authored alpha, source contours, and exact no-op result.
3. [`evidence/solid-proxy-traversal.png`](evidence/solid-proxy-traversal.png) — high-contrast alpha-footprint traversal.
4. [`evidence/calibration-card-traversal.png`](evidence/calibration-card-traversal.png) — banded exact-height/pivot cards exposing cutoff seams independently of silhouette texture.
5. [`evidence/production-sprite-traversal.png`](evidence/production-sprite-traversal.png) — the same traversal using production sprites.
6. [`metadata/layered-map-contract.json`](metadata/layered-map-contract.json) — layer and route contract.
7. [`metadata/manifest.json`](metadata/manifest.json) and [`metadata/provenance.json`](metadata/provenance.json) — immutable file binding and source provenance.

## Canonical sources

- `sources/layered-shuttergate-master.png`
- `sources/entrance-shell-mask.png`
- `sources/gantry-shell-mask.png`

The masks are source-authored review inputs. `build_poc.py` does not regenerate their geometry.

## Build and verify

```bash
uv run --with pillow python3 assets/game-art/layered-map-poc/build_poc.py
uv run --with pillow python3 assets/game-art/layered-map-poc/build_poc.py --verify
```

Verification rebuilds the entire package in a temporary directory and requires byte-identical committed outputs. It also binds the approved production sprites used in the traversal boards.

## Production recommendation

Use explicit foreground artifacts as the default for route-crossing structures. Simpler maps may avoid route occlusion entirely. Do not return to bespoke runtime polygons inferred from flattened plates.
