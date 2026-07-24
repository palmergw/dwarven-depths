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
- After health changes, active zero-health dwarves transition to downed while
  active zero-health enemies and deployables transition to destroyed from one
  shared pre-resolution snapshot. Living and already-resolved entities retain
  their lifecycle state with machine-readable evidence.
- Lifecycle decisions, resulting combatants, and surviving navigation occupancy
  use stable entity-ID order. Downed and destroyed entities vacate occupancy in
  the same resolution. Inputs are strictly validated, immutable, and detached,
  and the mixed-kind simultaneous-death fixture is pinned across Node and all
  three browser engines.
- Newly downed or destroyed entities enqueue direct-damage death triggers in
  stable owner-entity and effect-ID order. Each effect executes at most once for
  its owner's supplied death event; damage is aggregated before each recursion
  round's simultaneous lifecycle transitions.
- Trigger chains stop when exhausted or at the authored positive recursion-round
  limit. A bounded result explicitly identifies pending death events, while
  decisions, health evidence, transitions, and resulting combatants remain
  versioned, immutable, detached, reason-coded, and input-order independent. A
  recursive chain fixture is pinned across Node and all three browser engines.
- Fixed-step phase 4 completes committed cooldowns and expires statuses exactly
  at their authored boundary tick. Timer decisions use stable cooldown-ID and
  owner-entity/status-ID order and retain immutable active records before the
  boundary.
- Applying an identical owner/status pair refreshes its expiry from the
  application tick without stacking and retains the stronger magnitude.
  Different statuses coexist in stable order. Application results are
  versioned, reason-coded, immutable, detached, and input-order independent,
  with timer and refresh evidence pinned across Node and all three browsers.
- Committed healing and non-damage status effects resolve at their exact impact
  tick during the damage-and-healing phase. Source death or removal does not
  cancel committed work; absent or zero-health targets discard it.
- Same-tick healing is aggregated per living target, capped at maximum health,
  and cannot revive a zero-health target. Due status effects reuse the shared
  refresh and stronger-magnitude rules in stable effect-ID order. Pending work,
  decisions, health evidence, and statuses are versioned, immutable, detached,
  and input-order independent, with capped-healing and status-refresh evidence
  pinned across Node and all three browser engines.
- Existing dwarf targets remain locked while living, hostile, in inclusive
  authored range, and (when required) in line of sight. Policy changes do not
  displace a valid lock; an absent, dead, friendly, out-of-range, or obscured
  lock triggers deterministic policy reacquisition from geometry-filtered
  candidates.
- Basic enemies likewise retain an eligible reachable dwarf or route-opening
  blocker and otherwise reuse deterministic route acquisition. Both lock paths
  return versioned, immutable, detached, reason-coded decisions, with retained
  and reacquired evidence pinned across Node and all three browser engines.

## Not implemented yet

Fixed-step integration of target validation/reacquisition with attack windups,
armor, attack-windup status semantics, non-damage trigger variants, rewards,
authored spawn schedules, boss behavior, terminal evaluation, and broader
combat event integration remain later Phase 3 checkpoints.
