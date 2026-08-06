# Concept shell WIP 03 — complete #274 review packet

- Running-client source head: `a374d5f90bea01eb161123e29bb3bd3fdebf09cf`.
- Viewports: desktop 1440×900 and mobile 390×844, Chromium, device scale 1, reduced motion.
- States: combined title/checkpoint/company roster, Ancestral Forge, presentation settings, preparation, victory result, and failure/recovery.
- The checkpoint, Forge, settings, and preparation captures use the production client and local profile. Result and failure use capture-local protocol-valid Workers to reach those existing client states deterministically; the fixture does not alter production code or claim simulation evidence.
- `packet.json` binds every PNG to the source identity and clean-worktree marker embedded in the served build, viewport, phase, shell view, visible actions, SHA-256, scroll bounds, hidden inspection surfaces, and stable-ID absence.
- Capture command: `node scripts/capture-concept-shell-packet.mjs` against a production preview at `http://127.0.0.1:4173`.

This replacement packet preserves the product-owner-approved desktop shell language while resolving exact-head review blockers: the Forge has one visible dominant return action; storage, startup, malformed-message, and transport failures use bounded player-facing language; failed workers are retired after event or command-transport failure before stale messages can replace recovery; settings and running status omit implementation language; capture rejects every lowercase dotted stable-ID namespace; and capture rejects tracked changes, a preview built from another source head, or a same-head preview built with tracked changes. Mobile remains functional evidence only and is visually deferred to #276.
