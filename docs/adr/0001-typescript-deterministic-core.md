# ADR-0001: TypeScript deterministic core with React and Phaser client

- **Status:** Accepted for Milestone 0 determinism and renderer spike
- **Date:** 2026-07-22

## Context

Dwarven Depths must eventually support web, mobile, and desktop while beginning with a desktop keyboard/mouse slice. Its automated real-time combat, progression loop, and authored waves require deterministic simulation. Autonomous agents must be able to inspect, replay, compare, and explain behavior without operating a graphical client.

## Decision

Use a TypeScript monorepo with:

- Pure headless `sim-core` shared by Node and browser
- Data-authored validated content
- Node CLI for scenarios, replays, sweeps, progression, and reports
- React for accessible DOM UI
- Phaser for nonauthoritative pixel-art battlefield rendering
- Browser/PWA first
- Tauri and Capacitor evaluated as packaging adapters after the web slice

Use a 30-tick-per-second integer simulation clock. Gameplay state and rules must not depend on Phaser, React, DOM, canvas, Node filesystem, wall-clock time, or rendering frame rate.

## Consequences

### Positive

- One gameplay implementation for CLI and client
- Fast agent-readable headless tests and balance sweeps
- Deterministic replay and browser parity checks
- Accessible responsive UI outside the canvas
- Straightforward web delivery and later wrappers
- Shared schemas and types across content, saves, reports, and UI

### Negative

- Custom pathing, simulation, content, and tooling must be built rather than inherited from an engine
- Phaser editor workflows cannot author authoritative mechanics
- TypeScript requires explicit fixed-point and deterministic-iteration discipline
- Tauri and Capacitor add later packaging-specific validation

## Alternatives rejected

- **Godot:** strong 2D editor and exports, but a first-class external headless harness would create engine-bound tooling or a second simulation boundary.
- **Unity:** broad exports but excessive editor, runtime, CI, and agent-operation weight for the slice.
- **Rust/Bevy:** strong deterministic performance, but higher browser/UI integration and iteration cost before profiling demonstrates need.
- **Phaser-authoritative simulation:** rejected because scene timers and frame updates compromise headless determinism and client-independent behavior.

## Validation

The decision remains valid only if a spike proves:

- Identical ordered authoritative events and checksums in Node, Chromium, Firefox, and WebKit for canonical replays
- Deterministic pathing and combat at different render frame rates
- Fixed simulation step and headless sweep throughput meet the versioned reference-machine budgets
- Trace verbosity does not alter commands, events, state, RNG consumption, or checksums
- Responsive Phaser rendering at the vertical-slice entity target
- Accessible React HUD and modal flows independent of canvas interaction

If the spike fails performance without obvious optimization headroom, profile the pure-core boundary before considering a Rust/WebAssembly implementation. Preserve replay and content contracts through any replacement.
