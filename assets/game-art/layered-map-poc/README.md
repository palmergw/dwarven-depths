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
4. `architecture-framing`
5. world subjects in front of route-crossing architecture
6. screen-space indicators
7. HUD

The complete clean plate is deterministically reconstructed from the same-camera environment base plus the entrance and service-bridge foreground passes. With no subject inserted, that reconstruction is byte-identical to the committed complete plate. The canonical artifact alpha—not inferred geometry in the compositor—defines each cutoff.

## Start-here evidence

1. [`evidence/shared-camera-product-owner-review.png`](evidence/shared-camera-product-owner-review.png) — one labeled board containing the clean map, approved production-sprite scale/occlusion, native foreground isolation, and the bounded review questions.
2. [`blender/outputs/reference-plate.png`](blender/outputs/reference-plate.png) — clean 1280×720 map with no entities or diagnostics.
3. [`blender/outputs/production-sprite-traversal.png`](blender/outputs/production-sprite-traversal.png) — approved 56 px Warden and 44 px raiders across tunnel, bridge, and route.
4. [`evidence/shared-camera-foreground-isolation.png`](evidence/shared-camera-foreground-isolation.png) — full-frame registered entrance and service-bridge RGBA on checkerboard.
5. [`evidence/shared-camera-review-index.md`](evidence/shared-camera-review-index.md) — exact review order, measurable contract, requested judgments, and explicit non-claims.

Other generated images in `evidence/` are engineering diagnostics or historical compositor outputs. They are **not** the product-owner start surface and must not be substituted for the five items above.

## Canonical shared-scene source

- `blender/layered-shuttergate.blend`
- `blender/build_scene.py`
- `blender/outputs/environment-base.png`
- `blender/outputs/entrance-shell.png`
- `blender/outputs/architecture-framing.png`
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

The entrance shell supplies the route-local occlusion proof. The architecture-framing layer stays outside the hooked route and proves that foreground depth can frame the broad tactical floor without an overhead bridge or floor-consuming support.

## Production recommendation

Use explicit foreground artifacts as the default for route-crossing structures. Simpler maps may avoid route occlusion entirely. Do not return to bespoke runtime polygons inferred from flattened plates.
