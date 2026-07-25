# Phase 5 — Playable web shell

## Implemented boundary

Phase 5 currently includes one playable vertical slice in `apps/web`:

- a React/Vite static application with checkpoint, preparation, running, result, and failure views;
- the shared authoritative runtime executing the canonical empty-level fixture in a real module Web Worker;
- protocol version 1 with strict validation for initialization, preparation confirmation, snapshots, terminal evidence, and failures;
- replay-compatible preparation command evidence and visible terminal result, final-state checksum, and event-stream checksum;
- deterministic protocol tests plus Chromium, Firefox, and WebKit worker/UI coverage;
- keyboard activation and live accessible status/result announcements.

The web build participates in the root workspace build and the browser tests participate in the repository browser verification gate.

## Authority and compatibility

React renders worker messages and may show a pending state, but it does not step or resolve gameplay. The worker compiles the same checked-in content and scenario fixture used by the CLI, then invokes `@dwarven-depths/runtime`. Protocol messages reject unknown versions, malformed shapes, and additional properties. A worker accepts preparation authority only once.

Protocol version 1 and its canonical fixture checksums are compatibility evidence. Future protocol changes must be explicitly versioned; existing message meanings must not be silently changed.

## Explicitly not implemented

- Phaser or battlefield rendering;
- the Shuttergate encounter UI;
- placement editing, combat HUD, upgrades, settings, respec, audio, or final visual design;
- new gameplay mechanics;
- new minimization schemas or divergence classes.

Broader Phase 5 work remains unimplemented until explicitly approved and added to this boundary.

## Executable checks

- `pnpm --filter @dwarven-depths/web build`
- `pnpm test:built -- apps/web/src/protocol.test.ts`
- `pnpm test:browser:docker`
- `pnpm run verify`
