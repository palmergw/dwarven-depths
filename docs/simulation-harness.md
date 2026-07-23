# Simulation, Test, and Balance Harness

## Purpose

The harness is the authoritative way for developers and autonomous agents to inspect how Dwarven Depths behaves without interpreting animation or manually operating the graphical client.

It must answer:

- What happened?
- Why did it happen?
- Is the result deterministic?
- Which mechanic or balance value caused the difference?
- Does a persistent upgrade produce meaningful progress?
- Can the intended campaign progression be completed without farming exploits?
- Which placements, policies, abilities, or purchases are effective?
- Did a code or content change alter a protected rule?

The harness uses the exact simulation, content compiler, progression rules, and save migrations used by the playable client.

## Non-negotiable properties

- No renderer, browser, GPU, audio device, or interactive prompt is required.
- Every run is reproducible from committed inputs or a self-contained manifest.
- Every output names the code revision, content manifest, schema versions, seed, scenario, and command policy.
- Behavioral claims cite a run ID and input manifest rather than only prose.
- Reports separate observed facts from derived interpretations.
- A report can be regenerated from the replay and event stream.
- Bulk sweeps never silently replace deterministic single-run evidence.

## CLI surface

The CLI executable is exposed through repository scripts. Command names below are the required interface; implementation flags may be refined without changing their intent.

```bash
# Validate source content, compiled content, references, scenarios, and fixtures
pnpm sim validate

# Execute one scenario and write a complete run bundle
pnpm sim run \
  --scenario scenarios/balance/warden-baseline.yaml \
  --seed 1 \
  --out reports/warden-baseline

# Replay a recorded command stream and verify all checkpoints
pnpm sim replay \
  --replay reports/warden-baseline/replay.json \
  --verify

# Inspect state, events, paths, and reasons near a tick
pnpm sim inspect \
  --run reports/warden-baseline \
  --tick 2700 \
  --before 90 \
  --after 90

# Generate a human-readable causal explanation from canonical events
pnpm sim explain \
  --run reports/warden-baseline \
  --format markdown

# Compare two runs or manifests and attribute material differences
pnpm sim compare \
  --baseline reports/warden-baseline \
  --candidate reports/warden-upgraded

# Sweep placements, builds, seeds, policies, or balance overrides
pnpm sim sweep \
  --matrix scenarios/balance/level-1-progression.matrix.yaml \
  --out reports/level-1-progression

# Execute a sequence of attempts, purchases, and campaign decisions
pnpm sim campaign \
  --scenario scenarios/campaigns/vertical-slice-progression.yaml \
  --out reports/campaign-progression

# Minimize a failing replay or scenario while preserving an assertion failure
pnpm sim minimize \
  --run reports/failing-case \
  --assert invariant.no_overlap

# Render text, JSON, CSV, or optional SVG diagnostics
pnpm sim render \
  --run reports/warden-baseline \
  --at-tick 2700 \
  --layers map,occupancy,path,range,target \
  --format svg
```

All commands support `--json` for automation-friendly terminal output and deterministic exit codes:

- `0`: success
- `1`: scenario executed but an assertion, calibration, or test failed
- `2`: invalid CLI input, schema, content, or scenario
- `3`: runtime or report-generation failure
- `4`: replay or checksum divergence
- `5`: invariant violation or simulation safety stop

Content and scenario tooling also supports canonical compilation and diffing:

```bash
pnpm sim content compile --source content/src --out .ddh/content.json
pnpm sim content diff --left old-content.json --right new-content.json
pnpm sim scenario compile --source scenario.yaml --out scenario.canonical.json
```

### Interactive agent protocol

In addition to batch policies, the CLI exposes a deterministic request-driven JSONL protocol over standard input/output:

```bash
pnpm sim agent serve \
  --scenario scenarios/balance/warden-baseline.yaml \
  --protocol jsonl
```

Representative requests:

