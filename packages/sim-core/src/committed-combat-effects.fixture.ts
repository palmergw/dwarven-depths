import type {
  ActiveStatus,
  CombatantHealth,
  CommittedHealingEffect,
  CommittedStatusEffect
} from "@dwarven-depths/contracts";
import { resolveCommittedCombatEffects } from "./committed-combat-effects.js";

export const committedCombatEffectStatus: ActiveStatus = {
  schemaVersion: 1,
  statusId: "status.guard" as never,
  ownerEntityId: "entity.dwarf.warden" as never,
  appliedAtTick: 5,
  expiresAtTick: 30,
  magnitude: 8
};

export const committedCombatEffectCombatants: readonly CombatantHealth[] = [
  {
    schemaVersion: 1,
    entityId: "entity.dwarf.warden" as never,
    currentHealth: 17,
    maximumHealth: 20
  },
  {
    schemaVersion: 1,
    entityId: "entity.dwarf.downed" as never,
    currentHealth: 0,
    maximumHealth: 20
  }
];

export const committedHealingEffect: CommittedHealingEffect = {
  schemaVersion: 1,
  effectId: "effect.heal.warden" as never,
  sourceEntityId: "entity.dwarf.cleric" as never,
  targetEntityId: "entity.dwarf.warden" as never,
  committedAtTick: 10,
  impactAtTick: 12,
  healing: 10
};

export const committedStatusEffect: CommittedStatusEffect = {
  schemaVersion: 1,
  effectId: "effect.guard.warden" as never,
  sourceEntityId: "entity.dwarf.cleric" as never,
  targetEntityId: "entity.dwarf.warden" as never,
  committedAtTick: 10,
  impactAtTick: 12,
  statusId: "status.guard" as never,
  durationTicks: 10,
  magnitude: 3
};

export function committedCombatEffectParityEvidence() {
  return resolveCommittedCombatEffects({
    currentTick: 12,
    healingEffects: [
      committedHealingEffect,
      {
        ...committedHealingEffect,
        effectId: "effect.heal.downed" as never,
        targetEntityId: "entity.dwarf.downed" as never,
        healing: 5
      }
    ],
    statusEffects: [committedStatusEffect],
    combatants: committedCombatEffectCombatants,
    statuses: [committedCombatEffectStatus]
  });
}
