# Phase 5 — Playable web shell

## Implemented boundary

Phase 5 currently includes nine dependency-ordered slices:

- a React/Vite static application with checkpoint, preparation, running, result, and failure views;
- the shared authoritative runtime executing the canonical empty-level fixture in a real module Web Worker;
- protocol version 1 with strict validation for initialization, preparation confirmation, snapshots, terminal evidence, and failures;
- replay-compatible preparation command evidence and visible terminal result, final-state checksum, and event-stream checksum;
- deterministic protocol tests plus Chromium, Firefox, and WebKit worker/UI coverage;
- keyboard activation and live accessible status/result announcements.
- a Phaser canvas that renders the authoritative level, map graph, and stable-ID-ordered entities from strictly validated render snapshots;
- a canvas-independent DOM battlefield summary and browser evidence that presentation-frame scheduling cannot alter terminal checksums.
- an explicit level checkpoint showing attempt context before a keyboard- and mouse-operable action initializes preparation authority.
- a strictly validated worker-owned preparation summary identifying the authoritative empty level, empty roster, and zero authored placement points before confirmation is enabled.
- a semantic DOM combat HUD that reports authoritative level, phase, tick, allied dwarf count, and hostile enemy count from validated render snapshots through the terminal result.
- a versioned worker-authoritative manual-pause gate with shared button/Escape semantics and focus-loss pausing that never resumes automatically.
- a strictly validated worker-authoritative combat-control availability snapshot and semantic HUD region that explains why the empty authoritative roster exposes no target-policy or ability actions.
- a strict replay-compatible `setTargetPolicy` command contract and deterministic reducer that orders same-tick input, reason-codes rejection, and feeds stable action entries into authoritative dwarf target acquisition.
- an incremental runtime host that owns fixed-step advancement, current-tick command sequencing, replayable effective-scenario identity, event accumulation, and canonical terminal evidence, with the empty web worker's pause-gated execution routed through that host.

The web build participates in the root workspace build and the browser tests participate in the repository browser verification gate.

## Authority and compatibility

React and Phaser render worker messages and may retain the latest render snapshot, but they do not step or resolve gameplay. The worker compiles the same checked-in content and scenario fixture used by the CLI, derives canonical map/entity presentation data from compiled content and runtime state, then invokes `@dwarven-depths/runtime`. Protocol messages reject unknown versions, malformed shapes, noncanonical entity ordering, invalid references, and additional properties. A worker accepts preparation authority only once.

Protocol version 1 and its canonical fixture checksums are compatibility evidence. Future protocol changes must be explicitly versioned; existing message meanings must not be silently changed.

## Explicitly not implemented

- the Shuttergate encounter UI;
- sprite assets, animation polish, camera controls, placement editing, nonempty target-policy UI, ability activation, health/cooldown details, upgrades, settings, respec, audio, or final visual design;
- new gameplay mechanics;
- new minimization schemas or divergence classes.

Broader Phase 5 work remains unimplemented until explicitly approved and added to this boundary.

## Executable checks

- `pnpm --filter @dwarven-depths/web build`
- `pnpm test:built -- apps/web/src/protocol.test.ts`
- `pnpm test:browser:docker`
- `pnpm run verify`
