import { resolveDeathTriggers } from "./death-trigger-resolution.js";

const combatants = [
  {
    schemaVersion: 1 as const,
    entityId: "entity.enemy.alpha" as never,
    kind: "enemy" as const,
    currentHealth: 0,
    lifecycleState: "destroyed" as const
  },
  {
    schemaVersion: 1 as const,
    entityId: "entity.enemy.bravo" as never,
    kind: "enemy" as const,
    currentHealth: 6,
    lifecycleState: "active" as const
  },
  {
    schemaVersion: 1 as const,
    entityId: "entity.dwarf.charlie" as never,
    kind: "dwarf" as const,
    currentHealth: 4,
    lifecycleState: "active" as const
  },
  {
    schemaVersion: 1 as const,
    entityId: "entity.deployable.delta" as never,
    kind: "deployable" as const,
    currentHealth: 3,
    lifecycleState: "active" as const
  }
];

const effects = [
  {
    schemaVersion: 1 as const,
    effectId: "effect.alpha.blast" as never,
    ownerEntityId: "entity.enemy.alpha" as never,
    targetEntityId: "entity.enemy.bravo" as never,
    damage: 6
  },
  {
    schemaVersion: 1 as const,
    effectId: "effect.bravo.blast" as never,
    ownerEntityId: "entity.enemy.bravo" as never,
    targetEntityId: "entity.dwarf.charlie" as never,
    damage: 4
  },
  {
    schemaVersion: 1 as const,
    effectId: "effect.charlie.blast" as never,
    ownerEntityId: "entity.dwarf.charlie" as never,
    targetEntityId: "entity.deployable.delta" as never,
    damage: 3
  },
  {
    schemaVersion: 1 as const,
    effectId: "effect.delta.blast" as never,
    ownerEntityId: "entity.deployable.delta" as never,
    targetEntityId: "entity.enemy.alpha" as never,
    damage: 1
  }
];

/** Shared recursive trigger evidence executed unchanged by Node and browsers. */
export function deathTriggerParityEvidence() {
  return resolveDeathTriggers({
    combatants,
    deathEvents: [
      { schemaVersion: 1, entityId: "entity.enemy.alpha" as never }
    ],
    effects,
    recursionLimit: 4
  });
}
