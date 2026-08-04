# Battlefield language WIP 02 — contract-supported combat states

Status: **NOT READY / not a product-owner approval candidate**.

Runtime source head: `8eb8e0bb7175243e47f5efd35a190045f91568ee`
Fixture: `scenarios/conformance/shuttergate-web-truth.json`

This packet is generated from the actual running client. It demonstrates the authored Warden Shield Slam pose, authored impact glyph, authored faction/selection rings, world health and stagger signals, warm/cool lighting, reduced-motion state equivalence, and the unchanged 56 px Warden / 44 px raider scale.

## Captures

- `quiet-paused-reduced-motion.png` — tick 1, 1440×900.
- `shield-slam-committed-reduced-motion.png` — tick 2, 1440×900.
- `shield-slam-impact-reduced-motion.png` — tick 8, 1440×900.
- `damage-stagger-reduced-motion.png` — tick 9, 1440×900.
- `quiet-paused-mobile-reduced-motion.png` — tick 1, 390×844.
- `shuttergate-normal-motion-clip.webm` — 8.4 seconds, ticks 1–20.
- `shuttergate-reduced-motion-clip.webm` — 8.4 seconds, ticks 1–20.

Each capture has a JSON sidecar binding source head, fixture, viewport, tick, authoritative presentation fields, renderer diagnostics, controls, and screenshot/video SHA-256.

## Bounded exclusions

The approved terminating web encounter contains exactly one basic hostile. It cannot truthfully produce dense-wave, elite/boss, or broad terminal-state evidence. Those states are not synthesized here, and no new encounter mechanics or nonauthoritative capture state were introduced. The implementation accepts snapshot-v2 elite/boss/terminal fields, but this packet remains incomplete against #273 until the product owner resolves the evidence conflict with the bounded web encounter contract.

The mobile capture records the current fit-first behavior. Responsive camera composition and full HUD reflow remain owned by #276; this packet does not claim mobile visual acceptance.

## Reproduction

Run the web client, then execute:

`DD_BATTLEFIELD_OUTPUT_DIRECTORY=docs/visual-evidence/battlefield-language/wip-02 node scripts/capture-battlefield-language.mjs`

Run `scripts/capture-shuttergate-clip.mjs` once with `DD_CLIP_REDUCED_MOTION=false` and once with `DD_CLIP_REDUCED_MOTION=true`, targeting the same output directory.
