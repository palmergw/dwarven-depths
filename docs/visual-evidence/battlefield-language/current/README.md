# Issue #273 exact-head visual review

Implementation source head: `d3ab59767ceb443137e43431cded8fd85dc3af46`

## Bounded product decision

Approve or reject the newly authored Shuttergate combat presentation: fixed-scale Warden and hostile role/facing/action poses, damage/status and Shield Slam treatment, slinger source-to-target path, distinct downed/destroyed departure language, and normal/reduced-motion continuity. The previously approved Shuttergate map, projection, scale, game-first frame, and HUD composition are intentionally unchanged and are not being reopened for review.

## Running-client evidence

All captures use the deterministic `scenarios/conformance/shuttergate-web-truth.json` fixture at 1440×900. `manifest.json` binds source head, tick, state, viewport, and screenshot checksums for quiet, dense-wave, Shield Slam committed/impact, damage/stagger, and terminal-departure states. Each screenshot has a complete truth/renderer sidecar.

The normal and reduced-motion seven-second clips and their sampled authoritative timelines are in `../../running-client/`:

- `shuttergate-normal-motion-clip.webm`
- `shuttergate-normal-motion-clip.json`
- `shuttergate-reduced-motion-clip.webm`
- `shuttergate-reduced-motion-clip.json`

Both sidecars bind the implementation head, fixture, viewport, video checksum, route traversal, action phases, health changes, lifecycle retention/removal, and canonical sample ordering. Reduced motion permits bounded authored route-node snaps while requiring readable static lifecycle retention; normal motion retains the tighter elapsed-time displacement bound.

## Comparisons

- `concept-target-vs-current-dense.png` preserves the complete fixed concept target beside the complete current 1440×900 running-client frame. SHA-256: `f55da0db5bdeedf5066b6fbb74c598c34dd38fdc44cc5a5d43d5ee3d04313609`.
- `previous-approved-vs-current-dense.png` preserves the previous approved static Shuttergate baseline beside the current frame, demonstrating that map composition and projection did not change. SHA-256: `576cf1c0f38823851ca37d8fd7e9c4854e7dfd32eadc7aa0e63b1c2d99758c5a`.

## Bounded adversarial checks

The capture rejects stale head/fixture/viewport/tick/state, entity-registry mismatch, renderer errors, hidden sprites, sidecar or checksum mismatch, backward route movement, unexplained removal/reappearance, noncanonical identities, invalid transition ticks, unbounded normal/reduced displacement, and unreadable lifecycle retention. Browser regressions also cover a skipped snapshot followed by recovery, 1×/2× interpolation, initial arrivals, terminal retention, every authoritative Shield Slam target including terminal departures, role/facing selection, timed damage feedback, reduced-motion teardown, and 100-update resource stability.
