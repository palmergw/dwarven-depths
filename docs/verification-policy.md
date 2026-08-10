# Verification execution policy

Dwarven Depths separates fast hosted change detection from long-running local verification. Hosted runner time is not a substitute for choosing the correct checkpoint.

## Standard hosted CI

`.github/workflows/ci.yml` runs only bounded fast checks on non-draft pull requests and `main` pushes:

- hosted-CI policy guard;
- lint and generated-artifact integrity;
- typecheck and build;
- a curated fast contract smoke suite (`pnpm test:ci:fast`);
- web payload budgets;
- compact content/scenario validation.

Every hosted job must declare `timeout-minutes` of 10 or less. Concurrency cancellation stops superseded runs. Standard hosted workflows must not run browser parity, complete verification, packaging containers, campaign/sweep calibration, evidence capture, or release-report generation.

`scripts/check-ci-runtime-policy.mjs` enforces those exclusions across every checked-in workflow. `pnpm check:ci-runtime-policy` runs both locally and in standard CI, so reintroducing a forbidden long command fails before it consumes a full runner job.

## Local checkpoints

### Iteration checkpoint

Run focused changed-scope tests while implementing. Add lint, typecheck, and build when the touched contract requires them. Do not run the complete suite after every correction.

### Exact-head checkpoint

Run exactly once after the immutable draft head has received an independent blockers-only `No blockers` result:

```bash
pnpm verify:local:checkpoint
```

This includes package-contract checks, full unit/component coverage, offline verification, Docker-backed browser parity using `mcr.microsoft.com/playwright:v1.61.1-noble`, content validation, and deterministic scenario replay. `/home/hermes/.hermes/scripts/dwarven_depths_verified_push.py` invokes this command on a clean exact head and verifies remote-head identity before the PR becomes ready.

### Release checkpoint

Run only for a release/packaging boundary, not for every PR:

```bash
pnpm verify:local:release
```

This runs the exact-head checkpoint, generates the release-candidate campaign reports, and builds/smokes the desktop package locally. Evidence must record the exact commit and command result.

## Remote timeout handling

If a fast hosted check times out because of runner/infrastructure behavior, inspect it once and reproduce the equivalent command locally. Two successful local executions on the immutable reviewed head may serve as the operative verification evidence. Preserve the remote URL and timeout conclusion and label the replacement evidence `local exact-head verification`; never report that remote CI passed.

A failure that reproduces locally is a product/gate blocker and cannot be overridden as infrastructure.
