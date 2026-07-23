# Technical Design

## Status

**Accepted for the Milestone 0 determinism and renderer spike.** Broader implementation remains conditional on the portability and performance gates in [ADR-0001](adr/0001-typescript-deterministic-core.md). This design implements the contracts in [Technical Design Readiness Rules](technical-design-readiness.md) and makes the headless simulation harness a first-class product surface.

The central architectural rule is:

> The game client presents and commands the simulation; it does not own gameplay truth.

Every balance, progression, targeting, pathing, reward, and combat outcome must be reproducible without rendering the graphical client.

## Architecture decision

Use a **TypeScript monorepo** with:

- A pure deterministic simulation package
- Validated data-authored content
- A Node.js command-line simulation and balance harness
- A browser client using React for accessible DOM UI and Phaser for the rendered battlefield
- Platform adapters for persistence, time, input, audio, and packaging
- PWA/web delivery first, with Tauri desktop and Capacitor mobile packaging evaluated after the browser slice is stable

The simulation package has no dependency on React, Phaser, browser APIs, Node filesystem APIs, wall-clock time, or network services.

### Why this architecture

- TypeScript runs in the browser and in a fast headless Node process.
- Agents can inspect one language across game rules, schemas, tests, CLI tools, and client integration.
- A pure core supports deterministic replay, bulk balance sweeps, progression simulation, and direct unit testing.
- Browser-first delivery covers the initial desktop target while preserving mobile and desktop packaging paths.
- DOM-based menus and HUD provide stronger accessibility and responsive behavior than a canvas-only interface.
- Phaser handles pixel-art rendering, cameras, animation, and pointer mapping without becoming the authoritative game engine.

## Alternatives considered

### Godot

Godot provides an excellent editor, 2D workflow, and broad export support. It was not selected because the required agent-inspectable headless balance harness would either be tied to engine startup and GDScript tooling or require a second external simulation implementation. A Godot client could consume an external simulation, but that adds a cross-language integration boundary without helping the first slice.

### Unity

Unity has mature platform exports and tooling but introduces a heavier editor/runtime/CI workflow, slower headless iteration, and more friction for autonomous agents inspecting and running mechanics. It is disproportionate to the initial deterministic tower-defense-style slice.

### Rust or Bevy

Rust offers strong deterministic and performance properties and can target WebAssembly. It would increase implementation complexity, browser/UI integration work, compile latency, and contributor burden before simulation scale requires it. The core boundaries allow a later measured rewrite if TypeScript profiling proves inadequate.

### Phaser-owned gameplay

Using Phaser scene updates, timers, physics, or display objects as authoritative gameplay was explicitly rejected. Render-frame coupling would weaken deterministic replays, headless execution, platform equivalence, and balance analysis.

## Repository layout

```text
apps/
  web/                    React + Phaser playable client
  sim-cli/                Headless scenario, replay, sweep, and report CLI
  lab/                    Optional later replay, timeline, and balance inspector
packages/
  contracts/              Stable IDs, commands, events, snapshots, replay contracts
  sim-core/               Deterministic fixed-step simulation and systems
  progression/            XP, rewards, unlocks, purchases, replay protection, respec
  runtime/                Deterministic orchestration of combat, progression, and transaction intents
  content-schema/         Schemas, validators, references, canonical compiler
  content-runtime/        Compiled immutable content lookup
  save/                   Save schema, migrations, transaction interface, adapters
  telemetry/              Event reduction, metrics, timelines, explanations
  balance/                Sweep matrices, policy bots, comparisons, calibration rules
  renderer-phaser/        Snapshot/event-to-visual projection only
  ui/                     Accessible React components and game-flow screens
  audio/                  Presentation-only audio adapters
  platform/               Storage, lifecycle, fullscreen, and export interfaces
  test-support/           Fixtures, builders, deterministic clocks, invariant helpers
content/
  src/
    characters/
    enemies/
    abilities/
    items/
    skill-trees/
    levels/
    waves/
    maps/
    rewards/
  schemas/                Generated JSON Schemas
  compiled/               Canonical generated content; never hand-edited
scenarios/
  mechanics/              Small rule-focused scenarios
  regression/             Bug and invariant reproductions
  balance/                Reference balance and progression cases
  campaigns/              Multi-attempt progression scripts
replays/
  fixtures/               Small reviewed replay fixtures only
reports/                  Generated locally; ignored except approved baselines
tests/
  fixtures/               Save, migration, content, and state fixtures
  browser/                Playwright and accessibility flows
  visual/                 Approved rendering snapshots
docs/
  adr/                     Architecture decisions
  mechanics/              Human explanations linked to scenario IDs
```

