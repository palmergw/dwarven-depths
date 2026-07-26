# Phase 5 — Playable web shell

## Implemented boundary

Phase 5 currently includes two playable vertical slices in `apps/web`:

- a React/Vite static application with checkpoint, preparation, running, result, and failure views;
- the shared authoritative runtime executing the canonical empty-level fixture in a real module Web Worker;
- protocol version 1 with strict validation for initialization, preparation confirmation, snapshots, terminal evidence, and failures;
- replay-compatible preparation command evidence and visible terminal result, final-state checksum, and event-stream checksum;
- deterministic protocol tests plus Chromium, Firefox, and WebKit worker/UI coverage;
- keyboard activation and live accessible status/result announcements.
- a Phaser canvas that renders the authoritative level, map graph, and stable-ID-ordered entities from strictly validated render snapshots;
- a canvas-independent DOM battlefield summary and browser evidence that presentation-frame scheduling cannot alter terminal checksums.
- an explicit level checkpoint showing attempt context before a keyboard- and mouse-operable action initializes preparation authority.

The web build participates in the root workspace build and the browser tests participate in the repository browser verification gate.

## Authority and compatibility

React and Phaser render worker messages and may retain the latest render snapshot, but they do not step or resolve gameplay. The worker compiles the same checked-in content and scenario fixture used by the CLI, derives canonical map/entity presentation data from compiled content and runtime state, then invokes `@dwarven-depths/runtime`. Protocol messages reject unknown versions, malformed shapes, noncanonical entity ordering, invalid references, and additional properties. A worker accepts preparation authority only once.

Protocol version 1 and its canonical fixture checksums are compatibility evidence. Future protocol changes must be explicitly versioned; existing message meanings must not be silently changed.

## Explicitly not implemented

- the Shuttergate encounter UI;
- sprite assets, animation polish, camera controls, placement editing, combat HUD, upgrades, settings, respec, audio, or final visual design;
- new gameplay mechanics;
- new minimization schemas or divergence classes.

Broader Phase 5 work remains unimplemented until explicitly approved and added to this boundary.

## Executable checks

- `pnpm --filter @dwarven-depths/web build`
- `pnpm test:built -- apps/web/src/protocol.test.ts`
- `pnpm test:browser:docker`
- `pnpm run verify`
