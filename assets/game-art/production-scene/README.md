# Shuttergate production scene package

This package is the Issue #286 presentation-only composability gate. It is not integrated into the web client and cannot define simulation truth.

## Deterministic build

Use the checked-in dependency pin:

`uv run --python 3.13.5 --with-requirements assets/game-art/production-scene/requirements.lock python3 assets/game-art/production-scene/build_scene.py --reproducible`

Verify committed files without rewriting them:

`uv run --python 3.13.5 --with-requirements assets/game-art/production-scene/requirements.lock python3 assets/game-art/production-scene/build_scene.py --verify`

The verifier strictly rejects extra contract properties, stale/unmanifested files, source or output digest drift, route points outside the walkable mask, route/HUD or route/foreground overlap, unaligned state pivots, noncanonical entity depth, static impact art in the neutral count proof, incomplete mutable HUD variants, actual Python/Pillow/zlib version drift, and lighting/provenance drift. The reproducibility run rebuilds in an isolated root and compares the complete manifest.

## Runtime-ready boundaries for #287

- The clean plate is a complete opaque 1280×720 character/UI-free environment.
- Character states use straight alpha on shared padded canvases with stable ground pivots, facing, nominal height, and deterministic depth anchors.
- The neutral reconstruction contains one readable Warden and one readable raider; Shield Slam impact is proved separately.
- HUD chrome is separate from fixture values, health fill, target selection, ability readiness/cooldown, and pause/resume state.
- The bottom HUD begins at x=272, leaving the lower-left gate and route endpoint visible.
- The route has a machine-checked walkable mask and diagnostic-only anchor overlay.
- Occlusion is explicitly bounded to #287's two fixed truth-screen anchors. Full route traversal masks belong to #273.
- Lighting uses straight-alpha normal compositing in sRGB, after entities/foreground and before combat effects/HUD.

## Approval boundary

| Surface | Locked through #287 if approved | Polishable without renewed approval | Requires renewed approval | Owner |
|---|---|---|---|---|
| Clean plate | Exact pixels and source identity | Minor export optimization with pixel identity | Replacement pixels or composition | #286 / product owner |
| Camera/framing | Elevated orthographic 2.5D, 1280×720 review frame | None | Projection or framing change | #286 / product owner |
| Route, entrance, gate | Exact topology, width contract, anchors | Local readability grading | Topology, entrance, gate, or width change | #286 / product owner |
| Entity scale/anchors | 104 px Warden, 92 px raider, pivots, fixed #287 anchors | Bounded sprite cleanup preserving silhouette/pivot | Proportion, scale family, or anchor change | #286 / product owner |
| HUD regions | Exact top and right-weighted bottom regions | Ornament and information hierarchy | Region placement or gate-obscuring layout | #275 / product owner |
| HUD state | Minimum #287 value/control variants | Typography/icon polish | Authoritative meaning or control relocation | #275 |
| Lighting/effects | Blend/order semantics and broad warm/cool language | Texture, timing, intensity/readability | Medium/palette language change | #273 |
| Animation | Two aligned states only for #287 | No claim of complete animation | Full movement/combat/hit/death set | #273 |
| Responsive/accessibility | Metadata-only crop boundary | None in this issue | Responsive composition and modes | #276 |

`status:approved` authorizes implementation only. `status:visual-approval` means visual approval is absent. Only a direct product-owner decision may apply `status:visual-approved`, and that decision binds the exact reviewed head/evidence.

## Composition decision requested

The clean plate retains the wider diagonal, architecture-forward composition shown in the current evidence rather than #284's denser populated central staging. It was previously praised but not approved. `composition-decision.png` explicitly compares the camera, route, entrance/gate, encounter density, HUD regions, and selected character scale. Approval of #286 explicitly accepts or rejects this composition as the floor for #287; it does not imply that sparse encounter density is final.

## Files

- `sources/`: original clean-plate master.
- `exports/`: environment, padded entity states, effects, route/occlusion masks, lighting, HUD chrome, and mutable HUD states.
- `metadata/scene-contract.json`: route, masks, pivots, depth, lighting, HUD, and crop contracts.
- `metadata/reconstruction.json`: exact neutral recipe and proof paths.
- `metadata/layer-manifest.json`: generated dimensions, semantics, and SHA-256 digests.
- `metadata/provenance.json`, `generation-log.md`, and `requirements.lock`: pinned toolchain, bound inputs, prompts/settings, license, and provenance.
- `docs/visual-evidence/production-scene/`: production-layer evidence only; no running-client screenshots.