```json
{"id":1,"op":"reset","scenarioId":"scenario.balance.warden_baseline","seed":"1"}
{"id":2,"op":"observe","detail":"standard"}
{"id":3,"op":"legalCommands"}
{"id":4,"op":"command","command":{"type":"activateAbility","characterId":"character.iron_warden","abilityId":"ability.iron_warden.shield_slam"}}
{"id":5,"op":"advance","until":{"anyEvent":["wave.started","ability.ready","dwarf.downed"]},"maximumTicks":1800}
{"id":6,"op":"snapshot"}
{"id":7,"op":"finish"}
```

Every response contains the request ID, current tick, lifecycle state, wave state, observation checksum, legal commands or rejection reasons, requested events, and terminal result where applicable. The agent may advance one tick, a fixed tick count, until a named event, until the next command opportunity, or until terminal state. Wall-clock time never advances this protocol.

The protocol exposes the public player-observation contract by default. Explicit oracle/debug mode is labeled noncanonical and cannot contribute to player-balance aggregates.

## Scenario format

Scenarios are human-authored YAML validated against JSON Schema and compiled into canonical JSON before execution.

```yaml
schemaVersion: 1
id: scenario.balance.warden_baseline
description: >-
  New profile, center-gate placement, nearest targeting, and one scripted
  Shield Slam. Expected to fail before victory while retaining progress.
contentVersion: vertical-slice-v1
levelId: level.shuttergate_hall
seed: "1"

profile:
  preset: profile.new_campaign
  overrides: {}

preparation:
  roster:
    - character.iron_warden
  placements:
    character.iron_warden: placement.shuttergate_hall.center_gate
  targetPolicies:
    character.iron_warden: nearest
  loadout: {}

controller:
  type: scripted
  commands:
    - atTick: 720
      type: activateAbility
      characterId: character.iron_warden
      abilityId: ability.iron_warden.shield_slam

capture:
  events: all
  stateEveryTicks: 30
  checksumsEveryTicks: 30
  pathDecisions: true
  targetReasons: true

assert:
  - type: terminalResult
    equals: defeat
  - type: minimumWaveStarted
    waveId: wave.shuttergate_hall.03_bulwark
  - type: maximumWaveStarted
    waveId: wave.shuttergate_hall.05_final_pressure
  - type: invariant
    id: invariant.no_overlap
  - type: persistentDelta
    path: currencies.forge_ore
    greaterThan: 0
```

### Scenario inputs

A scenario may define:

- Content and level IDs
- Seed or seed list
- Starting profile preset and explicit overrides
- Roster, placements, items, skill nodes, and target policies
- A scripted command list or named controller policy
- Optional balance overrides, clearly marked noncanonical
- Capture verbosity
- Expected outcomes, invariants, and metric ranges
- Campaign actions after resolution

Every override appears in the run manifest and explanation. The harness must never present an overridden run as canonical balance evidence.

## Controller policies

Controllers generate semantic commands and are versioned inputs.

Required policies:

- `none`: no active abilities or preference changes
- `scripted`: exact authored commands at exact ticks
- `cooldown`: activates configured abilities whenever valid
- `threshold`: activates based on health, enemy count, boss state, or wave
- `heuristic`: documented deterministic scoring for abilities and targeting
- `recorded`: reuses commands captured from a human play session

Controllers may inspect only the public observation contract available to a player or test policy. They may not read hidden future spawns, RNG state, or private AI intent unless running an explicitly labeled oracle diagnostic.

Each policy emits reason events such as:

```json
{
  "tick": 720,
  "policyId": "controller.threshold.shield_slam.v1",
  "decision": "activate",
  "reasonCode": "enemy_count_in_area_gte",
  "observed": 4,
  "threshold": 3
}
```

## Run bundle

Each run writes a self-contained directory:

