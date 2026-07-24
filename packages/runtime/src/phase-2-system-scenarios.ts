import {
  type CompiledContent,
  findShortestAttackRoute,
  type StaticAttackRoute,
  validateStaticPlacement
} from "@dwarven-depths/content-runtime";
import type {
  MovementProposal,
  PendingSpawn,
  SimulationEvent,
  SimulationState,
  StaticPlacementValidation
} from "@dwarven-depths/contracts";
import {
  createInitialState,
  resolveBattlefieldPhase
} from "@dwarven-depths/sim-core";

export interface Phase2SystemScenarioEvidence {
  readonly entranceQueue: {
    readonly waitingEvents: readonly SimulationEvent[];
    readonly resumedEvents: readonly SimulationEvent[];
    readonly finalState: SimulationState;
  };
  readonly liveCapQueue: {
    readonly cappedEvents: readonly SimulationEvent[];
    readonly resumedEvents: readonly SimulationEvent[];
    readonly finalState: SimulationState;
  };
  readonly placementRoutes: {
    readonly eastPlacement: StaticPlacementValidation;
    readonly eastAttackRoute: StaticAttackRoute | undefined;
    readonly southPlacement: StaticPlacementValidation;
    readonly southAttackRoute: StaticAttackRoute | undefined;
  };
}

function spawn(
  id: string,
  authoredOrder: number,
  entityId: string
): PendingSpawn {
  return {
    id,
    authoredOrder,
    entityId,
    enemyDefinitionId: "enemy.goblin_cutter",
    entranceId: "entrance.west"
  } as PendingSpawn;
}

function movement(
  id: string,
  entityId: string,
  fromNodeId: string,
  toNodeId: string
): MovementProposal {
  return { id, entityId, fromNodeId, toNodeId } as MovementProposal;
}

/**
 * Produces compact deterministic evidence for the Phase 2 system boundaries.
 * Combat-owned removal is represented by a replacement state between phases;
 * the queue transition itself remains authoritative sim-core behavior.
 */
export function createPhase2SystemScenarioEvidence(
  content: CompiledContent
): Phase2SystemScenarioEvidence {
  const levelId = "level.phase_2_system" as never;
  const map = content.maps.get("map.phase_2_system" as never);
  if (map === undefined) throw new Error("missing Phase 2 system scenario map");

  const initial = createInitialState(content, levelId, "1");
  if (initial.battlefield === undefined)
    throw new Error("missing Phase 2 battlefield state");

  const entranceBlockedState: SimulationState = Object.freeze({
    ...initial,
    battlefield: Object.freeze({
      ...initial.battlefield,
      occupancy: Object.freeze([
        Object.freeze({
          entityId: "entity.enemy.blocker" as never,
          nodeId: "node.entry" as never
        })
      ])
    })
  });
  const entranceWaiting = resolveBattlefieldPhase(
    entranceBlockedState,
    content,
    [spawn("spawn.entrance_waiting", 0, "entity.enemy.entrance_waiting")],
    [
      movement(
        "movement.blocker_clears_entrance",
        "entity.enemy.blocker",
        "node.entry",
        "node.south"
      )
    ]
  );
  const entranceResumed = resolveBattlefieldPhase(
    entranceWaiting.state,
    content,
    [],
    []
  );

  const capWaiting = resolveBattlefieldPhase(
    initial,
    content,
    [
      spawn("spawn.cap_first", 0, "entity.enemy.cap_first"),
      spawn("spawn.cap_second", 1, "entity.enemy.cap_second")
    ],
    [],
    { liveEnemyCap: 1, currentLiveEnemies: 0 }
  );
  const capBattlefield = capWaiting.state.battlefield;
  if (capBattlefield === undefined)
    throw new Error("missing capped Phase 2 battlefield state");
  const afterCombatRemoval: SimulationState = Object.freeze({
    ...capWaiting.state,
    battlefield: Object.freeze({
      ...capBattlefield,
      occupancy: Object.freeze([])
    })
  });
  const capResumed = resolveBattlefieldPhase(
    afterCombatRemoval,
    content,
    [],
    [],
    { liveEnemyCap: 1, currentLiveEnemies: 0 }
  );

  const eastPlacements = [
    {
      entityId: "entity.dwarf.warden" as never,
      placementPointId: "placement.east" as never
    }
  ];
  const southPlacements = [
    {
      entityId: "entity.dwarf.warden" as never,
      placementPointId: "placement.south" as never
    }
  ];
  const eastPlacement = validateStaticPlacement(map, eastPlacements);
  const southPlacement = validateStaticPlacement(map, southPlacements);

  return Object.freeze({
    entranceQueue: Object.freeze({
      waitingEvents: entranceWaiting.events,
      resumedEvents: entranceResumed.events,
      finalState: entranceResumed.state
    }),
    liveCapQueue: Object.freeze({
      cappedEvents: capWaiting.events,
      resumedEvents: capResumed.events,
      finalState: capResumed.state
    }),
    placementRoutes: Object.freeze({
      eastPlacement,
      eastAttackRoute: findShortestAttackRoute(
        map,
        "entrance.west" as never,
        eastPlacements
      ),
      southPlacement,
      southAttackRoute: findShortestAttackRoute(
        map,
        "entrance.west" as never,
        southPlacements
      )
    })
  });
}
