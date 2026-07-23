# First-Pass Systems and Content Decisions

This document closes the remaining product-level questions needed before technical design. Values and content remain data-driven for balancing, but the rules below are the default implementation target unless playtesting provides evidence to change them.

## Original setting

The campaign takes place beneath **Emberdelve**, an original ruined mountain kingdom built around public-domain traditions of dwarven smithing, mining, oath keeping, treasure guarding, and subterranean folklore.

The player's roster is the **Stonebound Company**. The company descends through abandoned gates, mines, foundries, halls, bridges, and deep shrines to reclaim the kingdom from goblin clans, cave beasts, trolls, and original fire-and-shadow creatures.

Tolkien-specific place names, languages, character designs, symbols, and creature names will not be used. “Moria” remains an inspiration reference only and is not part of the game's setting or marketing.

## Initial roster and unlock order

The first-pass roster contains six dwarves. The unlock order deliberately introduces one new system at a time.

| Order | Character | Core role | Active ability | First important synergy |
|---|---|---|---|---|
| 1 | **Iron Warden** | Blocking, armor, protection | **Shield Slam:** damages and briefly staggers enemies in a short frontal area | Holds enemies in a lane so ranged and area effects gain time to work |
| 2 | **Deep Ranger** | Long-range priority damage | **Marked Shot:** attacks the highest-priority visible target for heavy damage | Fires safely through lanes held by the Iron Warden and introduces target-priority play |
| 3 | **Rune-smith** | Wards, control, support | **Binding Rune:** marks an area that slows enemies and weakens their attacks | A ward linked to the adjacent Iron Warden gains durability and coverage; marked enemies improve Ranger control |
| 4 | **Emberwright** | Deployables and area denial | **Sentry Forge:** places or repairs an attackable turret on a valid auxiliary point | Turret fire primes enemies for enhanced Ranger shots |
| 5 | **Hearthkeeper** | Sustain and timed buffs | **Rallying Draught:** grants a temporary defensive and attack-speed aura | Extends a blocking formation's survival and accelerates ally effects |
| 6 | **Oathbreaker** | High-risk area damage | **Reckoning:** converts missing health into a powerful melee sweep | Benefits strongly from Warden protection and Hearthkeeper sustain |

**Oathbreaker** is an in-world title for a dwarf seeking redemption rather than a moral alignment. Names and exact abilities remain editable content, but the order of mechanical complexity is intentional.

### Roster capacity

- A level defines how many dwarves may be deployed and which grid points are available.
- Unlocking a dwarf adds a roster option; it does not guarantee that every level permits the full company.
- The player selects the active roster before placement when capacity is lower than the unlocked roster size.
- Benched dwarves retain persistent progression and may receive a configurable reduced catch-up share at resolution, but they do not receive full participation XP.

## Enemy progression

### Initial vertical-slice enemies

| Enemy | Behavior | Tactical lesson |
|---|---|---|
| **Goblin Cutter** | Basic melee unit that approaches and attacks the nearest reachable dwarf | Blocking, attack range, and baseline time-to-defeat |
| **Goblin Slinger** | Stops at range when it has line of sight and attacks a dwarf according to its target rules | Target-priority changes and the limits of a single blocker |
| **Goblin Bulwark** | Slower armored unit that occupies space and causes enemies to queue behind it | Armor response, congestion, and ability timing |
| **Gatebreaker Captain** | Intermediary boss with a heavy telegraphed strike and a rally that accelerates nearby goblins | Interrupt timing, boss focus, and surviving mixed pressure |

Later content may add trolls, burrowing creatures, spiders, armored warbands, corrupted constructs, and original fire-and-shadow enemies. Each new archetype must introduce a behavior, targeting problem, formation pressure, or resistance interaction—not only more health.

### Wave authorship

- Initial waves are deterministic authored content.
- A wave definition owns duration, spawn events, spawn points, enemy definitions, encounter modifiers, and boss references.
- Replaying the same level with the same content version produces the same base wave schedule.
- Seeded variation may later select from authored variants, but uncontrolled procedural wave generation is outside the first slice.
- Enemy stat growth is primarily level-authored; endless or challenge modes may add formulas later.

## Experience and leveling

- XP belongs to individual characters and persists across attempts.
- Combat XP is awarded from a shared participation pool rather than by last hit.
- Every living or downed dwarf deployed in the attempt receives the same base participation share for progress achieved while present; character-specific bonuses may be added later.
- Benched dwarves may receive a configurable reduced catch-up share at round resolution.
- A newly unlocked dwarf starts at a configurable catch-up level so later recruits are immediately usable without matching the leaders automatically.
- A level threshold makes a skill-tree point available immediately.
- The upgrade can be selected through the manually triggered pause or deferred to round resolution.
- XP cannot be lost in the initial campaign rules.

