# Issue #282 visual approval evidence

This packet is the standalone art-production gate required before any renderer integration. All evidence is derived from the original raster masters under `assets/game-art/visual-direction/`; the approved concept is used only in the explicitly identified comparison image.

## Review order

1. `concept-keyframe-side-by-side.png` — concept at natural 1672×941 scale on the left; original Shuttergate keyframe at the same natural scale on the right.
2. `../..` is not required for review; the full exported keyframe is `../../../assets/game-art/visual-direction/exports/shuttergate-keyframe-1280x720.png`.
3. `camera-path-environment-crop.png` — HUD-reduced crop for camera, receding architecture, winding route, chokepoints, and objective review.
4. `character-battlefield-scale-proof.png` — integrated 1280×720 frame with both 128 px native action sheets for battlefield/portrait scale comparison.
5. `iron-warden-actions-4x.png` and `mine-raider-actions-4x.png` — nearest-neighbor 4× review sheets; native sheets live under `assets/game-art/visual-direction/exports/`.
6. `hud-production-sheet.png` — HUD frame, portrait, health, exactly three ability controls, fortress/wave/resource status, pause, and settings.
7. `environment-layer-breakdown.png` — five separable depth/pipeline categories. Individual raster exports and normalized path/placement anchors live in the asset package.

## Evidence metadata

- Logical/review frame: 640×360 / 1280×720.
- Master keyframe: 1672×941 RGB PNG; exported keyframe: 1280×720 RGB PNG.
- Style: crisp hand-painted pixel-art/pre-rendered-3D raster with a 2 px logical texel target.
- Palette: cold near-black/slate/navy stone with amber, copper, and umber local torchlight.
- Source: original PNG raster masters plus deterministic Python/Pillow crop, scale, and montage source.
- Provenance and license: `assets/game-art/visual-direction/metadata/provenance.json`.
- Exact prompts/settings and visual QA: `assets/game-art/visual-direction/metadata/generation-log.md`.
- Exact file dimensions/digests: `assets/game-art/visual-direction/metadata/asset-manifest.json`.
- Exact reviewed revision: recorded in the draft PR evidence because visual approval binds that immutable remote head.

## Known limitations

These are production-direction keys, not final transparent atlases. Deep-navy sheet backgrounds need masking during integration; environment panels are separable direction samples rather than a tile-complete level; character sheets provide six action keys rather than full animation timing; the HUD portrait omits the Warden helmet; and the broad route reads as a hooked S rather than a tightly alternating S. Issue #283 remains blocked until the product owner explicitly approves this exact package.
