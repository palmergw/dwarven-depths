# Core Progression and Round Structure

## Design intent

Dwarven Depths is an automated real-time survival roguelite about building a persistent company of specialist dwarves. The player begins with only the **Iron Warden** and is not expected to survive the first level without improving the character over repeated attempts.

Failure is expected but productive. An attempt succeeds when it earns useful progression, teaches an encounter, unlocks a character, or enables a noticeably deeper push on the next attempt.

## Terminology

| Term | Definition |
|---|---|
| **Wave** | A timed segment within a level, characterized by a particular enemy strength, theme, composition, spawn pattern, or encounter rule. Waves transition directly into one another without a preparation recess. |
| **Round** | The accepted preparation-and-combat cycle: place the available roster, begin continuous waves, and continue until complete victory or all dwarves are down. |
| **Level** | One map containing several timed waves, with intermediary or final bosses appearing in designated waves. |
| **Attempt** | One initiation of a round on the current level. |
| **Campaign** | Progression across multiple related levels, including persistent character, item, ability, resource, and unlock state. Some exact persistence and variance remain balance-tunable. |
| **Run** | Reserved for attempt-scoped modifiers such as temporary momentum or synergy growth; it is not a synonym for attempt, round, level, or campaign. |

## Primary loop

1. Enter the current level.
2. Place each available dwarf on a valid grid point.
3. Start the round.
4. Survive continuous timed waves using automatic baseline combat, target priorities, active abilities, items, and encounter-specific actions.
5. Earn character experience and resources from kills and progress.
6. Trigger or defer eligible skill-tree upgrades.
7. Continue until all dwarves are down or the final wave has ended and every remaining enemy is defeated.
8. At defeat or victory, return to the level checkpoint.
9. Apply earned progression and revise placement.
10. Attempt the current level again or advance after victory.

A defeated player restarts the **current level**, not the entire campaign. The main repeat-and-improve loop therefore occurs within each level while remaining connected to campaign-wide progression.

## Starting state

- The Iron Warden is the only initially available character.
- Preparation begins with one static placement decision.
- The first level is tuned so a new profile is unlikely to clear it without upgrades.
- Early upgrades must create visible improvements in survival time or battlefield control.
- The opening teaches placement, ability timing, target priorities, blocking, and productive failure without presenting a full roster at once.

## Checkpoints and persistence

The beginning and end of a level attempt are the primary durable checkpoints.

The following progression persists between attempts:

- Character experience
- Character levels
- Spendable resources
- Character and skill-tree upgrades
- Ability upgrades
- Acquired items
- Character unlocks

A character unlock earned by defeating an intermediary boss persists immediately, even if the player later loses the same attempt. The save system must commit that unlock at the boss-defeat boundary rather than waiting for round resolution.

The current design does not allow an attempt to leave the profile worse off. Negative progression may be reconsidered only as an explicit future challenge or balance feature.

### Earlier-level replay

Completed levels may be replayed, but repeated farming must not become the optimal way to defeat later content. The first-pass economy will use sharply reduced repeat rewards after a level's first clear while preserving modest rewards for experimentation and alternative builds. Exact reward reduction remains data-driven.

### Full recycle and respec

The only planned respec is a **full character-tree or shared upgrade-progression recycle**:

- The player selects either one dwarf's complete skill tree or the complete shared purchased-upgrade track.
- The selected scope refunds exactly its spent skill points or Forge Ore.
- Individual-node refunds are not available.
- Campaign level access resets to the first level, forcing commitment to the rebuilt configuration.
- Character XP and levels, unspent currency, persistent items, claimed one-time rewards, unlocked dwarves, settings, codex entries, and achievements remain.
- Re-clearing campaign access cannot duplicate first-clear, boss, character, or unique-item rewards.
- A destructive confirmation explains exactly what resets and what remains.

The recycle is an explicit player-chosen exception to the rule that ordinary attempts cannot leave the profile worse off.

