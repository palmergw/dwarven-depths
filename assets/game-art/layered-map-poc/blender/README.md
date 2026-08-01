# Shared-camera Blender source — Shuttergate tutorial map

This directory is the first executable replacement for the rejected independently generated raster assets.

The authored composition is explicitly a **tutorial map**. Its scale is not a large-map benchmark; large-map composition remains separate work.

## Contract

- Blender 4.3.2
- one orthographic camera: `CAMERA_Shuttergate_Ortho`
- one editable scene: `layered-shuttergate.blend`
- named collections:
  - `ENVIRONMENT_BASE`
  - `FOREGROUND_ENTRANCE`
  - `DIAGNOSTIC_ROUTE_SUBJECTS`
  - `PRODUCTION_ROUTE_SUBJECTS`
  - `SHARED_LIGHTING`
- Cycles CPU, 16 samples, denoising disabled
- 1280×720 RGBA outputs

## Build

```bash
blender -b --factory-startup --python-exit-code 1 \
  --python assets/game-art/layered-map-poc/blender/build_scene.py
```

The script recreates the `.blend` file and emits all source passes from the same camera. Transparent passes are normalized to zero RGB where alpha is zero. The pinned `compose_reference.py` alpha-composites the environment and entrance passes into the canonical no-entity reference:

- `outputs/environment-base.png`
- `outputs/entrance-shell.png`
- `outputs/route-subjects.png` (transparent diagnostic proxy isolation)
- `outputs/production-sprite-subjects.png` (approved 56 px Warden / 44 px raider isolation)
- `outputs/reference-plate.png`
- `outputs/route-traversal.png` (review-only proxy evidence)
- `outputs/production-sprite-traversal.png` (review-only production-sprite scale/density evidence)
- `render-manifest.json` (camera/source/output hashes and alpha semantics)

Verify the committed editable source by rerendering every pass into an isolated temporary directory and comparing decoded pixels with the committed outputs:

```bash
blender -b --factory-startup --python-exit-code 1 \
  --python assets/game-art/layered-map-poc/blender/build_scene.py -- --verify
```

No Blender UI, MCP, display server, chroma key, traced polygon, independent image registration, or post-render perspective warp is used.

## Current WIP critique

This checkpoint proves the missing production capability for a tutorial-scale map; it is not final art or a large-map solution. Perspective, registration, native alpha, and architectural foundations originate in one scene.

The replacement blockout keeps the authored 40×46 floor, 50-unit orthographic frame, and shared-camera export contract while discarding the rejected bridge, gantry, flanking bastions, and decorative lower-edge framing. A single hooked route crosses one unobstructed tutorial court from the upper-right entrance to the left side-wall shutter. The entrance is the sole foreground occluder. Approved 56 px Warden and 44 px raider assets render as source-hash-bound camera-facing planes with presentation opacity normalized so their low-alpha interiors do not appear ghosted; canvas, pivot, nominal scale, and nonzero silhouette support remain unchanged.

Remaining work includes:

- develop carved architecture and masonry silhouettes beyond the current deterministic blockout;
- refine the entrance voussoir silhouette and defended-shutter machinery;
