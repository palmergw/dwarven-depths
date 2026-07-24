import { compileContent } from "@dwarven-depths/content-runtime";
import type {
  BattlefieldEnemyCombatant,
  BattlefieldState,
  ContentBundle,
  EnemyMovementPlanningEntry,
  EnemyMovementPlanningRequest,
  NavigationNodeId
} from "@dwarven-depths/contracts";
import conformanceContent from "../../../content/fixtures/conformance-map.json" with {
  type: "json"
};
import referenceCombatants from "../../../content/fixtures/phase-3-reference-combatants.json" with {
  type: "json"
};
import { planEnemyMovement } from "./enemy-movement-planning.js";

const authoredEnemyEntityIds = [
  "entity.enemy.proposed",
  "entity.enemy.already",
  "entity.enemy.unreachable",
  "entity.enemy.waiting",
  "entity.enemy.unlocked",
  "entity.enemy.test",
  "entity.enemy.second",
  "entity.foe.pending"
];

export const enemyMovementPlanningContent = {
  ...conformanceContent,
  definitions: [
    ...conformanceContent.definitions.map((definition) =>
      definition.kind === "level"
        ? { ...definition, waveIds: ["wave.movement_planning"] }
        : definition
    ),
    {
      kind: "wave",
      id: "wave.movement_planning",
      startAtTick: 0,
      durationTicks: 100,
      spawnEvents: authoredEnemyEntityIds.map((entityId, authoredOrder) => ({
        id: `spawn.${entityId.slice("entity.".length)}`,
        authoredOrder,
        atTick: 0,
        entityId,
        enemyDefinitionId: "enemy.goblin_cutter",
        entranceId: "entrance.west"
      }))
    },
    ...referenceCombatants.definitions.filter(
      (definition) =>
        definition.id === "enemy.goblin_cutter" ||
        definition.id === "enemy.goblin_slinger"
    )
  ]
};

function combatant(
  entityId: string,
  nextMovementAtTick: number,
  currentTargetEntityId: string | null,
  range = 1
): BattlefieldEnemyCombatant {
  return {
    schemaVersion: 1,
    entityId,
    enemyDefinitionId: "enemy.goblin_cutter",
    classification: "basic",
    currentHealth: 50,
    maximumHealth: 50,
    armor: 0,
    movementIntervalTicks: 6,
    admittedAtTick: 0,
    lifecycleState: "active",
    basicAttack: {
      id: "attack.goblin_cutter_basic",
      windupTicks: 6,
      impactDelayTicks: 1,
      cooldownTicks: 20,
      damage: 10,
      range,
      requiresLineOfSight: false
    },
    actionState: {
      schemaVersion: 1,
      nextMovementAtTick,
      currentTargetEntityId,
      activeBasicAttack: null,
      cooldownCompleteAtTick: null
    }
  } as BattlefieldEnemyCombatant;
}

function battlefield(
  enemy: BattlefieldEnemyCombatant,
  enemyNodeId: NavigationNodeId,
  includeTarget = true
): BattlefieldState {
  return {
    schemaVersion: 1,
    mapId: "map.conformance_diamond",
    startedWaveIds: ["wave.movement_planning"],
    firedSpawnIds: authoredEnemyEntityIds.map(
      (entityId) => `spawn.${entityId.slice("entity.".length)}`
    ),
    occupancy: [
      { entityId: enemy.entityId, nodeId: enemyNodeId },
      ...(includeTarget
        ? [
            {
              entityId: "entity.dwarf.warden",
              nodeId: "node.goal"
            }
          ]
        : [])
    ],
    pendingSpawns: authoredEnemyEntityIds
      .filter((entityId) => entityId !== enemy.entityId)
      .map((entityId) => ({
        id: `spawn.${entityId.slice("entity.".length)}`,
        authoredOrder: authoredEnemyEntityIds.indexOf(entityId),
        entityId,
        enemyDefinitionId: "enemy.goblin_cutter",
        entranceId: "entrance.west"
      })),
    enemyAdmissions: [
      {
        schemaVersion: 1,
        spawnId: `spawn.${enemy.entityId.slice("entity.".length)}`,
        entityId: enemy.entityId,
        enemyDefinitionId: enemy.enemyDefinitionId,
        admittedAtTick: enemy.admittedAtTick
      }
    ],
    enemyCombatants: [enemy],
    dwarfCombatants: [],
    pendingCommittedAttacks: []
  } as unknown as BattlefieldState;
}

