# Technical Design Readiness Rules

This document records the deterministic game-rule contracts agreed before architecture selection. Numerical balance remains externalized, but these semantics are implementation requirements for the first vertical slice.

## Readiness status

The product rules are sufficiently closed to begin technical design once this document is treated as authoritative alongside:

- [Core Progression and Round Structure](gameplay-loop.md)
- [First-Pass Systems and Content Decisions](first-pass-systems.md)

Technical design may choose an engine, simulation structure, serialization format, and authoring tools, but it must preserve the contracts below.

## Canonical lifecycle

Top-level states are mutually exclusive:

1. `LEVEL_SELECT_CHECKPOINT`
2. `PREPARATION`
3. `COMBAT_RUNNING`
4. `COMBAT_PAUSED`
5. `UPGRADE_CHOICE_PAUSED`
6. `ROUND_RESOLVING`
7. `RESULTS_PROGRESSION`
8. `RESPEC_CONFIRMATION`

Only `COMBAT_RUNNING` advances gameplay time.

The normal round lifecycle is:

`PREPARATION → COMBAT_RUNNING → ROUND_RESOLVING → RESULTS_PROGRESSION`

Combat proceeds through authored wave timestamps, followed by final cleanup:

`WAVE_1 → WAVE_2 → … → FINAL_WAVE → FINAL_CLEANUP → VICTORY`

Failure may transition from any active wave or final cleanup when death resolution leaves no living dwarves.

## Fixed deterministic simulation

- Gameplay advances on a fixed simulation clock independent of rendering.
- Gameplay durations use integer simulation units rather than platform-dependent floating-point comparisons.
- Animation is presentation only; authored attacks and abilities identify explicit commit and impact times.
- Each attempt records a deterministic seed.
- The same content version, persistent starting state, seed, placement, target policies, and ordered player commands must produce the same result.
- Pausing freezes wave time, movement, AI, attack windups, projectiles, cooldowns, statuses, and deployable lifetimes.
- UI animation may continue while gameplay is paused.
- Background-tab, suspended-app, and lost-window-focus time never advances combat.
- No rule may depend on render frame rate, pointer sampling frequency, localized text, or collection iteration order.

### Same-step event order

Every simulation step resolves in this order:

1. Apply queued player commands.
2. Start authored wave events and enqueue scheduled spawns.
3. Admit queued spawns where valid space exists.
4. Expire statuses and complete cooldowns.
5. Validate or acquire targets.
6. Advance movement and resolve movement reservations.
7. Complete committed attacks and abilities.
8. Apply damage and healing.
9. Mark zero-health entities down or destroyed simultaneously.
10. Resolve death and destruction triggers in stable entity-ID and effect-ID order.
11. Repeat trigger resolution until no new death events remain or the authored safety limit is reached.
12. Grant rewards and persist boss unlocks.
13. Evaluate terminal victory or failure.

If a boss and the final living dwarf die in the same step:

- The boss reward and character unlock persist.
- The round result is defeat because no dwarf remains alive.

A projectile or delayed committed effect survives its source's death unless its definition explicitly marks it as channeled and cancellable.

## Wave and victory semantics

- Wave and spawn timestamps are measured from round combat time; paused time does not count.
- Waves begin at authored timestamps even if earlier enemies remain alive.
- Existing enemies retain their identity and remain active across transitions.
- A boss wave is a normal timed wave containing a boss and creates no recess.
- Boss death triggers its reward but does not end the level while scheduled spawns or hostile entities remain.
- When the final wave duration and spawn schedule have ended, combat enters final cleanup.
- Victory requires every scheduled spawn event to have fired or been admitted from its queue and no living hostile enemy or hostile deployable to remain.
- Failure occurs after death resolution leaves no living deployed dwarf.
- Friendly deployables never satisfy the living-dwarf requirement.
- Fortress durability is not a vertical-slice rule.

### Spawn contention

- Spawn events have stable authored IDs and ordering.
- An occupied spawn entrance queues the enemy off-map rather than overlapping or discarding it.
- Queued enemies prevent victory.
- A level may define a live-enemy cap; when full, pending spawns remain queued while wave time and labels continue.
- Summoned and split enemies use explicit reward budgets so infinite adds cannot generate unlimited progression.

