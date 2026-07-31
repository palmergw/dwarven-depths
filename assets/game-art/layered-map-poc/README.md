# Layered Shuttergate map proof of concept

This package tests a production-map authoring model in which route-crossing architecture is emitted as canonical straight-alpha RGBA passes from one editable Blender scene and orthographic camera rather than reconstructed after flattening.

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

The complete clean plate is deterministically reconstructed from the same-camera environment base plus the entrance and service-bridge foreground passes. With no subject inserted, that reconstruction is byte-identical to the committed complete plate. The canonical artifact alpha—not inferred geometry in the compositor—defines each cutoff.

## Start-here evidence

1. [`evidence/layered-map-overview.png`](evidence/layered-map-overview.png) — cohesive full-frame map with approved-scale units.
2. [`evidence/foreground-artifact-isolation.png`](evidence/foreground-artifact-isolation.png) — checkerboard RGBA artifacts, authored alpha, source contours, and exact no-op result.
3. [`evidence/entrance-mask-alignment.png`](evidence/entrance-mask-alignment.png) — native one-pixel entrance contour and same-camera RGBA shown at 4× nearest-neighbor.
4. [`evidence/solid-proxy-traversal.png`](evidence/solid-proxy-traversal.png) — high-contrast alpha-footprint traversal.
5. [`evidence/calibration-card-traversal.png`](evidence/calibration-card-traversal.png) — banded exact-height/pivot cards exposing cutoff seams independently of silhouette texture.
6. [`evidence/gantry-boundary-diagnostics.png`](evidence/gantry-boundary-diagnostics.png) — paired before/after native and 4× crops at adjacent 1 px x / 2 px y increments through the support-free span, with visible-alpha percentages.
7. [`evidence/no-op-difference-heatmap.png`](evidence/no-op-difference-heatmap.png) — real per-pixel no-entity difference heatmap.
8. [`evidence/production-sprite-traversal.png`](evidence/production-sprite-traversal.png) — environmentally lit production sprites at the same geometry.
9. [`metadata/layered-map-contract.json`](metadata/layered-map-contract.json) — per-artifact route states, affected/exempt classes, and layer contract.
10. [`metadata/manifest.json`](metadata/manifest.json) and [`metadata/provenance.json`](metadata/provenance.json) — immutable file binding and source/tool provenance.

## Canonical shared-scene source

- `blender/layered-shuttergate.blend`
- `blender/build_scene.py`
- `blender/outputs/environment-base.png`
- `blender/outputs/entrance-shell.png`
- `blender/outputs/gantry-shell.png`
- `blender/render-manifest.json`

The environment and foreground passes are rendered from named collections through `CAMERA_Shuttergate_Ortho`. Transparent RGB is decontaminated at export, and `build_poc.py` uses those exact pass pixels without resizing, registration, tracing, chroma keying, or perspective correction. The Blender verifier rerenders every committed pass and rejects stale pixels, source drift, extra manifest properties, alpha contamination, or source-asset drift.

## Build and verify

```bash
uv run --with-requirements assets/game-art/layered-map-poc/requirements.lock \
  python3 assets/game-art/layered-map-poc/build_poc.py
uv run --with-requirements assets/game-art/layered-map-poc/requirements.lock \
  python3 assets/game-art/layered-map-poc/build_poc.py --verify
```

Verification first rerenders every pass from the committed editable Blender source, then rebuilds the entire compositor package in a temporary directory and requires byte-identical committed outputs. It also binds the approved production sprites used in the traversal boards.

The entrance shell is intentionally a **fully visible aperture** for route subjects; its evidence proves clearance and alpha isolation rather than claiming an occlusion transition. The gantry is the progressive-occlusion proof case.

## Production recommendation

Use explicit foreground artifacts as the default for route-crossing structures. Simpler maps may avoid route occlusion entirely. Do not return to bespoke runtime polygons inferred from flattened plates.
