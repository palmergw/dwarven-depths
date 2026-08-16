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

## `shuttergate-sapper-hexer-intent-atlas-master.png` — floor-language refinement

- Provider: `openai-codex`
- Model: `gpt-image-2-medium`
- Aspect ratio: `landscape`
- Requested and saved dimensions: `1536x1024`
- Quality: `medium`
- Modality: five image-to-image correction passes
- Input image: preceding project-owned `shuttergate-sapper-hexer-intent-atlas-master.png`
- Input SHA-256: `05df683d24534804cb2b200ae41d0fe9e4c0a3580bc3708e8e143ec34c8f8e08`
- Output SHA-256: `d48b067baf46a9f4d3c030e75bf9789d59e751e6303b9919ce60de86251c061d`
- License: project MIT license (`LICENSE`)

### Exact first-pass prompt

Edit this original Dwarven Depths authored VFX source atlas while preserving its exact 4-column by 2-row black-background sprite-sheet layout, painterly hand-authored dark-fantasy material language, and 1536×1024-like composition. No text, labels, plaques, UI panels, letters, generic icons, circles, crosshairs, prohibition signs, or debug geometry. Keep generous pure black separation around every cell and never let neighboring cells touch.

This atlas is downscaled dramatically for a warm torchlit brown stone battlefield, so simplify each sprite to a bold readable pictorial silhouette with controlled value contrast, thick structural marks, and very little fine particle noise. Actors must remain visually primary: effects should feel floor-integrated and restrained, never neon, oversized, foggy, ribbon-like, or explosively bright.

Top row, exactly four isolated cells left to right: (1) compact Sapper source attachment: a recognizable squat black iron powder bomb, short braided lit fuse, one warm ember, brass cap/rivet accents; tight square silhouette suitable for a 24px health-frame endcap, with no backing plaque or detached hanging sign; (2) Sapper preparation world tell only: remove the second bomb and show a clearly directional low floor-skimming fuse trail traveling left-to-right, one coherent braided charcoal fuse with a restrained warm ember head, sparse tiny sparks, and a thin broken smoky wake, with an obvious start and direction at thumbnail size rather than a brown smoke serpent or particle smear; (3) Sapper commitment/impact footprint: one broad but restrained etched blast area integrated into stone—an irregular scorched radial fracture footprint with a dark charred perimeter, several strong engraved amber cracks, and a modest central ember, reading as a dangerous floor blast consequence rather than a magic circle, starburst, or floating explosion; (4) Sapper authored cancellation: recognizable cracked bomb shell fragments and a severed extinguished fuse, sparse embers, compact directional breakup, and no circle-slash symbol.

Bottom row, exactly four isolated cells left to right: (1) compact Hexer source attachment: recognizable small brass-and-black iron rune lantern/reliquary with a faceted violet crystal and one strong asymmetrical notch/silhouette, suitable for a 24px health-frame endcap with no backing plaque; (2) Hexer preparation/commit world tell only: remove the lantern object, paint a compact angular floor rune at far left from 3–4 chunky engraved strokes, then send one narrow braided violet-and-muted-gold channel left-to-right through clear negative space to a small directional hooked tip, thick enough for thumbnail scale but never a saturated ribbon and with almost no loose particles; (3) Hexer target endpoint: one compact floor-integrated endpoint seal with a clearly different silhouette from the source rune—an open broken triangular claw/ward gripping inward around a small dim violet center, plus subtle warm stone etching, with no full ring, crosshair, or generic triangle icon; (4) Hexer authored cancellation: shattered brass rune-lantern pieces and fractured violet crystal dissipating into sparse angular motes, with no prohibition symbol.

Maintain warm Shuttergate lighting inheritance: black iron, aged brass, ember orange, muted dusty violet, scorched charcoal. Preserve transparent-keyable pure black background and clean cell isolation.

### Exact refinement prompt

Refine this exact 4-column by 2-row black-background game VFX atlas. Preserve cell positions, all cell isolation, the painterly dark-fantasy treatment, and cells top-left, top-third, top-right, bottom-left, and bottom-right unchanged. Change only top-row cell 2 and bottom-row cells 2 and 3.