## Round flow

### 1. Preparation

At the start of an attempt, the player places the available roster.

- Placement uses free selection among fixed, authored grid points.
- Every point must represent valid, accessible terrain.
- One dwarf may occupy a grid point.
- Adjacent dwarves may block movement between them when no traversable gap exists.
- Proximity may enable character-specific synergies.
- Not every level must provide enough valid positions or roster capacity for every unlocked character.
- Placement locks when combat begins.
- There is no repositioning between waves in the initial design.

### 2. Continuous waves

- Each wave has a configured duration and encounter composition.
- Waves transition immediately when their timers expire; the battlefield is not cleared between waves.
- Enemies surviving an expired wave remain active as the next wave begins.
- After the final wave timer expires, no further enemies spawn.
- Victory occurs only after the final wave has expired **and** every remaining enemy is defeated.
- Failure occurs immediately when all placed dwarves are down.

This permits enemy pressure to accumulate when the player's damage or control is insufficient.

### 3. Real-time combat

Baseline combat is automated and runs in real time.

The player's active responsibilities are:

- Triggering character abilities while combat continues.
- Using active or consumable items.
- Editing each dwarf's target preference.
- Responding to wave-specific activities and encounter mechanics.
- Opening an eligible skill-tree upgrade selection.

Normal ability activation does not pause combat. Targeting interactions should remain fast and readable; an optional slowdown mode may be evaluated if playtesting shows that full-speed activation is inaccessible or too demanding.

The design avoids routine movement commands, manual basic attacks, and repetitive low-impact input.

### 4. Mid-round upgrade

When a dwarf reaches a level threshold:

- An upgrade-ready indicator appears.
- The player chooses when to open it.
- Opening the upgrade interface pauses combat and preserves encounter state.
- The player selects from that character's skill tree.
- The upgrade applies before combat resumes.
- The player may defer the choice until later, including the post-round progression screen.
- Leveling does not heal the character by default, although a skill-tree node may explicitly add healing.
- Choices cannot be changed without the full recycle mechanism.

### 5. Round resolution

At victory or defeat:

- Commit earned experience and resources.
- Resolve deferred character levels and skill-tree choices.
- Purchase permanent character or ability upgrades.
- Upgrade, equip, or manage persistent curated items as allowed by the item rules.
- Present boss rewards, character unlocks, milestones, and newly available decisions.
- Return to placement for the next attempt or proceed to the next level.

The results screen must make the value of the attempt obvious: what was earned, what changed, and how those changes could improve the next push.

## Combat rules

### Navigation and blocking

- Enemies move toward living dwarves and may choose among targets when multiple paths are available.
- Enemies cannot pass through dwarves.
- Enemies cannot pass through other enemies.
- Chokepoints and congestion are intentional tactical systems.
- Enemies must defeat a blocking dwarf or find another valid route.
- Path and target choices must be deterministic for the same simulation state, apart from explicitly seeded variation.

### Dwarf behavior

- Dwarves remain on their chosen grid points for the round.
- Dwarves automatically rotate, aim, and select valid targets within their abilities.
- Individual characters may later use restricted arcs or areas, but full rotation is the default first-pass rule.
- Each dwarf has a configurable target preference that may be edited during combat.
- A preference influences valid target selection but does not permit attacks through obstacles or outside range.

### Enemy attacks

An enemy may attack a dwarf when:

- The dwarf is within the enemy's attack range.
- No blocking obstacle invalidates the attack.
- The enemy's attack-specific requirements are met.

### Health, death, and deployables

- At zero health, a dwarf is down for the remainder of the round.
- A downed dwarf stops attacking, using abilities, blocking, and contributing to synergies.
- Death-triggered item or skill effects may resolve at the moment the dwarf is downed.
- Revival is not a default rule and must be introduced explicitly by a future character, ability, or item.
- Deployables such as Engineer turrets occupy their own valid placement footprint.
- Enemies may attack and disable destructible deployables.
- Destroyed deployables stop contributing attacks, blocking, or synergies unless their definition includes a destruction effect.