```text
reports/<run-id>/
  manifest.json             Exact inputs, versions, hashes, and command
  scenario.compiled.json    Canonical scenario
  content-manifest.json     Content IDs and hashes used
  provenance.json           Runtime, OS, revision, schemas, and build metadata
  profile.before.json       Persistent starting state
  commands.ndjson           Ordered accepted and rejected commands
  events.ndjson             Canonical simulation and progression events
  checkpoints.ndjson        Tick and state checksum pairs
  replay.json               Minimal deterministic replay contract
  profile.after.json        Persistent result after transactions
  state.final.json          Optional inspectable canonical terminal state
  summary.json              Machine-readable outcome and metrics
  invariants.json           Rule-ID keyed invariant results
  metrics.csv               Flat analysis table
  trace.ndjson              Optional decision trace; read-only observer output
  timeline.md               Human-readable chronological account
  explanation.md            Causal summary with event references
  diagnostics/              Optional path, target, and state views
  failures.json             Assertion or invariant failures
```

Large optional snapshots may be compressed and excluded from normal CI artifacts. The replay, event stream, summary, and manifest remain sufficient to reproduce the run.

## Manifest contract

```ts
interface RunManifest {
  harnessVersion: string;
  repositoryRevision: string;
  dirtyWorkingTree: boolean;
  contentManifestHash: string;
  contentVersion: string;
  simSchemaVersion: number;
  saveSchemaVersion: number;
  scenarioId: string;
  scenarioHash: string;
  controllerId: string;
  controllerHash: string;
  seed: string;
  startedBy: "cli" | "ci" | "browser-export";
  runtime: RuntimeProvenance;
  ruleSetVersion: string;
  canonical: boolean;
  overrides: BalanceOverride[];
}
```

A dirty-tree run is valid for local exploration but is marked noncanonical. CI and committed calibration baselines require a clean revision.

## Replay contract

A replay contains only the minimum information needed to reproduce authoritative behavior:

- Replay schema version
- Simulation and content versions
- Initial persistent profile or fixture reference plus hash
- Compiled level and content manifest hash
- Seed and initial RNG state derivation rule
- Preparation choices
- Ordered command envelopes
- Expected checkpoint and final checksums
- Expected terminal and persistent transaction summary

A replay does not contain animation state, frame timestamps, audio, DOM state, or arbitrary snapshots as authoritative input.

`sim replay --verify` fails on the first divergent checkpoint and reports:

- Last matching tick
- First divergent tick
- First differing canonical state path
- Relevant events and commands around the divergence
- RNG position and system name
- Expected and actual checksums

## Canonical state and checksums

- Canonical serialization sorts entities, IDs, effects, statuses, claims, and map keys by stable byte-order rules.
- Presentation-only fields are excluded.
- Each requested checkpoint records a SHA-256 checksum of the canonical state.
- Terminal output also records separate combat-state, reward-ledger, and persistent-profile checksums to localize divergence.
- The serializer itself has golden fixtures and cross-runtime tests in Node and supported browsers.
- Ordered command and event records maintain separate hash chains so a divergence can be localized even when a periodic state checkpoint has not yet been written.
- Normal runs checksum lifecycle boundaries, wave boundaries, boss/reward events, upgrade applications, terminal state, and periodic checkpoints. Per-tick checksums are available for a narrowed debug interval rather than required in every report.
- `trace=off`, `standard`, `decisions`, and `full` must produce identical commands, authoritative events, states, and checksums.

## Event explanation model

Every material event includes a stable reason code and references its causal inputs.

Example:

```json
{
  "eventId": "event.001284",
  "tick": 1812,
  "type": "target.acquired",
  "actorId": "character.iron_warden#1",
  "targetId": "enemy.goblin_bulwark#7",
  "reasonCode": "policy_highest_armor_then_distance",
  "candidates": [
    {"id": "enemy.goblin_cutter#12", "armor": 0, "distance": 1300},
    {"id": "enemy.goblin_bulwark#7", "armor": 20, "distance": 1500}
  ],
  "tieBreak": "not_required"
}
```

The explanation reducer converts canonical events into deterministic prose and tables. It does not ask an LLM to infer missing causality.