This avoids starving support characters while preserving the importance of roster participation.

## Resources and economy

The vertical slice uses one spendable currency plus character XP. A second, nonfarmable campaign currency may be introduced only after it has a distinct proven use.

### Forge Ore

Common progression currency awarded for:

- Enemy kills
- First-time wave milestones
- Attempt progress
- Level victory

Forge Ore purchases ordinary character, ability, and item upgrades.

### Deferred Runestones

If introduced after the vertical slice, this scarce campaign currency is awarded primarily for:

- First defeat of an intermediary boss
- First level clear
- Explicit campaign milestones

Runestones are not implemented in the vertical slice. If later playtesting establishes a distinct need, they are awarded only by nonrepeatable boss or first-clear milestones and may purchase capstones or final relic tiers. They never gate a character already earned by defeating a boss.

### Replay protection

- The current uncleared level provides full kill, progress, and milestone rewards.
- A completed level provides a reduced share of repeatable Forge Ore and character XP.
- First-clear milestones and Runestones are never repeatable.
- The reduced reward is initially represented as a configurable level-replay multiplier rather than scaling future prices around farming behavior.
- Future upgrade prices are based on intended current-level progression, not on the assumption that players farm older levels.
- A minimum modest reward remains so players may test builds without receiving nothing.

Reducing old-level rewards is preferred over inflating future costs because price inflation also punishes players who do not farm.

## Upgrades

The progression systems have separate purposes.

| System | Earned through | Chosen or purchased | Persistence |
|---|---|---|---|
| Character level | Shared participation XP | Skill point available mid-round or post-round | Permanent until full recycle |
| Skill-tree node | Character level point | Paused upgrade interface | Permanent until full recycle |
| Ability rank | Forge Ore and prerequisites | Post-round | Permanent until full recycle |
| Item unlock | Boss, level, or milestone reward | Post-round inventory | Permanent and retained through recycle |
| Item rank | Forge Ore | Post-round | Permanent |
| Attempt momentum | Consecutive kills or wave performance | Automatic or encounter choice | Ends with the attempt |

Skill trees use authored nodes and prerequisites rather than randomized offers. Randomized upgrades may later appear as attempt-specific momentum choices, keeping permanent builds inspectable and intentional.

## Items

The initial item system favors reusable equipment over consumable inventory management.

- Items are persistently unlocked.
- Each deployed dwarf has one item slot in the initial rules.
- An item is assigned during preparation and cannot be swapped during combat.
- Items may be passive, cooldown-based active, conditional, or death-triggered.
- Active items use the same real-time interaction model as character abilities.
- Items are upgraded with Forge Ore after a round.
- Items do not have expendable inventory quantities in the first implementation.
- Duplicate items, rarity rolls, crafting, and item combination are deferred.

Items are omitted from the minimum playable slice until the core character loop is stable. The first item-system test may use **Powder Cask**, which creates a small explosion when its carrier is downed. This validates persistent loadouts and death triggers without creating a full loot system.

## Attempt-specific systems

Attempt-specific progression is deliberately secondary.

The first candidate is **Momentum**:

- Momentum grows from consecutive kills without a dwarf being downed.
- Configured thresholds grant small temporary synergy improvements.
- Momentum resets when the attempt ends.
- Momentum does not grant permanent currency multipliers, preventing a rich-get-richer farming loop.
- Momentum is deferred until after the vertical slice proves persistent progression.

## Campaign and content scope

The first-pass campaign model uses six authored levels. This is a planning target rather than a commitment to produce all six before validating the vertical slice.

| Level | Working map | Deployment cap | Intermediary or completion reward |
|---|---|---:|---|
| 1 | **Shuttergate Hall** | 1 | Deep Ranger unlock |
| 2 | **Bellows Mines** | 2 | Rune-smith unlock |
| 3 | **Echo Wells** | 2 | Emberwright unlock |
| 4 | **Cinder Foundry** | 3 | Hearthkeeper unlock |
| 5 | **Rootbound Vault** | 4 | Oathbreaker unlock |
| 6 | **The Crownforge** | 4 | Campaign completion and final boss |

- Campaign levels are authored maps connected in fixed first-pass progression.
- Each level may contain one or more intermediary bosses and a final cleanup sequence; the campaign's final level contains the final boss.
- Character unlock gates are attached to specific intermediary boss defeats and cost no additional currency.
- The final campaign boss is attempted only after the intended roster has become available.
- Deployment caps intentionally force roster selection after the company grows.
- The engine and content format must not assume a fixed number of levels, waves, bosses, characters, or placement slots.
- The vertical slice implements only Level 1, one intermediary boss, and the immediate unlock of the Deep Ranger for the next preparation phase.

