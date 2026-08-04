# Battlefield language WIP 03 — running encounter and terminal result

Status: **PRODUCT-OWNER VISUAL APPROVED**. Direct approval is recorded on issue #273 and draft PR #296; technical exact-head gates still apply.

Runtime source head: `c09038f0b478477b0c126116bb3b1d0959d7eba9`
Fixture: `scenarios/conformance/shuttergate-web-truth.json`

This packet is generated from the actual running client. It binds quiet setup, dense combat, authoritative Shield Slam phases, damage/stagger and elite state, terminal defeat, mobile fit, and normal/reduced encounter motion to one runtime source head and fixture.

The seven approved PNGs are byte-identical to the product-owner-approved WIP 03 images at `ada2fb5c10c01d1c3bbde2d4d1a62095f5259810`. Their sidecars and both clips were recaptured from the runtime source head above after the alignment validator was corrected to bind snapshot, registry, and rendered-scene combatant identities at variable authoritative counts.

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
