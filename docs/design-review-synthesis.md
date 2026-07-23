# Independent Design Review Synthesis

Three independent reviews examined the accepted product direction through combat/progression, balance/content, and technical-readiness lenses. This document records how conflicting recommendations were resolved.

## Decisions adopted

### Deep Ranger is the first unlock

Reviewers agreed the second character should introduce a clear new decision without immediately requiring several support systems. The Deep Ranger was selected before the Rune-smith because the Warden already demonstrates blocking, while the Ranger immediately makes target-priority editing, range, line of sight, and protected back-line damage meaningful.

The resulting teaching order is:

1. Iron Warden
2. Deep Ranger
3. Rune-smith
4. Emberwright
5. Hearthkeeper
6. Oathbreaker

### Boss-gated characters unlock without a purchase

The earlier possibility of making a boss-earned character available but still requiring a resource payment was rejected for the first campaign. It double-gated a major milestone and could create a mandatory farming pause. The unlock commits immediately on boss death and becomes deployable during the next preparation phase.

### One spendable currency in the vertical slice

Reviews differed between a one-currency and two-currency economy. The resolved direction is:

- Character-specific XP for levels and skill-tree points
- Forge Ore for ordinary purchases
- No Runestones in the vertical slice
- Runestones may be added later only as nonrepeatable mastery currency with a distinct use, never as payment for an already earned character

This preserves the concept-art direction without committing implementation to an unnecessary second grind.

### Full rewards on the current level; reduced completed-level rewards

The highest unlocked uncleared level must continue awarding full configured rewards so a stuck player can progress through the intended loop. Completed earlier levels grant a reduced, configurable share of repeatable XP and Forge Ore and never repeat boss, first-clear, unique-item, or future Runestone rewards.

Deeper progress and personal-best milestones carry most of the value, making repeated opening-wave farming inefficient without punishing legitimate failure.

### Shared participation XP

XP is character-specific but is not allocated by killing blow. Every dwarf selected for the attempt receives the encounter award, including one downed earlier in the attempt. Benched dwarves may receive a reduced catch-up share, and new unlocks may start near the roster's progression level.

This prevents automated last-hit behavior from starving blockers and support characters.

### Persistent curated items, deferred from the minimum slice

Random affixes, crafting fragments, consumable stacks, durability, and loot rarity were rejected. The intended item system uses a small persistent catalogue, one slot per deployed dwarf, deterministic acquisition, and Forge Ore upgrades. Items are not required to prove the minimum vertical slice.

### Attempt Momentum is deferred

A team-wide momentum or temporary synergy-growth system remains a future candidate. Killing-blow streaks were rejected because they distort automated party play and disadvantage support roles. Attempt-scoped progression will not be added until placement, abilities, targeting, and permanent progression are proven.

### Deterministic authored encounters come first

Initial waves, spawns, enemy statistics, and bosses are authored and deterministic. Seeded variants may be introduced later. Adaptive stat scaling, uncontrolled procedural waves, random misses, crits, and random damage are excluded from the slice so balance and repeatability can be measured reliably.

### Six-level campaign model, one-level implementation target

A six-level model provides a coherent unlock sequence and final full-roster test, but it is not an instruction to produce six levels before validating the game. Technical design and content formats must remain cardinality-independent. Implementation begins with one map, five short waves, one intermediary boss, and the Ranger unlock.

### Respec retains earned identity and prevents reward duplication

A full recycle may reset one dwarf's whole skill tree or the complete shared purchased-upgrade track. It refunds that scope and resets campaign access to Level 1, but preserves XP, character levels, persistent items, claimed rewards, and unlocked dwarves. Re-clearing campaign access cannot duplicate first-clear rewards.

This makes the choice consequential without erasing playtime or contradicting the permanence of a boss unlock.

## Technical rules closed by the review

The readiness review established mandatory contracts for:

- Fixed-step deterministic simulation
- Stable same-step event ordering
- Wave overlap and final cleanup
- Simultaneous boss and last-dwarf death
- Spawn queues and live-enemy caps
- Solid collision, path ties, congestion, and route-opening attacks
- Downed-unit occupancy and deployable loss semantics
- Target acquisition, preference changes, line of sight, and range boundaries
- Status stacking and death-trigger ordering
- Pending mid-round upgrades and nonretroactive stat effects
- Reward ownership, save atomicity, stable content IDs, and migration safety
- Pause, focus loss, modal priority, keyboard repeat, and future touch commands
- Deterministic replay and vertical-slice acceptance tests

These are detailed in [Technical Design Readiness Rules](technical-design-readiness.md).

## Options explicitly deferred or rejected for the first slice

- Fortress durability as a second loss condition
- Character movement or repositioning between waves
- Directional facing and restricted firing arcs
- Mid-combat save and resume
- Revivals
- Enemy pushing, swapping, jumping, flying, and knockback
- Friendly fire
- Random misses, critical hits, or random damage
- Procedurally rolled items
- Consumable inventory quantities
- Adaptive difficulty based on player performance
- Controller support
- Online analytics or cloud save synchronization

These may be revisited after the reference loop is playable and measurable, but technical design should not quietly assume them.