Generated reports, large sweeps, and arbitrary replay outputs are build artifacts rather than permanent repository content. Small canonical fixtures are committed when they protect a rule or calibration target.

## Package dependency direction

```text
A → B means “A may import B”.

content-runtime → contracts, content-schema
sim-core        → contracts, content-runtime
progression     → contracts, content-runtime
runtime         → contracts, content-runtime, sim-core, progression
telemetry       → contracts, runtime
balance         → contracts, runtime, telemetry
save            → contracts, progression
sim-cli         → contracts, content-runtime, runtime, telemetry, balance, save
web             → contracts, content-runtime, runtime, save, renderer-phaser, ui
renderer-phaser → contracts
ui              → contracts
```

Rules:

- `sim-core` cannot import application, renderer, storage, or UI packages.
- `progression` consumes simulation outcomes and produces persistent transactions; it does not mutate live combat state outside defined commands.
- `runtime` is the shared authoritative coordinator used by CLI and web. It routes semantic commands, applies pure progression decisions, updates the combat build projection, and emits idempotent storage transaction intents without importing a storage adapter.
- `renderer-phaser` receives read-only snapshots and presentation events.
- `ui` dispatches semantic commands and displays projections; it never edits simulation state directly.
- `sim-cli` and `web` use the same runtime, compiled content, simulation, and progression entry points.

## Deterministic simulation model

### Durable rule identifiers

Every non-tunable requirement receives a stable rule ID such as `SIM-EVENT-ORDER-001`, `PATH-NO-OVERLAP-001`, `SAVE-BOSS-ATOMIC-001`, or `A11Y-FOCUS-LOSS-001`.

- Design documents map prose requirements to rule IDs.
- Scenarios, invariants, tests, reports, and CI failures cite those IDs.
- A rule ID is never reused for a different meaning.
- Tunable calibration targets use separate `BAL-*` IDs so changing a target is not confused with changing a rule.

This creates a durable path from design intent to executable evidence and lets agents find every artifact related to one behavior.

### Clock and numeric representation

- Simulation frequency: **30 fixed ticks per second** for the slice.
- Rendering may interpolate at the display frame rate.
- Time, cooldowns, status duration, wave schedules, and attack timing are integer ticks.
- Health, damage, armor, rewards, and XP are integers.
- Movement uses integer fixed-point cell units, initially thousandths of a cell.
- Floating-point values may be used for rendering only, never for authoritative comparisons or checksums.

### State shape

Use normalized deterministic tables rather than a general-purpose engine ECS.

```ts
interface SimulationState {
  schemaVersion: number;
  contentVersion: string;
  tick: number;
  seed: string;
  rngState: RngState;
  phase: CombatPhase;
  activeWaveIds: WaveId[];
  pendingSpawns: SpawnQueueEntry[];
  entities: EntityTables;
  placements: PlacementState;
  statuses: StatusTables;
  cooldowns: CooldownTables;
  pendingEffects: EffectQueue;
  rewards: AttemptRewardLedger;
  pendingUpgrades: PendingUpgrade[];
  terminal?: TerminalResult;
}
```

Entity and effect collections expose stable sorted iteration. JavaScript object insertion order, unordered sets, locale sorting, wall-clock timestamps, and random UUID generation are prohibited in simulation rules.

### Systems pipeline

`step(state, commands, content) -> StepResult` executes the event order defined by the readiness rules:

1. Validate and apply semantic commands.
2. Advance wave schedule and enqueue spawns.
3. Admit queued spawns.
4. Expire statuses and cooldowns.
5. Validate and acquire targets.
6. Plan movement and resolve reservations.
7. Commit attacks and abilities.
8. Apply damage and healing.
9. Mark deaths simultaneously.
10. Resolve bounded death-trigger chains.
11. Grant rewards and unlocks.
12. Evaluate terminal state.
13. Emit canonical events and optional snapshot/checksum.

Each system is a pure function over explicit state and content. Performance-oriented mutation inside a step is permitted only behind an API that preserves deterministic input/output and can be compared against fixtures.

### Commands

The client and harness communicate only through semantic commands.

```ts
type GameCommand =
  | PlaceDwarfCommand
  | SelectRosterCommand
  | ConfirmPreparationCommand
  | ActivateAbilityCommand
  | SetTargetPolicyCommand
  | OpenUpgradeCommand
  | ChooseSkillNodeCommand
  | CloseUpgradeCommand
  | PauseCommand
  | ResumeCommand
  | AbandonAttemptCommand;

interface CommandEnvelope<T extends GameCommand> {
  tick: number;
  sequence: number;
  command: T;
}
```

Screen coordinates are translated into semantic IDs before reaching the simulation. Invalid commands return a reason event and never partially mutate state.

