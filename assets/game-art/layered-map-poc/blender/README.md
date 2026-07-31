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
- `outputs/reference-plate.png`

No Blender UI, MCP, display server, chroma key, traced polygon, independent image registration, or post-render perspective warp is used.

## Current WIP critique

This checkpoint proves the missing production capability, not final art quality. Perspective, scale, registration, alpha, and support foundations now originate in one scene. Remaining work includes:

- improve framing so the lower shutter is more legible;
- replace the simple blockout with more painterly materials and architectural detail;
- refine the entrance voussoir silhouette;
- remove the small disconnected brace/light fragment in the gantry-only pass;
- add route subjects and prove traversal using the native renderer alpha;
- integrate Blender-source hashes and render verification into `build_poc.py`.
