# Approved-art client integration evidence

- Issue: #283
- Capture runtime commit: `54cacd52b28e1d110aea2a4b173b17e5b74d242a`
- Approved art-package baseline: `e3d454e9d6bc8673c0deb3fffa2dd59194982870`
- Captured: 2026-07-29T12:32:23Z
- Fixture: web protocol v4, `scenario.conformance.shield_slam`, authoritative Web Worker
- Browser: Playwright Chromium 1.61.1, production Vite preview

## Concept and approved-package comparison

| Fixed concept target | Product-owner-approved #282 package | Actual running client |
|---|---|---|
| [`../../assets/concept-art/dwarven-depths-gameplay-mockup.png`](../../../assets/concept-art/dwarven-depths-gameplay-mockup.png) | [`shuttergate-keyframe-1280x720.png`](../../../assets/game-art/visual-direction/exports/shuttergate-keyframe-1280x720.png) | [`desktop-1440x900-active.png`](desktop-1440x900-active.png) |

The runtime uses the approved raster keyframe as the world/architecture/lighting plane, the approved action sheets as transparent persistent Phaser sprites, the approved Shield Slam HUD treatment, and the approved normalized route as presentation-only placement anchors. Snapshot IDs and graph edges are not drawn. The Worker snapshot and command contracts are unchanged.

## Actual-client viewport matrix

All screenshots are viewport captures from the built client, not standalone mockups.

| Viewport | Checkpoint | Paused combat | Active combat |
|---|---|---|---|
| 1440×900 | [`desktop-1440x900-checkpoint.png`](desktop-1440x900-checkpoint.png) | [`desktop-1440x900-paused.png`](desktop-1440x900-paused.png) | [`desktop-1440x900-active.png`](desktop-1440x900-active.png) |
| 1280×800 | [`laptop-1280x800-checkpoint.png`](laptop-1280x800-checkpoint.png) | [`laptop-1280x800-paused.png`](laptop-1280x800-paused.png) | [`laptop-1280x800-active.png`](laptop-1280x800-active.png) |
| 390×844 | [`mobile-390x844-checkpoint.png`](mobile-390x844-checkpoint.png) | [`mobile-390x844-paused.png`](mobile-390x844-paused.png) | [`mobile-390x844-active.png`](mobile-390x844-active.png) |

Reduced-motion evidence: [`laptop-1280x800-reduced-motion.png`](laptop-1280x800-reduced-motion.png). Motion preference is persisted as `reduce`; entity interpolation and torch tweening are disabled while the authoritative snapshot is unchanged.

Motion evidence: [`shuttergate-motion-7s.webm`](shuttergate-motion-7s.webm). The seven-second actual-client capture includes the paused-to-running transition, route-bound combatants, depth sorting, local torchlight, and the docked combat HUD.

Checkpoint captures document the current pre-run shell honestly; the concept-aligned title/checkpoint/roster shell remains the separately dependency-ordered #274 scope. The preparation, paused, running, and terminal battlefield all use this integrated frame.

## Performance and lifecycle

[`capture-metrics.json`](capture-metrics.json) records one Phaser canvas and sampled presentation rates of 60–61 FPS at all three viewports. Navigation duration was 150–157 ms in the local production preview. These are bounded local observations, not broad hardware claims.

The focused three-browser run exercised StrictMode mount/unmount, stale feedback rejection, reduced-motion behavior, authoritative command flow, and renderer teardown: 90 passed and 3 intentionally skipped. The active journey passed separately in Chromium, Firefox, and WebKit after asset URLs were moved into the Vite graph; no missing-texture diagnostics remained.

## Reproduction and provenance

1. Run `pnpm --filter @dwarven-depths/web build`.
2. Run `pnpm --filter @dwarven-depths/web exec vite preview --host 0.0.0.0 --port 4173`.
3. Run `node scripts/capture-issue-283-evidence.mjs`.

`apps/web/src/assets/shuttergate/manifest.json` binds the shipped derivatives to SHA-256 digests. `scripts/prepare-web-game-art.py` deterministically copies the approved keyframe and HUD icon and removes the documented deep-navy backing from the two approved action sheets. Original sources, prompts/settings, license, and provenance remain in `assets/game-art/visual-direction/metadata/`.