### Events

Events explain what happened and support presentation, telemetry, replay inspection, and assertions.

Representative categories:

- Lifecycle: round started, wave started, final cleanup, victory, defeat
- Spawn and movement: queued, spawned, path selected, blocked, moved
- Targeting: acquired, retained, invalidated, policy changed
- Combat: attack committed, impact, damage, heal, status changed
- Death: downed, destroyed, trigger fired
- Progression: XP owned, Forge Ore owned, level reached, upgrade pending
- Campaign: boss defeated, character unlocked, level completed
- Diagnostics: command rejected, route unavailable, spawn delayed, safety limit reached

Every event contains stable IDs, simulation tick, sequence, relevant before/after values, and a machine-readable reason code. Display prose is derived outside the simulation.

## Pathfinding and movement

- Maps compile to an authored orthogonal graph with stable node and neighbor order.
- Placement points reference graph nodes and explicit adjacency links.
- Path costs use integers.
- The initial pathfinder is deterministic A* or Dijkstra with stable tie-breaking.
- Dwarves and attackable solid deployables are route goals and blockers.
- Enemy movement uses reservation proposals followed by stable entity-ID arbitration.
- Congested enemies wait; they never overlap, swap, push, or bypass.
- Cached paths are invalidated only by explicit topology or occupancy revisions.
- The harness can render the graph, current occupancy, chosen route, rejected routes, and tie-break explanation as text or SVG.

## Combat representation

Content defines attacks and abilities through reusable deterministic effects:

- Damage
- Heal
- Apply or refresh status
- Stagger or interrupt
- Taunt or target-weight modifier
- Spawn deployable
- Area query
- Death trigger
- Reward or unlock trigger, restricted to campaign content

Complex behavior may use a named system extension, but extensions must expose validated inputs, deterministic events, focused scenarios, and serializable state. Arbitrary scripts embedded in content are prohibited for the slice.

## Content architecture

Human-authored content uses YAML for readable diffs and comments. The content compiler:

1. Parses source files.
2. Validates each document against generated JSON Schema.
3. Resolves stable-ID references.
4. Rejects duplicate IDs, unreachable prerequisites, invalid wave timestamps, impossible placement links, and reward-ID reuse.
5. Normalizes units into integer ticks and fixed-point values.
6. Sorts maps and collections canonically.
7. Produces immutable canonical JSON and a content manifest hash.
8. Generates TypeScript ID unions or branded registries where useful.

Validation runs at four levels:

1. Structural schema validation with unknown properties rejected by default.
2. Referential validation over the complete content graph.
3. Semantic validation for routes, cycles, reward budgets, schedules, supported policies, and bounded triggers.
4. Executable content lint that loads every level and runs bounded reference/no-input scenarios to find impossible victory, dead placements, permanent spawn queues, absent final cleanup, and nonterminating effects.

The client and harness consume only compiled content. A source change that does not alter canonical gameplay content should not alter the manifest hash.

### Stable ID examples

```text
character.iron_warden
character.deep_ranger
enemy.goblin_cutter
ability.iron_warden.shield_slam
level.shuttergate_hall
wave.shuttergate_hall.04_gatebreaker
reward.unlock.deep_ranger
placement.shuttergate_hall.center_gate
```

Display names and translations are never identifiers.

## Progression boundary

Combat owns an `AttemptRewardLedger`. Reward events create immutable, idempotent ledger entries with stable claim IDs.

The progression package:

- Applies owned XP and Forge Ore
- Creates pending character levels
- Persists boss unlocks immediately
- Applies first-clear and personal-best rules
- Enforces completed-level replay multipliers
- Purchases ability and item ranks
- Executes full recycle transactions
- Produces a new persistent profile through an atomic transaction interface

The browser implementation stores the local profile in IndexedDB through a versioned adapter. The CLI uses an in-memory adapter or explicit JSON profile file. Storage engines never determine gameplay outcomes.

## Save design

```ts
interface ProfileSave {
  schemaVersion: number;
  contentVersion: string;
  revision: number;
  profileId: string;
  currencies: CurrencyState;
  characters: Record<CharacterId, CharacterProgress>;
  unlockedCharacterIds: CharacterId[];
  levelProgress: Record<LevelId, LevelProgress>;
  claimedRewardIds: RewardClaimId[];
  inventory: InventoryState;
  loadouts: LoadoutState;
  savedPreparations: Record<LevelId, SavedPreparation>;
  settings: SettingsState;
}
```

