# Approved-art client integration evidence

- Issue: #283
- Replacement capture runtime commit: `bf15d2ad5e932808bdc3ada7132edac1c4fdfac6`
- Approved art-package baseline: `e3d454e9d6bc8673c0deb3fffa2dd59194982870`
- Captured: 2026-07-29T13:58:44Z
- Fixture: web protocol v4, `scenario.conformance.shield_slam`, authoritative Web Worker
- Browser: Playwright Chromium 1.61.1, production Vite preview

## Concept and approved-package comparison

| Fixed concept target | Product-owner-approved #282 package | Actual running client |
|---|---|---|
| [`../../assets/concept-art/dwarven-depths-gameplay-mockup.png`](../../../assets/concept-art/dwarven-depths-gameplay-mockup.png) | [`shuttergate-keyframe-1280x720.png`](../../../assets/game-art/visual-direction/exports/shuttergate-keyframe-1280x720.png) | [`desktop-1440x900-active.png`](desktop-1440x900-active.png) |

This is the replacement packet after the first submission was declared evidence-invalid. The runtime no longer imports or ships the flattened keyframe. Five character/UI-free layers derived only from the approved #282 `exports/environment/` package provide background passage, winding floor path, architecture, foreground props, and lighting. The approved action sheets remain persistent Phaser sprites; target policy, Shield Slam, and pause are keyboard/pointer-accessible controls docked inside the game frame. Snapshot IDs and graph edges are not drawn. The Worker snapshot and command contracts are unchanged.

`apps/web/src/assets/shuttergate/manifest.json` identifies every runtime environment layer with `role: environment`, its approved environment-only source path, and explicit exclusions for characters, creatures, combat effects, state text, controls, and HUD. The focused browser regression rejects a keyframe/non-environment source substitution.

## Actual-client viewport matrix

All screenshots are viewport captures from the built client, not standalone mockups.

| Viewport | Checkpoint | Paused combat | Active combat |
|---|---|---|---|
| 1440×900 | [`desktop-1440x900-checkpoint.png`](desktop-1440x900-checkpoint.png) | [`desktop-1440x900-paused.png`](desktop-1440x900-paused.png) | [`desktop-1440x900-active.png`](desktop-1440x900-active.png) |
| 1280×800 | [`laptop-1280x800-checkpoint.png`](laptop-1280x800-checkpoint.png) | [`laptop-1280x800-paused.png`](laptop-1280x800-paused.png) | [`laptop-1280x800-active.png`](laptop-1280x800-active.png) |
| 390×844 | [`mobile-390x844-checkpoint.png`](mobile-390x844-checkpoint.png) | [`mobile-390x844-paused.png`](mobile-390x844-paused.png) | [`mobile-390x844-active.png`](mobile-390x844-active.png) |

Reduced-motion evidence: [`laptop-1280x800-reduced-motion.png`](laptop-1280x800-reduced-motion.png). Motion preference is persisted as `reduce`; entity interpolation and torch tweening are disabled while the authoritative snapshot is unchanged.

Motion evidence: [`shuttergate-motion-7s.webm`](shuttergate-motion-7s.webm). The 8.8-second 1280×720 actual-client recording contains the paused-to-running transition and at least seven seconds of active capture, route-bound snapshot combatants, depth sorting, local torchlight, and in-frame controls/HUD.

Checkpoint captures document the current pre-run shell honestly; the concept-aligned title/checkpoint/roster shell remains the separately dependency-ordered #274 scope. The preparation, paused, running, and terminal battlefield all use this integrated frame.

## Performance and lifecycle

[`capture-metrics.json`](capture-metrics.json) records one Phaser canvas and sampled presentation rates of 60–61 FPS at all three viewports. Navigation duration was 152–162 ms in the local production preview. These are bounded local observations, not broad hardware claims.

The replacement focused three-browser run exercised environment exclusion tampering, StrictMode mount/unmount, stale feedback rejection, reduced-motion behavior, in-frame commands, pause/focus, authoritative command flow, sprite-count integrity, and renderer teardown: 93 passed and 3 intentionally skipped. The active fixture reached exactly one snapshot dwarf and one snapshot hostile at every viewport; the runtime registry simultaneously reported exactly one dwarf sprite and one hostile sprite. The same-snapshot HUD reported `1` allied dwarf and `1` hostile enemy.

Paused captures intentionally report `0`/`0` snapshot and sprite counts because they are taken at the authoritative pre-resume boundary. Active captures are blocked until the DOM integrity record reports snapshot `1`/`1` and runtime sprite `1`/`1`; the capture script rejects any mismatch and additionally requires the 1440×900 active fixture to be exactly `1`/`1`.

## Reproduction and provenance

1. Run `pnpm --filter @dwarven-depths/web build`.
2. Run `pnpm --filter @dwarven-depths/web exec vite preview --host 0.0.0.0 --port 4173`.
3. Run `node scripts/capture-issue-283-evidence.mjs`.

`apps/web/src/assets/shuttergate/manifest.json` binds the shipped derivatives to SHA-256 digests and source roles. `scripts/prepare-web-game-art.py` deterministically builds the five 1280×720 runtime environment planes exclusively from the approved environment exports, copies the approved in-frame HUD controls, and removes the documented deep-navy backing from the two approved action sheets. A second script run produces no asset diff. Original sources, prompts/settings, license, and provenance remain in `assets/game-art/visual-direction/metadata/`.

This replacement packet is not self-approved. PR #285 remains draft under `status:visual-approval` and `status:evidence-invalid` pending direct product-owner review of the newly published exact head.
