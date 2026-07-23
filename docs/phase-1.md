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

## Version 1 replay contract

`replay.json` binds:

- content version and manifest hash;
- scenario ID, scenario hash, level ID, seed, and PRNG identity;
- ordered accepted command envelopes with deterministic sequence numbers;
- one terminal checkpoint containing the final-state and cumulative event-stream checksums;
- expected terminal result and terminal tick.

Replay schema version 1 intentionally supports exactly one terminal checkpoint. Terminal state and event artifact mismatches report the first differing canonical JSON path. Intermediate checkpoint capture, seeking, and earlier-tick divergence localization are later Phase 1 slices; accepting but ignoring such checkpoints would create false verification confidence.

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
- `state.final.json` — terminal authoritative state;
- `summary.json` — terminal summary.

The completion manifest remains the final publication signal. Runs are still assembled in a fresh sibling staging directory and atomically renamed into place. Existing destinations require `--replace true` and must be recognizable completed run bundles.

## Verification boundaries

`sim replay --verify` rejects:

- missing, symlinked, malformed, noncanonical, or unlisted artifacts;
- unsupported replay versions, unknown fields, malformed hashes, and invalid command/checkpoint ordering;
- content, scenario, seed, level, command, summary, state, event, or checkpoint mismatches;
- authoritative replay results that differ from the recorded terminal evidence.

`sim replay --verify` executes the validated replay command envelopes directly; scenario commands remain cross-bound metadata and are not the execution source. Node, Chromium, Firefox, and WebKit parse and verify the same checked-in replay fixture through `@dwarven-depths/runtime`. Filesystem and publication behavior remains isolated to the Node CLI.
