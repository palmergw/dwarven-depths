# Dwarven Depths Issue #273 — Combat animation generation log

## Original-asset declaration

The hostile role atlas is a newly generated original Dwarven Depths project asset. The original project-owned Shuttergate keyframe master was supplied only as an image-to-image consistency reference. No pixels from the external concept mockup were supplied, cropped, traced, or composited. The existing approved Iron Warden master is reused as the editable source for Warden action exports.

## `shuttergate-hostile-role-atlas-master.png`

- Provider: `openai-codex`
- Model: `gpt-image-2-medium`
- Aspect ratio: `landscape`
- Requested size setting: `1536x1024`
- Saved dimensions: `1536x1024`
- Quality: `medium`
- Modality: `image`
- Input image: `assets/game-art/visual-direction/sources/keyframe-master.png`
- Source SHA-256: `8f27d5e80b9adcbcab6d3b05435fda8777c81326d2a1f8e590673c04d14ed660`
- License: project MIT license (`LICENSE`)

### Exact prompt

Using the attached ORIGINAL Dwarven Depths Shuttergate source keyframe only as a consistency reference for palette, logical texel scale, material rendering, elevated orthographic camera angle, and hostile design language, create an ORIGINAL clean production sprite atlas raster for the Shuttergate encounter. Wide landscape canvas, flat solid removable deep-navy background with NO scenery, NO floor, NO frame, NO UI, NO title, NO labels, NO text. Crisp hand-painted pixel-art with subtly pre-rendered 3D volume, hard edges, consistent chunky 2px logical texel feel, cold slate/navy/scavenged-iron palette with restrained ember-orange eyes and accents. Strong readable silhouettes suitable for final 44-pixel-tall in-game sprites.

Arrange EXACTLY TWELVE and only twelve full-body hostile figures in a strict 4-column by 3-row grid, evenly spaced in twelve equal invisible cells, same ground line within each row, no overlap, no cropping, no weapons crossing cell boundaries, no extra inset art. Each COLUMN is one consistent role, left to right: (1) GOBLIN CUTTER — lean hunched melee raider, hooked mining cleaver and light asymmetrical armor; (2) GOBLIN SLINGER — narrow ranged raider with unmistakable sling in hand, small ammunition satchel, lighter silhouette; (3) GOBLIN BULWARK ELITE — broad armored elite with heavy scavenged tower shield and short pick, clearly larger/heavier but still within the cell; (4) GATEBREAKER CAPTAIN BOSS — imposing hornless mine captain with massive two-handed gatebreaking hammer, reinforced dark plate, distinctive ember crest, largest silhouette.

Each ROW is one action, top to bottom: TOP = idle combat-ready stance; MIDDLE = committed attack action (cutter cleaver swing, slinger visibly releasing a sling projectile with a short restrained ember trail inside its cell, bulwark shield/pick strike, captain hammer downswing); BOTTOM = clearly downed/destroyed pose on the ground, still role-readable. Preserve exact character/equipment continuity down each column. Every figure faces toward lower-left in the same elevated orthographic presentation direction. Exactly twelve figures total. No dwarves, no generic duplicate raiders, no animation arrows, no written pose names, no smooth vector aesthetic, no photorealism, no concept-sketch lines, no checkerboard transparency.

## Visual QA

The generated source contains exactly twelve figures in a regular 4×3 layout. Cutter, slinger, shielded bulwark, and hammer captain remain distinguishable in idle, attack, and downed rows. Weapons remain cell-local, the deep-navy backing is removable, and the deterministic exporter binds every crop and digest. The source intentionally supplies one authored lower-left facing; runtime mirroring may represent the opposite diagonal without changing authoritative state. Additional directional authorship is not claimed by this source.

## `shuttergate-hostile-facing-atlas-master.png`

- Provider: `openai-codex`
- Model: `gpt-image-2-medium`
- Aspect ratio: `landscape`
- Requested size setting: `1536x1024`
- Saved dimensions: `1536x1024`
- Quality: `medium`
- Modality: `image`
- Input image: `assets/game-art/combat-animation/sources/shuttergate-hostile-role-atlas-master.png`
- Source SHA-256: `7e70295ef8eee65e100bbfecda451501ae1a1de041835e7570aa204cfc397953`
- License: project MIT license (`LICENSE`)

### Exact prompt

Create an ORIGINAL clean directional idle-pose sprite atlas for Dwarven Depths, using the attached ORIGINAL project-owned hostile role atlas as the exact character/equipment/style reference. Wide 1536x1024 landscape canvas, flat solid removable deep-navy background only, no scenery, no floor, no frame, no UI, no text, no labels. Crisp hand-painted pixel-art with subtly pre-rendered 3D volume, hard edges, chunky logical texels, cold slate/navy/scavenged-iron materials, restrained ember-orange eyes. Final use is 44-pixel-tall gameplay sprites.

Arrange EXACTLY SIXTEEN and only sixteen full-body hostile idle combat-ready figures in a strict 4-column by 4-row grid, evenly spaced, no overlap, no cropping, no weapons crossing cells. Each ROW is one consistent role, top to bottom: row 1 goblin cutter with hooked mining cleaver and light asymmetrical armor; row 2 goblin slinger with unmistakable sling and ammunition satchel; row 3 broad goblin bulwark elite with tower shield and short pick; row 4 imposing Gatebreaker captain boss with massive two-handed hammer, reinforced dark plate, ember crest. Preserve the exact face, armor, proportions, weapon, and material identity across each row.

Each COLUMN is one authored elevated-orthographic facing, left to right: column 1 facing toward the upper-left/back-left; column 2 facing toward the upper-right/back-right; column 3 facing toward the lower-right/front-right; column 4 facing toward the lower-left/front-left. Make head, shoulders, feet, shield planes, weapon grip, and body foreshortening clearly communicate each direction—not mere mirroring, tinting, arrows, or labels. Exactly sixteen figures total. No action trails, no attacks, no downed poses, no dwarves, no generic duplicate role substitutions, no animation arrows, no written direction names, no smooth vector style, no photorealism, no concept sketch, no checkerboard transparency.

### Bounded QA limitation

The atlas provides strong authored front-versus-back distinction and stable role continuity. Left-versus-right differences are subtler, especially for cutter and slinger, but remain bound to separate authored cells through equipment placement and foreshortening. Runtime tests must bind every simulation facing value to a distinct stable asset ID; product-owner review remains the final visual gate.
