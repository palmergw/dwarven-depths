# Milestone 0 implementation

The first implementation checkpoint provides a deterministic TypeScript workspace with:

- Stable versioned content and scenario contracts
- Strict content/scenario validation with precise reference paths
- Canonical JSON serialization with SHA-256 content, scenario, state, and event checksums
- A bounded 32-bit integer seed contract and seeded PRNG state
- Minimal level and wave descriptors, with authored-reference validation
- An empty-level deterministic lifecycle reaching victory
- Preparation waits without advancing gameplay ticks or PRNG state
- Shared runtime used by the CLI
- Immutable initial progression-profile contract
- Machine-readable validation, assertion, and run output with explicit exit codes

## Commands

```bash
corepack pnpm install
corepack pnpm verify

corepack pnpm sim validate \
  --content content/fixtures/empty-content.json \
  --scenario scenarios/conformance/empty-level.json

corepack pnpm sim run \
  --content content/fixtures/empty-content.json \
  --scenario scenarios/conformance/empty-level.json \
  --out .ddh/runs/empty \
  --replace true
```

Generated run bundles are written beneath `.ddh/` and are ignored by Git. Each bundle is built in a new sibling staging directory and then renamed into place. Existing destinations are rejected unless `--replace true` is provided, and only a directory with a valid Milestone 0 completion manifest is eligible for replacement. Replacement swaps the complete directory without following artifact symlinks or preserving stale files; the current working directory and its ancestors are never eligible. `manifest.json` is created last and marked `complete: true`.

The manifest records repository revision/dirty state, protocol versions, runtime and controller identity, content/scenario hashes, and the seed. `canonical` is true only when the repository revision is known and the tracked/untracked source tree is clean.

CLI exit codes follow the harness contract: `0` success, `1` assertion failure, `2` invalid CLI/schema/content/scenario input, `3` runtime or report-generation failure, and `5` invariant violation or simulation safety stop. Validation failures retain structured issue paths, codes, and related paths.

`pnpm test:browser` runs directly on hosts with Playwright browser dependencies. `pnpm test:browser:docker` uses the pinned Playwright image and is the portable local parity command used by `pnpm verify`.

## Current boundary

This checkpoint proves the initial Node contract, serializer, content validation, lifecycle, checksums, CLI artifact path, and identical canonical replay hashes in Chromium, Firefox, and WebKit. Richer report files, real map/wave mechanics, persistence, and the interactive agent protocol remain part of the open Milestone 0 implementation.
