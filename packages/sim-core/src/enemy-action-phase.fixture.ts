import { compileContent } from "@dwarven-depths/content-runtime";
import type {
  BattlefieldState,
  ContentBundle,
  EnemyActionPhaseRequest,
  NavigationNodeId
} from "@dwarven-depths/contracts";
import { resolveEnemyActionPhase } from "./enemy-action-phase.js";
import {
  battlefield,
  combatant,
  enemyMovementPlanningContent,
  entry
} from "./enemy-movement-planning.fixture.js";

function request(
  currentTick: number,
  state: BattlefieldState,
  alive = true
): EnemyActionPhaseRequest {
  const enemy = state.enemyCombatants[0];
  if (enemy === undefined) throw new Error("fixture enemy is missing");
  return {
    schemaVersion: 1,
    currentTick,
    levelId: "level.conformance_map" as never,
    battlefield: state,
    entries: [entry(enemy.entityId, alive)]
  };
}

export async function enemyActionPhaseParityEvidence() {
  const content = await compileContent(
    enemyMovementPlanningContent as unknown as ContentBundle
  );

  const trackingEnemy = combatant("entity.enemy.waiting", 6, null);
  const tracking = resolveEnemyActionPhase(
    request(1, battlefield(trackingEnemy, "node.entry" as NavigationNodeId)),
    content
  );

  const startingEnemy = combatant("entity.enemy.already", 6, null);
  const startState = battlefield(
    startingEnemy,
    "node.south" as NavigationNodeId
  );
  const started = resolveEnemyActionPhase(request(6, startState), content);
  const startedState = started.battlefield;
  const winding = resolveEnemyActionPhase(request(10, startedState), content);

  const cancelledState: BattlefieldState = {
    ...startedState,
    occupancy: startedState.occupancy.filter(
      (occupant) => occupant.entityId !== "entity.dwarf.warden"
    )
  };
  const cancelled = resolveEnemyActionPhase(
    request(10, cancelledState, false),
    content
  );

  const committed = resolveEnemyActionPhase(request(12, startedState), content);
  const cooldownState = committed.battlefield;
  const coolingDown = resolveEnemyActionPhase(
    request(20, cooldownState),
    content
  );
  const restarted = resolveEnemyActionPhase(
    request(32, cooldownState),
    content
  );

  return Object.freeze({
    tracking,
    started,
    winding,
    cancelled,
    committed,
    coolingDown,
    restarted
  });
}