Top row cell 2: it currently reads as a trail of stones. Replace it with one unmistakable braided black powder fuse lying low across the floor from left to right, about finger-thick relative to the bomb in cell 1, with a visible rope texture and charred tail at the left, one moving orange ember head near the right, 3–5 tiny sparks, and only a very thin sparse charcoal smoke wake. No bomb, rock rubble, snake-like thick smoke, or big glow. The fuse must be a bold continuous directional silhouette after heavy downscaling.

Bottom row cell 2: it is currently an oversized armored arrow/ribbon. Replace it with a compact engraved source rune at far left made from three asymmetric hooked stone strokes, followed by one very narrow braided energy channel moving left-to-right. The channel should be only about 1/6 as tall as the current ribbon, made of two restrained strands—muted dusty violet and dim aged-gold—with lots of black negative space, ending in one small hooked directional tip. No arrowhead, blade, thick metal edging, ribbon, neon, or loose particle cloud. Fill the horizontal distance while remaining thin enough to pass below actors.

Bottom row cell 3: it currently resembles a large ornate circular badge. Replace it with a smaller open floor endpoint—not a ring, badge, crosshair, or symmetric icon. Use three broken claw-like engraved stone/brass strokes arranged asymmetrically around a small dim violet fracture, leaving at least half the implied perimeter open and ample black negative space. It should look like a target consequence etched into stone beside a character's feet, not UI.

Keep pure keyable black background, no text, labels, plaques, or generic symbols.

### Exact surgical channel prompt

Make one surgical correction to this exact project-owned 4-column by 2-row black-background VFX atlas. Preserve every pixel and cell except BOTTOM ROW, SECOND COLUMN (the Hexer directional channel). Preserve canvas dimensions and all cell isolation.

The bottom-row second cell currently reads like a straight UI arrow because it has a triangular source and pointed arrowhead. Remove both arrow-like ends completely. Replace the left end with an irregular authored floor rune shaped like a small cracked fork: three unequal crooked engraved strokes, one short branch upward, one long branch down-left, and one broken brass notch—deliberately asymmetric, pictorial, and not enclosed. From that rune, carry the same very narrow muted-plum and aged-brass braided channel toward the right, but let it terminate in a softly frayed hooked wisp and two tiny fading motes, not a point, chevron, blade, triangle, cursor, or arrowhead. Give the channel a subtle shallow curve and one small discontinuity so it reads as magical causality across stone rather than a straight UI connector. Keep it low-profile with abundant black negative space, painterly material, and no neon or particle cloud. No text, labels, plaques, rings, crosshairs, generic geometry, or changes to the other seven cells.

### Exact cell-containment prompt

Correct only the placement of BOTTOM ROW, SECOND COLUMN in this exact 4×2 black-background atlas. Do not redesign it and do not change any other cell. The irregular cracked-fork source rune currently touches/crosses the left boundary of its equal grid cell and is clipped by deterministic export. Move and scale the complete bottom-row second-cell rune-plus-channel artwork so every visible pixel lies safely inside column 2 (the horizontal quarter from 25% to 50% of canvas width), with at least 45 pixels of pure black margin from both the left and right cell boundaries. Keep the full irregular three-stroke source rune visible at the left within that cell, followed by the same narrow shallow-curved muted-plum/aged-brass channel and its softly frayed hooked wisp. Preserve the non-arrow silhouette, material, brightness, low profile, black negative space, exact 4×2 layout, pure black key background, and all other seven cells unchanged. No text, plaques, rings, arrows, triangles, crosshairs, or new elements.

### Exact gameplay-contrast prompt

Make a surgical gameplay-contrast correction to exactly two cells in this project-owned 4×2 black-background VFX atlas: TOP ROW COLUMN 2 (Sapper fuse) and BOTTOM ROW COLUMN 2 (Hexer rune-channel). Preserve canvas, positions, silhouettes, dimensions, pure-black background, cell containment, and every other cell unchanged. Do not make either effect larger, wider, glowier, more saturated, or more particle-heavy.

