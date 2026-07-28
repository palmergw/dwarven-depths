# Visual recovery contract

## Reference and boundary

`assets/concept-art/dwarven-depths-gameplay-mockup.png` is the hard visual reference. It defines atmosphere and presentation, not mechanics. The Shuttergate prototype is rendered in the real Phaser client from the existing Worker-owned `RenderSnapshot`; presentation may place and light snapshot entities but may not create combatants, infer damage, decide outcomes, or affect commands, pause state, checksums, saves, or replays.

The original files in `apps/web/public/assets/visual-prototype/` are prototype assets, not crops of the reference and not a claim of a complete production library. Their stable presentation roles are recorded in `manifest.json`.

## Fixed composition

- The authored battlefield is 640×360 logical pixels and scales only with Phaser `FIT`. Browser interpolation is disabled (`pixelArt`, no antialiasing, and `image-rendering: pixelated`).
- At 1440×900, the game frame remains centered, the title and current action are visible, and combat gives the 16:9 battlefield the dominant area. At 390×844, the frame uses the available width without horizontal overflow; the battlefield remains 16:9 and controls continue below it.
- Camera is a fixed side-on, slightly elevated fortress-hall view. The embedded horizontal lane occupies the lower middle third. The gate and arch establish the central chokepoint; no graph line or node marker represents the lane.

## Objective visual checks

### Pixel scale

Prototype sprite source pixels use whole-number coordinates and hard edges. At 640×360, the Iron Warden reads at 48×64 source pixels and the hostile at 48×48. Asset scaling, positions, material courses, and presentation animation use whole logical pixels. A screenshot must show no smoothing around sprite edges.

### Palette and materials

The battlefield is predominantly cold blue-charcoal stone (`#293037` family) and subterranean black (`#0a0d10`), balanced by torch amber (`#f09a38`) and aged brass/gold (`#9b7240`, `#f2d28a`). Timber is dark umber with lighter grain straps; metal uses cool slate highlights. Warm light must remain local rather than tinting the whole scene brown.

### Character readability

The Iron Warden must have a broad armored silhouette, gold beard/face region, shield, and hammer. A hostile must differ in height, warm hide color, horns, and eye blocks. Both remain identifiable at the 390-pixel viewport. Snapshot entities are sorted and projected deterministically; overlapping occupants receive deterministic slots.

### Layer order

Back to front: cavern void; masonry courses; central arch and gate; timber braces and local torch glow; embedded stone/wood lane; snapshot-derived combatants and deployables; transient combat feedback; compact location/battle-status HUD; dark foreground rubble. Foreground may overlap floor edges but not combatant heads or controls. Battle status is a presentation label for preparation, running, or ended phase only; it must not infer wave progression or a victory/defeat outcome.

### UI hierarchy

1. Game title and encounter objective.
2. Battlefield during preparation/combat, or stronghold vista at checkpoint.
3. Current status and primary action.
4. Company/combat detail and secondary controls.
5. Collapsed developer overlay.

Normal player mode uses player-facing names such as “Shuttergate Hall” and “Iron Warden.” Raw stable IDs, graph primitives, conformance language, tick diagnostics, and journey diagnostics are not visible. Existing diagnostics are available only inside the explicitly collapsed developer overlay or terminal evidence surfaces.

### Motion and feedback

Only transient snapshot-change emphasis and torch ambience may move. Motion communicates no additional authoritative state. Reduced motion disables tweens and CSS animation while retaining static outlines, readable state text, torch assets, and lighting. No camera shake, parallax, or continuous sprite motion is required by this prototype.

### High contrast

High contrast replaces shell panels, borders, controls, and text with black/white equivalents while preserving semantic labels and focus outlines. The battlefield remains atmospheric artwork; its adjacent caption and controls carry the same state without relying on color. Dwarf/enemy differentiation uses silhouette as well as hue.

## Debug and authority separation

The Phaser scene consumes only the validated, canonical `RenderSnapshot`. It never posts commands. React controls retain their existing Worker command path and pause/focus behavior. Stable IDs remain keys and callback arguments but are translated to player-facing labels. Developer journey guidance is collapsed by default. The visual layer cannot change simulation sequence, terminal state, evidence, or checksums.
