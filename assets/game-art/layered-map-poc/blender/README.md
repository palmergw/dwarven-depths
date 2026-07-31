# Shared-camera Blender source — work in progress

This directory is the first executable replacement for the rejected independently generated raster assets.

## Contract

- Blender 4.3.2
- one orthographic camera: `CAMERA_Shuttergate_Ortho`
- one editable scene: `layered-shuttergate.blend`
- named collections:
  - `ENVIRONMENT_BASE`
  - `FOREGROUND_ENTRANCE`
  - `FOREGROUND_GANTRY`
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

The script recreates the `.blend` file and emits all source passes from the same camera. Transparent passes are normalized to zero RGB where alpha is zero. The pinned `compose_reference.py` then alpha-composites the environment, entrance, and gantry passes into the canonical no-entity reference:

- `outputs/environment-base.png`
- `outputs/entrance-shell.png`
- `outputs/gantry-shell.png`
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

This checkpoint proves the missing production capability and begins the scale/style correction; it is not final art. Perspective, registration, native alpha, and support foundations originate in one scene.

The fourth blockout keeps the authored 40×46 floor, 42-unit route, and 50-unit orthographic frame while adding two broad, visibly staged off-route defense courts connected to the lane. The previous freestanding beam and floor posts remain removed. The foreground gantry is a high service bridge keyed directly into two massive side bastions and their wall platforms: it connects fortress architecture, creates a deliberate overhead traversal threshold, and establishes vertical scale without placing supports in the route. Approved 56 px Warden and 44 px raider assets now render as source-hash-bound, unlit camera-facing planes from the same scene, preserving their authored pixels while replacing proxy-only scale claims. Procedural basalt, carved-stone, road, and timber variation, embedded iron rails, irregular shoulder rubble, cool fill, and warm tunnel/gate pools continue moving the sterile blockout toward the original fortress direction without changing the shared-camera contract.

Remaining work includes:

- develop carved architecture, chains, machinery, and masonry silhouettes rather than relying on repeated blocks;
- refine the entrance voussoir silhouette and defended-shutter machinery;