An autonomous agent may summarize the report, but claims must cite event IDs, metric paths, or comparison deltas.

## Summary metrics

Every run calculates at least:

### Outcome

- Terminal result and tick
- Highest wave started and completed
- Final cleanup entered
- Boss spawned, phase reached, and defeated
- Living/downed dwarves at termination

### Combat

- Damage dealt and received by source, target, ability, and wave
- Effective and overheal
- Time spent blocked or idle
- Attack and ability count, hit count, interrupt count, and rejected activations
- Cooldown availability and unused-ready time
- Enemy time alive and time queued
- Congestion depth and blocker pressure
- Target-policy selection distribution and retarget count
- Status uptime and synergy uptime

### Progression

- XP and Forge Ore owned by source
- Levels reached and pending choices
- Personal-best and first-clear claims
- Unlocks
- Upgrade affordability before and after
- Reward efficiency by wave and elapsed combat tick

### Pathing

- Path length and recalculation count
- Wait ticks caused by congestion
- Route-opening attacks
- Spawn queue delay
- Unreachable or invalid route diagnostics

### Performance

- Steps executed
- Entities and effects by peak and average
- Time per simulation system
- Allocations or memory where measurable
- Report generation time, kept separate from simulation time

## Comparison reports

`sim compare` aligns two runs by scenario phase, wave, entity archetype, event type, and persistent transaction.

It reports:

- Input differences
- First divergent checkpoint
- First causal event difference
- Outcome and milestone changes
- Damage, survival, congestion, ability, reward, and progression deltas
- Changed content fields reachable from affected mechanics
- Whether differences are expected by an approved calibration rule

Example conclusion structure:

```text
Observed
- Candidate survived to Wave 4 instead of Wave 3.
- Warden received 18% less damage before Tick 1800.
- Shield Slam interrupted 2 Bulwark attacks instead of 0.

Attributed
- skill.iron_warden.slam_interrupt enabled interrupt on armored windups.
- No spawn, path, target-policy, or enemy-stat inputs changed.

Unchanged
- Forge Ore per defeated enemy.
- Boss unlock and first-clear claims.
```

## Sweep matrices

A matrix expands a bounded Cartesian product or sampled set.

```yaml
schemaVersion: 1
id: matrix.balance.level_1_progression
scenario: scenarios/balance/warden-baseline.yaml
axes:
  seed: ["1", "2", "3", "4"]
  placement:
    - placement.shuttergate_hall.center_gate
    - placement.shuttergate_hall.east_step
  build:
    - profile.new_campaign
    - profile.warden.health_1
    - profile.warden.slam_interrupt
  controller:
    - none
    - controller.threshold.shield_slam.v1
aggregate:
  groupBy: [build, placement, controller]
  metrics:
    - terminal.tick
    - highestWave
    - dwarf.iron_warden.damageReceived
    - rewards.forgeOre
```

Sweep reports include distribution summaries, raw sample counts, medians and percentiles, paired deltas, individual outliers, and direct links to every constituent run. Comparisons reuse the same ordered input and seed set on both sides. When confidence intervals are useful, deterministic bootstrap resampling records its own analysis seed. A report never presents an isolated win-rate percentage without its sample count and provenance.

Deterministic authored encounters may use one canonical seed; additional seeds are meaningful only after seeded variation exists, for controller/input exploration, or for testing RNG mechanics. Synthetic, oracle, or fault-injected cases are labeled and excluded from player-balance aggregates by default.

## Campaign progression harness

A campaign scenario models repeated attempts and between-attempt choices.

```yaml
schemaVersion: 1
id: campaign.vertical_slice.reference_progression
initialProfile: profile.new_campaign
policy:
  preparation: policy.best_known_legal_placement.v1
  combat: controller.threshold.shield_slam.v1
  progression: policy.affordable_warden_upgrade.v1
stop:
  whenCharacterUnlocked: character.deep_ranger
  maximumAttempts: 20
assert:
  - firstAttemptResult: defeat
  - eventuallyUnlocks: character.deep_ranger
  - noDuplicateClaims: true
  - noNegativePersistentDelta: true
```

