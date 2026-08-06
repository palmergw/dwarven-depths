# Concept shell WIP 03 — complete #274 review packet

- Running-client source head: `b2036f03104a88eab78e6e2a8a73db0e26bb658a`.
- Viewports: desktop 1440×900 and mobile 390×844, Chromium, device scale 1, reduced motion.
- States: combined title/checkpoint/company roster, Ancestral Forge, presentation settings, preparation, victory result, and failure/recovery.
- The checkpoint, Forge, settings, and preparation captures use the production client and local profile. Result and failure use capture-local protocol-valid Workers to reach those existing client states deterministically; the fixture does not alter production code or claim simulation evidence.
- `packet.json` binds every PNG to source head, viewport, phase, shell view, visible actions, SHA-256, scroll bounds, hidden inspection surfaces, and stable-ID absence.
- Capture command: `node scripts/capture-concept-shell-packet.mjs` against a production preview at `http://127.0.0.1:4173`.

This replacement packet preserves the product-owner-approved desktop shell language while resolving exact-head review blockers: the Forge has one visible dominant return action; storage, startup, malformed-message, and transport failures use bounded player-facing language; failed workers are retired before stale messages can replace recovery; settings and running status omit implementation language; and capture rejects tracked source changes. Mobile remains functional evidence only and is visually deferred to #276. This materially changed packet requires renewed product-owner desktop approval.
