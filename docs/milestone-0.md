# Milestone 0 implementation

The first implementation checkpoint provides a deterministic TypeScript workspace with:

- Stable versioned content and scenario contracts
- Strict content/scenario validation with precise paths
- Canonical JSON serialization and SHA-256 checksums
- Seeded integer PRNG state
- An empty-level deterministic lifecycle reaching victory
- Shared runtime used by the CLI
- Machine-readable validation and run output

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

Generated run bundles are written beneath `.ddh/` and are ignored by Git.

`pnpm test:browser` runs directly on hosts with Playwright browser dependencies. `pnpm test:browser:docker` uses the pinned Playwright image and is the portable local parity command used by `pnpm verify`.

## Current boundary

This checkpoint proves the initial Node contract, serializer, content validation, lifecycle, checksums, CLI artifact path, and identical canonical replay hashes in Chromium, Firefox, and WebKit. Richer report files, real map/wave mechanics, persistence, and the interactive agent protocol remain part of the open Milestone 0 implementation.
