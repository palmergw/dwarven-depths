# Phase 5 — Playable web shell

## Implemented boundary

Phase 5 currently includes these dependency-ordered slices:

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
- a backward-compatible protocol-v4 target-policy input path with worker-derived, manifest-bound dwarf capabilities, strict canonical command/result validation, and semantic keyboard/mouse controls; the empty fixture continues to expose the authoritative unavailable state.
- the approved deterministic Shield Slam content, strict replay command, integer cone/cooldown/impact/interruption/stagger resolver, reason-coded evidence, and accessible protocol-v4 activation control with authoritative phase/cooldown feedback and duplicate-safe queued presentation; Shuttergate content deliberately migrates to `phase-5-shuttergate-shield-slam-v2` while historical no-ability fixtures retain their prior bytes and checksums.
- a semantic terminal-results action that disposes the completed worker, clears attempt-local presentation and input state, and returns to a fresh checkpoint for a deterministic repeat attempt.
- a semantic results action that downloads deterministic, versioned authoritative run evidence with a stable checksum-derived filename, without presenting that evidence document as a CLI replay format.
- an outcome-specific authoritative results region that receives keyboard focus after each strictly validated terminal result and is removed when returning to checkpoint.
- a checkpoint presentation-settings view with deterministic focus restoration and a strictly validated, durable reduced-motion preference that cannot affect simulation authority.
- a strictly validated, durable default/large/extra-large text-scale preference with responsive narrow-viewport reflow that cannot affect simulation authority.
- a strictly validated, durable standard/high-contrast preference that applies a coherent current-shell palette without affecting simulation authority.
- a semantic checkpoint upgrade-inventory view that presents validated persistent purchases and Forge Ore with an explicit empty state and deterministic focus restoration, without mutating progression.

The web build participates in the root workspace build and the browser tests participate in the repository browser verification gate.

## Authority and compatibility

React and Phaser render worker messages and may retain the latest render snapshot, but they do not step or resolve gameplay. The worker compiles the same checked-in content and scenario fixture used by the CLI, derives canonical map/entity presentation data from compiled content and runtime state, then invokes `@dwarven-depths/runtime`. Protocol messages reject unknown versions, malformed shapes, noncanonical entity ordering, invalid references, and additional properties. A worker accepts preparation authority only once.

Protocol versions 1–4 and the canonical empty-fixture checksums are compatibility evidence. Future protocol changes must be explicitly versioned; existing message meanings must not be silently changed.

## Explicitly not implemented

- the Shuttergate encounter UI;
- sprite assets, animation polish, camera controls, placement editing, a nonempty playable encounter/roster, generalized abilities, health presentation beyond Shield Slam cooldown/rejection feedback, upgrade purchasing/effects, respec, audio, or final visual design;
- new gameplay mechanics;
- new minimization schemas or divergence classes.

Broader Phase 5 work remains unimplemented until explicitly approved and added to this boundary.

## Executable checks

- `pnpm --filter @dwarven-depths/web build`
- `pnpm test:built -- apps/web/src/protocol.test.ts`
- `DD_SKIP_BUILD=1 ./scripts/test-browser-docker.sh apps/web/src/App.browser.test.tsx`
- `pnpm test:browser:docker`
- `pnpm run verify`
