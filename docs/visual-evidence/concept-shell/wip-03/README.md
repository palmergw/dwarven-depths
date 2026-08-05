# Concept shell WIP 03 — complete #274 review packet

- Running-client source head: `ab4040ba29ee6e10e6eb00ab43a16891191a34e8`.
- Viewports: desktop 1440×900 and mobile 390×844, Chromium, device scale 1, reduced motion.
- States: combined title/checkpoint/company roster, Ancestral Forge, presentation settings, preparation, victory result, and failure/recovery.
- The checkpoint, Forge, settings, and preparation captures use the production client and local profile. Result and failure use capture-local protocol-valid Workers to reach those existing client states deterministically; the fixture does not alter production code or claim simulation evidence.
- `packet.json` binds every PNG to source head, viewport, phase, shell view, visible actions, SHA-256, scroll bounds, hidden inspection surfaces, and stable-ID absence.
- Capture command: `node scripts/capture-concept-shell-packet.mjs` against a production preview at `http://127.0.0.1:4173`.

This packet propagates the product-owner-approved WIP 02 shell language across the complete #274 state set. It is visual-review evidence, not final approval.
