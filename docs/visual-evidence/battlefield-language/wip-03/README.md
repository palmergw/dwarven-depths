# Battlefield language WIP 03 — running encounter and terminal result

Status: **AWAITING PRODUCT-OWNER VISUAL APPROVAL**. This packet does not clear `status:visual-approval`, and draft PR #296 must not be marked ready.

Runtime source head: `be10d201d0b9c8608320361ec3e65e9eaa31e611`
Fixture: `scenarios/conformance/shuttergate-web-truth.json`

This packet is generated from the actual running client. It binds quiet setup, dense combat, authoritative Shield Slam phases, damage/stagger and elite state, terminal defeat, mobile fit, and normal/reduced encounter motion to one runtime source head and fixture.

## Captures

- `quiet-paused-reduced-motion.png` — tick 2, 1440×900, one Warden and one hostile.
- `dense-wave-reduced-motion.png` — tick 1801, 1440×900, one Warden and two hostiles.
- `shield-slam-committed-reduced-motion.png` — tick 1826, 1440×900.
- `shield-slam-impact-reduced-motion.png` — tick 1832, 1440×900.
- `damage-stagger-reduced-motion.png` — tick 1833, 1440×900; the damaged/status hostile is the encounter elite, so this one truthful frame supplies both status and elite evidence rather than duplicating the image under another ID.
- `terminal-defeat-reduced-motion.png` — authoritative terminal defeat at tick 1834, 1440×900, with result evidence and checkpoint-return control.
- `quiet-paused-mobile-reduced-motion.png` — tick 2, 390×844, with the sidecar bound to the actual mobile viewport.
- `shuttergate-normal-motion-clip.webm` — 7 seconds of player-mode encounter footage, ticks 2–168.
- `shuttergate-reduced-motion-clip.webm` — 7 seconds of player-mode encounter footage, ticks 2–168.

Every image and clip has a JSON sidecar binding source head, fixture, viewport, authoritative tick/state or observed tick range, controls/interactions, and SHA-256. `manifest.json` canonically lists the fixed captures and records dense-wave, elite, and terminal coverage.

## Reproduction

Run the web client, then execute:

`DD_BATTLEFIELD_OUTPUT_DIRECTORY=docs/visual-evidence/battlefield-language/wip-03 node scripts/capture-battlefield-language.mjs`

Run `scripts/capture-shuttergate-clip.mjs` once with `DD_CLIP_REDUCED_MOTION=false` and once with `DD_CLIP_REDUCED_MOTION=true`, targeting the same output directory.
