import { compileContent } from "@dwarven-depths/content-runtime";
import type {
  BattlefieldState,
  ContentBundle,
  EnemyMovementPlanningRequest,
  NavigationNodeId
} from "@dwarven-depths/contracts";
import {
  battlefield,
  combatant,
  enemyMovementPlanningContent,
  entry
} from "./enemy-movement-planning.fixture.js";
import { resolveEnemyMovementPhase } from "./index.js";

interface FixtureMapDefinition {
  readonly kind: string;
  readonly nodes: readonly {
    readonly id: string;
    readonly neighborNodeIds: readonly string[];
  }[];
  readonly connections: readonly unknown[];
  readonly aimPoints: readonly unknown[];
}

export const enemyMovementPhaseContent = {
  ...enemyMovementPlanningContent,
  definitions: enemyMovementPlanningContent.definitions.map((definition) => {
    if (definition.kind !== "map") return definition;
    const map = definition as unknown as FixtureMapDefinition;
    return {
      ...map,
      nodes: [
        ...map.nodes.map((node) =>
          node.id === "node.south"
            ? {
                ...node,
                neighborNodeIds: [...node.neighborNodeIds, "node.west"]
              }
            : node
        ),
        {
          id: "node.west",
          x: -1,
          y: 1,
          aimPointId: "aim.west",
          neighborNodeIds: ["node.south"]
        }
      ],
      connections: [
        ...map.connections,
        {
          id: "connection.west_south",
          nodeIds: ["node.west", "node.south"],
          cost: 10
        }
      ],
      aimPoints: [...map.aimPoints, { id: "aim.west", x: -1, y: 1 }]
    };
  })
};

function contentionRequest(): EnemyMovementPlanningRequest {
  const alpha = combatant("entity.enemy.proposed", 6, "entity.dwarf.warden");
  const beta = combatant("entity.enemy.second", 6, "entity.dwarf.warden");
  const alphaState = battlefield(alpha, "node.entry" as NavigationNodeId);
  const betaState = battlefield(beta, "node.west" as NavigationNodeId);
  return {
    schemaVersion: 1,
    currentTick: 6,
    levelId: "level.conformance_map" as never,
    battlefield: {
      ...alphaState,
      occupancy: [
        { entityId: alpha.entityId, nodeId: "node.entry" },
        { entityId: beta.entityId, nodeId: "node.west" },
        { entityId: "entity.dwarf.warden", nodeId: "node.goal" }
      ],
      pendingSpawns: alphaState.pendingSpawns.filter(
        (spawn) => spawn.entityId !== beta.entityId
      ),
      enemyAdmissions: [
        ...alphaState.enemyAdmissions,
        ...betaState.enemyAdmissions
      ],
      enemyCombatants: [alpha, beta]
    } as unknown as BattlefieldState,
    entries: [entry(alpha.entityId), entry(beta.entityId)]
  };
}

export async function enemyMovementPhaseParityEvidence() {
  const content = await compileContent(
    enemyMovementPhaseContent as unknown as ContentBundle
  );
  const contention = resolveEnemyMovementPhase(contentionRequest(), content);
  const waiting = combatant("entity.enemy.waiting", 12, null);
  const stationary = resolveEnemyMovementPhase(
    {
      schemaVersion: 1,
      currentTick: 6,
      levelId: "level.conformance_map" as never,
      battlefield: battlefield(waiting, "node.entry" as NavigationNodeId),
      entries: [entry(waiting.entityId)]
    },
    content
  );
  return Object.freeze({ contention, stationary });
}

export { contentionRequest };
