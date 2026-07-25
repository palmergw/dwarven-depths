# AGENTS.md

## Project status

Dwarven Depths is in Phase 4 progression, persistence, campaign-harness, and minimization consolidation. Phases 0–3 are complete. The executable simulation CLI currently provides `validate`, `run`, `replay --verify`, `inspect`, `explain`, `compare`, `render`, `sweep`, `campaign`, and `minimize`. `docs/phase-4.md` defines the live Phase 4 boundary; broader proposals in `docs/simulation-harness.md` remain contracts until explicitly listed as implemented in a phase document. Minimization schemas 1–8 are implemented and compatibility-frozen; new divergence classes or schema 9 require explicit product-owner approval.

## Source-of-truth order

1. `docs/technical-design-readiness.md` — fixed game-rule contracts
2. `docs/first-pass-systems.md` — roster, economy, content, and balance direction
3. `docs/technical-design.md` — proposed software architecture
4. `docs/simulation-harness.md` — required test, replay, report, and agent-inspection surface
5. `docs/technical-design-review-synthesis.md` — independent review decisions and TypeScript/Rust resolution
6. `docs/implementation-plan.md` — staged delivery and quality gates
7. `docs/gameplay-loop.md` — product loop and terminology
8. `docs/concept-art.md` — visual direction, not authoritative mechanics

If documents conflict, do not silently choose. Identify the conflict and preserve the higher-ranked rule until the design is intentionally amended.

## Implementation principles

- The headless deterministic simulation is authoritative.
- React, Phaser, browser state, animation, and audio must not own gameplay truth.
- CLI and client must use the same simulation and compiled content.
- Content, scenarios, commands, events, saves, replays, and reports use stable nonlocalized IDs and versioned schemas.
- Mechanics changes require focused scenarios and comparison evidence.
- Balance claims require manifests, metrics, and event evidence rather than screenshots or intuition alone.
- Keep generated large reports out of Git unless approved as compact regression or calibration fixtures.

## Non-performative verification policy

1. During iteration, run changed-scope tests and lint/typecheck as appropriate; CLI-only changes should prefer focused CLI tests.
2. Once a pre-review head is stable, run one complete `pnpm run verify`.
3. Independent exact-head review inspects code and runs only adversarial focused probes; it does not automatically duplicate the complete suite.
4. Review fixes receive focused regression coverage, followed by one final complete verification only when the head stabilizes.
5. Publication requires exact-head PR CI; merge requires post-merge `main` CI.
6. Do not run another post-merge local complete suite when the merged tree is identical to the reviewed tree and CI is green.
7. Wait for CI mechanically in one bounded command rather than spending repeated model turns polling.

Detailed evidence belongs on the PR. Tracker #103 holds a finite checklist and one compact rolling status, not duplicate CI transcripts.

## Required agent workflow once the harness exists

1. Run content and scenario validation.
2. Reproduce the relevant canonical scenario.
3. Record revision, content manifest, scenario, controller, and seed.
4. Inspect summary, timeline, event evidence, and diagnostics.
5. Compare baseline and candidate runs.
6. Run progression or sweep scenarios for balance claims.
7. Add or update a focused regression when behavior changes.
8. Report observations separately from recommendations.

See `docs/simulation-harness.md` for the command contract and evidence format.