The output shows each attempt, upgrades selected, affordability, personal-best movement, reward sources, and why the policy chose each purchase. It supports questions such as:

- How many attempts does a reference policy need to unlock the Ranger?
- Does a new upgrade improve expected progress?
- Can opening-wave farming outpace deeper attempts?
- Does completed-level replay dominate current-level play?
- Does full recycle preserve and refund exactly the intended state?

A campaign controller is deterministic and explicitly versioned. It is not presented as a model of all human players.

## Test pyramid

### Unit tests

Cover pure functions and boundary semantics:

- Tick arithmetic and fixed-point operations
- RNG sequences
- Canonical serialization
- Range and line-of-sight boundaries
- Armor and damage rounding
- Target scoring and tie-breaking
- Status stacking
- Reward multipliers and claim IDs
- Skill prerequisites and respec refunds
- Save migrations

### System contract tests

Small scenarios protect:

- Wave overlap
- Spawn queuing
- Congestion and route-opening attacks
- Equal-cost path tie-breaking
- Attack commit and target invalidation
- Simultaneous deaths
- Bounded death-trigger recursion
- Boss unlock followed by later defeat
- Pending and deferred upgrades
- Completed-level reward reduction
- Relaunch without reward duplication

### Persistence fault-injection tests

The harness can interrupt a profile transaction before validation, before durable write, after durable write but before acknowledgement, during migration, and during backup replacement. Every injection point verifies:

- The previous valid generation remains recoverable.
- A committed reward or unlock is not lost.
- An uncommitted transaction is not partially visible.
- Retrying the same claim ID is idempotent.
- Unsupported or corrupt data is never overwritten automatically.
- Migration preserves semantics and is idempotent, not merely shape-compatible.

Fixtures cover every historical save schema, unknown and retired IDs, duplicate claims, truncated data, interrupted writes, unsupported newer schemas, and the largest legal profile.

### Golden replay tests

A small reviewed set records exact checkpoints and event summaries for critical mechanics. Goldens change only through an explicit update command that writes a before/after comparison.

```bash
pnpm test:golden
pnpm golden:update --scenario scenario.regression.boss_mutual_death
```

A golden update without a committed explanation file fails review validation.

### Invariant tests

Run on every scenario step:

- No active entities overlap illegally
- No duplicate stable runtime IDs
- Health and cooldown bounds hold
- No downed dwarf acts, blocks, targets, or contributes synergies
- No deployable satisfies the dwarf-survival condition
- No reward claim is applied twice
- No noncanonical ordering source enters a decision
- Spawned plus queued plus resolved enemies reconcile with authored events
- Currency, XP, and inventory do not become invalid
- Terminal state does not return to combat

### Property-based tests

Generate bounded maps, entities, commands, and event combinations to verify:

- Determinism under repeated execution
- Pause insertion invariance
- Serialization round trips
- Stable path tie-breaking
- No overlap under arbitrary congestion
- Reward idempotency under repeated transaction application
- Respec refund conservation
- Save migration idempotency
- Trigger-chain termination

Use a property-testing library such as fast-check with persisted failing seeds and automatic shrinking.

### Metamorphic tests

Verify expected relationships without requiring one exact output:

- Increasing Warden maximum health cannot reduce survival in a no-heal, identical-command scenario unless a threshold mechanic explicitly depends on health percentage.
- Adding a valid damage upgrade cannot reduce direct attack damage.
- Inserting an equivalent pause cannot change combat outcome.
- Renaming display text cannot change checksums.
- Reordering source YAML documents cannot change compiled content or results.
- Rendering at a different frame rate cannot change simulation checksums.

Any legitimate exception is encoded and documented rather than weakening the whole property.

### Balance calibration tests

Calibration tests assert broad intended bands rather than exact event logs:

