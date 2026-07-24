import { compileContent } from "@dwarven-depths/content-runtime";
import type {
  BattlefieldEnemyCombatant,
  BattlefieldState,
  ContentBundle
} from "@dwarven-depths/contracts";
import conformanceContent from "../../../content/fixtures/conformance-map.json" with {
  type: "json"
};
import referenceCombatants from "../../../content/fixtures/phase-3-reference-combatants.json" with {
  type: "json"
};
import {
  createBattlefieldDwarfDeploymentAuthority,
  createInitialState,
  deployBattlefieldDwarves,
  resolveBattlefieldAttackImpacts,
  resolveEnemyActionPhase
} from "./index.js";

const authoredWarden = referenceCombatants.definitions.find(
  (definition) => definition.id === "character.iron_warden"
);
if (authoredWarden?.kind !== "character")
  throw new Error("missing authored Warden fixture");

const contentInput = {
  ...conformanceContent,
  definitions: [
    ...conformanceContent.definitions.map((definition) =>
      definition.kind === "level"
        ? { ...definition, waveIds: ["wave.attack_impact"] }
        : definition
    ),
    ...referenceCombatants.definitions
      .filter(
        (definition) =>
          definition.id === "character.iron_warden" ||
          definition.id === "enemy.goblin_cutter"
      )
      .map((definition) =>
        definition.id === "character.iron_warden"
          ? { ...definition, maximumHealth: 10 }
          : definition
      ),
    {
      ...authoredWarden,
      id: "character.substitute",
      maximumHealth: 999,
      basicAttack: { ...authoredWarden.basicAttack, id: "attack.substitute" }
    },
    {
      kind: "wave",
      id: "wave.attack_impact",
      startAtTick: 0,
      durationTicks: 100,
      spawnEvents: [
        {
          id: "spawn.attack_impact.cutter",
          authoredOrder: 0,
          atTick: 0,
          entityId: "entity.enemy.cutter",
          enemyDefinitionId: "enemy.goblin_cutter",
          entranceId: "entrance.west"
        }
      ]
    }
  ]
};

export async function battlefieldAttackImpactParityEvidence() {
  const content = await compileContent(
    contentInput as unknown as ContentBundle
  );
  const initial = createInitialState(
    content,
    "level.conformance_map" as never,
    "1"
  );
  if (initial.battlefield === undefined) throw new Error("missing battlefield");
  const deployments = Object.freeze([
    Object.freeze({
      entityId: "entity.dwarf.warden" as never,
      characterDefinitionId: "character.iron_warden" as never,
      placementPointId: "placement.goal" as never
    })
  ]);
  const deploymentAuthority = createBattlefieldDwarfDeploymentAuthority(
    deployments,
    initial.battlefield.mapId,
    content
  );
  const deployed = deployBattlefieldDwarves(
    initial.battlefield,
    deploymentAuthority,
    content
  );
  const cutterDefinition = content.enemies.get("enemy.goblin_cutter" as never);
  if (cutterDefinition === undefined)
    throw new Error("missing cutter definition");
  const cutter: BattlefieldEnemyCombatant = {
    schemaVersion: 1,
    entityId: "entity.enemy.cutter" as never,
    enemyDefinitionId: cutterDefinition.id,
    classification: cutterDefinition.classification,
    currentHealth: cutterDefinition.maximumHealth,
    maximumHealth: cutterDefinition.maximumHealth,
    armor: cutterDefinition.armor,
    movementIntervalTicks: cutterDefinition.movementIntervalTicks,
    admittedAtTick: 0,
    lifecycleState: "active",
    basicAttack: { ...cutterDefinition.basicAttack },
    actionState: {
      schemaVersion: 1,
      nextMovementAtTick: 6,
      currentTargetEntityId: "entity.dwarf.warden" as never,
      activeBasicAttack: null,
      cooldownCompleteAtTick: 26
    }
  };
  const readyToCommit: BattlefieldState = {
    ...deployed,
    startedWaveIds: ["wave.attack_impact" as never],
    firedSpawnIds: ["spawn.attack_impact.cutter" as never],
    occupancy: [
      { entityId: cutter.entityId, nodeId: "node.south" as never },
      ...deployed.occupancy
    ],
    enemyCombatants: [
      {
        ...cutter,
        actionState: {
          ...cutter.actionState,
          activeBasicAttack: {
            schemaVersion: 1,
            attackId: "attack.goblin_cutter_basic.enemy.cutter.tick_0" as never,
            sourceEntityId: cutter.entityId,
            targetEntityId: "entity.dwarf.warden" as never,
            startedAtTick: 0,
            commitAtTick: 6,
            impactAtTick: 7,
            cooldownDurationTicks: 20,
            damage: 10,
            range: 1,
            targetIsValid: true
          },
          cooldownCompleteAtTick: null
        }
      }
    ],
    enemyAdmissions: [
      {
        schemaVersion: 1,
        spawnId: "spawn.attack_impact.cutter" as never,
        entityId: cutter.entityId,
        enemyDefinitionId: cutter.enemyDefinitionId,
        admittedAtTick: 0
      }
    ],
    pendingCommittedAttacks: []
  };
  const committed = resolveEnemyActionPhase(
    {
      schemaVersion: 1,
      currentTick: 6,
      levelId: "level.conformance_map" as never,
      battlefield: readyToCommit,
      entries: [
        {
          schemaVersion: 1,
          enemyEntityId: cutter.entityId,
          candidates: [
            {
              entityId: "entity.dwarf.warden" as never,
              targetKind: "living_dwarf",
              placementPointId: "placement.goal" as never,
              pathCost: 1,
              isAlive: true,
              isReachable: true,
              opensRoute: false
            }
          ],
          solidBlockerEntityIds: []
        }
      ]
    },
    content,
    deploymentAuthority
  ).battlefield;
  const pending = resolveBattlefieldAttackImpacts(
    {
      schemaVersion: 1,
      currentTick: 6,
      levelId: "level.conformance_map" as never,
      battlefield: committed
    },
    content,
    deploymentAuthority
  );
  const resolved = resolveBattlefieldAttackImpacts(
    {
      schemaVersion: 1,
      currentTick: 7,
      levelId: "level.conformance_map" as never,
      battlefield: pending.battlefield
    },
    content,
    deploymentAuthority
  );
  return Object.freeze({
    content,
    deployments,
    deploymentAuthority,
    committed,
    pending,
    resolved
  });
}
