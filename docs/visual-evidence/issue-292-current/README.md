# Issue #292 current visual evidence

Renderer source head: `119e1749123705c3804d3dba43019bd930a5cee1`

## Atomic truth screen

- Actual running client, 1440×900, DPR 1, authoritative fixture `scenarios/conformance/shuttergate-web-truth.json`, tick 1.
- Sidecar count/state/control checks pass for one Warden and one hostile.
- Current screenshot SHA-256: `188631c8ee5c9e524cc8ed0c70d11f3f70dc01e7d9b7fcf0c429c4d5547ea6cd`.
- Approved #291 screenshot SHA-256: `efef3884fe4dc83d44af1495d410390e31d60dcfae82943af7cc09cf1a395d7a`.
- `approved-comparison.png` shows approved/current/4×-RGB-difference witness rows for the Warden focus and gate subject.

The images differ at 512 pixels in bounding box `(643,305)–(1214,417)`. Of those, 177 are the previously published antialiased Warden-ring and gate subject/ring changes; 335 depth-test the Warden focus frame against static scene geometry. Viewport, environment assets, entity pivots and scale, HUD, controls, and simulation state are unchanged. The product owner explicitly approved these pixels at exact renderer/evidence head `3aea32ae017073d6829d809cfab7312eded0bcf0` on 2026-08-02; subsequent release-gate-only test changes do not alter this packet.

## Route sweep

`../issue-292-depth-sweep/manifest.json` binds eight actual-running-Phaser native-pixel full-opacity captures and eight half-opacity motion samples to its exact renderer head and static-depth SHA-256. Every authored route ID contains both fixed-scale runtime subjects, ground rings, the depth-tested Warden focus, and maximum transient VFX. Independent consecutive captures are byte-identical; each authored occlusion boundary is represented at both effect opacities while the scene and subjects remain fixed.

The route images are evidence only. The independent CPU oracle and mutation regression live in `apps/web/src/shuttergate-depth-sweep.test.ts`.
