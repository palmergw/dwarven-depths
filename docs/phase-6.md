# Phase 6 — Vertical-slice calibration and release candidate

## Implemented boundary

Phase 6 pins a machine-readable Level 1 Shuttergate reference baseline and an approved balance matrix. The matrix covers all 24 combinations of the two authored Iron Warden placements, six target policies, and two supported builds for the canonical seed and content manifest. Every case binds its expected terminal outcome, reason, deepest wave, and broad terminal-tick, spawn, defeat, and survivor ranges.

The baseline is validated as strict plain data before comparison. The existing authoritative Shuttergate calibration remains the only producer of gameplay evidence; the baseline neither runs a second gameplay loop nor changes content or mechanics. Node and browser calibration evidence remain bound to the same canonical checksum.

The simulation CLI now explicitly exports one local, schema-versioned Shuttergate attempt telemetry document with `telemetry --content <file> --out <file>`. The document records identity and manifest context, the fixed campaign roster/build, outcome and duration, wave transitions, spawn/defeat/survivor totals, terminal Warden state, and committed rewards from the existing authoritative campaign attempt. Canonical bytes and a payload checksum make repeated exports comparable and tampering detectable; publication uses create-only file semantics. No telemetry is collected or uploaded implicitly.

The canonical Level 1 policy replay is pinned as the existing schema-1 durable three-attempt campaign artifact plus its schema-2 manifest. A focused check regenerates byte-identical fixtures from the documented campaign scenario, independently replays every attempt checksum during restore, and verifies the resulting purchased upgrade, committed rewards, and Forge Ore. This adds no replay format or gameplay producer.

CI regenerates that authoritative three-attempt campaign as the `phase-6-release-candidate-reports` artifact. It contains the machine-readable campaign, calibration, and binding manifest plus deterministic Markdown that identifies their checksums and renders every attempt and the existing baseline-versus-upgraded comparison. A second deterministic readiness report maps the vertical-slice criteria, in source order, to their existing automated or bounded visual-review evidence and marks contract-blocked criteria without presenting them as accepted. The Markdown derives no additional gameplay evidence.

The web client presents one phase-aware run journey from checkpoint review through preparation, combat, and terminal evidence. It explains the existing pause controls and focus-loss pause, marks current and completed steps without duplicating live announcements, and adapts the final guidance to authoritative failure. This onboarding is presentation-only and derives its state from the existing client phase.

The battlefield renders routes and factions with a bounded pixel-art shape language, and validated render-snapshot transitions drive stable-ID-ordered visual, textual, and opt-in synthesized sound feedback. Initial mounts, replayed snapshots, and phase regressions produce no feedback. Reduced-motion preferences preserve static transition framing and text while suppressing animation; blocked audio and storage fail soft without changing worker authority. Manual review covers 320 px and desktop layouts in standard and high contrast; faction meaning remains shape-independent from color, feedback text wraps without overflow, and the canvas remains legible with motion reduced.

The production web release enforces gzip-9 payload budgets of 512,000 bytes for the main JavaScript, 40,960 bytes for the authoritative worker, 10,240 bytes for CSS, and 563,200 bytes total. The check requires exactly one hashed asset in each class, rejects unknown JavaScript or CSS chunks, and ignores source maps. Raising a limit or adding a production chunk is an intentional release-budget change, not an incidental build update. Browser coverage also gates the 320 px shell with extra-large text, high contrast, and reduced motion: the page cannot overflow horizontally, its main landmark and level-one heading are named, and enabled controls expose accessible names. Existing modal focus containment and restoration tests remain part of the same browser gate.

Observed calibration evidence and balance recommendations remain separate. Satisfying the matrix proves that the approved combinations remain inside broad evidence ranges and that the first persistent upgrade extends survival for each placement/policy pair. It does not claim equal strategy strength, victory balance, or recommend future tuning.

The calibrated desktop campaign now has an authoritative terminating web encounter. The supported unupgraded route preserves productive early defeat, while the purchased Iron Warden build can defeat the Gatebreaker Captain and persist victory rewards through the same Worker-owned campaign path. The pinned placement, policy, and build matrix records the approved defeat, deeper-push, and victory bands without moving gameplay truth into the client.

## Explicitly not implemented

- a reference human replay;
- telemetry categories that the current authoritative attempt does not produce, including aggregate basic-attack damage, healing, blocking time, and player-entered command timing; these are not inferred;
- terminal client/CLI parity;
- new mechanics, report/replay formats, minimization schemas, or divergence classes.

## Executable check

- `pnpm test:built packages/runtime/src/shuttergate-level-1-baseline.test.ts`
- `pnpm test:built packages/runtime/src/shuttergate-level-1-balance-matrix.test.ts`
- `pnpm test:built packages/runtime/src/shuttergate-attempt-telemetry.test.ts`
- `pnpm test:built packages/runtime/src/shuttergate-level-1-policy-replay.test.ts`
- `./scripts/test-browser-docker.sh packages/runtime/src/shuttergate-attempt-telemetry.browser.test.ts`
- `pnpm test:built apps/sim-cli/src/cli.test.ts -t 'exports deterministic local telemetry'`
- `./scripts/test-browser-docker.sh apps/web/src/App.browser.test.tsx -t 'run journey guidance'`
- `pnpm check:web-budgets`
- `pnpm test:built scripts/check-web-release-budgets.test.ts`
- `pnpm report:release-candidate`
- `pnpm test:built scripts/release-readiness.test.ts`
