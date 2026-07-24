# Phase 3: combat foundation

Phase 3 begins with the target-selection contract fixed in
`docs/technical-design-readiness.md`. This document records only the executable
Phase 3 surface currently present in the repository.

## Implemented boundary

- The simulation core exposes deterministic dwarf target-policy selection for
  nearest, lowest health, highest health, highest armor, fastest, and boss or
  elite first.
- Callers supply living hostile candidates already determined to be valid, in
  range, and in line of sight. Candidate combat metrics are deterministic safe
  integers and identities are stable `entity.*` IDs.
- A requested policy is used only when the attacker declares it supported.
  Unsupported policies fall back to nearest. Boss-or-elite-first also falls
  back to nearest when no preferred target exists.
- Every policy resolves equal primary preferences by squared distance and then
  stable entity ID. Input order is not gameplay data.
- Empty candidate sets return no target with a machine-readable reason. Invalid
  policies, duplicate identities, nonliving candidates, and malformed metrics
  are rejected before selection.
- Returned decisions are immutable and inputs remain detached and unchanged.
- Version 1 battlefield maps author stable `aim.*` integer-coordinate centers
  and `opaque.*` inclusive axis-aligned rectangles. Navigation nodes reference
  their aim point explicitly. Coordinates are bounded to -1,000,000 through
  1,000,000 so all geometry arithmetic remains within JavaScript safe integers.
- Range uses squared Euclidean distance between authored aim-point centers.
  Authored range is a nonnegative integer no greater than 94,906,265; equality
  counts as in range, and queries reject malformed ranges or unknown aim IDs.
- Ranged visibility tests the closed segment between aim points against closed
  opaque rectangles. Crossing, edge contact, corner contact, and an endpoint on
  or inside opaque terrain are blocked. A clear segment remains visible.
- Line-of-sight queries consume only immutable authored map geometry. Units do
  not participate in blocking at this boundary.
- Basic-enemy target acquisition accepts route-analysis results for potential
  living dwarves and attackable blockers. It admits only reachable living
  dwarves and reachable, living blockers whose destruction opens the intended
  route, then selects the lowest path cost with stable placement-point and
  entity-ID ties. Decisions are immutable and reason-coded.
- Attack windups resolve at explicit integer commit and impact ticks. Invalid
  targets cancel before or at commitment without starting cooldown; valid
  attacks commit exactly at the authored tick and pin both impact and cooldown
  completion timing. Batch decisions use stable attack-ID order and are
  immutable, detached, and reason-coded.

## Not implemented yet

Integration of route analysis with enemy target acquisition, dwarf candidate
filtering, target locking, committed-attack impact execution, damage, armor,
cooldown state advancement, statuses, death resolution, authored spawn
schedules, boss behavior, and combat event integration remain later Phase 3
checkpoints.
