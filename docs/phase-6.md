# Phase 6 — Vertical-slice calibration and release candidate

## Implemented boundary

Phase 6 pins a machine-readable Level 1 Shuttergate reference baseline and an approved balance matrix. The matrix covers all 24 combinations of the two authored Iron Warden placements, six target policies, and two supported builds for the canonical seed and content manifest. Every case binds its expected terminal outcome, reason, deepest wave, and broad terminal-tick, spawn, defeat, and survivor ranges.

The baseline is validated as strict plain data before comparison. The existing authoritative Shuttergate calibration remains the only producer of gameplay evidence; the baseline neither runs a second gameplay loop nor changes content or mechanics. Node and browser calibration evidence remain bound to the same canonical checksum.

Observed calibration evidence and balance recommendations remain separate. Satisfying the matrix proves that the approved combinations remain inside broad evidence ranges and that the first persistent upgrade extends survival for each placement/policy pair. It does not claim equal strategy strength, victory balance, or recommend future tuning.

## Explicitly not implemented

- Level 1 mechanics or content-statistic tuning beyond the approved evidence ranges;
- local telemetry export, reference human/policy replays, release-candidate report publication, presentation polish, or performance/accessibility budgets;
- a terminating Phase 5 web encounter or terminal client/CLI parity;
- new mechanics, report/replay formats, minimization schemas, or divergence classes.

## Executable check

- `pnpm test:built packages/runtime/src/shuttergate-level-1-baseline.test.ts`
- `pnpm test:built packages/runtime/src/shuttergate-level-1-balance-matrix.test.ts`
