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

## Not implemented yet

Additional historical save migrations, encounter reward-event production,
catch-up experience, purchased-upgrade effect application, full save scope,
player-facing recycle confirmation, campaign/sweep harnesses, and upgraded-build
calibration remain later Phase 4 checkpoints.
