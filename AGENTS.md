# AGENTS.md

## Project status

Dwarven Depths is in Milestone 0 implementation. The repository now contains the first deterministic TypeScript workspace and a runnable `validate`/`run` simulation CLI for the empty conformance scenario. The broader command surface in `docs/simulation-harness.md` remains an implementation contract unless listed as available in `docs/milestone-0.md`.

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
