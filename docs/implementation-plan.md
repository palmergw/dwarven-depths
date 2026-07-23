# Technical Implementation Plan

## Objective

Build the vertical slice in increments that produce inspectable mechanics before visual polish. The simulation harness precedes the graphical client and remains a release gate throughout development.

## Phase 0: Repository and contracts

### Deliverables

- pnpm workspace and strict TypeScript configuration
- Formatting, linting, type-checking, test, build, and content-validation scripts
- `contracts`, `content-schema`, `content-runtime`, `sim-core`, `progression`, `runtime`, and `sim-cli` packages
- Versioned IDs, command, event, scenario, replay, report, save, and content contracts
- CI with dependency caching and generated-artifact checks

### Verification

- Empty canonical scenario compiles and reaches a defined terminal state
- Node, Chromium, Firefox, and WebKit serialize and replay the same fixture to identical ordered events and checksums
- Invalid and duplicate content IDs fail with precise paths
- Repository scripts are noninteractive and documented

## Phase 1: Deterministic kernel and harness foundation

### Deliverables

- Fixed tick clock and deterministic PRNG
- Canonical serializer and checksums
- Stable entity/effect tables
- Command queue and event stream
- Scenario compiler and `sim run`, `replay`, `inspect`, and `validate`
- Unit, invariant, property, and golden infrastructure
- Run-bundle manifest, summary, timeline, and diagnostics

### Verification

- Repeated execution and inserted equivalent pauses produce identical checksums
- Divergence reporting identifies the first changed state path
- Property tests preserve deterministic ordering and serialization
- A minimal replay is reproducible from a clean checkout

## Phase 2: Map, placement, pathing, and congestion

### Deliverables

- Authored orthogonal navigation graph
- Stable placement, spawn, and adjacency points
- Legal-placement validation
- Deterministic route selection and movement reservations
- Spawn queues and optional live-enemy cap
- Text and SVG map/path/occupancy diagnostics

### Verification

- No overlap, phase-through, swap, push, or nondeterministic tie resolution
- Blocked enemies queue and resume deterministically
- Route-opening blocker attacks work
- Multiple Warden placements produce explainable path differences

## Phase 3: Combat, targeting, waves, and boss

### Deliverables

- Iron Warden, Shield Slam, Goblin Cutter, Goblin Bulwark, Goblin Slinger, and Gatebreaker Captain content
- Target policies and line-of-sight/range rules
- Attacks, armor, statuses, stagger, cooldowns, death, and bounded death triggers
- Five-wave Shuttergate reference schedule with Wave 4 unlock boss
- Final cleanup, victory, and all-dwarves-down failure
- `sim explain` and `sim compare`

### Verification

- System scenarios cover commit timing, target invalidation, boundaries, simultaneous death, and boss persistence
- The unupgraded canonical profile fails before victory
- Ability use changes outcomes through reason-coded events
- Browser-independent simulation remains deterministic under load

## Phase 4: Progression, persistence, and campaign harness

### Deliverables

- Character XP, levels, pending skill nodes, Forge Ore, purchases, and replay protection
- Atomic reward claims and immediate Deep Ranger unlock
- Local profile schema, IndexedDB adapter, JSON harness adapter, migrations, and backup behavior
- Full recycle transaction
- `sim campaign`, `sim sweep`, `sim minimize`, and calibration reports

### Verification

- Productive defeat persists owned progress
- Boss unlock survives subsequent defeat and relaunch
- Claims cannot duplicate under repeated transactions or recovery
- Reference upgrade produces measurable deeper progress
- Completed-level replay is less efficient than current-level progress
- Respec conserves refunds and retained state exactly

## Phase 5: Playable web client

### Deliverables

- React application shell, level/checkpoint, preparation, HUD, upgrade, results, settings, and respec screens
- Phaser map and entity renderer driven by snapshots/events
- Web Worker simulation host
- Keyboard/mouse semantic input and debug overlays
- Audio/presentation adapter stubs
- PWA/offline packaging

### Verification