Both effects currently disappear against the warm brown Shuttergate floor after downscaling. Improve material/value separation inside their existing silhouettes only.

Top row column 2: preserve the same continuous left-to-right braided powder fuse and ember head. Lighten the rope's upper ridge from near-black to readable charcoal-brown, add a broken one-pixel-like aged-brass/ember edge along alternating braid segments, keep the underside dark, and strengthen only the tiny traveling ember core. It must read as a physical fuse at thumbnail scale, not a black scratch or smoke smear. Keep smoke sparse and dark.

Bottom row column 2: preserve the complete asymmetric cracked-fork source rune, shallow curved narrow braided channel, frayed non-arrow endpoint, and black margins. Increase the source rune's engraved aged-brass edge and muted plum fracture core. Give the channel one continuous dusty-plum core strand with a restrained alternating aged-brass thread, both materially solid enough to survive heavy downscale. Keep the channel narrow with negative space and soft painterly edges; no neon, broad ribbon, straight UI line, arrow, triangle, chevron, ring, or particle cloud. Make the frayed hooked endpoint visible through a small warm-brass tip and two muted plum motes, never an arrowhead.

No text, plaques, labels, UI, geometry symbols, or changes to adjacent cells.

### Bounded QA and export semantics

The resulting source preserves exactly eight isolated cells. The Sapper source remains a compact actor-attached bomb, while its world tell is now a continuous braided fuse rather than detached smoke particles and its commit is a floor-integrated scorched fracture footprint. The Hexer source remains a compact lantern attachment; its world tell separates the floor rune from a narrow low channel, and its endpoint is an open asymmetric floor fracture rather than a closed ring. The exporter continues to create separate straight-alpha source, world, endpoint, and cancellation layers without environment or actor pixels. Runtime-scale WIP capture remains the controlling visual QA gate.

## `shuttergate-sapper-hexer-intent-atlas-master.png` — pictorial-causality replacement

- Provider: `openai-codex`
- Model: `gpt-image-2-medium`
- Aspect ratio: `landscape`
- Requested and saved dimensions: `1536x1024`
- Quality: `medium`
- Modality: two image-to-image correction passes
- Input image: preceding project-owned `shuttergate-sapper-hexer-intent-atlas-master.png`
- Input SHA-256: `d48b067baf46a9f4d3c030e75bf9789d59e751e6303b9919ce60de86251c061d`
- Output SHA-256: `e980b290f3402516d23ee4bfbd2ead5486aa6ed7fff1cf2bd676c8c275b89be9`
- License: project MIT license (`LICENSE`)

### Exact replacement prompt

Edit this ORIGINAL project-owned Dwarven Depths 4-column × 2-row black-keyed VFX atlas into a clearer gameplay-scale production replacement. Preserve exactly 1536×1024, exactly eight isolated cells in the same grid/order, pure uniform black background, painterly chunky dark-fantasy pixel-art material language, and generous black margins. No text, labels, UI panels, plaques, hanging signs, health bars, characters, scenery, floor rectangles/tiles, circles, rings, crosshairs, arrows, chevrons, letters, neon, cyan, broad ribbons, smoke serpents, opaque clouds, or generic debug geometry. Nothing crosses a cell boundary.

This is a readability correction, not amplification: use bold recognizable object silhouettes and controlled value separation, while keeping actors visually primary at 1440×900. Simplify fine noise. Effects must stay low and floor-integrated with transparent/keyable negative space.

