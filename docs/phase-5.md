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
- a durable checkpoint purchase flow over the finite authored vertical-slice upgrade catalog that resolves through shared progression authority, uses optimistic save revisions, updates only from confirmed canonical envelopes, and exposes reasoned unavailable states plus accessible failure recovery.
- a destructive checkpoint confirmation that recycles all shared purchased upgrades through progression authority, refunds authored Forge Ore spend exactly, preserves retained profile state, and updates only from a revision-checked canonical save.
- a destructive checkpoint confirmation that recycles the authored Iron Warden skill tree through progression authority, restores spent skill-point levels exactly, preserves unrelated progression, and updates only from a revision-checked canonical save.
- a durable checkpoint Iron Warden skill-selection flow that exposes only shared-authority eligible nodes, spends the next pending level through progression authority, and updates only from a revision-checked canonical save.
- accessible checkpoint effect summaries for owned and next upgrade ranks plus selected and eligible Iron Warden skill nodes, derived from the shared authored catalogs without changing progression authority.
- deterministic Escape-key unwinding for checkpoint settings, upgrade inventory, and nested recycle confirmations, with trigger-focus restoration and no dismissal while a progression save is pending.
- modal semantics and deterministic forward/reverse keyboard-focus containment for checkpoint settings, upgrade inventory, and nested recycle confirmations, without changing progression authority or pointer controls.
- active recycle confirmations isolate every background upgrade-inventory control from pointer, keyboard, and assistive-technology interaction, restoring the unchanged inventory when dismissed.
- successful shared-upgrade and Iron Warden skill recycling restores focus to a persistent inventory heading when the completed action removes its confirmation trigger.
- confirmed checkpoint upgrade purchases restore focus to the changed upgrade heading, including when its purchase control becomes disabled at maximum rank.
- confirmed Iron Warden skill selections restore focus to the selected node heading, including when the final pending skill point removes every selection control.
- an installable production web shell whose versioned service worker precaches the complete generated application and simulation-worker assets, preserves the prior active cache across failed updates, and reopens the checkpoint offline after an initial successful load.

The web build participates in the root workspace build and the browser tests participate in the repository browser verification gate.

## Authority and compatibility

React and Phaser render worker messages and may retain the latest render snapshot, but they do not step or resolve gameplay. The worker compiles the same checked-in content and scenario fixture used by the CLI, derives canonical map/entity presentation data from compiled content and runtime state, then invokes `@dwarven-depths/runtime`. Protocol messages reject unknown versions, malformed shapes, noncanonical entity ordering, invalid references, and additional properties. A worker accepts preparation authority only once.

Protocol versions 1–4 and the canonical empty-fixture checksums are compatibility evidence. Future protocol changes must be explicitly versioned; existing message meanings must not be silently changed.

## Explicitly not implemented

- the Shuttergate encounter UI;
- sprite assets, animation polish, camera controls, placement editing, a nonempty playable encounter/roster, generalized abilities, health presentation beyond Shield Slam cooldown/rejection feedback, applying purchased upgrade or selected skill effects in the web encounter, other-character skill selection/respec, audio, or final visual design;
- new gameplay mechanics;
- new minimization schemas or divergence classes.

Broader Phase 5 work remains unimplemented until explicitly approved and added to this boundary.

## Executable checks

- `pnpm --filter @dwarven-depths/web build`
- `pnpm test:built -- apps/web/src/protocol.test.ts`
- `DD_SKIP_BUILD=1 ./scripts/test-browser-docker.sh apps/web/src/App.browser.test.tsx`
- `DD_SKIP_BUILD=1 ./scripts/test-browser-docker.sh apps/web/src/upgrade-purchase.browser.test.tsx`
- `DD_SKIP_BUILD=1 ./scripts/test-browser-docker.sh apps/web/src/upgrade-recycle.browser.test.tsx`
- `DD_SKIP_BUILD=1 ./scripts/test-browser-docker.sh apps/web/src/skill-recycle.browser.test.tsx`
- `DD_SKIP_BUILD=1 ./scripts/test-browser-docker.sh apps/web/src/skill-selection.browser.test.tsx`
- `node scripts/test-web-offline.mjs`
- `pnpm test:browser:docker`
- `pnpm run verify`