## Battlefield and placement

The authored battlefield defines:

- Walkable navigation cells and ordered connections
- Dwarf placement points
- Deployable attachment points where applicable
- Enemy entrances
- Solid and opaque terrain
- Line-of-sight aim points
- Stable point and region IDs

First-slice rules:

- Placement is free choice among authored valid points, not freeform world coordinates.
- One living dwarf occupies one placement point.
- A deployable either uses its own authored point or an explicit attachment slot.
- Dwarves, enemies, and solid attackable deployables occupy navigation space while active.
- Downed or destroyed entities leave navigation and line-of-sight occupancy immediately after death resolution; corpses do not collide.
- Movement is orthogonal across authored connections; diagonal movement, corner cutting, flying, jumping, pushing, swapping, knockback, and destructible terrain are deferred.
- Adjacency is an explicit authored connection, not visual proximity.
- Direct adjacency is nonrecursive: each valid synergy pair contributes once unless a specific effect says otherwise.
- Synergies recalculate after placement, spawn, deployable creation/destruction, and death resolution.

### Route legality and congestion

- An enemy routes toward an attack-valid position for a living dwarf, not through that dwarf.
- A formation may intentionally create a wall because enemies can approach and attack the route-opening dwarf.
- Placement confirmation is rejected only when static terrain and authored connectivity leave an entrance with no possible attack route to any placed dwarf.
- Enemies cannot overlap, pass through, swap, or push other enemies.
- A blocked enemy waits and retries.
- The front enemy attacks the blocking dwarf or attackable deployable when doing so opens the intended route.
- Movement reservation conflicts resolve by stable enemy entity ID.
- Equal-cost path choices use authored neighbor order.

## Target selection

### Enemy targeting

A basic enemy selects in this order:

1. A reachable living dwarf or route-opening attackable blocker
2. Archetype-specific preference
3. Lowest path cost
4. Lowest stable placement-point ID
5. Lowest stable entity ID

Basic goblins prefer the nearest reachable dwarf. Later archetypes may use explicit tags such as `prefers_ranged`, `prefers_low_health`, or `attacks_deployables`.

### Dwarf targeting

The first-pass player-facing policies are:

- Nearest
- Lowest health
- Highest health
- Highest armor
- Fastest
- Boss or elite first

A character or ability declares which policies it supports.

- Policy changes do not pause combat.
- A change applies at the next target acquisition and does not cancel a committed attack.
- A target remains locked until dead, invalid, out of range, or outside line of sight.
- Unsupported or impossible preferences fall back to nearest valid target.
- Universal ties resolve by distance and then stable entity ID.
- Dwarves rotate instantly for gameplay; rotation animation is cosmetic.
- Directional attack arcs are deferred unless introduced later as an explicit character mechanic.

## Range, line of sight, and attacks

- Melee attacks require authored melee adjacency or range.
- Ranged attacks require both range and line of sight.
- Range is measured between authored point centers using one documented metric; equality counts as in range.
- Opaque terrain blocks line of sight.
- Units do not block line of sight in the vertical slice.
- Touching an opaque boundary counts as blocked.
- Elevation may affect presentation but has no gameplay modifier in the slice.
- There is no friendly fire, random miss chance, critical hit, evasion, or random damage variance in the slice.
- If a target becomes invalid before the attack's commit point, the attack cancels and reacquires normally.
- Default cooldown starts only when an attack or ability commits.

## Damage, statuses, death, and deployables

- Health, damage, armor, healing, and status magnitudes use deterministic integer values.
- Damage cannot reduce health below zero; healing cannot exceed maximum health.
- Area boundaries are inclusive.
- Identical status IDs do not stack by default; reapplication refreshes duration and retains the stronger magnitude.
- Different status IDs stack in a documented stable order.
- A dwarf at zero health is down for the remainder of the round.
- A downed dwarf stops attacking, receiving commands, blocking, being targeted, and contributing synergies.
- Revival and healing of downed dwarves are excluded from the slice.
- A death-trigger effect may execute once per owning entity death unless explicitly authored otherwise.
- Trigger recursion has an authored safety limit and deterministic order.
- Attackable deployables define health, faction, footprint, targetability, and lifetime.
- Deployables disappear when destroyed or at round end and are never persistent battlefield entities.
- Deployables do not count as dwarves for victory or failure.

