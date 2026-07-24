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
- Fixed-step phase 5 now composes dwarf target-lock validation with active
  pre-commit attack windups. A retained lock keeps the existing windup valid;
  an invalid lock cancels that work before or at commitment while separately
  exposing normal policy reacquisition for future work. Reacquisition never
  retargets an already-started attack. Batch evidence is stable by attack ID,
  versioned, immutable, detached, reason-coded, and checksum-pinned across Node
  and all three browser engines.
- Fixed-step phase 5 also composes basic-enemy target-lock validation with
  active pre-commit windups. Eligible reachable dwarves and route-opening
  blockers retain their locks; invalid locks cancel the original windup while
  separately exposing deterministic acquisition for future work. Reacquisition
  never retargets started attacks. Evidence is stable by attack ID, versioned,
  immutable, detached, reason-coded, and checksum-pinned across Node and all
  three browser engines.
- Version 1 wave content authors explicit round-combat start ticks, durations,
  and stable spawn events with timestamps, authored order, enemy definitions,
  entity identities, and map entrance references. Validation rejects events
  outside their wave interval, duplicate spawn IDs/entities/orders, and
  entrances not owned by the level map.
- Fixed-step phase 2 starts every due wave independently of unresolved earlier
  enemies, enqueues each due spawn exactly once, and preserves future and
  already-fired schedule state. Level wave order and explicit spawn order—not
  caller array order—own gameplay ordering. Results are versioned, immutable,
  detached, reason-coded, and pinned for overlapping waves across Node and all
  three browser engines.
- Authored phase-2 scheduling now composes directly with authoritative spawn
  admission and movement. Battlefield state persists started-wave and
  fired-spawn IDs, emits reason-coded `wave.started` and `spawn.enqueued`
  evidence before admission evidence, and retries queued enemies without
  replaying schedule events. The composed result remains versioned, immutable,
  detached, input-order independent, and checksum-pinned across Node and all
  three browser engines.
- Authored enemy-definition identity is preserved from each wave spawn through
  pending queues, admission decisions, battlefield state, and reason-coded spawn
  events. Queued records validate their `enemy.*` definition ID against the
  authored schedule, providing the deterministic content link required to
  initialize admitted combatants in the executable encounter path.
- Spawn admission now initializes one authoritative enemy combatant from the
  immutable compiled enemy definition. The record carries stable entity and
  definition identity, classification, current and maximum health, armor target
  metric, movement interval, lifecycle state, and detached basic-attack timing,
  damage, range, and line-of-sight data. Queued spawns create no combatant;
  retries preserve existing mutable health without duplicate initialization.
  Persisted definition-owned fields are checked against compiled content, and
  the Cutter-to-Slinger admission sequence is checksum-pinned across Node and
  all three browser engines.
- Each admitted enemy also receives detached deterministic action state at its
  exact admission tick: its first movement boundary derived from the authored
  movement interval, no target lock, no active basic-attack windup, and no
  cooldown. A separate authoritative spawn/entity/definition admission ledger
  binds that immutable tick and compiled definition identity against later
  action-state validation. Persisted locks,
  windups, cooldown boundaries, and movement timing are strict, versioned,
  safe-integer records that survive queue retries and movement phases without
  reconstruction. The action-state admission sequence is checksum-pinned
  across Node and all three browser engines.
- The battlefield movement phase consumes that persisted cadence. An active
  enemy can submit at most one movement proposal only when its authored boundary
  is due; moved and congestion-waited attempts advance to the first cadence
  boundary after the current tick, while rejected malformed attempts do not.
  Early, duplicate, destroyed, and overflowed enemy movement attempts are
  rejected without mutation, and queued spawn retries retain stable event order.
- Deterministic enemy route planning finds the minimum weighted path from an
  occupied navigation node to an attack-valid position for one selected dwarf
  placement. It reuses inclusive range and authored line-of-sight geometry,
  never traverses the target placement or explicit solid blockers, and leaves
  moving-enemy congestion to the reservation phase. Equal-cost choices follow
  authored neighbor order. Already-valid, routed, and unreachable results carry
  immutable, reason-coded route evidence pinned across Node and all three
  browser engines.
