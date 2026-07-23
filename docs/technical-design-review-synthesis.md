# Technical Design Review Synthesis

Three independent reviews evaluated the technical direction through architecture, simulation/harness, and delivery/quality lenses.

## Consensus

All reviews agreed on the boundaries that matter most:

- The deterministic headless simulation is authoritative.
- The graphical client is a replaceable presentation and command adapter.
- The CLI and playable client must execute the same simulation and compiled content.
- Menus, controls, progression, and accessibility belong in semantic DOM rather than a canvas-only UI.
- Content, saves, commands, events, replays, reports, and migrations require stable versioned schemas.
- The harness is a vertical-slice deliverable, not post-game tooling.
- Node and browser replay parity must be proven before substantial UI or content production.
- Platform wrappers must remain thin and may not fork mechanics.

## TypeScript versus Rust disagreement

Two reviews recommended a TypeScript web-first core; the dedicated harness review preferred a Rust core compiled natively and to WebAssembly.

### Rust strengths identified

- Strong integer and overflow discipline
- Native high-volume sweep performance
- One native/WASM implementation
- Mature property-testing and explicit serialization control

### Rust costs identified

- Additional Rust/WASM-to-TypeScript protocol and debugging boundary
- Higher contributor and autonomous-agent workflow complexity
- Slower browser/UI integration and content-tool iteration
- Greater architecture investment before the reference entity scale is measured

### Resolution

Proceed with the TypeScript design for the determinism spike because it provides the shortest path to one inspectable language across schemas, simulation, progression, CLI, browser worker, tests, and UI.

This is conditional rather than ideological. Milestone 0 must prove:

- Identical authoritative events and checksums in Node, Chromium, Firefox, and WebKit
- Fixed-point and safe-integer discipline under property tests
- Headless throughput and step-time budgets for the stress encounter
- Telemetry-level invariance
- Canonical serializer stability

If measured performance or cross-runtime determinism fails without clear TypeScript optimization headroom, retain all language-neutral content, command, event, replay, report, and save contracts and reevaluate Rust/WASM for `sim-core`. The renderer and DOM UI decision remains unchanged.

## Additions adopted from review

The technical design was expanded to include:

- Stable rule and calibration IDs linking design to scenarios, tests, reports, and CI
- Four-stage content validation, including executable content lint
- Deterministic JSONL agent interaction over standard input/output
- Deterministic CLI exit codes and content/scenario diff commands
- Runtime provenance, invariant reports, final-state artifacts, and optional decision traces
- Command and event hash chains plus lifecycle checkpoint checksums
- A requirement that trace verbosity cannot affect behavior
- Paired statistical sweeps with sample counts, percentiles, deterministic analysis seeds, and explicit synthetic/oracle labeling
- Persistence fault injection and a historical migration fixture corpus
- Pinned performance, memory, bundle, asset, and latency budgets
- Cross-browser replay parity as the highest-priority architecture gate
- CI publication of replay, balance, migration, performance, accessibility, security, and failure artifacts

## Architecture decision status

[ADR-0001](adr/0001-typescript-deterministic-core.md) is accepted for implementation of the Milestone 0 determinism and renderer spike. Acceptance of the broader implementation remains conditional on that spike passing its documented portability and performance gates.