function entry(
  enemyEntityId: string,
  isAlive = true
): EnemyMovementPlanningEntry {
  return {
    schemaVersion: 1,
    enemyEntityId,
    candidates: [
      {
        entityId: "entity.dwarf.warden",
        targetKind: "living_dwarf",
        placementPointId: "placement.goal",
        pathCost: 10,
        isAlive,
        isReachable: true,
        opensRoute: false
      }
    ],
    solidBlockerEntityIds: []
  } as unknown as EnemyMovementPlanningEntry;
}

export async function enemyMovementPlanningParityEvidence() {
  const content = await compileContent(
    enemyMovementPlanningContent as unknown as ContentBundle
  );
  const proposedEnemy = combatant(
    "entity.enemy.proposed",
    6,
    "entity.dwarf.warden"
  );
  const proposed = planEnemyMovement(
    {
      schemaVersion: 1,
      currentTick: 6,
      levelId: "level.conformance_map" as never,
      battlefield: battlefield(proposedEnemy, "node.entry" as NavigationNodeId),
      entries: [entry(proposedEnemy.entityId)]
    },
    content
  );
  const alreadyEnemy = combatant("entity.enemy.already", 6, null);
  const alreadyValid = planEnemyMovement(
    {
      schemaVersion: 1,
      currentTick: 6,
      levelId: "level.conformance_map" as never,
      battlefield: battlefield(alreadyEnemy, "node.south" as NavigationNodeId),
      entries: [entry(alreadyEnemy.entityId)]
    },
    content
  );
  const unreachableEnemy = combatant("entity.enemy.unreachable", 6, null);
  const unreachableBattlefield = battlefield(
    unreachableEnemy,
    "node.entry" as NavigationNodeId
  );
  const unreachable = planEnemyMovement(
    {
      schemaVersion: 1,
      currentTick: 6,
      levelId: "level.conformance_map" as never,
      battlefield: {
        ...unreachableBattlefield,
        occupancy: [
          ...unreachableBattlefield.occupancy,
          { entityId: "entity.blocker.south", nodeId: "node.south" },
          { entityId: "entity.blocker.east", nodeId: "node.east" }
        ]
      },
      entries: [
        {
          ...entry(unreachableEnemy.entityId),
          solidBlockerEntityIds: ["entity.blocker.south", "entity.blocker.east"]
        }
      ]
    } as unknown as EnemyMovementPlanningRequest,
    content
  );
  const waitingEnemy = combatant("entity.enemy.waiting", 12, null);
  const notDue = planEnemyMovement(
    {
      schemaVersion: 1,
      currentTick: 6,
      levelId: "level.conformance_map" as never,
      battlefield: battlefield(waitingEnemy, "node.entry" as NavigationNodeId),
      entries: [entry(waitingEnemy.entityId)]
    },
    content
  );
  const unlockedEnemy = combatant("entity.enemy.unlocked", 6, null);
  const unlocked = planEnemyMovement(
    {
      schemaVersion: 1,
      currentTick: 6,
      levelId: "level.conformance_map" as never,
      battlefield: battlefield(
        unlockedEnemy,
        "node.entry" as NavigationNodeId,
        false
      ),
      entries: [entry(unlockedEnemy.entityId, false)]
    },
    content
  );
  return Object.freeze({
    proposed,
    alreadyValid,
    unreachable,
    notDue,
    unlocked
  });
}

export { battlefield, combatant, entry };