## Character progression and unlocks

Intermediary bosses are progression gates.

1. Test mastery of the current roster.
2. Persistently unlock access to the next dwarf.
3. Introduce the next layer of tactical and synergy complexity.

A newly available dwarf unlocks immediately and without an additional purchase when the associated intermediary boss is first defeated. The unlock becomes usable at the next preparation phase. This avoids double-gating a milestone the player has already earned.

Not every level must allow the entire roster to be placed. Level-specific placement capacity creates roster-selection decisions as the company grows.

## Enemy progression

- The first enemy is a basic melee goblin.
- A configured wave presents the same enemy count, base strength, timing, and composition when replayed under the same campaign state.
- Later waves may increase health, armor, damage, movement behavior, or introduce additional enemy archetypes.
- New enemy types should add tactical behavior rather than only larger statistics.
- Deliberate seeded variants may be added later, but deterministic authored encounters are the default for initial balance and testing.

## Attempt-specific progression

Persistent progression is the foundation. Limited attempt-specific systems may later include:

- Synergy effects that build through consecutive successful waves.
- Kill streak or momentum bonuses.
- Temporary encounter rewards.
- Items or buffs lasting until the attempt ends.

These systems are not required for the first vertical slice and must not obscure the persistent upgrade loop.

## Product constraints

- Single-player only.
- Eventual targets: web, mobile, and desktop.
- First playable target: desktop browser or desktop build with keyboard and mouse.
- No controller support is planned in the current scope.
- Accessibility requirements include rebindable keyboard/mouse controls, UI scaling, reduced motion and flash options, color-independent indicators, speed or pause accommodations, readable combat text controls, and touch-ready interaction sizing where relevant.
- The setting, creatures, names, symbols, and lore must be original and inspired by public-domain dwarven and subterranean folklore rather than Tolkien-specific intellectual property.

## Initial vertical-slice target

The first playable slice must prove the loop with minimal content:

- One authored map with several meaningful Iron Warden placement points.
- Iron Warden automated combat, target preference control, and one active ability.
- Continuous timed waves beginning with basic melee goblins.
- At least one additional enemy behavior that changes target or ability decisions.
- Enemy congestion and dwarf blocking at a chokepoint.
- Kill, wave-progress, resource, and character-XP rewards.
- Expected defeat before full completion on an unupgraded profile.
- A persistent Iron Warden improvement enabling a measurably deeper later attempt.
- A manually opened, pausing, deferrable skill-tree choice.
- A post-round progression and placement loop.
- One intermediary boss.
- An immediate persistent second-character unlock when that boss is defeated.
- Verified level restart after defeat without losing earned durable progress.

## Balance-tunable decisions

The following should be represented as data rather than hard-coded rules:

- Wave duration, spawn schedule, composition, and stat scaling.
- Level roster capacity and valid placement points.
- Target-priority options.
- XP thresholds and upgrade costs.
- First-clear, replay, kill, progress, and boss rewards.
- Enemy resistances, armor, path preferences, and target scores.
- Skill-tree choices and synergy range categories.
- Item effects, acquisition milestones, and upgrade costs.
- Optional combat slowdown amount.

## Technical-design handoff

Independent systems, balance/content, and technical-readiness reviews have closed the first-pass product rules. Their decisions are recorded in:

- [First-Pass Systems and Content Decisions](first-pass-systems.md)
- [Independent Design Review Synthesis](design-review-synthesis.md)
- [Technical Design Readiness Rules](technical-design-readiness.md)

Technical design can now evaluate engine and platform architecture, simulation boundaries, data schemas, persistence, content tooling, UI composition, testing, packaging, and vertical-slice milestones without inventing missing gameplay semantics.