## XP and pending upgrades

- XP is character-specific and persistent.
- Encounter XP is granted to every dwarf selected for the attempt, including a dwarf downed earlier in that attempt; it is never assigned by killing blow.
- Benched dwarves may receive a configurable reduced catch-up share at round resolution.
- A newly unlocked character begins at a configurable catch-up level relative to the existing roster.
- Crossing each level threshold creates one ordered pending skill-tree point.
- Multiple thresholds create multiple ordered pending choices.
- No level automatically opens a modal.
- Pending choices do not block further XP gain.
- A living dwarf's pending choice may be opened during combat; a downed dwarf resolves it after the round.
- Opening the upgrade screen pauses gameplay exactly.
- Closing the screen defers the choice without penalty.
- The authored skill tree provides deterministic eligible nodes; closing and reopening does not reroll them.
- Confirming a node persists and applies it before gameplay resumes.
- Maximum-health increases preserve missing health rather than providing a default heal.
- Cooldown changes affect future cooldown starts, not an already running cooldown.
- Damage and range changes affect attacks not yet committed.

## Reward and save contract

### Ownership and commitment

- The checkpoint is the player-facing place for spending and preparation; reward ownership may commit during combat for crash safety.
- Kill XP and Forge Ore become owned when the authoritative reward event resolves.
- Boss unlocks and one-time boss rewards commit atomically when the boss death event resolves.
- Wave milestones and personal-best rewards commit when their milestone event resolves.
- Victory commits completed-level state, next-level access, and first-clear rewards.
- Defeat never removes owned XP, levels, currency, upgrades, unlocked characters, or persistent items.
- Explicitly abandoning a round returns to preparation and retains already owned rewards.
- Relaunch during combat abandons transient combat and returns to preparation without duplicating owned rewards.
- Stable claimed-reward IDs prevent duplicate boss, milestone, first-clear, and unique-item grants.

### Save scope

The vertical slice uses one local profile and does not support mid-combat resume.

Persist:

- Save schema and content version
- Currency balances
- Per-character XP, levels, and pending/selected skill nodes
- Purchased ability and item upgrades
- Unlocked characters and levels
- Completed levels and personal-best milestones
- Claimed one-time reward IDs
- Persistent item inventory and loadouts
- Last selected level
- Saved placement and targeting preferences
- Settings and accessibility preferences

Do not persist live enemies, projectiles, current health, cooldowns, wave timers, deployables, streaks, temporary synergies, or open pause menus.

Every character, enemy, level, wave, placement point, item, skill node, reward, and content version uses a stable nonlocalized ID. Retired IDs remain inert during migration rather than being reassigned. Unsupported newer or corrupt saves fail safely without overwriting recoverable data.

## Replay protection

- The highest unlocked uncleared level grants full configured rewards on every attempt so a stuck player can progress.
- Completed earlier levels grant a configurable reduced share of kill XP and Forge Ore.
- Completed levels cannot repeat personal-best, boss, first-clear, unique-item, or future Runestone rewards.
- Personal-best milestones make deeper progress more efficient than repeatedly farming an opening wave.
- Summoned, split, and boss-generated enemies have capped reward budgets.
- Reward calculations permit zero rather than forcing a minimum grant that can be exploited.
- Upgrade costs are balanced around progression in the current level, not assumed farming.

## Respec contract

A respec is the only explicit opt-in exception to the no-negative-progression rule.

- The player chooses either one dwarf's complete skill tree or the shared purchased-upgrade progression to recycle.
- The selected scope refunds exactly the associated spendable points or currency.
- Partial node refunds are not allowed.
- Campaign access resets to the first level.
- Character XP and levels, currency not spent in the selected scope, persistent items, codex entries, achievements, settings, claimed first-clear rewards, and permanently unlocked dwarves remain.
- Re-clearing reset campaign access does not duplicate claimed rewards.
- A destructive confirmation explains exactly what resets, what remains, and that campaign access returns to the first level.

## Input, pause, and modal behavior