TOP ROW, SAPPER, left to right: (1) A compact unmistakable round black-iron powder bomb source attachment, about 60% of cell height, with a thick short braided fuse, glowing ember tip, brass cap/rivets, and a small attachment notch. No backing or frame. It must survive export to 30×30. (2) Preparation tell: at far LEFT, repeat a small unmistakable bomb with lit fuse. From it, one clearly left-to-right, low floor-skimming braided charcoal fuse with alternating aged-brass ember edge, 3–5 sparse sparks, and a very thin broken smoke wake. At far RIGHT, foreshadow the destination with only 3–4 short dim scorched radial scratches. The bomb → directional fuse → destination sequence must read at roughly 160×52, not as a rope alone or brown smear. (3) Commit: one broad low etched blast footprint, wider than tall, with an irregular dark scorched perimeter, 6–8 strong engraved amber fissures, a compact grounded central ignition, and a few embers. Underlying floor must remain visible through large empty gaps. No opaque disc, magic circle, star icon, or flame column. Must read at 98×50. (4) Cancellation: recognizable broken bomb halves, severed extinguished fuse, and restrained dissolving iron/ember fragments; no prohibition symbol.

BOTTOM ROW, HEXER, left to right: (1) A compact unmistakable forged rune lantern/reliquary source attachment, about 60% of cell height, with dark iron body, brass handle/notch, and one bold asymmetrical muted-plum crystal rune. No backing or frame. It must survive export to 30×30. (2) Preparation/commit channel: at far LEFT, a compact visibly authored source rune/reliquary footprint made from an asymmetrical lantern-shaped brass outline plus a muted-plum crystal slash—not an arrow or generic glyph. From it, one narrow taut shallow-curved channel travelling left-to-right, only about 10% of cell height, formed by a continuous dusty-plum core and broken aged-brass thread. Leave abundant black negative space. At far RIGHT, finish with a small frayed hooked wisp and two motes, not a point or arrowhead. This source → direction must survive display around 180×50. (3) Target endpoint: one compact asymmetrical floor-hugging recipient seal, clearly different from the source: three broken claw-like brass/stone strokes open toward a small dim plum fracture, with over half the implied perimeter open. No ring, triangle, badge, crosshair, tablet, or floor patch. Must read beside an actor at 68×42. (4) Cancellation: fractured lantern body and plum crystal shards dissolving into sparse angular dust; no prohibition symbol.

Use Shuttergate materials and lighting: smoked black iron, aged engraved brass, ember orange, charcoal, muted dusty plum-violet. Increase internal light/dark material separation, not overall glow, saturation, size, or particle count. Prioritize pictorial mechanic causality without captions at normal gameplay scale.

### Exact alpha-separation correction prompt

Make a surgical production correction to this ORIGINAL project-owned 1536×1024 4-column × 2-row black-keyed VFX atlas. Preserve exact canvas, grid, cell isolation, black background, painterly chunky pixel-art materials, and all eight asset identities. Do not add text, labels, UI, plaques, actors, scenery, floor tiles, rings, crosshairs, arrows, letters, neon, broad ribbons, smoke clouds, or extra assets.

CRITICAL ALPHA-SEPARATION CORRECTION: remove every baked stone, cobblestone, rubble-floor, shadow-disc, or rectangular/oval ground patch from TOP ROW CELL 3 and BOTTOM ROW CELL 3. Their backgrounds must become pure black all around and between the marks, so runtime alpha extraction leaves the real Shuttergate floor visible. Top cell 3 must retain only sparse irregular scorched perimeter traces, 6–8 strong engraved amber fissure strokes, one compact central ignition, and a few embers floating on pure black; no stone pieces or filled floor mass. Bottom cell 3 must retain only three open asymmetric broken claw-like aged-brass/black-iron strokes and a small dim plum fracture/motes on pure black; no stone patch, tablet, backing, ring, or badge.

HEXER SOURCE CORRECTION in BOTTOM ROW CELL 2: replace the oversized symmetric diamond/plaque-like source object at far left with a much smaller low floor-authored rune/reliquary footprint, no more than about one quarter of cell height. It must be asymmetrical and pictorial: three short unequal cracked aged-brass strokes suggesting an open lantern silhouette around one muted-plum crystal slash, with no enclosed border, diamond, triangle, badge, or backing. Preserve the existing narrow shallow-curved dusty-plum plus aged-brass channel travelling left-to-right and its small frayed non-arrow ending. Leave abundant black negative space.

