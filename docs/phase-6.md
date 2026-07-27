# Phase 6 — Vertical-slice calibration and release candidate

## Implemented boundary

Phase 6 currently pins one machine-readable Level 1 Shuttergate reference baseline. It identifies the canonical content manifest, seed, Iron Warden placement, nearest-target controller, unupgraded build, safety limit, defeat outcome, and bounded terminal-tick, spawn, defeat, and survivor observations.

The baseline is validated as strict plain data before comparison. The existing authoritative Shuttergate calibration remains the only producer of gameplay evidence; the baseline neither runs a second gameplay loop nor changes content or mechanics. Node and browser calibration evidence remain bound to the same canonical checksum.

Observed calibration evidence and balance recommendations are separate: satisfying this baseline proves that the approved reference setup remains within its pinned initial ranges. It does not approve victory balance, other placements, controllers, builds, or future tuning.

## Explicitly not implemented

- Level 1 tuning beyond the pinned reference setup;
- local telemetry export, reference human/policy replays, release-candidate report publication, presentation polish, or performance/accessibility budgets;
- a terminating Phase 5 web encounter or terminal client/CLI parity;
- new mechanics, report/replay formats, minimization schemas, or divergence classes.

## Executable check

- `pnpm test:built -- packages/runtime/src/shuttergate-level-1-baseline.test.ts`
