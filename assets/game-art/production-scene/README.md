# Shuttergate production scene package

This package is the Issue #286 presentation-only composability gate. It is not integrated into the web client and cannot define simulation truth.

## Deterministic build

Use the checked-in dependency pin:

`uv run --python 3.13.5 --with-requirements assets/game-art/production-scene/requirements.lock python3 assets/game-art/production-scene/build_scene.py --reproducible`

Verify committed files without rewriting them:

`uv run --python 3.13.5 --with-requirements assets/game-art/production-scene/requirements.lock python3 assets/game-art/production-scene/build_scene.py --verify`

The verifier strictly rejects extra contract properties, every recursively discovered stale/unmanifested export or evidence file regardless of extension, source or output digest drift, provenance edits that attempt to bless changed approved masters/references, disconnected or misordered route zones/portal segments, a traversable shutter objective, route endpoints beneath the HUD, route-board or registration-closeup pixel drift, unaligned state pivots, noncanonical entity depth, static impact art in the neutral count proof, incomplete mutable HUD variants, actual Python/Pillow/zlib version drift, and lighting/provenance drift. The reproducibility run rebuilds in an isolated root and compares the complete manifest.

## Runtime-ready boundaries for #287

- The clean plate is a complete opaque 1280×720 character/UI-free environment.
- Character states are downsampled once from the approved high-resolution masters to the selected miniature 56 px Warden / 44 px raider scale, with bounded sharpening and no permanent sticker outline. They use straight alpha on shared padded canvases with stable ground pivots, facing, nominal height, and deterministic depth anchors.
- The neutral reconstruction contains one readable Warden and one readable raider; Shield Slam impact is proved separately.
- HUD chrome is separate from fixture values, health fill, target selection, ability readiness/cooldown, and pause/resume state.
- The bottom HUD begins at x=272, leaving the foreground shutter approach and objective anchor visible.
- The painted route is represented as three pixel-surveyed visible depth zones. The upper gate is a wholly architecture-hidden transition. The lower gate uses a portal-local lintel/jamb occluder during its hidden segment and excludes the visibly floored mouth. The route terminates at the foreground-shutter threshold. There is no rail-crossing, winding-path, branching-path, or global exposed-floor-mask requirement.
- The diagnostic route overlay uses gold only on surveyed visible floor, cyan for both architecture-hidden spans, and green around the lower visible mouth. Full-frame and closeup proofs are rebuilt and pixel-compared by read-only verification. They are never player UI. The shutter is a nontraversable objective.
- The two portal masks are canonical full-frame `L` source assets under `sources/foreground/`; the builder contains no portal geometry and derives matching straight-alpha occluders only by copying registered clean-plate pixels through those authored masks. The upper gatehouse artifact retains a transparent aperture around its explicit non-rendered hidden interval. The lower artifact contains the complete bridge deck and jamb mass while the aperture, background floor, torch glow, and visible mouth remain transparent. World entities and production-scale rings render before the active portal occluder; screen-space focus renders afterward.
- Diagnostic-only, manifest-bound solid Warden/raider silhouettes and 56/44 px banded pivot cards lead the portal review surface. Deterministic small-increment sweeps expose each cutoff independently from textured sprites, while the 4× source/checker/alpha/one-pixel-contour board binds the cutout to clean-plate architecture. These diagnostic assets never contribute to runtime/player-facing reconstruction. #273 still owns interpolation, full-route traversal, and production movement.
- Lighting uses straight-alpha normal compositing in sRGB, after entities/foreground and before combat effects/HUD.

## Approval boundary

| Surface | Locked through #287 if approved | Polishable without renewed approval | Requires renewed approval | Owner |
|---|---|---|---|---|
| Clean plate | Exact pixels and source identity | Minor export optimization with pixel identity | Replacement pixels or composition | #286 / product owner |
| Camera/framing | Elevated orthographic 2.5D, 1280×720 review frame | None | Projection or framing change | #286 / product owner |
| Route, entrance, gate | Pixel-surveyed piecewise topology, background entrance, hidden upper transition, compound lower transition, terminal shutter objective | Local readability grading | Topology, entrance, portal, objective, or depth-zone change | #286 / product owner |
| Entity scale/anchors | 56 px Warden, 44 px raider, pivots, fixed #287 anchors | Bounded sprite cleanup preserving silhouette/pivot | Proportion, scale family, or anchor change | #286 / product owner |
| HUD regions | Exact top and right-weighted bottom regions | Ornament and information hierarchy | Region placement or gate-obscuring layout | #275 / product owner |
| HUD state | Minimum #287 value/control variants | Typography/icon polish | Authoritative meaning or control relocation | #275 |
| Lighting/effects | Blend/order semantics and broad warm/cool language | Texture, timing, intensity/readability | Medium/palette language change | #273 |
| Animation | Two aligned states only for #287 | No claim of complete animation | Full movement/combat/hit/death set | #273 |
| Responsive/accessibility | Metadata-only crop boundary | None in this issue | Responsive composition and modes | #276 |

`status:approved` authorizes implementation only. `status:visual-approval` means visual approval is absent. Only a direct product-owner decision may apply `status:visual-approved`, and that decision binds the exact reviewed head/evidence.

## Composition decision requested

The clean plate retains the wider diagonal, architecture-forward composition shown in the current evidence rather than #284's denser populated central staging. It was previously praised but not approved. `composition-decision.png` explicitly compares the camera, route, entrance/gate, encounter density, HUD regions, and selected character scale. Approval of #286 explicitly accepts or rejects this composition as the floor for #287; it does not imply that sparse encounter density is final.

## Exact decision surface

| Review item | Requested now | Demonstrated fact | Known limitation / later owner |
|---|---|---|---|
| Composition | Accept the wider diagonal camera, pixel-registered painted-floor route, entrance, shutter backstop, and HUD regions as #287's floor | Clean plate is complete and independently layered | Encounter density and production battlefield polish: #273 |
| Entities | Accept 56 px Warden, 44 px raider, shared pivots, and two fixed anchors | Direct-from-master exports and individual removal keep the same clean-plate pixel digest; a separate board stress-tests density without claiming simulation truth | Full movement/combat/hit/death animation and forgiving runtime hit/focus targets: #273 / #275 |
| Occlusion | Accept the two fixed #287 anchors, portal-local masks, sample positions, and world/screen cue order | Upper transition wholly hides both entities; lower transition partially covers both under the lintel and excludes the visible mouth | Traversal interpolation, all-archetype coverage, and production movement: #273 |
| HUD | Accept regions and minimum state separation for #287 | Chrome, values, target, ability, and pause variants are separate | Final ornament/information hierarchy: #275 |
| Responsive presentation | No visual decision requested | Crop policy is metadata only | Layout, accessibility modes, and viewport evidence: #276 |

## Files

- `sources/`: original clean-plate master.
- `exports/`: environment, padded entity states, effects, fixed-anchor and portal-local occlusion masks/occluders, review-only diagnostic subjects, lighting, HUD chrome, and mutable HUD states.
- `metadata/scene-contract.json`: piecewise route zones/portals, objective, fixed-anchor masks, pivots, depth, lighting, HUD, and crop contracts.
- `metadata/reconstruction.json`: exact neutral recipe and proof paths.
- `metadata/layer-manifest.json`: generated dimensions, semantics, and SHA-256 digests.
- `metadata/provenance.json`, `generation-log.md`, and `requirements.lock`: pinned toolchain, bound inputs, prompts/settings, license, and provenance.
- `docs/visual-evidence/production-scene/`: production-layer evidence only; no running-client screenshots.