SAPPER PREPARATION in TOP ROW CELL 2: preserve the small recognizable bomb at left and narrow directional fuse, but reduce the far-right destination scratches to three short irregular dim scorched marks so they do not resemble an arrowhead or chevrons.

Keep top-left bomb, top-right cancellation, bottom-left lantern, and bottom-right cancellation unchanged. Keep actors-above-effects hierarchy through low profiles and controlled contrast. Pure uniform black key background with generous margins in every cell.

### Bounded QA and export semantics

The replacement keeps eight isolated authored layers and removes baked floor pixels from both committed endpoints. Sapper preparation now carries its bomb source into the directional fuse itself before the open destination scratches; commitment is alpha-only etched fissures. Hexer preparation starts with a compact open source rune, follows a narrow channel, and resolves into a separate open asymmetric endpoint. Runtime-scale WIP capture remains the controlling readability and hierarchy gate.

## `shuttergate-sapper-hexer-intent-atlas-master.png` — structural-readability correction

- Provider: `openai-codex`
- Model: `gpt-image-2-medium`
- Aspect ratio: `landscape`
- Requested and saved dimensions: `1536x1024`
- Quality: `medium`
- Modality: three image-to-image correction passes plus one deterministic cell-containment pass
- Input image: preceding project-owned `shuttergate-sapper-hexer-intent-atlas-master.png`
- Input SHA-256: `e980b290f3402516d23ee4bfbd2ead5486aa6ed7fff1cf2bd676c8c275b89be9`
- Intermediate image output SHA-256: `a02013bd9e4a85d91353b990c402a5a03d78763e89595455ec61f2231709f482`
- Final source SHA-256 after deterministic cell containment and pictorial-source correction: `c6c53b558d58fd4497369b5a1d1cb1cc45bff32b59ad7fa679564e44f576eaf8`
- License: project MIT license (`LICENSE`)

### Exact replacement prompt

Edit this ORIGINAL project-owned Dwarven Depths 4-column x 2-row VFX atlas as a production readability correction. Preserve exactly eight isolated cells in the same order on a perfectly uniform pure black removable-key background, with generous black margins and no element crossing a cell boundary. Keep the painterly chunky pixel-art dark-fantasy material language, elevated floor-facing perspective, smoked iron, aged brass, ember orange, charcoal, and muted dusty plum. No text, labels, UI panels, plaques, health bars, actors, scenery, floor tiles or filled floor patches, circles, rings, crosshairs, arrows, chevrons, letters, neon, cyan, broad ribbons, smoke serpents, opaque clouds, or generic debug geometry.

This correction must improve thumbnail readability by simplifying detail and strengthening bold object silhouettes and structural marks, not by increasing glow, saturation, particle count, or effect footprint. Actors will remain visually primary.

Top row, left to right: (1) compact round black-iron Sapper powder bomb source attachment with a thick short braided fuse, one restrained amber ember, brass cap, two bold rivets, and a tiny asymmetric attachment notch; (2) one coherent low bomb-to-braided-fuse-to-open-etched-footprint preparation sequence, using sparse aged-brass ember segments, thin broken smoke, six chunky irregular scorch cuts, and large transparent gaps; (3) the same broad low committed footprint with six to eight chunky scorched fissures, modest grounded ignition, and at most five embers; (4) broken bomb halves and severed extinguished fuse cancellation. No backing, rope-only smear, smoke serpent, filled disc, magic circle, star, flame column, or prohibition icon.

Bottom row, left to right: (1) compact forged Hexer rune lantern source attachment with dark iron body, brass handle/notch, and one bold asymmetrical muted-plum crystal slash; (2) an open three-stroke source rune followed by one taut shallow narrow dusty-plum channel with intermittent aged-brass thread and a frayed non-arrow hook; (3) a compact floor-hugging open recipient mark made from three unequal broken claw-like strokes around a dim plum fracture; (4) fractured lantern and crystal cancellation. Preserve abundant negative space and no backing, ribbon, generic glyph, ring, triangle, badge, crosshair, or prohibition icon.

