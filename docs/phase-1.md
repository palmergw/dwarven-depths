# Phase 1 deterministic replay foundation

Phase 1 extends the Milestone 0 deterministic runtime with self-contained, independently verifiable run bundles. The first slice implements replay schema version 1 and terminal checkpoint verification.

## Commands

Produce a completed run bundle:

```bash
pnpm sim run \
  --content content/fixtures/empty-content.json \
  --scenario scenarios/conformance/empty-level.json \
  --out .ddh/runs/empty \
  --replace true
```

Replay and verify every protected artifact plus the authoritative result:

```bash
pnpm sim replay --run .ddh/runs/empty --verify
```

A successful verification emits one JSON object with `ok: true` and `verified: true`. Schema or authored-input errors use exit code `2`. Replay or artifact divergence uses exit code `4` with a stable code, expected and actual evidence where available, and the terminal checkpoint tick where applicable.

Inspect an inclusive tick window only after verifying the complete bundle:

```bash
pnpm sim inspect \
  --run .ddh/runs/empty \
  --tick 0 \
  --before 0 \
  --after 0
```

`inspect` emits one JSON object containing revision, content/scenario/replay identity, ordered events, checkpoints, terminal state evidence when present, lifecycle diagnostics, and the versioned timeline records in the requested window. Omitted `--tick`, `--before`, or `--after` values default to zero. Window arguments are canonical nonnegative integers; before/after spans are bounded to 100,000 ticks. Windows with no evidence return empty arrays.

## Version 1 replay contract

`replay.json` binds:

- content version and manifest hash;
- scenario ID, scenario hash, level ID, seed, and PRNG identity;
- ordered accepted command envelopes with deterministic sequence numbers;
- one terminal checkpoint containing the final-state and cumulative event-stream checksums;
- expected terminal result and terminal tick.

Replay schema version 1 intentionally supports exactly one terminal checkpoint. Terminal state and event artifact mismatches report the first differing canonical JSON path. Intermediate checkpoint capture, seeking, and earlier-tick divergence localization are later Phase 1 slices; accepting but ignoring such checkpoints would create false verification confidence.

## Timeline and lifecycle diagnostics

Timeline schema version 1 merges each ordered simulation event with each replay checkpoint by tick and sequence. Diagnostic schema version 1 emits one reason-coded lifecycle record per event, binding a stable diagnostic ID to the event ID, event type, rule ID, tick, and sequence. The shared `@dwarven-depths/runtime` derivation has pinned timeline and diagnostic hashes in Node, Chromium, Firefox, and WebKit. `sim replay --verify` reconstructs both streams from authoritative replay execution and rejects any missing, extra, reordered, or changed record before `inspect` can present it. The compact `empty-level.json` and `nonterminating.json` conformance scenarios cover completed and safety-stopped lifecycle boundaries without introducing gameplay mechanics.

## Stable entity/effect tables

`@dwarven-depths/sim-core` exposes versioned, mechanic-neutral `AuthoritativeTables` primitives before dynamic map or combat state is introduced. Entity IDs use `entity.<kind>.<instance>` and effect IDs use `effect.<kind>.<instance>`. Records are normalized by code-point ID order, copied and frozen at the boundary, and exposed only through immutable snapshots and lookup methods.

Insertion returns a new table and rejects duplicates; each table is bounded to 100,000 records and IDs to 128 characters. Effects require existing source and target entities. Removing an entity deterministically cascades every effect that references it and rebuilds the private effect index; removing an effect leaves the prior table unchanged. The checked-in nonempty fixture `scenarios/conformance/stable-tables.json` has canonical checksum `6ea32a50c655cfe02f6c08ef08c3a742b65f6be310d35b41069ea61595e580ba` in Node, Chromium, Firefox, and WebKit.

## Completed run bundle

The Phase 1 bundle contains:

- `manifest.json` — completion, provenance, versions, bindings, a checksum over its metadata, and the exact file list;
- `content.compiled.json` — strict self-contained content input;
- `content-manifest.json` — content identity summary;
- `scenario.compiled.json` — strict scenario input;
- `replay.json` — versioned replay contract and expected evidence;
- `commands.ndjson` — ordered accepted command envelopes;
- `checkpoints.ndjson` — versioned checkpoint evidence;
- `events.ndjson` — ordered event stream;
- `timeline.ndjson` — versioned event/checkpoint chronology;
- `diagnostics.ndjson` — reason-coded lifecycle evidence;
- `state.final.json` — terminal authoritative state;
- `summary.json` — terminal summary.

The completion manifest remains the final publication signal. Runs are assembled in a fresh sibling staging directory, and new destinations are published with one atomic directory rename. Existing destinations require `--replace true`, must be recognizable completed bundles, and use a validated rollback-safe two-rename replacement; consumers must treat a transiently missing destination as incomplete and retry rather than assuming a completed bundle disappeared permanently. Replacement rechecks the moved directory identity before any backup removal.

## Verification boundaries

`sim replay --verify` rejects:

- missing, symlinked, malformed, noncanonical, or unlisted artifacts;
- unsupported replay versions, unknown fields, malformed hashes, and invalid command/checkpoint ordering;
- content, scenario, seed, level, command, summary, state, event, or checkpoint mismatches;
- authoritative replay results that differ from the recorded terminal evidence.

Replay verification opens the run directory once and resolves every artifact through that stable Linux directory descriptor; final artifact components are opened with `O_NOFOLLOW`. Each artifact is limited to 4 MiB, the aggregate bundle payload to 16 MiB, and each NDJSON stream to 100,000 records before parsing. These bounds turn oversized untrusted evidence into structured replay-divergence errors rather than process-level memory failures.

`sim replay --verify` executes the validated replay command envelopes directly; scenario commands remain cross-bound metadata and are not the execution source. Node, Chromium, Firefox, and WebKit parse and verify the same checked-in replay fixture through `@dwarven-depths/runtime`. Filesystem and publication behavior remains isolated to the Linux Node CLI.
