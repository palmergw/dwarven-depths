import { resolveCommittedAttackImpacts } from "./committed-attack-impact.js";

const combatant = {
  schemaVersion: 1 as const,
  entityId: "entity.enemy.cutter" as never,
  currentHealth: 20,
  maximumHealth: 20
};

const attack = {
  schemaVersion: 1 as const,
  attackId: "attack.warden.basic" as never,
  sourceEntityId: "entity.dwarf.warden" as never,
  targetEntityId: "entity.enemy.cutter" as never,
  committedAtTick: 12,
  impactAtTick: 15,
  cooldownCompleteAtTick: 42,
  damage: 12,
  range: 1_000
};

/** Shared golden evidence executed unchanged by Node and every browser engine. */
export function committedAttackImpactParityEvidence() {
  return Object.freeze([
    resolveCommittedAttackImpacts({
      currentTick: 14,
      attacks: [attack],
      combatants: [combatant]
    }),
    resolveCommittedAttackImpacts({
      currentTick: 15,
      attacks: [attack],
      combatants: []
    }),
    resolveCommittedAttackImpacts({
      currentTick: 15,
      attacks: [
        { ...attack, attackId: "attack.zulu" as never, damage: 13 },
        { ...attack, attackId: "attack.alpha" as never, damage: 11 }
      ],
      combatants: [combatant]
    })
  ]);
}