Prioritize bold legible silhouettes, controlled light/dark material separation, floor integration, pictorial source/direction/consequence, and clean negative space at normal 1440x900 gameplay scale.

### Exact cell-containment correction prompt

Make one surgical correction to this ORIGINAL project-owned 1536x1024 4-column x 2-row VFX atlas. Preserve every visible pixel, pure black background, canvas, grid, style, and asset exactly unchanged except bottom row, second column. Move and slightly compress the complete Hexer source-rune, narrow plum/brass channel, frayed hook, and two motes so all visible pixels remain safely inside x=384 through x=767 and y=512 through y=1023, with at least 28 pixels of pure black horizontal margin. Keep the source rune complete, the channel narrow and shallow, and the ending non-arrow. Do not clip, erase, redesign, enlarge, brighten, or alter any other cell.

### Exact Sapper cell-containment correction prompt

Make one surgical production correction to this ORIGINAL project-owned 1536x1024 4-column x 2-row VFX atlas. Preserve every visible pixel, pure black background, canvas, strict grid, painterly style, and asset exactly unchanged except top row, second column. Move and slightly compress the complete Sapper preparation artwork—the recognizable bomb, physical braided fuse, sparse ember/smoke marks, and open etched destination scratches—so all visible pixels remain inside x=384 through x=767 and y=0 through y=511. Preserve the full bomb silhouette at the left, one continuous readable fuse through the middle, and the open destination footprint at the right. Do not alter the adjacent cells, add a second bomb, clip, erase, redesign, enlarge, brighten, add particles, or change any other asset.

The image correction retained four meaningful Hexer-source pixels across the equal-cell boundary. A deterministic Pillow correction recovered the complete artwork from x=350 through x=767, cleared that bounded region, resized the recovered keyed artwork proportionally to 344×96 pixels, and placed it at x=404, y=728. This leaves 20 black pixels on both sides of the canonical x=384 through x=767 export cell without changing the other seven assets.

Adversarial runtime-scale review then found that the open source rune collapsed to a generic purple diamond. A second deterministic source correction reused the atlas's authored freestanding Hexer lantern pixels: the keyed lantern was proportionally reduced to 49×78 pixels and placed at x=404, y=737 inside the channel cell, replacing only the diamond-like source region. The narrow channel, frayed endpoint, separate recipient mark, and the other seven canonical cells remain unchanged.

### Bounded QA and export semantics

The candidate preserves eight isolated alpha-keyable assets and simplifies both mechanic sequences around readable structural silhouettes. The Sapper preparation repeats the bomb at its source, carries one continuous physical fuse toward an open destination footprint, and resolves into a related floor fracture. The Hexer source rune and narrow channel remain wholly contained in their export cell and lead to a separate open recipient mark. The exact running-client WIP board remains the controlling product-quality gate.

## `shuttergate-sapper-hexer-intent-atlas-master.png` — source-to-consequence readability correction

- Provider: `openai-codex`
- Model: `gpt-image-2-medium`
- Aspect ratio: `landscape`
- Requested and saved dimensions: `1536x1024`
- Quality: `medium`
- Modality: two image-to-image correction passes
- Input image: preceding project-owned `shuttergate-sapper-hexer-intent-atlas-master.png`
- Input SHA-256: `c6c53b558d58fd4497369b5a1d1cb1cc45bff32b59ad7fa679564e44f576eaf8`
- First-pass output SHA-256: `5e6494db0d4891865a617d864b9ffadc865638b2c80211992ddbae704d00ba11`
- Final alpha-separated output SHA-256: `c868b6ffa0e8589ca651b5a30359aca50102ebe827d02a31aa38ea2d0042dd1b`
- License: project MIT license (`LICENSE`)

### Exact readability prompt

Edit this exact 2-row by 4-column production sprite atlas on a pure black background. Preserve the 1536x1024 composition, cell positions, painterly hand-authored dark-fantasy style, warm Shuttergate orange/brass lighting, and transparent-keyable black negative space. Do not add text, UI, actors, plaques, circles, debug glyphs, neon ribbons, or extra objects crossing cell boundaries.

