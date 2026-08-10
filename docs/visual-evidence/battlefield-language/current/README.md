# Issue #273 exact-head visual review

Implementation source head: `8d81e1fe8bb37a6319a3edda51af9d9eedecaa32`

## Bounded product decision

Approve or reject only the corrected hostile attack treatment: each role now uses its authored attack silhouette during windup, commitment, impact, and recovery while retaining four-way orientation. The previously approved character art, movement cadence, damage/status and Shield Slam treatment, departure language, map, projection, scale, game-first frame, and HUD composition are unchanged and are not being reopened for review.

## Running-client evidence

All captures use the deterministic `scenarios/conformance/shuttergate-web-truth.json` fixture at 1440×900. `manifest.json` binds source head, tick, state, viewport, and screenshot checksums for quiet, dense-wave, Shield Slam committed/impact, damage/stagger, and terminal-departure states. Each screenshot has a complete truth/renderer sidecar.

The normal and reduced-motion seven-second clips and their sampled authoritative timelines are in `../../running-client/`:

- `shuttergate-normal-motion-clip.webm`
- `shuttergate-normal-motion-clip.json`
- `shuttergate-reduced-motion-clip.webm`
- `shuttergate-reduced-motion-clip.json`

Both sidecars bind the implementation head, fixture, viewport, video checksum, route traversal, action phases, health changes, lifecycle retention/removal, and canonical sample ordering. Reduced motion permits bounded authored route-node snaps while requiring readable static lifecycle retention; normal motion retains the tighter elapsed-time displacement bound.

## Comparisons

- `concept-target-vs-current-dense.png` preserves the complete fixed concept target beside the complete current 1440×900 running-client frame. SHA-256: `8757c049f7138bf68ee991e7c28aecfef4297873e0f9632f6808d2c5ec1749d0`.
- `previous-approved-vs-current-dense.png` preserves the previous approved static Shuttergate baseline beside the current frame, demonstrating that map composition and projection did not change. SHA-256: `14222ce0520342824ff6d0f9719e39c8a29dc42e3bc858ed69f3d258197ac509`.

## Bounded adversarial checks

The capture rejects stale head/fixture/viewport/tick/state, entity-registry mismatch, renderer errors, hidden sprites, sidecar or checksum mismatch, backward route movement, unexplained removal/reappearance, noncanonical identities, invalid transition ticks, unbounded normal/reduced displacement, and unreadable lifecycle retention. Browser regressions also cover a skipped snapshot followed by recovery, 1×/2× interpolation, initial arrivals, terminal retention, every authoritative Shield Slam target including terminal departures, role/facing selection, timed damage feedback, reduced-motion teardown, and 100-update resource stability.
