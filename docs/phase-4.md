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

## Not implemented yet

Durable file/local-storage profile adapters, encounter reward-event production,
catch-up experience, skill-tree eligibility and selection, Forge Ore purchases,
saves and migrations, recycle transactions, campaign/sweep harnesses, and
upgraded-build calibration remain later Phase 4 checkpoints.
