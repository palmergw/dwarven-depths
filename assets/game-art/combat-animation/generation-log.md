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

## `shuttergate-hostile-attack-cycle-master.png`

- Provider: `openai-codex`
- Model: `gpt-image-2-medium`
- Aspect ratio: `landscape`
- Requested size setting: `1536x1024`
- Saved dimensions: `1536x1024`
- Quality: `medium`
- Modality: `image`
- Input image: `assets/game-art/combat-animation/sources/shuttergate-hostile-role-atlas-master.png`
- Source SHA-256: `ad465196d3a473e904a477588d31bce835dc37ef993eed3afdcb5f904a948b52`
- License: project MIT license (`LICENSE`)

### Exact prompt

Create an ORIGINAL production sprite atlas for the Dwarven Depths project, closely preserving the exact painterly pixel-art character designs, proportions, armor, weapons, warm orange accents, three-quarter camera, and dark navy keyed background of the provided project-owned reference. Do not add text, labels, borders, UI, rings, bars, or environment. Arrange a precise 4-column by 5-row grid with generous separation and no overlap. Columns left to right are the same four roles as the reference: goblin cutter with axe; goblin slinger with sling; armored goblin bulwark with pick and rectangular shield; massive gatebreaker captain with hammer and forearm shield. Rows top to bottom are an authored complete attack cycle, with feet planted on one consistent invisible ground line in every frame: (1) anticipation—weight shifts back, knees compress, weapon/shield visibly draw back; (2) strike—weapon arm drives forward while torso remains anatomically stable; (3) contact—clear weapon/shield contact silhouette at maximum extension, restrained warm amber sparks only; (4) recoil—weapon rebounds and body absorbs force through bent knees; (5) recovery—returns toward guarded idle. Keep anatomy and ground contact stable. Motion must come from limbs, weapon, shield, and weight shift, never whole-body stretching, rotation, or distortion. Each cell must contain exactly one complete character, no cropped weapons, no duplicated limbs. Match the crisp painterly sprite rendering and readable silhouettes of the reference at game scale. Uniform dark navy (#061525-like) background suitable for deterministic color-key alpha extraction.

### Bounded QA

The source contains exactly twenty separated figures in a regular 4×5 layout. Each role preserves stable anatomy, equipment, scale, and planted feet across anticipation, strike, contact, recoil, and recovery. Contact sparks are warm and cell-local. The deterministic exporter binds every source digest, crop, phase ID, output dimension, alpha treatment, and generated file.

## `iron-warden-basic-attack-cycle-master.png`

- Provider: `openai-codex`
- Model: `gpt-image-2-medium`
- Aspect ratio: `landscape`
- Requested size setting: `1536x1024`
- Saved dimensions: `2172x724`
- Quality: `medium`
- Modality: `image`
- Input image: `assets/game-art/visual-direction/sources/iron-warden-master.png`
- Source SHA-256: `226aa23dea6cabfc04403cc93343e8122dd297615037911245b74750d8e279a2`
- License: project MIT license (`LICENSE`)

### Exact prompt

Create an ORIGINAL production sprite atlas for the Dwarven Depths project preserving the exact Iron Warden identity, proportions, bronze/dark-steel armor, red beard, round shield, one-handed axe, warm painterly pixel-art rendering, three-quarter camera, and dark navy keyed background of this project-owned reference. No text, labels, borders, UI, rings, bars, environment, or unrelated poses. Arrange exactly 5 evenly spaced columns in one row, one complete Iron Warden per cell, all feet planted on the same invisible ground line. Left to right depict one coherent basic axe attack cycle: (1) anticipation—knees compressed, weight planted back, axe drawn behind shoulder, shield guarding; (2) strike—axe arm and torso drive forward while boots remain planted and anatomy remains stable; (3) contact—axe at maximum forward/downward extension with a tiny restrained warm amber spark accent, shield still readable; (4) recoil—axe rebounds and body absorbs force through knees and shoulders; (5) recovery—returns toward guarded idle. Motion must be authored through limbs, axe, shield, and weight shift, never whole-body stretch, squash, rotation, or distortion. Keep character scale, anatomy, armor details, weapon size, shield size, lighting, and camera perfectly consistent between frames. No cropped axe or shield, no duplicated limbs. Uniform dark navy (#061525-like) background suitable for deterministic color-key alpha extraction.

### Bounded QA

The generated source follows the project-owned reference identity rather than the prompt's inaccurate weapon nouns: it preserves the Warden's square-headed hammer and tall rectangular shield. Exactly five complete, separated figures form a planted anticipation-through-recovery cycle with restrained contact sparks. The deterministic exporter binds the source digest, five equal crops, stable phase IDs, dimensions, alpha treatment, and generated files.

## `iron-warden-shield-slam-cycle-master.png`

- Provider: `openai-codex`
- Model: `gpt-image-2-medium`
- Aspect ratio: `landscape`
- Requested size setting: `1536x1024`
- Saved dimensions: `2172x724`
- Quality: `medium`
- Modality: `image`
- Input image: `assets/game-art/combat-animation/sources/iron-warden-basic-attack-cycle-master.png`
- Source SHA-256: `46c5a0ae9fd29cab5183239b313a9c03141059cb569af324d4ef02eb4e18c698`
- License: project MIT license (`LICENSE`)

### Exact prompt

Create an ORIGINAL production sprite atlas for the Dwarven Depths project, preserving exactly the same Iron Warden identity, anatomy, proportions, bronze and dark-steel armor, red braided beard, square-headed one-handed hammer, tall rectangular shield, warm painterly pixel-art rendering, elevated three-quarter camera, and uniform deep navy keyed background shown in the project-owned reference. No text, labels, borders, UI, rings, bars, environment, floor, or unrelated poses. Arrange EXACTLY FIVE evenly separated complete Iron Warden figures in one horizontal row. All figures must have boots planted on exactly the same invisible ground line and remain exactly the same body scale. Left to right, depict one coherent SHIELD SLAM cycle: (1) anticipation—knees compress, weight braces behind both planted boots, tall shield drawn close and slightly back, hammer hand guarding; (2) commitment—shield shoulder and arm begin driving forward while torso remains anatomically stable; (3) contact—shield face reaches maximum forward extension with a tiny restrained warm amber edge spark, body behind the shield, no magic arc; (4) recoil—shield rebounds toward the torso and knees absorb force; (5) recovery—returns toward guarded idle. Motion must come from shield arm, shoulder, knees, and believable weight shift, never whole-body stretch, squash, rotation, sliding, or distortion. Preserve shield dimensions/design, hammer dimensions/design, beard, armor, lighting, and camera perfectly across all five frames. No cropped equipment, duplicated limbs, detached parts, cyan effects, or smooth vector style. Crisp silhouettes that remain readable at 56-pixel gameplay height. Uniform dark navy (#061525-like) background suitable for deterministic color-key alpha extraction.

### Bounded QA

Exactly five complete figures preserve the Warden's anatomy, shield, hammer, scale, and planted ground line. The action is authored through shield extension and braced weight transfer, with a restrained warm contact spark and no detached overlay. The deterministic exporter binds the source digest and all five phase exports.