- Ability activation accepts one semantic command per discrete press, click, or tap; keyboard repeat is ignored.
- Invalid, cooling-down, or downed-character abilities remain visible with a reason and consume no cooldown.
- Simultaneous valid commands are ordered by simulation timestamp and input sequence number.
- Manual pause and upgrade pause are distinct.
- Opening an upgrade remembers whether combat was running or manually paused and returns to that prior state when closed.
- Target preferences may be edited while combat is running or manually paused, but not beneath another modal.
- Combat input is ignored after terminal-state evaluation begins.
- Window focus loss pauses desktop play and returning focus never automatically resumes it.
- Escape closes the top modal; with no modal, it pauses or unpauses combat.
- Pointer and keyboard activate the same semantic actions.
- UI behavior does not require hover or right-click.
- Modal focus is contained and restored to the invoking control when closed.

## Multi-platform and accessibility contract

Desktop keyboard and mouse are the first delivery target, but game actions are semantic commands that can later be invoked by touch.

The design must support:

- Complete keyboard operation and remapping
- Mouse-only operation
- Pause and configurable combat-speed accommodations
- UI and text scaling with responsive reflow
- Color-independent status, targeting, synergy, and range indicators
- Reduced motion, reduced flashes, adjustable screen shake, and effect-opacity controls
- Independent master, music, ambient, combat, voice, and UI audio controls as content requires
- Subtitles or captions for spoken and mechanically important audio cues
- Toggle/hold alternatives and no rapid-click requirements
- Visible focus, logical focus order, and touch-sized eventual controls
- Tooltips available through focus and tap, not hover alone

Controller support is explicitly outside the current scope. Pixel-art scaling never determines gameplay coordinates or hit detection.

## Vertical-slice reference encounter

The first balance target uses one authored map and five short timed waves:

- Wave 1 teaches basic Goblin Cutter blocking.
- Wave 2 adds pressure from a second entrance.
- Wave 3 introduces an armored Goblin Bulwark.
- Wave 4 introduces the intermediary Gatebreaker Captain and a mixed escort.
- Wave 5 continues pressure after the unlock boss wave, allowing immediate-unlock persistence to be tested even if the player later loses.
- Final cleanup begins after Wave 5's last spawn event.

Exact duration, counts, and statistics remain balance data. The reference target is approximately thirty seconds per wave for early testing, not a fixed campaign-wide rule.

## Vertical-slice verification gate

Technical implementation is not considered complete until automated or instrumented tests demonstrate:

### Determinism

- Repeated replays with identical content, save, seed, placement, target policy, and command list produce identical spawn, path, target, damage, death, reward, and final-checksum results.
- Render frame rate and equivalent inserted pauses do not change the outcome.
- Simultaneous boss and last-dwarf death persists the Deep Ranger unlock and records defeat.

### Waves and combat

- Timed waves overlap when earlier enemies survive.
- Boss death does not end scheduled combat.
- Victory requires the final spawn and every hostile to be resolved.
- Failure occurs only after no deployed dwarf remains alive.
- Target-policy edits affect the next acquisition without cancelling a committed attack.
- Range and line-of-sight boundaries are covered explicitly.

### Placement and pathfinding

- Multiple legal Warden placements produce meaningfully different outcomes.
- Invalid static-route placement is rejected with an understandable reason.
- Enemies never overlap, phase through, swap, or use nondeterministic equal-cost routes.
- Congestion clears deterministically when a front unit or blocking dwarf is removed.

### Progression and saves

- An unupgraded reference profile normally fails before victory.
- A specified persistent upgrade creates a measurable deeper result under the reference setup.
- Owned rewards and boss unlocks survive defeat and relaunch without duplication.
- Pending upgrades pause, defer, apply, and persist according to contract.
- Deep Ranger availability persists immediately after the boss death and becomes usable only at the next preparation.
- Replaying a completed level applies reduced repeat rewards and never duplicates one-time rewards.
- Full recycle refunds the selected scope, resets campaign access, preserves declared retained state, and cannot duplicate clear rewards.
- Save migration preserves stable IDs; corrupt or unsupported saves fail safely.

### Input and accessibility

- The round is operable with keyboard only and mouse only.
- Critical information and actions require neither hover nor color perception.
- Focus loss pauses and does not auto-resume.
- Key repeat cannot trigger an ability twice.
- Enlarged text, reduced motion, reduced flashes, and minimum supported viewport retain access to every required action.
- Every action has a future touch-equivalent semantic command.
