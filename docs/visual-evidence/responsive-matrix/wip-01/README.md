# Issue #276 responsive matrix — WIP 01

Clearly labeled work in progress for product-owner review. This packet was captured from clean implementation head `ae0c87a89e92afb0b753fa73780be20f79624f32` by `scripts/capture-responsive-matrix.mjs` against the actual built client.

## Packet

- 65 deterministic PNGs: 13 states at 1440×900, 1280×800, 1024×768, 768×768, and 390×844.
- `manifest.json` binds every capture to source head, fixture where applicable, viewport, presentation settings, phase, tick, entity count, control geometry, scroll reachability, browser/page-error cleanliness, and screenshot SHA-256.
- Combat captures use `scenarios/conformance/shuttergate-web-truth.json`; shell result and error captures use a deterministic protocol-v4 terminal worker.
- The capture fails on stale/dirty source metadata, wrong count, viewport overflow, visible inspection or stable-ID text, unreachable controls, undersized mobile targets, unbound combat fixture/state, console errors, page errors, or checksum-generation failure.

## Bounded comparisons

Fixed style/composition target (reference only; never a runtime asset):
`assets/concept-art/dwarven-depths-gameplay-mockup.png`

Previous product-owner-approved desktop shell baseline from #274:
`docs/visual-evidence/concept-shell/wip-03/desktop-checkpoint.png`

Current desktop checkpoint and combat:
`desktop-checkpoint.png`, `desktop-dense-combat.png`

The #274 mobile frame was explicitly rejected and is shown only as the prior feedback baseline, never as an approved target:
`docs/visual-evidence/concept-shell/wip-03/mobile-checkpoint.png`

Current dedicated mobile views:
`mobile-checkpoint.png`, `mobile-forge.png`, `mobile-settings.png`, `mobile-preparation.png`, `mobile-dense-combat.png`, and `mobile-ability-impact.png`.

## Feedback addressed

- Replaced the compressed desktop mobile shell with a one-task Company checkpoint and persistent compact Company/Forge/Settings navigation.
- Made Forge and Settings dedicated full-height scroll views.
- Re-authored preparation around a battlefield-dominant upper region and one bottom primary action.
- Re-authored combat as a readable cropped tactical world plus a separate touch-sized Company Actions deck.
- Preserved the approved 1440×900 desktop shell and battlefield composition.

## Manual review status

Automated geometry and integrity checks passed, but they do not constitute visual approval. Review the checklist in `docs/visual-recovery.md`. This draft remains `status:visual-approval` and must not be marked ready or merged until the product owner explicitly approves this exact implementation/evidence packet.
