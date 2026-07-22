# Core Progression and Round Structure

## Design intent

Dwarven Depths begins as an intentionally difficult survival game rather than a power fantasy. The player starts with only the **Iron Warden** and is not expected to survive the entire first level. Every attempt must still create useful progress: enemy kills and distance reached award resources and experience, allowing the player to improve the Iron Warden and push farther on the next attempt.

The primary progression loop is:

1. Place the currently available dwarf or dwarves.
2. Enter combat and survive as long as possible.
3. Earn experience and resources from kills and progress, even when the attempt ends in defeat.
4. Improve the current roster between attempts.
5. Defeat an intermediary boss.
6. Gain access to an additional dwarf, with a possible resource cost if balance requires it.
7. Learn and exploit the new character's abilities and synergies.
8. Repeat until every dwarf has been unlocked and the final boss can be challenged.

Failure should feel expected and productive. A failed attempt is successful when it creates a meaningful upgrade, teaches the player about an enemy or encounter, or enables a noticeably deeper push.

## Starting state

- The **Iron Warden is the only initially available character**.
- The round begins with one static placement decision for the Iron Warden.
- The first level must be tuned so a new player is unlikely to clear it without upgrades.
- Early upgrades should create visible improvements in survival time and battlefield control.
- The opening experience should teach placement, ability timing, enemy priorities, and the value of repeated attempts without presenting a full roster at once.

## Level progression and character unlocks

Each level is a sequence of escalating combat waves with intermediary bosses acting as progression gates.

- Enemy kills award experience and one or more spendable resources.
- Reaching new wave or level milestones may award additional resources.
- Defeating an intermediary boss makes the next dwarf available.
- The newly available dwarf may unlock immediately or may require a resource purchase; this remains a balancing decision.
- Every new dwarf expands the tactical possibility space through a unique ability and at least one meaningful synergy with the existing roster.
- The unlock cycle repeats through the final boss, by which point the full intended roster is available.

Bosses therefore serve three purposes:

1. Test mastery of the roster currently available.
2. Mark a clear progression milestone.
3. Introduce the next layer of character and synergy complexity.

## Round flow

### 1. Preparation

At the beginning of a round, the player's primary decision is static character placement.

- Place each available dwarf on a valid battlefield position.
- Placement is locked when combat starts unless a later item or ability explicitly changes that rule.
- Initial scope should avoid movement micromanagement during combat.
- Chokepoints, range, facing or coverage, and synergy proximity should make placement consequential.

### 2. Combat

Dwarves perform their baseline combat behavior automatically. Player attention during a wave should focus on discrete, high-value actions:

- Triggering character abilities at the right moment.
- Using consumable or active items when relevant.
- Responding to wave-specific combat activities or encounter mechanics.
- Choosing whether to pause and apply an available character upgrade after earning sufficient experience.

The combat layer should avoid routine unit movement, basic-attack targeting, or repetitive low-impact input. Player actions should change the outcome of the wave rather than merely increase input frequency.

### 3. Mid-round character upgrade

When a character earns enough experience during combat, the player may trigger that character's upgrade immediately.

- Opening the upgrade choice pauses the game.
- The player can inspect the available choices without time pressure.
- The chosen upgrade applies before combat resumes.
- The pause should preserve encounter state exactly.
- This is the exception to the normal rule that progression choices are resolved after the round.

The exact shape of the choice—automatic stat level, branching perk, or a combination—will be settled during systems design.

### 4. Round resolution

At victory or defeat, combat ends and deferred progression is resolved.

- Confirm earned experience and resources.
- Resolve character level-ups not taken during combat.
- Purchase or select character upgrades.
- Upgrade abilities.
- Upgrade, combine, equip, or manage items.
- Present newly reached milestones and character-unlock opportunities.
- Prepare the next attempt.

The end-of-round flow should make the value of the attempt obvious: what was earned, what can now improve, and how that improvement may help the next push.

## Progression economy principles

- **Kills matter:** defeating enemies always contributes to progression.
- **Distance matters:** reaching farther waves or checkpoints should be rewarded.
- **Defeat retains value:** expected failure must not erase the attempt's meaningful gains.
- **Upgrades change outcomes:** early investment should produce perceptible combat differences, not only small numerical increases.
- **Unlocks add decisions:** a new dwarf should expand strategy rather than simply replace an older character.
- **Grinding has limits:** progression should assist mastery, not make ability timing, placement, and synergy irrelevant.
- **No dead attempts:** even a short attempt should offer information or modest progress, while anti-farming rules can prevent trivial encounters from becoming optimal.

## Initial vertical-slice target

A first playable slice should prove this loop with the smallest useful content set:

- One map with several meaningful Iron Warden placement options.
- Iron Warden baseline auto-combat and one player-triggered ability.
- Several escalating waves with at least two enemy archetypes.
- Kill, wave-progress, resource, and experience rewards.
- Expected player defeat before the full level is cleared on an unupgraded profile.
- A persistent Iron Warden improvement that enables a measurably deeper second attempt.
- A pausing mid-round character-upgrade choice.
- A post-round progression screen for deferred upgrades.
- One intermediary boss.
- A second dwarf becoming available after the boss, with the unlock-cost decision configurable for balancing.

## Decisions still to make

- Whether progression persists across a full campaign, a run, or both.
- Precise meanings and hierarchy of **round**, **wave**, **level**, **attempt**, and **run**.
- Whether mid-round character upgrades are stat increases, branching perks, or both.
- Whether newly available characters unlock immediately or require resources.
- How many waves and intermediary bosses comprise a level.
- What is lost, retained, or converted after defeat.
- How items are acquired and whether they are temporary or persistent.
- Whether the player may defer a mid-round upgrade choice until the post-round screen.
- How enemy scaling limits low-level farming while preserving rewards for partial progress.
