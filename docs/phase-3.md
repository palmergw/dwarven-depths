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

## Not implemented yet

Authored range and line-of-sight geometry, candidate filtering, enemy target
acquisition, target locking, attack commitment, damage, armor, cooldowns,
statuses, death resolution, authored spawn schedules, boss behavior, and combat
event integration remain later Phase 3 checkpoints.
