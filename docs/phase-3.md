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
  completion timing plus the resolved damage and range values then in force.
  Batch decisions use stable attack-ID order and are immutable, detached,
  versioned, and reason-coded.
- Committed direct attacks remain pending until their exact authored impact
  tick. Source death or removal does not cancel committed work. At impact, an
  absent or zero-health target discards the attack with a machine-readable
  reason; otherwise snapshotted integer damage is applied.
- Same-tick direct damage is aggregated per living target before health changes,
  clamps at zero, and returns stable attack decisions plus stable entity health
  evidence. Results are independent of input order and are immutable, detached,
  and versioned. Armor reduction is intentionally not inferred at this boundary.

## Not implemented yet

Integration of route analysis with enemy target acquisition, dwarf candidate
filtering, target locking, armor, cooldown state advancement, statuses, healing,
zero-health downed/destroyed transitions, death triggers, authored spawn
schedules, boss behavior, and combat event integration remain later Phase 3
checkpoints.