- Fixed-step phase 12 resolves configured boss-death rewards before terminal
  evaluation. Each unclaimed reward atomically grants Forge Ore, records its
  stable claim ID, and unlocks its configured character; replayed claims are
  explicit no-ops. Multiple boss deaths resolve in stable boss/reward order,
  and the resulting profile and reason-coded decisions are versioned,
  immutable, detached, input-order independent, and checksum-pinned across
  Node and all three browser engines. This preserves the boss reward and unlock
  even when terminal evaluation subsequently records a same-step defeat.
- Fixed-step phase 13 validates the authoritative post-scheduling wave state,
  enters final cleanup only when the final authored wave interval has ended,
  and evaluates defeat before victory. No living deployed dwarf is an immediate
  defeat; otherwise victory requires the complete spawn schedule to have fired,
  an empty pending-spawn queue, and no living hostile enemy or hostile
  deployable. Unresolved cleanup conditions remain reason-coded, while results
  are versioned, immutable, detached, input-order independent, and
  checksum-pinned across Node and all three browser engines. The runtime
  checkpoint composes this evaluation after boss reward resolution.
- One compact Phase 3 system artifact carries a retained dwarf target through
  commitment, lethal boss impact, lifecycle resolution, a bounded death trigger,
  boss reward/unlock, and completed-wave victory. Companion evidence covers
  invalid-lock cancellation with future reacquisition, same-tick dwarf/enemy
  lethal impacts, and committed healing/status application.
- The complete artifact is reason-coded, immutable, and pinned to one literal
  checksum in Node, Chromium, Firefox, and WebKit. It verifies the implemented
  combat boundaries together without introducing a second authoritative game
  loop or inventing unresolved mechanics.
- `sim explain` fully verifies a run bundle before reducing its canonical events
  and reason-coded diagnostics into one versioned explanation report. The same
  report renders deterministic Markdown or JSON, and every entry cites its event
  ID, tick, sequence, rule code, and recorded event or command causes. The pure
  reducer is pinned across Node and all three browser engines.
- Version 1 content now authors immutable base combatant records for the Iron
  Warden, Goblin Cutter, Goblin Slinger, Goblin Bulwark, and Gatebreaker Captain.
  Records carry bounded health, armor metrics, movement intervals, target-policy
  support, and basic attack timing, damage, range, and line-of-sight data under
  stable `character.*`, `enemy.*`, and `attack.*` IDs. Wave spawns must reference
  an authored enemy definition. Compilation canonicalizes and indexes the records
  through read-only maps, and the reference manifest checksum is pinned in Node,
  Chromium, Firefox, and WebKit. Armor remains a targeting/content metric here;
  no damage-reduction formula, Shield Slam stagger, Captain rally, or heavy-strike
  behavior is inferred by this checkpoint.
- The Shuttergate Hall reference content authors one deterministic battlefield
  with west and east enemy entrances, two legal Iron Warden placements, and five
  ordered 900-tick waves. The composition teaches Cutter blocking, adds
  second-entrance and Slinger pressure, introduces a Bulwark, places the
  Gatebreaker Captain with a mixed Wave 4 escort, and continues mixed pressure
  through Wave 5 after the boss spawn. All 18 spawns use stable global authored
  order, entity identity, enemy-definition, and entrance references. Compilation
  is immutable, insensitive to non-gameplay source ordering, and checksum-pinned
  across Node and all three browser engines. Captain special abilities and armor
  behavior remain intentionally unauthored until their mechanic contracts exist.

## Not implemented yet

Battlefield route-to-target composition and target/attack action execution,
armor reduction,
attack-windup status semantics,
non-damage trigger variants,
non-boss rewards, authored special abilities and boss behavior, balance
calibration, and broader combat event integration remain later checkpoints.
