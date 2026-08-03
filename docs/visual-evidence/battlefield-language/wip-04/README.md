# Battlefield language WIP 04 — readable hostile-count replacement

Status: **AWAITING PRODUCT-OWNER VISUAL APPROVAL**. This packet replaces the withdrawn WIP 03 decision packet, but direct product-owner review is still required before `status:evidence-invalid` or `status:visual-approval` may be cleared. Draft PR #296 must not be marked ready.

Runtime source head: `4e90315626357a231029c0674ee95480d67df923`
Fixture: `scenarios/conformance/shuttergate-web-truth.json`

This actual-running-client packet fixes the contradictory dense evidence. Capture now measures post-depth visible sprite alpha, rejects a combatant with less than half of its authored silhouette visible, rejects silhouettes whose alpha bounds overlap by at least half of the smaller combatant, and validates variable authoritative entity counts. The dense frame is delayed until the elite reaches the gate anchor: its authoritative position remains unchanged, the arch retains intentional depth, and the elite is independently countable beside the Warden and slinger.

## Captures

- `quiet-paused-reduced-motion.png` — tick 8, 1440×900, one distinctly readable Warden and one distinctly readable hostile.
- `dense-wave-reduced-motion.png` — tick 1821, 1440×900, exactly one Warden plus two independently readable hostiles; sidecar/HUD/registry all agree on three combatants.
- `shield-slam-committed-reduced-motion.png` — tick 1825, 1440×900.
- `shield-slam-impact-reduced-motion.png` — tick 1831, 1440×900.
- `damage-stagger-reduced-motion.png` — tick 1832, 1440×900; the damaged/status hostile is the encounter elite.
- `terminal-defeat-reduced-motion.png` — authoritative terminal defeat at tick 1834, 1440×900, with result evidence and checkpoint-return control.
- `quiet-paused-mobile-reduced-motion.png` — tick 8, 390×844, bound to the actual mobile viewport.
- `shuttergate-normal-motion-clip.webm` — 7 seconds of player-mode encounter footage, ticks 2–168.
- `shuttergate-reduced-motion-clip.webm` — 7 seconds of player-mode encounter footage, ticks 2–168.

Every image and clip has a JSON sidecar binding source head, fixture, viewport, authoritative tick/state or observed tick range, controls/interactions, and SHA-256. `manifest.json` records dense-wave, elite, terminal, and exact dense-entity integrity coverage.

## Reproduction

Run the web client, then execute:

`DD_BATTLEFIELD_OUTPUT_DIRECTORY=docs/visual-evidence/battlefield-language/wip-04 node scripts/capture-battlefield-language.mjs`

Run `scripts/capture-shuttergate-clip.mjs` once with `DD_CLIP_REDUCED_MOTION=false` and once with `DD_CLIP_REDUCED_MOTION=true`, targeting the same output directory.
