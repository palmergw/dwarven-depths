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
- Saved dimensions: `1536x1024`
- Quality: `medium`
- Modality: `image`
- Input images: `assets/game-art/combat-animation/sources/iron-warden-basic-attack-cycle-master.png`, `assets/game-art/combat-animation/sources/iron-warden-shield-slam-cycle-master.png` (preceding rejected candidate used only as identity/continuity references)
- Source SHA-256: `bbf7c4fd3090f767ca8a187befc495a46303ad9934a57cd0cf6a28bdfda2d6c4`
- License: project MIT license (`LICENSE`)

### Exact prompt

Create a replacement ORIGINAL production sprite atlas for the Dwarven Depths project. Preserve the exact same Iron Warden character identity from the references: stocky dwarf anatomy, red braided beard, bronze and dark-steel armor, square-headed one-handed hammer, tall rectangular shield with diamond emblem, warm painterly pixel-art rendering, elevated three-quarter camera, crisp silhouette. Output exactly FIVE evenly separated, complete figures in one horizontal row on a perfectly uniform deep navy (#061525) removable background. No text, labels, borders, UI, rings, bars, floor, scenery, cyan, magic arc, detached effect, extra figures, cropped equipment, duplicated limbs, or smooth vector art.

This is a forceful but anatomy-stable SHIELD SLAM cycle designed to remain unmistakable at only 56 pixels tall. Keep body, head, beard, armor, hammer, shield dimensions, lighting, camera, and logical ground line consistent. Both boots remain planted and clearly visible in every frame; motion comes from knees, hips, shoulder, shield arm, and believable weight transfer—never global rotation, stretch, squash, sliding, or distortion.

Left to right: (1) ANTICIPATION: unmistakably low, wide braced silhouette; knees deeply compressed; hips and shoulders pulled back; shield drawn tightly beside the torso and visibly rearward; hammer hand guarding high. This must read as stored weight, not idle. (2) COMMITMENT: strong forward diagonal through shoulder and shield arm; rear knee driving; shield halfway thrust forward; torso stable; clear separation from frames 1 and 3. (3) CONTACT: shield face at maximum forward extension well ahead of head and torso; body visibly driving behind it; tiny restrained warm amber edge sparks only; strongest silhouette in the row. (4) RECOIL: shield has visibly bounced back and upward toward the shoulder; torso and knees absorb force rearward; hammer arm counterbalances low; clearly different from idle and anticipation. (5) RECOVERY: guarded settling pose midway back to idle, shield returned in front but still slightly angled, knees partly bent, hammer lowering; clearly distinct from frame 1.

Prioritize broad readable silhouette differences, consistent planted boots, weapon/shield motion, and animation continuity at gameplay scale. Exactly five figures.

### Bounded QA

Exactly five complete figures preserve the Warden's identity, anatomy, shield, hammer, scale, and planted ground line. The low brace, forward drive, maximum shield contact, high shield rebound, and guarded settle are distinct at gameplay scale. The contact accent is warm and restrained with no detached overlay. The deterministic exporter binds the source digest and all five phase exports.

## `shuttergate-expanded-hostile-role-atlas-master.png`

- Provider: `openai-codex`
- Model: `gpt-image-2-medium`
- Aspect ratio: `landscape`
- Requested size setting: `1536x1024`
- Saved dimensions: `1620x971`
- Quality: `medium`
- Modality: image-to-image consistency reference
- Input image: `assets/game-art/combat-animation/sources/shuttergate-hostile-role-atlas-master.png`
- Source SHA-256: `8b88de6fe432b54f8b8821a90c10948bc0d37ae85f9c3c8f2630ea8fbe9cab5d`
- License: project MIT license (`LICENSE`)

### Exact prompt

Create an ORIGINAL production sprite atlas for the Dwarven Depths project, using the attached project-owned hostile atlas only as the exact style, camera, palette, logical texel, material, and scale reference. Wide landscape canvas, perfectly uniform deep navy (#061525) removable background. No scenery, floor, UI, text, labels, borders, rings, bars, or extra figures. Crisp hand-painted painterly pixel art with subtly pre-rendered volume, hard chunky texels, cold slate/navy/scavenged iron and restrained warm amber accents. Arrange EXACTLY FIFTEEN complete hostile figures in a strict 5-column by 3-row grid, evenly spaced, no overlap or cropping, one role per column with exact identity continuity down the column. Columns left to right: (1) GOBLIN SKIRMISHER: very lean agile silhouette, paired short hooked blades, light asymmetric leather/iron armor and narrow trailing scarf; (2) GOBLIN SAPPER: compact demolition specialist with unmistakable long fuse-bomb satchel and short mining maul, amber fuse accent; (3) GOBLIN HEXER ELITE: tall narrow hooded silhouette, forked iron channeling staff with a restrained amber rune lantern, no cyan; (4) GOBLIN BANNER BEARER ELITE: sturdy support silhouette carrying a tall torn rectangular fortress banner on a pole, short sidearm, warm ember badge; (5) GOBLIN WARDEN HUNTER ELITE: broad predatory silhouette with two-handed hooked polearm, marked iron visor and trophy plates. Rows top to bottom: TOP idle combat-ready three-quarter elevated orthographic pose facing lower-left; MIDDLE committed role action with anatomy and feet stable (skirmisher low feint, sapper lights/raises fuse charge, hexer channels staff, banner bearer braces and raises banner, hunter extends hooked polearm to mark prey); BOTTOM clearly downed/destroyed pose, still role-readable. Same invisible ground line per row. Every figure must remain readable at final 44-pixel-tall game scale. Exactly fifteen figures. No dwarves, no duplicate generic raiders, no smooth vector art, no photorealism, no concept sketch, no checkerboard transparency.

### Bounded QA and export semantics

The source contains exactly fifteen separated figures in a regular 5×3 layout. Each role preserves its equipment and silhouette across idle, committed action, and downed rows. The exporter creates separate straight-alpha 80×60 role files at the fixed 44-pixel hostile baseline. The source authors one elevated-orthographic facing and one committed action per new role; directional and attack-phase filenames deliberately reuse those authored pixels rather than claiming generated intermediate animation. Runtime tell/effect signals remain separate presentation layers. No concept-mockup pixels were supplied, cropped, traced, or composited.

## `shuttergate-sapper-hexer-intent-atlas-master.png`

- Provider: `openai-codex`
- Model: `gpt-image-2-medium`
- Aspect ratio: `landscape`
- Requested and saved dimensions: `1536x1024`
- Quality: `medium`
- Modality: image-to-image consistency reference
- Input image: preceding project-owned `shuttergate-sapper-hexer-intent-atlas-master.png` (direction-rejected version, used only as the atlas-layout reference)
- Source SHA-256: `b953aca51a36f2de30d6b5504cffe6604d73ada45c321aed119f1b6089811086`
- License: project MIT license (`LICENSE`)

### Exact prompt

Edit this original 4-column by 2-row game-asset atlas, preserving the exact 1536×1024 atlas layout, dark near-black keyable background, painterly hand-authored isometric fantasy style, and eight clearly separated cells with generous empty margins. Do not add text, captions, UI mockups, characters, or scenery.

The cells must remain in this exact order. TOP ROW: (1) compact Sapper bomb-and-lit-fuse pictorial CREST END-CAP, (2) Sapper TELL: a small bomb at the source, a thin restrained directional trail of amber fuse sparks and translucent charcoal smoke, then a clearly etched low-contrast blast footprint on stone at the destination, (3) Sapper COMMIT: the same etched footprint receiving a compact grounded amber impact and a few embers, (4) Sapper cancellation fracture/dissolve. BOTTOM ROW: (1) compact Hexer rune-lantern pictorial CREST END-CAP, (2) Hexer TELL: a small source rune/lantern with a narrow directional violet-grey channel and clear negative space, ending at a small target rune endpoint, (3) Hexer COMMIT: the same narrow channel resolving at a compact endpoint with a restrained warm-violet pulse, (4) Hexer cancellation fracture/dissolve.

Critical correction: remove the large detached hanging shield plaques. The two crest cells should be tiny horizontal engraved brass/blackened-steel health-frame endcaps, visually weighted but compact, with the pictogram cut into metal—not floating badges. Effects must stay below character silhouette height and must not become serpents, ribbons, circles, crosshairs, letters, or debug glyphs. Use Shuttergate materials: smoked iron, old brass, ember orange, dusty charcoal, muted plum-violet, rough etched stone texture. Keep actors visually primary: narrow effects, low saturation, no neon/cyan, no oversized glow, no broad opaque smoke, no overlapping ground rings. Each direction/recipient/consequence should read pictorially without captions at gameplay scale.

### Bounded QA and export semantics

The generated source contains the requested 4×2 sequence and no environment pixels or character figures, but adversarial inspection found that both first-column cells still retained detached plaques. That output is direction-rejected and superseded by the plaque-removal correction below; it must not be used as evidence that the compact source-frame requirement was met.

## `shuttergate-sapper-hexer-intent-atlas-master.png` — plaque-removal correction

- Provider: `openai-codex`
- Model: `gpt-image-2-medium`
- Aspect ratio: `landscape`
- Requested and saved dimensions: `1536x1024`
- Quality: `medium`
- Modality: image-to-image correction
- Input image: preceding project-owned `shuttergate-sapper-hexer-intent-atlas-master.png`
- Input SHA-256: `b953aca51a36f2de30d6b5504cffe6604d73ada45c321aed119f1b6089811086`
- Output SHA-256: `c96f62a362266025b702437e3dd5502dc684c354ea6bf1cd4b4448944e320334`
- License: project MIT license (`LICENSE`)

### Exact prompt

Edit this ORIGINAL project-owned 4-column by 2-row production game-asset atlas. Preserve the exact 1536x1024 canvas, uniform near-black keyable background, painterly hand-authored isometric fantasy material language, and exactly eight clearly separated cells in the same strict grid with generous margins. No text, captions, UI mockups, characters, scenery, cyan, neon, broad ribbons, serpentine smoke, rings, crosshairs, letters, geometric debug symbols, or extra assets.

CRITICAL: completely remove both large rectangular hanging plaques and every plaque border, backing plate, corner ornament, and frame from the first column. The first-column cells must contain ONLY compact isolated pictorial objects on transparent/keyable background: TOP LEFT an unmistakable round blackened-iron Sapper bomb with a short lit fuse, a tiny restrained ember, and one small engraved brass attachment tab suitable for a health-frame endcap; BOTTOM LEFT an unmistakable compact blackened-iron Hexer rune lantern with warm muted plum light and one small engraved brass attachment tab. Neither may be enclosed by any rectangle, shield, badge, plaque, panel, or background.

Cells in exact order. TOP ROW: (1) isolated bomb/fuse endcap object; (2) Sapper TELL, with a clearly visible small bomb at source, short restrained directional amber fuse sparks and thin broken charcoal smoke with generous negative space, terminating in a readable low-contrast etched stone blast footprint; (3) Sapper COMMIT, same footprint receiving a compact grounded amber impact, fractured stone and only a few embers; (4) authored bomb fracture/dissolve cancellation. BOTTOM ROW: (1) isolated rune-lantern endcap object; (2) Hexer TELL, a visible source lantern/rune, narrow directional muted plum-grey channel with generous negative space, and a distinct small target rune endpoint; (3) Hexer COMMIT, same compact target endpoint grounded into etched stone with restrained warm-plum resolve; (4) authored rune fracture/dissolve cancellation.

Make each source, direction, recipient, and consequence pictorially readable when the exported world effects are rendered approximately 140x28 pixels and the endcap objects approximately 20x20 pixels. Keep silhouettes and floor texture visible through effects. Use Shuttergate materials: smoked iron, old brass, ember orange, dusty charcoal, muted plum-violet, rough etched stone. Maintain actors-above-effects hierarchy. No opaque smoke masses, no saturated glow, no particle amplification.

### Bounded QA and export semantics

The correction contains exactly eight isolated assets in the required 4×2 order. The first-column exports are now freestanding bomb and lantern objects with no plaque geometry or backing. The remaining cells retain distinct source, directional, destination, impact/resolve, and cancellation imagery. The keyed background is uniform and no character, UI, text, or environment layer is present. The deterministic exporter uses the first-column cells directly for compact health-frame endcaps and binds the corrected source digest and every exported digest.

## `shuttergate-sapper-hexer-intent-atlas-master.png` — gameplay-scale readability correction

- Provider: `openai-codex`
- Model: `gpt-image-2-medium`
- Aspect ratio: `landscape`
- Requested and saved dimensions: `1536x1024`
- Quality: `medium`
- Modality: image-to-image correction
- Input image: preceding project-owned `shuttergate-sapper-hexer-intent-atlas-master.png`
- Input SHA-256: `c96f62a362266025b702437e3dd5502dc684c354ea6bf1cd4b4448944e320334`
- Output SHA-256: `05df683d24534804cb2b200ae41d0fe9e4c0a3580bc3708e8e143ec34c8f8e08`
- License: project MIT license (`LICENSE`)

### Exact prompt

Edit this ORIGINAL project-owned Dwarven Depths asset atlas into a cleaner production-ready replacement while preserving its exact 4-column × 2-row layout, 1536×1024 canvas intent, black removable key background, warm painterly pixel-art material, and generous cell isolation. No text, labels, borders, UI, plaques, health bars, characters, scenery, floor tiles, cobblestones, rings, crosshairs, arrows, letters, or generic geometric debug symbols. Exactly eight isolated effects, one centered in each equal cell, nothing crosses a cell boundary.

TOP ROW — SAPPER, left to right: (1) compact recognizable black-iron spherical goblin bomb with brass winding key and a thick braided fuse, fuse tip visibly glowing amber; bold readable silhouette for a 20-pixel actor-attached crest, no backing plate; (2) directional fuse tell: the same compact bomb clearly at the LEFT source, its thick braided fuse and a restrained LOW horizontal stream of warm ember flecks and thin charcoal smoke traveling unmistakably LEFT→RIGHT; readable when displayed only 32 pixels high, smoke must not become a serpent or cloud and must leave negative space; (3) committed blast footprint: a broad, flat, floor-integrated radial blast warning made ONLY of sparse etched amber fissures, small ember points, and a restrained low central ignition; no bomb, no floor/tile patch, no opaque disc, no high flame column; silhouette wider than tall and readable at 98×50 pixels while underlying game floor texture remains visible; (4) cancellation: recognizable broken bomb halves and a few dissolving iron/ember fragments, no prohibition icon.

BOTTOM ROW — HEXER, left to right: (1) compact recognizable dark forged hex lantern with one bold asymmetrical violet rune glowing inside and brass handle/key detail; bold readable silhouette for a 20-pixel actor-attached crest, no backing plate; (2) directional channel: the same lantern clearly at LEFT source emitting one narrow, taut, low violet-and-muted-brass braided channel toward a small rune-knot endpoint at RIGHT; channel thickness about 10–14% of cell height, much narrower and calmer than the prior ribbon, no floor patch, no smoky serpent, strong negative space above and below, readable when displayed 26 pixels high; (3) target endpoint: a compact floor-hugging asymmetrical rune-knot made of three short etched violet/brass strokes and a few low motes; no stone tablet, no circular ring, no crosshair, no floor/tile patch, remains visible beside rather than over an actor at 60×34 pixels; (4) cancellation: fractured lantern/rune shards dissolving into restrained violet dust, no prohibition icon.

Keep effects crisp, materially grounded, low-profile, and darker at edges. Warm Sapper light must harmonize with Shuttergate amber illumination; Hexer violet must be desaturated plum with restrained brass highlights, never saturated neon. Prioritize normal gameplay-scale readability through recognizable objects and directional causality, not size, brightness, or particle count.

### Bounded QA and export semantics

The replacement preserves eight isolated cells and removes baked floor patches from both committed endpoints. The Sapper sequence uses one recognizable bomb language from source through fuse direction and then resolves into a sparse alpha-only etched blast footprint. The Hexer sequence uses one lantern source, a narrow channel, and a compact endpoint; runtime placement moves that endpoint beside the target footing so it does not cover the recipient silhouette. Cancellation remains authored fracture/dissolve rather than prohibition glyphs. The deterministic exporter binds the replacement source and every alpha export.