- Save updates are compare-and-swap transactions over a revision number.
- The durable envelope separately records save schema, content compatibility, simulation/replay protocol, application build, write metadata, payload checksum, and profile revision.
- Reward and unlock transactions are idempotent by claim ID.
- Writes validate first, write a temporary generation, flush where supported, then atomically replace while retaining the previous valid generation.
- A backup of the last known-good revision is retained before migration.
- Migration functions are pure, consecutive, sequential, fixture-tested, and never silently discard unknown IDs.
- Saves validate before migration, after each migration step, and before commit.
- Unsupported newer versions open read-only with a clear error and are never rewritten.
- Mid-combat state is not saved; owned reward claims may commit during combat independently.

## Web client

### React responsibilities

- Level selection and checkpoint screens
- Roster, placement controls, upgrades, results, settings, and respec confirmation
- HUD, ability buttons, targeting policies, combat log, and accessible summaries
- Keyboard focus, reflow, scaling, captions, and reduced-motion controls
- Persistence and application lifecycle integration

### Phaser responsibilities

- Pixel-art map and entities
- Animation, effects, camera, and interpolation between snapshots
- Hit testing that maps pointer/touch input to semantic entity or placement IDs
- Debug overlays for graph nodes, paths, ranges, line of sight, target selection, and entity IDs

Phaser never advances authoritative health, cooldowns, movement, waves, rewards, or AI.

### Simulation host

The browser initially runs the simulation in a Web Worker:

- Keeps rendering and accessible DOM interaction responsive
- Uses structured commands and snapshots
- Allows the same core package to run in Node
- Provides a clean future boundary for profiling or a WebAssembly replacement

A deterministic command queue attaches each command to a simulation tick and sequence. The host owns pause and catch-up policy but may not skip simulation steps.

## Platform delivery

### First target

- Modern desktop browsers
- Installable PWA where supported
- Keyboard and mouse
- Offline local campaign after first load

### Desktop packaging

Evaluate Tauri after the browser slice passes its quality gates. It should wrap the same web build and use a save adapter rather than forking game rules.

### Mobile packaging

Evaluate Capacitor after touch UI and responsive layouts pass browser emulation and real-device testing. Mobile pause/background semantics must abandon transient combat without advancing time.

### Deferred

- Online services
- Cloud saves and profile merging
- Multiplayer
- Controller input
- Native engine rewrite

## Observability

Development builds expose:

- Current tick, phase, seed, content manifest, and state checksum
- Entity inspector with stable IDs and active effects
- Path, occupancy, range, line-of-sight, and target overlays
- Event stream filtering
- Command recording and replay export
- Snapshot export at a selected tick
- Performance counters per system

These facilities use the same contracts as the headless harness and must not change simulation behavior. Telemetry and inspection are read-only observers: changing trace verbosity must not change entity allocation, RNG consumption, iteration order, events, or checksums.

## Initial performance budgets

Performance budgets live in a versioned benchmark manifest and are reviewed against a pinned reference machine rather than uncalibrated hosted-runner timing:

- Fixed simulation step in the vertical-slice stress case: p95 below 2 ms and p99 below 4 ms.
- Headless reference encounter after warm-up: at least 100 times real-time throughput.
- Desktop presentation target: 60 FPS, p95 frame below 16.7 ms and p99 below 33 ms.
- No growth in live listeners, textures, timers, or retained entities after 100 repeated attempts.
- Desktop memory below 512 MB in the slice stress case; mobile receives a stricter measured budget during its spike.
- Initial JavaScript payload target below 350 KiB gzip, using code splitting for renderer and lab tooling where practical.
- Per-level compressed asset target at or below 25 MB until measured quality needs justify review.
- Semantic input command queued within 100 ms at p95 and applied on the next eligible simulation boundary.

Thresholds are initial engineering budgets, not gameplay balance values. CI records runtime and hardware provenance and reports trends before enforcing absolute timing on a new environment.

## Security and integrity boundaries

This is a single-player local game; anti-cheat is not a goal. Integrity priorities are:

- Safe parsing of content, saves, scenarios, and replays
- Bounded entity, spawn, trigger, and report sizes
- No executable code in content files
- Versioned schemas and explicit migrations
- Sanitized report paths and filenames
- No dependence on remote services for local play or tests

## Architecture acceptance criteria

Technical implementation must preserve:

- One simulation implementation used by CLI and client
- Headless execution with no DOM, canvas, audio, or GPU
- Deterministic replay from initial profile, content manifest, seed, and commands
- Canonical events sufficient to explain every material outcome
- Machine-readable reports and human summaries generated from the same event data
- Validated data-authored mechanics and balance values
- Save and reward idempotency
- Render/client code incapable of directly mutating gameplay state
- Platform adapters incapable of changing rule semantics
- Identical ordered authoritative events and final checksums for canonical replays in Node, Chromium, Firefox, and WebKit before substantial UI or content production