Make only a focused readability refinement to the eight existing isolated assets. TOP ROW SAPPER, left to right: (1) Keep the compact round black-iron bomb crest but simplify it into a clear bomb silhouette with one thick glowing fuse ember; reduce tiny decoration. (2) Replace the long chain/smoke-serpent look with a clear left-to-right fuse action: a small bomb/source socket at the left edge, a short restrained directional trail of three broad warm ember beats and low charcoal smoke wisps, ending in a clear etched fork/arrow scorched into stone. Use chunky readable shapes, not many tiny particles. (3) Make the blast commitment a broad low floor-integrated etched blast footprint: one dark cracked center, 5-6 thick radial scorched fractures, restrained molten-orange edges, broad enough to remain legible at 124x62; no floating explosion. (4) Keep authored fracture cancellation, but simplify to 3-4 large broken bomb-shell pieces and one extinguished fuse curl, with less scattered debris.

BOTTOM ROW HEXER, left to right: (1) Keep the compact brass-bound violet rune lantern crest but simplify to one large unmistakable angular rune with warm brass frame; no tiny ornaments. (2) Replace the thin decorative cable with a clear left-to-right cast: a compact source rune/lantern at far left, a narrow mostly-dark braided channel with two broad violet rune pulses and warm brass edge, ending in a small open target socket at far right. Preserve lots of negative space and make direction unmistakable without becoming bright or oversized. (3) Refine the target endpoint into a compact floor-bound broken-brass hex socket around one dark violet rune, with a notch facing back toward the source; no ring, no floating crystal cluster, no large halo. (4) Keep authored fracture cancellation but simplify to 3-4 large brass casing fragments and a few dim violet shards; remove particle confetti.

Across all cells: silhouettes must survive aggressive downscaling; prefer 4-8 pixel-equivalent broad authored strokes over micro-detail; effects should feel carved, scorched, heavy, and lit by the environment. Keep actor hierarchy by using dark iron/charcoal as the majority value, restrained orange/violet accents, and no saturated glow fields.

### Exact alpha-separation prompt

Make a surgical production correction to this exact 1536x1024 4-column by 2-row black-background VFX atlas. Preserve the canvas, exact 2x4 grid, painterly chunky dark-fantasy style, all cell positions, and every asset identity. Do not add text, UI, actors, scenery, plaques, circles, crosshairs, arrows, neon, or anything crossing a cell boundary.

CRITICAL ALPHA-SEPARATION: Remove every baked stone floor surface, filled dark ground mass, shadow oval, cobblestone texture, and opaque floor patch from TOP ROW COLUMN 3 (Sapper blast footprint) and BOTTOM ROW COLUMN 3 (Hexer target endpoint). Replace all removed ground pixels with the same pure uniform black key background used around the atlas. Preserve only isolated alpha-keyable effect marks: Top row column 3: one compact dark scorched central fracture, 5-6 thick irregular radial charcoal fissure strokes with restrained molten-orange/brass edges, and at most 3 tiny embers. Large pure-black gaps must separate every branch so the real game floor remains visible. No filled disc, slab, floor texture, star, or floating explosion. Bottom row column 3: only three broken asymmetrical brass/black-iron claw segments, open toward the left/source, around one small isolated dark-violet angular rune and at most 2 dim motes. Replace the entire black-stone disc beneath it with pure black. No tablet, floor texture, filled seal, ring, badge, or halo.

Also reduce the smoke loops in TOP ROW COLUMN 2: preserve the bomb, three broad ember beats, braided fuse direction, and etched fork destination, but make smoke a very thin sparse low charcoal wake with clear black gaps—not repeating circles, a cloud, or serpent. Keep every other shape unchanged as much as possible. The result must key cleanly to separate straight-alpha effects, preserve the environment plate, survive downscale, and keep actors visually primary.

### Bounded QA and export semantics