- Recorded client commands replay identically in CLI
- Client and CLI terminal checksums match
- Renderer frame rate does not alter simulation
- Keyboard-only and mouse-only complete flows pass
- Focus loss, pause, modal restoration, scaling, reduced motion, flashes, contrast, and color-independent indicators pass browser tests

## Phase 6: Vertical-slice calibration and release candidate

### Deliverables

- Approved Level 1 content and balance ranges
- Local telemetry export
- Reference human and policy replays
- Full run/comparison/campaign reports attached to release candidate
- Pixel-art, effects, UI, sound, onboarding, and feedback polish
- Performance and accessibility budgets enforced

### Verification

- Every vertical-slice acceptance criterion has an automated scenario, browser test, or documented manual visual review
- Clean-checkout harness reports explain baseline, first upgrade, boss unlock, replay reduction, and respec
- CI publishes machine-readable and Markdown reports
- No unexplained golden or calibration change
- Web build works offline after initial load

## Phase 7: Packaging evaluation

After the web slice is accepted:

- Evaluate Tauri for desktop packaging
- Evaluate Capacitor for mobile packaging
- Validate storage, background suspension, touch interactions, safe areas, performance, and report export
- Do not fork simulation or progression logic by platform

## Quality gates

### Every pull request

- Formatting and linting
- Strict type check
- Content and scenario validation
- Unit and system tests
- Core invariant and property smoke tests
- Golden replay checks
- Deterministic baseline/candidate scenario report when mechanics change
- Generated files are current
- Lockfile integrity, dependency policy, and production bundle budget

### Main branch

- Full property suite
- Canonical balance and campaign scenarios
- Browser/CLI parity
- Chromium, Firefox, and WebKit replay parity
- Playwright accessibility and interaction suite
- Production web build
- Report artifacts for changed mechanics

### Scheduled or release

- Expanded sweeps and campaign policies
- Cross-browser replay parity
- Performance envelopes
- Save migration corpus
- Visual snapshots across responsive viewports
- Dependency and supply-chain audits

### Published CI evidence

Relevant workflows retain compact machine-readable summaries longer than bulky diagnostics and publish:

- JUnit results and coverage
- Content-validation and rule-ID coverage reports
- Replay/checksum conformance and first-divergence reports
- Balance and progression summaries with baseline diffs
- Performance benchmark JSON with runtime/hardware provenance
- Failing scenarios, minimized replays, browser traces, screenshots, videos, and accessibility reports as applicable
- Save-migration and persistence fault-injection results
- SBOM, dependency/license audit, artifact checksums, and release manifest

Absolute performance gates use the pinned benchmark profile and versioned budgets from `technical-design.md`; hosted runners without calibration provide trends rather than authoritative thresholds.

## Change protocol for mechanics and balance

Every mechanics or balance change must include:

1. The affected design rule or a proposed design amendment.
2. A focused scenario or fixture.
3. Baseline run bundle.
4. Candidate run bundle.
5. `sim compare` output.
6. Updated tests and calibration rationale.
7. Confirmation that progression and anti-farming behavior remain acceptable.
8. Browser parity when presentation or command flow changes.

An agent may propose values from a sweep, but an approved change must remain understandable through committed content diffs and report evidence.

## Initial implementation issues

The first implementation backlog should be cut in this order:

1. Workspace, contracts, and deterministic serializer spike
2. Content schema/compiler and stable IDs
3. Fixed-step core, PRNG, commands, events, and replay
4. Scenario CLI and report bundle
5. Navigation graph, placement legality, and pathing
6. Movement reservations, collision, and congestion
7. Targeting, range, and line of sight
8. Combat, statuses, death, and Shield Slam
9. Timed waves, spawn queue, boss, and terminal rules
10. Progression ledger, profile, rewards, unlocks, and respec
11. Sweep, campaign, comparison, minimization, and explanation tools
12. React/Phaser/Web Worker playable client
13. Browser parity, accessibility, PWA, calibration, and polish

The harness is not a final issue after the game. It becomes useful in the first implementation increments and expands alongside each mechanic.
