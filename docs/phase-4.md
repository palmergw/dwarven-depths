# Phase 4: progression foundation

This document records only the executable Phase 4 surface currently present in
the repository.

## Implemented boundary

- Character experience state is versioned and character-specific, with bounded
  non-negative experience, an authored level, and ordered pending skill-point
  levels.
- Authored cumulative level thresholds begin at level 1 with zero experience,
  continue without level gaps, and increase strictly by cumulative experience.
- One atomic award crosses every due threshold in ascending level order and adds
  one pending skill point for each crossed level. Existing deferred points do not
  block later experience or additional crossings.
- Experience continues accumulating at the maximum authored level. Zero awards
  and awards that do not cross a threshold remain explicit and reason-coded.
- Requests and character experience state use strict versioned shapes, safe
  integers, stable `character.*` IDs, and dense bounded arrays. Results are
  immutable, detached, independent of threshold input order, and
  literal-checksum-pinned across Node, Chromium, Firefox, and WebKit.
- The versioned profile boundary now retains canonical per-character experience
  state and claimed authoritative XP reward-event IDs. A bounded event batch is
  committed in stable event-ID order, advances only its owning character through
  authored thresholds, increments the profile revision once, and reports replayed
  event IDs as explicit idempotent no-ops.
- XP reward commitment validates the complete persisted character-XP set against
  character-owned thresholds before mutation. Existing boss reward transitions
  preserve character XP and XP-event claims.
- Authored character skill trees use stable node IDs, bounded acyclic
  prerequisites, and additive effect descriptors. Eligibility is derived from
  persisted selections in stable node-ID order and never rerolls when queried
  again.
- Confirming an eligible node consumes the character's oldest pending
  skill-point level, persists the selected node and spent level atomically, and
  increments the profile revision. Existing reward transitions preserve the
  selection.
- Selected nodes derive immutable maximum-health, attack-damage, attack-range,
  and future-cooldown-start modifier totals.
- Authoritative deployment and live-selection boundaries apply those absolute
  totals to every deployed owner. Maximum-health increases preserve missing
  health, already-running cooldowns retain their completion tick, and active or
  committed attacks retain their snapshotted damage, range, and cooldown while
  future attacks use the new values. Reapplication is idempotent, live totals
  cannot decrease, and ownership, overflow, lineage, and persisted battlefield
  evidence are validated before acceptance.
- Authored shared upgrade catalogs define stable ability/item upgrade IDs,
  unlocked character/item owners, positive ordered rank costs, and acyclic
  prerequisites. A Forge Ore purchase commits exactly the next rank, preserves
  exact cumulative spend for later full-recycle accounting, and increments the
  profile revision atomically. Profile validation bounds unspent plus spent
  Forge Ore as one exactly refundable safe-integer total.
  Catalog/profile validation rejects unaffordable, maximum-rank, forged-spend,
  missing-prerequisite, overflow, and malformed transactions without mutation;
  purchase evidence is canonical and browser-parity pinned.
- Purchased ability ranks can author bounded passive maximum-health, basic-attack
  damage/range, and future-cooldown modifiers per rank. Catalog-validated owned
  ranks bind the exact normalized effect table into new purchase history, reject
  later catalog substitution, combine with selected skill totals, and apply once
  through the same authoritative deployment/live-state boundary, preserving
  missing health and already-running or committed work. Item ranks cannot claim
  character passive effects before a loadout owner exists. Reapplication is
  idempotent and nondecreasing, and effect evidence is literal-checksum-pinned
  across Node, Chromium, Firefox, and WebKit. Shield Slam activation/stagger,
  item behavior, armor reduction, and boss specials remain uninferred.
- Portable profile saves use a strict versioned envelope that binds content
  compatibility, simulation protocol, application build, write metadata, profile
  identity/revision, and a canonical payload checksum to normalized progression
  state. The explicit Node JSON adapter validates before writing, compares the
  expected revision, flushes a temporary generation, retains the previous valid
  primary as a backup, and atomically replaces the primary. Corrupt, oversized,
  and unsupported generations are never silently overwritten; a valid backup can
  be loaded read-only when the primary is unavailable. Fault-injection evidence
  covers validation, durable replacement, backup replacement, and interrupted
  acknowledgement boundaries.
- The browser IndexedDB adapter stores current profile envelopes behind an
  explicit platform entry point and enforces profile-revision compare-and-swap
  writes. The first pure consecutive migration upgrades historical envelope
  schema 0 to schema 1, validates before and after the step, and preserves the
  exact historical generation as a backup in the same atomic transaction.
  Interrupted migrations expose neither a partial backup nor a partial current
  save, while corrupt and unsupported-newer records remain untouched.
- Full progression recycle transactions accept exactly one complete character
  skill tree or the complete shared purchased-upgrade track. Character recycle
  restores every persisted spent-level point in ascending order; shared recycle
  refunds the exact catalog-validated cumulative Forge Ore spend. Both scopes
  increment the profile revision once and reset validated campaign access to
  the authored first level while preserving modeled XP, levels, unspent state,
  other character choices, unlocks, items, and claimed reward ownership.
  Strict request, campaign-prefix, owner, catalog, empty-scope, and overflow
  validation is atomic, with reason-coded immutable evidence pinned across Node,
  Chromium, Firefox, and WebKit. Player-facing destructive confirmation and
  unmodeled settings, codex, achievement, and complete campaign-save integration
  remain outside this executable boundary.
