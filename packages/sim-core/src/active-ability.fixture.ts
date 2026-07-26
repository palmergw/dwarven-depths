import { compileContent } from "@dwarven-depths/content-runtime";
import {
  type BattlefieldState,
  canonicalHash
} from "@dwarven-depths/contracts";
import shuttergateInput from "../../../content/fixtures/phase-3-shuttergate.json" with {
  type: "json"
};
import { resolveActiveAbilityTick } from "./active-ability.js";

export async function shieldSlamCanonicalEvidence() {
  const content = await compileContent(shuttergateInput);
  const character = content.characters.get("character.iron_warden" as never);
  const enemy = content.enemies.get("enemy.goblin_cutter" as never);
  if (character === undefined || enemy === undefined)
    throw new Error("canonical Shield Slam content is missing");
  const battlefield: BattlefieldState = {
    schemaVersion: 1,
    mapId: "map.shuttergate_hall" as never,
    startedWaveIds: [],
    firedSpawnIds: [],
    pendingSpawns: [],
    enemyAdmissions: [],
    occupancy: [
      {
        entityId: "entity.dwarf.warden" as never,
        nodeId: "node.shuttergate_north_guard" as never
      },
      {
        entityId: "entity.enemy.shield_slam_target" as never,
        nodeId: "node.shuttergate_gate" as never
      }
    ],
    pendingCommittedAttacks: [],
    dwarfCombatants: [
      {
        schemaVersion: 1,
        entityId: "entity.dwarf.warden" as never,
        characterDefinitionId: character.id,
        placementPointId: "placement.shuttergate_north_guard" as never,
        currentHealth: character.maximumHealth,
        maximumHealth: character.maximumHealth,
        lifecycleState: "active",
        basicAttack: character.basicAttack,
        actionState: {
          schemaVersion: 1,
          currentTargetEntityId: "entity.enemy.shield_slam_target" as never,
          activeBasicAttack: null,
          cooldownCompleteAtTick: null
        }
      }
    ],
    enemyCombatants: [
      {
        schemaVersion: 1,
        entityId: "entity.enemy.shield_slam_target" as never,
        enemyDefinitionId: enemy.id,
        classification: enemy.classification,
        currentHealth: enemy.maximumHealth,
        maximumHealth: enemy.maximumHealth,
        armor: enemy.armor,
        movementIntervalTicks: enemy.movementIntervalTicks,
        admittedAtTick: 0,
        lifecycleState: "active",
        basicAttack: enemy.basicAttack,
        actionState: {
          schemaVersion: 1,
          nextMovementAtTick: 0,
          currentTargetEntityId: "entity.dwarf.warden" as never,
          activeBasicAttack: {
            schemaVersion: 1,
            attackId: "attack.instance.canonical_interrupted" as never,
            sourceEntityId: "entity.enemy.shield_slam_target" as never,
            targetEntityId: "entity.dwarf.warden" as never,
            startedAtTick: 0,
            commitAtTick: 8,
            impactAtTick: 9,
            cooldownDurationTicks: enemy.basicAttack.cooldownTicks,
            damage: enemy.basicAttack.damage,
            range: enemy.basicAttack.range,
            targetIsValid: true
          },
          cooldownCompleteAtTick: null
        }
      }
    ]
  };
  const command = {
    tick: 0,
    sequence: 0,
    command: {
      atTick: 0,
      type: "activateAbility" as const,
      dwarfEntityId: "entity.dwarf.warden" as never,
      abilityId: "ability.iron_warden.shield_slam" as never
    }
  };
  const committed = resolveActiveAbilityTick(
    {
      schemaVersion: 1,
      currentTick: 0,
      phase: "COMBAT_RUNNING",
      battlefield,
      commands: [command],
      cooldowns: [],
      statuses: [],
      committedAbilities: []
    },
    content
  );
  const impacted = resolveActiveAbilityTick(
    {
      schemaVersion: 1,
      currentTick: 7,
      phase: "COMBAT_RUNNING",
      battlefield,
      commands: [],
      cooldowns: committed.cooldowns,
      statuses: committed.statuses,
      committedAbilities: committed.committedAbilities
    },
    content
  );
  const evidence = Object.freeze({
    schemaVersion: 1 as const,
    contentManifestHash: content.manifestHash,
    commands: Object.freeze([command]),
    activation: committed.activations,
    impact: impacted.impacts,
    cooldowns: impacted.cooldowns,
    statuses: impacted.statuses,
    battlefield: impacted.battlefield
  });
  return Object.freeze({ evidence, checksum: await canonicalHash(evidence) });
}
