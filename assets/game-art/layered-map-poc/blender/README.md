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
  - `SHARED_LIGHTING`
- Cycles CPU, 16 samples, denoising disabled
- 1280×720 RGBA outputs

## Build

```bash
blender -b --factory-startup \
  --python assets/game-art/layered-map-poc/blender/build_scene.py
```

The script recreates the `.blend` file and emits all outputs from the same camera:

- `outputs/environment-base.png`
- `outputs/entrance-shell.png`
- `outputs/gantry-shell.png`
- `outputs/route-subjects.png` (transparent diagnostic proxy isolation)
- `outputs/reference-plate.png`
- `outputs/route-traversal.png` (review-only proxy evidence)
- `render-manifest.json` (camera/source/output hashes and alpha semantics)

Verify the committed editable source and outputs without rebuilding them:

```bash
blender -b --factory-startup \
  --python assets/game-art/layered-map-poc/blender/build_scene.py -- --verify
```

No Blender UI, MCP, display server, chroma key, traced polygon, independent image registration, or post-render perspective warp is used.

## Current WIP critique

This checkpoint proves the missing production capability and begins the scale/style correction; it is not final art. Perspective, registration, native alpha, and support foundations originate in one scene.

The third blockout expands the authored floor to 40×46 world units and the route to 42 world units, with a 50-unit orthographic frame. The previous freestanding beam and floor posts were removed. The foreground gantry is now a high service bridge keyed directly into two massive side bastions and their wall platforms: it connects fortress architecture, creates a deliberate overhead traversal threshold, and establishes vertical scale without placing supports in the route. Procedural basalt, carved-stone, road, and timber variation, embedded iron rails, irregular shoulder rubble, cool fill, and warm tunnel/gate pools continue moving the sterile blockout toward the original fortress direction without changing the shared-camera contract.

Remaining work includes:

- replace the proxy cylinders with the approved 56 px Warden and 44 px raider sprites;
- broaden the tactical staging floor beyond the central road where gameplay composition benefits;
- develop carved architecture, chains, machinery, and masonry silhouettes rather than relying on repeated blocks;
- refine the entrance voussoir silhouette and defended-shutter machinery;
- integrate Blender-source hashes and render verification into the top-level POC verifier.