- New Iron Warden profile fails before full Level 1 victory under the reference policy.
- A first meaningful upgrade advances at least one defined milestone under the same inputs.
- A skillful scripted ability policy outperforms no-input play without making upgrades irrelevant.
- The intermediary boss becomes reachable through intended current-level progression.
- Deep Ranger unlock survives a subsequent defeat.
- Earlier-level replay is less efficient than meaningful current-level progress.

Balance tests report misses as evidence for review. They do not automatically rewrite values.

### Browser integration tests

Playwright tests verify:

- Client and CLI produce matching final checksums for the same replay.
- Placement and target-policy UI dispatch the intended semantic commands.
- Pause and upgrade modals freeze simulation.
- Focus loss pauses and does not resume automatically.
- Keyboard-only and mouse-only flows work.
- UI scaling, reduced motion, enlarged text, and color-independent indicators remain usable.
- Phaser debug overlays correspond to headless state and paths.

### Visual tests

Snapshot only rendering responsibilities:

- Pixel-grid scaling
- Entity/event presentation at selected replay ticks
- Range, path, target, and synergy overlays
- Responsive HUD and modal states

Visual tests never substitute for simulation assertions.

## Calibration baselines

Committed baseline files store ranges and qualitative goals, not opaque hand-tuned snapshots.

```yaml
schemaVersion: 1
scenarioId: scenario.balance.warden_baseline
goals:
  terminalResult: defeat
  highestWave:
    min: wave.shuttergate_hall.03_bulwark
    max: wave.shuttergate_hall.05_final_pressure
  bossDefeated: false
  forgeOre:
    min: 1
rationale:
  - New players should receive useful progression.
  - The first profile should not normally clear the level.
```

Every baseline includes rationale, owner, last-reviewed revision, and linked design rule.

## Agent inspection protocol

An autonomous agent assessing mechanics or balance must:

1. Run `pnpm sim validate`.
2. Identify the canonical scenario or create a small noncanonical scenario with explicit overrides.
3. Execute `sim run` and retain its manifest.
4. Inspect `summary.json`, `timeline.md`, and relevant event slices.
5. Use `sim compare` for any proposed change.
6. Run the relevant campaign or sweep when making progression claims.
7. Cite rule or calibration IDs, scenario ID, seed or sample manifest, content manifest, repository revision, metric paths, event IDs, and sample count where applicable.
8. Separate observations from recommendations.
9. Add or update a focused regression scenario when a behavior is fixed or intentionally changed.
10. Never infer rule correctness from screenshots alone.

Recommended agent-facing response structure:

```text
Revision and inputs
Observed behavior
Causal evidence
Balance/progression interpretation
Risks or uncertainty
Recommended change
Verification scenario
```

## Debugging workflow

When a result is surprising:

1. Re-run the exact replay with verification.
2. Locate the first divergent checksum, not the final symptom.
3. Inspect commands and events around that tick.
4. Render occupancy, paths, ranges, targets, statuses, and reward ledger.
5. Minimize the scenario or replay.
6. Add a failing focused regression.
7. Fix the responsible system or content.
8. Re-run unit, invariant, property, golden, balance, and browser parity gates as applicable.
9. Produce a comparison report and explain intentional baseline changes.

## Harness completion gate

The harness is complete for the vertical slice when it can:

- Reproduce client combat exactly in Node
- Validate every content and scenario reference
- Record and verify deterministic replays
- Detect and localize the first state divergence
- Explain targeting, pathing, damage, death, rewards, and unlocks through reason-coded events
- Run single mechanics scenarios and multi-attempt campaign progression
- Compare builds and balance overrides
- Sweep placements, policies, builds, and supported seeds
- Enforce unit, contract, golden, invariant, property, metamorphic, calibration, browser-parity, accessibility, and visual test layers
- Publish machine-readable and human-readable CI artifacts
- Give an agent enough evidence to describe working mechanics and balance without operating the graphical client
