# AGENTS.md

## Project status

Dwarven Depths is in Phase 6 vertical-slice calibration and release-candidate development. Phases 0–4 are complete. Phase 5 delivered the React/Vite playable shell, authoritative Web Worker host, Phaser renderer, client controls, progression, accessibility settings, offline packaging, and CLI evidence verification; terminal client/CLI parity remains explicitly blocked until an approved terminating web encounter contract exists. `docs/phase-5.md` and `docs/phase-6.md` define the exact implemented boundaries. The executable simulation CLI currently provides `validate`, `run`, `replay --verify`, `inspect`, `explain`, `compare`, `render`, `sweep`, `campaign`, and `minimize`. Broader proposals remain contracts until explicitly listed as implemented in a phase document. Minimization schemas 1–8 are implemented and compatibility-frozen; new divergence classes or schema 9 require explicit product-owner approval.

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

## Coherent delivery policy

- One issue/PR delivers one coherent customer-visible workflow or release-candidate outcome, not one tracker checkbox.
- Combine adjacent criteria that share a component, state transition, risk model, and verification surface. Presentation settings, modal/focus behavior, telemetry validity, and report publication are not split into one PR per variant.
- Tiny isolated PRs are reserved for urgent regressions or genuinely independent blockers.
- During Phase 6, prioritize visible polish, onboarding and feedback, performance/accessibility budgets, and finite release-candidate completion over new telemetry fields, replay metadata, evidence schemas, or assurance-only variants.
- Implementation sessions are capped at 100 model turns. If a coherent outcome cannot safely finish within that bound, preserve a meaningful local commit or dirty checkpoint and exit cleanly so the changed deterministic fingerprint resumes it without broad rediscovery.

## Non-performative verification policy

1. During iteration, run changed-scope tests and lint/typecheck as appropriate; CLI-only changes should prefer focused CLI tests.
2. Before independent review, perform one bounded adversarial self-check using only relevant lenses: strict shape rejection, canonical ordering, stable-ID domains, version/sequence binding, terminal evidence consistency, tampering/replay, and asynchronous UI/storage races.
3. Draft publication and review-fix heads receive focused changed-scope tests plus lint/typecheck/build as appropriate, then use the draft-only exact-head push helper. Draft open/synchronize workflows skip runner jobs; the complete repository gate is not repeated for every review fix.
4. Create and keep the PR draft while independent exact-head review and correction cycles run.
5. Independent exact-head review inspects code and runs adversarial focused probes; it does not duplicate the complete suite. Review all reported blockers together and fix the coherent defect class in one batch before re-review.
6. After the final exact draft head receives a blockers-only `No blockers` result, that same clean HEAD must pass one complete local `pnpm verify:local:checkpoint` and remote-head read-back. Mark it ready only then. Standard PR/main CI remains a fast bounded change-detection gate; long browser, packaging, calibration, capture, and release-report suites do not run on hosted runners.
7. Run `pnpm verify:local:release` only at an actual release/packaging boundary. Do not repeat complete local suites after every correction or after an unchanged merge.
8. If a fast remote check times out for runner/infrastructure reasons, reproduce it locally twice on the immutable reviewed head, preserve the remote timeout URL/conclusion, and label the substitute evidence as local exact-head verification rather than claiming remote success.
9. See `docs/verification-policy.md`; `pnpm check:ci-runtime-policy` prevents long-running commands from being added to hosted workflows.

Detailed evidence belongs on the PR. Trackers #166 and #238 hold finite checklists and compact rolling status rather than duplicate CI transcripts.

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
