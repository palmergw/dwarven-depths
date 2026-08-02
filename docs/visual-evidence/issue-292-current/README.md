# Issue #292 current visual evidence

Renderer source head: `05de837589bab71ebddc81fcfe31d5b744c407d2`

## Atomic truth screen

- Actual running client, 1440×900, DPR 1, authoritative fixture `scenarios/conformance/shuttergate-web-truth.json`, tick 1.
- Sidecar count/state/control checks pass for one Warden and one hostile.
- Current screenshot SHA-256: `f0ad6d9b3ea31eeecd69d284c601355d8562d1b31cce67835d20692e5a55edbc`.
- Approved #291 screenshot SHA-256: `efef3884fe4dc83d44af1495d410390e31d60dcfae82943af7cc09cf1a395d7a`.
- `approved-comparison.png` shows the approved gate crop, current gate crop, and a 4× RGB difference crop.

The images differ at 177 pixels in bounding box `(648,305)–(1214,403)`. The changed pixels are confined to depth-tested antialiased ring/subject coverage: nine Warden-ring edge pixels and 168 gate subject/ring pixels. Viewport, environment assets, entity pivots and scale, HUD, controls, and simulation state are unchanged. This is not pixel-identical to #291, so the issue's explicit product-owner approval condition remains open.

## Route sweep

`../issue-292-depth-sweep/manifest.json` binds eight actual-running-Phaser native-pixel crops to the same renderer head and static-depth SHA-256. Every authored route ID contains both fixed-scale runtime subjects and ground rings; coincident east/west aliases intentionally produce byte-identical crops. Three gate arrival samples at 0 ms, 210 ms, and 630 ms cover the transient upright-billboard effect while it is depth masked.

The route images are evidence only. The independent CPU oracle and mutation regression live in `apps/web/src/shuttergate-depth-sweep.test.ts`.
