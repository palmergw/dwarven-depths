# Concept-faithful visual-direction package

This is the Issue #282 art-production gate for Shuttergate. It is a production-direction raster package, not a client integration and not an authoritative gameplay contract.

## Art contract

- Camera: slightly elevated orthographic/2.5D view over substantial foreground, floor, architecture, and receding hall planes.
- Frame: 640×360 logical composition exported at 1280×720; 2× logical texel scale.
- Character proof: 128 px native review height, with 4× nearest-neighbor evidence. The native sheets contain six evenly spaced poses each.
- Palette: dominant sampled darks `#030508`, `#030b10`, `#121618`, `#1c1917`, and `#2f2621`; sampled torch/material accents `#4c2717`, `#6b321c`, `#815c41`, and `#b1845a`.
- Materials: cold stone, aged timber, black iron, copper, rails, chains, banners, rubble, and restrained warm local light.
- Naming: lowercase kebab-case stable presentation names; category directories separate environment and HUD exports.
- Depth: background passage → floor/path → architecture → entities/effects → foreground props → lighting → screen-space HUD.
- Authority: coordinates and layers are presentation-only. Integration must bind them to authoritative snapshots without moving state or timing into the renderer.

## Package map

- `sources/`: original full-resolution raster masters for the keyframe, both character sheets, environment board, and HUD board.
- `exports/`: 1280×720 integrated keyframe, native character sheets, independently addressable environment samples, and independently addressable HUD samples.
- `metadata/art-direction-analysis.md`: bounded visual analysis and exclusions.
- `metadata/generation-log.md`: exact prompts, provider/model/settings, image-reference use, visual QA, and known limitations.
- `metadata/layout-spec.json`: presentation route, placement anchors, named regions, light direction, and depth order.
- `metadata/provenance.json`: source, license, originality, and concept-reference boundaries.
- `metadata/asset-manifest.json`: dimensions and SHA-256 digest for every source, export, and evidence raster.
- `build_evidence.py`: deterministic Pillow export/evidence build. Run with `uv run --with pillow python3 assets/game-art/visual-direction/build_evidence.py`.

## Production feasibility and limitations

The package separates environment, route, architecture, props, lighting, characters, and HUD into addressable raster exports and records presentation anchors suitable for later binding. It demonstrates a raster/pre-rendered production pipeline rather than a flattened client background.

The generated boards remain direction masters, not alpha-cut animation atlases. Their deep-navy removable backing and panel crops require final masking/cleanup during approved-art integration. The source character poses are action keys rather than complete tween sequences. The HUD portrait omits the low-profile helmet seen in the character sheet. Route and placement coordinates are visual authoring metadata only and must not replace simulation topology. No Phaser/WebGL integration is included in this issue.
