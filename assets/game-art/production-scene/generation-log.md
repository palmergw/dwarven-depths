# Issue #286 production-scene generation log

## Clean plate

- Provider: `openai-codex`
- Model: `gpt-image-2-medium`
- Reported setting: landscape, medium quality, one image reference
- Backend reported request size: 1536×1024
- Saved raster dimensions: 1672×941
- Reference: `assets/game-art/visual-direction/sources/keyframe-master.png`
- Reference boundary: approved Shuttergate art direction only; no crop, trace, copied pixels, or edited reference raster.

Exact prompt:

> Use the image generation tool exactly once to create an ORIGINAL production environment clean plate for Dwarven Depths issue #286. Use assets/game-art/visual-direction/sources/keyframe-master.png only as an image-reference for the already-approved Shuttergate art direction; do not crop, trace, copy, or edit reference pixels. Required image: full 16:9-safe elevated orthographic dark-fantasy underground dwarven fortress, coherent edge-to-edge complete scene, crisp hand-painted pixel art with subtly pre-rendered 3D massing and chunky consistent texel feel. Preserve the approved distinct Shuttergate composition: cold slate/navy masonry, receding upper-right ember entrance, a clearly readable winding S/hooked route through two architectural chokepoints and rail crossing, ending at a massive fortified iron shutter gate in lower-left foreground; dense arches, stairs, ledges, timber, black iron, rails, chains, banners, rubble, drains, warm amber/copper torch pools and cool deep shadows. ABSOLUTELY ZERO dwarves, defenders, enemies, creatures, silhouettes in doorways, combat effects, selection/faction rings, health bars, labels, counts, state text, HUD frames, buttons, icons, pause/settings controls, or mock UI. No empty damage scars where figures were removed; no disconnected route, duplicated architecture, crop/mask scars, or blank regions. The world must fill the full frame, including the top and bottom regions previously occupied by HUD.

Visual QA found zero apparent defenders, enemies, creature silhouettes, combat effects, state text, or UI. It found no removal scars, crop seams, clone-stamped architecture, disconnected route, or unfinished blank region and passed the raster as a complete production clean plate.

## Derived assets

`build_scene.py` deterministically derives the two alpha character states needed by #287 directly from the approved #282 high-resolution character masters at the selected miniature 56 px Warden / 44 px raider heights. Each export receives one controlled LANCZOS downsample and bounded unsharp pass, never a runtime shrink, double resample, or permanent hard outline. The builder authors separate effect/HUD/lighting/mask layers, composes the proof, publishes native/4× isolation boards plus a clearly nonauthoritative density/readability stress board, and records every output digest. These poses are a bounded truth-screen set rather than a production animation set; #273 owns complete movement, combat, hit, and death animation coverage. No third-party asset, font, texture, stock image, or model is used.

The clean plate route was surveyed directly against the painted pixels after product-owner review found the first segment proposal visibly misregistered. A skeptical pixel review then removed gold points that crossed upper and lower parapets, extended the upper cyan span to the true floor lips, represented the lower gate as a compound hidden-plus-visible transition, and moved the terminal point off the shutter façade onto the floor threshold. Rail crossing, winding, branching, and one globally exposed clearance mask are not requirements. Full traversal masks and movement remain owned by issue #273.

## Reproducible export toolchain

- Python: `3.13.5`
- Pillow: `12.3.0`, pinned by `requirements.lock`
- zlib: `1.3.1`
- PNG export: Pillow RGBA/L output with fixed default encoder arguments; isolated rebuild compares every committed output digest.
- Every clean-plate, character-master, approved-keyframe, concept-boundary, generation-log, lockfile, and builder input is SHA-256-bound in `metadata/provenance.json`.
