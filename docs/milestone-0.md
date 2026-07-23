# Milestone 0 implementation

The first implementation checkpoint provides a deterministic TypeScript workspace with:

- Stable versioned content and scenario contracts
- Strict content/scenario validation with precise reference paths
- Canonical JSON serialization with SHA-256 content, scenario, state, and event checksums
- A bounded 32-bit integer seed contract and seeded PRNG state
- Minimal level and wave descriptors, with authored-reference validation
- An empty-level deterministic lifecycle reaching victory
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
  --out .ddh/runs/empty
```

Generated run bundles are written beneath `.ddh/` and are ignored by Git. `manifest.json` is written last and marked `complete: true`, so agents can reject interrupted or partially written bundles.

CLI exit codes are `0` for success, `1` for a scenario assertion failure, and `2` for validation, usage, or execution errors. Validation failures include structured issue paths and codes.

`pnpm test:browser` runs directly on hosts with Playwright browser dependencies. `pnpm test:browser:docker` uses the pinned Playwright image and is the portable local parity command used by `pnpm verify`.

## Current boundary

This checkpoint proves the initial Node contract, serializer, content validation, lifecycle, checksums, CLI artifact path, and identical canonical replay hashes in Chromium, Firefox, and WebKit. Richer report files, real map/wave mechanics, persistence, and the interactive agent protocol remain part of the open Milestone 0 implementation.