- The simulation CLI accepts a strict versioned JSON seed-sweep matrix through
  `sim sweep`. Matrix content and scenario paths are relative to the matrix and
  cannot be absolute. A bounded nonempty set of unique canonical uint32 seeds
  expands in authored order through the shared content compiler and authoritative
  runtime. Every sample is a normal self-contained, replay-verifiable run bundle,
  and the completed aggregate binds matrix, content, and base-scenario hashes to
  ordered terminal/checksum evidence and relative constituent-run paths. Aggregate
  publication and validated replacement are rollback-safe; invalid matrices and
  failed samples do not expose a completed sweep. Sweep artifact schema 2 also
  records terminal-result counts in stable byte order and terminal-tick minimum,
  maximum, p50, and p90 metrics. Percentiles use the deterministic nearest-rank
  method over sorted integer ticks. Replacement recomputes these metrics from
  replay-verified constituent evidence and rejects aggregate tampering.
- The pinned authoritative Shuttergate calibration can execute either authored
  Warden placement point through one shared combat, reward, and terminal path.
  The original north-guard reference API and checksum remain stable, while
  unknown or foreign placement IDs are rejected before combat. This is the
  executable prerequisite for the CLI placement sweep axis.
- A strict optional placement axis expands with authored seeds in seed-major,
  placement-minor Cartesian order through `sim sweep`, bounded to 64 total
  samples. Placement sweeps use artifact schema 3, preserve the selected seed
  and placement in every sample, execute each pair through the authoritative
  Shuttergate combat/reward/terminal producer, and bind the complete evidence
  by canonical checksum. Aggregate outcome and nearest-rank terminal-tick
  metrics derive from that evidence. Replacement recompiles the self-contained
  content, reruns every pair, and rejects reordered, foreign, duplicate, or
  tampered identity/evidence. Existing seed-only schema-2 run bundles remain
  unchanged and replay-verifiable.
- An optional versioned target-policy controller axis expands authoritative
  placement sweeps in seed-major, placement-middle, controller-minor order.
  Controller IDs map only to the Iron Warden's already-authored target policies;
  active-ability behavior is not inferred. Controller sweeps use artifact schema
  4, remain bounded to 64 Cartesian samples, bind controller identity and applied
  target policy into canonical evidence, and rerun every sample during validated
  replacement. Existing schema-2 seed and schema-3 seed × placement artifacts
  remain unchanged.
- An optional purchased-build axis expands controller sweeps in seed-major,
  placement-middle, controller-middle, build-minor order. The versioned build
  catalog currently contains the new-campaign Warden and the authored Shield
  Slam rank-1 passive purchase. Schema-5 samples bind build identity, deployed
  maximum health/basic-attack damage, purchased modifier evidence, and the full
  calibration checksum. Validated replacement reconstructs the profile purchase
  and reruns the authoritative deployment/combat/reward/terminal path. The
  Cartesian product remains bounded to 64 samples, and earlier sweep schemas
  remain unchanged.
- A strict versioned attempt-progress reward policy can commit authored Forge Ore
  for defeated-enemy and ordered started-wave evidence. Completed-attempt events
  are normalized and committed in stable reward-ID order; one batch increments
  the profile revision once, while replay is an explicit no-op. Existing profile
  reward ownership is paired with a canonical attempt-reward ledger so a claimed
  ID cannot be replayed with substituted level, attempt, outcome, progress, or
  policy evidence. Ledger/profile disagreement, non-prefix waves, impossible
  partial-wave victories, duplicates, malformed input, and arithmetic overflow
  fail atomically. The immutable nonempty evidence is literal-checksum-pinned
  across Node, Chromium, Firefox, and WebKit. Campaign artifact and save-envelope
  integration of this ledger remain later work.
- A strict versioned Shuttergate attempt request now runs placement, target-policy,
  and purchased-build choices through the authoritative encounter producer and
  derives its completed-attempt reward event directly from terminal battlefield
  evidence. Callers provide only one canonical attempt ID; the producer derives
  its reward ID, level, result, destroyed-enemy count, and ordered started-wave
  prefix. Existing calibration APIs and checksums remain unchanged. The result is
  immutable and its nonempty reward event is literal-checksum-pinned across Node,
  Chromium, Firefox, and WebKit. Multi-attempt campaign policy transitions and
  artifact publication remain the next dependency.

## Not implemented yet

Additional historical save migrations, multi-attempt campaign policy transitions,
catch-up experience, active ability and item-rank behavior, full save scope,
player-facing recycle confirmation, additional build and active-ability controller sweep axes,
additional statistical sweep metrics, campaign/minimization harnesses, and upgraded-build
calibration remain later Phase 4 checkpoints.