## Targeting preferences

The first-pass target options are:

- Nearest valid target
- Lowest health
- Highest health
- Highest armor
- Fastest movement
- Boss or elite first

Each ability definition declares which preferences it supports. If a preferred target is invalid or unreachable, the dwarf falls back to nearest valid target using deterministic tie-breaking.

Target preferences may be changed during combat without pausing. The UI must make the current preference and resulting target legible.

## Local balance telemetry

Development and opt-in playtest builds record local structured events for:

- Attempt start, victory, defeat, and duration
- Level, wave, content version, and deterministic seed
- Roster, placement points, items, levels, and skill nodes
- Enemy spawns, kills, leaks in pressure, and survivors at each wave transition
- Damage dealt, damage taken, healing, blocking time, and dwarf-down events
- Ability and item activation timing
- Target-preference changes
- XP and resources awarded
- Upgrade choices and purchases
- Boss phase reached and cause of defeat

No online analytics service is required for the vertical slice. Local exportable telemetry is sufficient for balancing and automated simulation tests.

## Art and content pipeline

- Use an original pixel-art style with a consistent source pixel grid.
- Begin with a **32-pixel terrain grid** so placement, footprints, range, and pathfinding share an understandable authoring unit.
- Characters and larger enemies may exceed one tile visually while retaining explicit logical footprints.
- Gameplay simulation coordinates remain independent from rendered sprite dimensions.
- Maps, waves, characters, abilities, enemies, items, skill trees, and rewards are authored as validated data rather than embedded in combat code.
- Stable content identifiers must survive display-name changes and save migrations.
- The first implementation uses a fixed 16:9 gameplay viewport with responsive surrounding UI; eventual mobile layouts may reposition controls without changing simulation rules.
- Pixel-perfect scaling is preferred where the display permits it, with readable non-pixel UI text allowed when accessibility requires it.

Exact sprite dimensions, animation frame counts, palette, and production tools should be established with an art-pipeline spike after engine selection.

## Accessibility defaults

The technical design must reserve support for:

- Pause outside competitive constraints and adjustable combat speed
- Rebindable keyboard and mouse controls
- Touch-sized controls and non-hover interaction states for future mobile support
- UI and combat-text scaling
- Reduced motion, screen shake, and flashing
- Color-independent status, targeting, and synergy indicators
- High-contrast overlays
- Subtitles and independent audio controls
- Ability queues or generous activation windows where slowdown alone is insufficient

Controller support is intentionally excluded from current scope.

## Vertical-slice acceptance criteria

The slice is successful when it demonstrates, with deterministic content and a persistent save:

- A new profile starts with only the Iron Warden.
- The player chooses one valid placement point and starts the level.
- Continuous timed waves transition without clearing surviving enemies.
- Goblin Cutters and at least one behaviorally distinct enemy navigate, queue, block, target, and attack correctly.
- The Iron Warden automatically selects targets and honors a mid-combat preference change.
- Shield Slam activates in real time and produces a readable tactical result.
- An unupgraded profile normally fails before completing the level under the reference simulation.
- Failure occurs only when the Iron Warden is down.
- Kill and progress rewards persist after returning to the level checkpoint.
- A purchased or selected persistent upgrade produces a measurable deeper push in a reference replay.
- A skill point can be opened while combat is paused or deferred until resolution.
- The intermediary boss can be defeated after sufficient progression and mastery.
- Defeating the boss immediately persists Deep Ranger availability, including if the attempt later ends in defeat.
- Replaying a completed level applies the configured reduced reward and cannot repeat first-clear rewards.
- Save and reload preserve the checkpoint state, boss unlock, build, inventory, and current level.
- Full recycle refunds configured progression, resets build choices, and returns campaign progression to the first level.
- The same content version, inputs, and seed reproduce the same simulation outcome.
- Essential controls remain keyboard-accessible, scalable, color-independent, and usable with reduced motion enabled.

## Decisions that may remain tunable during technical design

- Exact wave durations and spawn counts
- XP thresholds and currency amounts
- Replay reward multiplier
- Skill and item numerical effects
- Character recruitment cost after availability
- Level roster capacity
- Enemy statistics and resistance values
- Optional combat slowdown amount
- Final campaign length
- Final pixel asset dimensions and animation budgets

These values must be externalized and validated, but they do not need final balance before implementation begins.