The final source keeps exactly eight isolated canonical cells. The Sapper tell now carries a recognizable bomb through three restrained fuse beats into an open scorched destination; its committed footprint contains only separated fissure marks. The Hexer channel now binds an unmistakable lantern source to a narrow two-pulse cast and open recipient socket. The alpha-separation pass removes generated stone patches from both endpoint cells before deterministic keyed export. Exact running-client capture remains the controlling normal-scale hierarchy and mechanic-readability gate.

## `shuttergate-sapper-hexer-intent-atlas-master.png` — spatial-anchor correction

- Provider: `openai-codex`
- Model: `gpt-image-2-medium`
- Aspect ratio: `landscape`
- Requested and saved dimensions: `1536x1024`
- Quality: `medium`
- Modality: image-to-image correction
- Input image: preceding project-owned `shuttergate-sapper-hexer-intent-atlas-master.png`
- Input SHA-256: `c868b6ffa0e8589ca651b5a30359aca50102ebe827d02a31aa38ea2d0042dd1b`
- Generated output SHA-256: `b52eba1eba051de3b433f26ab1c77221ab8631bf2e9f7da5bb45dae8fc9efd2f`
- Final source SHA-256 after deterministic unchanged-cell preservation: `ca6f2f9f3c3ba509e0c5a8a23776fb2940e5c498a217a8774c59b6010c16a89d`
- License: project MIT license (`LICENSE`)

### Exact prompt

Edit this original Dwarven Depths 4-column by 2-row game-effect source atlas while preserving the exact 1536x1024 atlas grid, pure near-black key background, painterly dark-bronze/charcoal/ember-orange/low-saturation-purple material language, and all cells not explicitly changed. This is a production sprite source, not a presentation board: no text, labels, borders, UI symbols, characters, scenery, or shadows outside each isolated effect.

Change only these cells:
TOP ROW, CELL 2 (Sapper fuse directional tell): replace the large bomb-plus-dotted-arrow/plaque silhouette with a low, floor-hugging directional effect. At the LEFT source edge, show only a compact partial bomb/fuse nozzle and one short curling ember-smoke transition that could visibly emerge from a Sapper hand/weapon. From there, create a continuous tapered trail of restrained ember dust and thin smoke sweeping toward the RIGHT recipient edge. No repeated beads, no arrowhead, no chain, no horizontal bar, no large smoke serpent. Keep abundant transparency/black negative space and a clearly directional left-to-right taper.
BOTTOM ROW, CELL 2 (Hexer rune channel): replace the lantern-plus-chain/plaque with a compact LEFT source cast: a small cropped staff/hand-adjacent rune spark and a very short downward curl to floor contact, then a narrow continuous ochre-purple energy seam travelling left-to-right. No lantern, no rings, no chain links, no repeated diamonds, no bar. Keep the channel slender and floor-textured, with dark gaps and low saturation so actors remain primary.
BOTTOM ROW, CELL 3 (Hexer target endpoint): replace the segmented brass ring with a restrained planted endpoint: a shallow broken ochre-purple floor rune/fracture footprint centered low, plus two or three thin translucent purple wisps rising only a short distance to suggest a target-foot wrap. No enclosing ring, no large metal chunks, no crosshair or UI glyph.

The changed effects must read as painterly, physically grounded tactical effects at small 1440x900 gameplay scale. They must not look like detached inventory icons, plaques, chains, arrows, or debug overlays. Preserve top row cells 1, 3, 4 and bottom row cells 1, 4 exactly as close as possible.

### Bounded QA and export semantics

The atlas remains an eight-cell black-keyed source. A deterministic cell-composition pass copied only top-row cell 2 and bottom-row cells 2 and 3 from the generated candidate over the preceding source, preserving the other five canonical cells byte-for-byte at the pixel level. The corrected Sapper tell replaces repeated beads and a fork with a single tapered ember-smoke travel seam. The Hexer cast replaces the lantern-chain plaque with a compact cast-to-floor transition and narrow energy seam, while its endpoint becomes an open floor fracture with a restrained vertical wisp response. Deterministic export and exact running-client capture remain the controlling integrity and normal-scale visual gates.
