import { compileContent } from "@dwarven-depths/content-runtime";
import type {
  BattlefieldState,
  ContentBundle,
  EnemyActionPhaseRequest,
  NavigationNodeId
} from "@dwarven-depths/contracts";
import { createBattlefieldDwarfDeploymentAuthority } from "./battlefield-attack-impact.js";
import { propagateBattlefieldRoundLineage } from "./battlefield-round-lineage.js";
import { resolveEnemyActionPhase as executeEnemyActionPhase } from "./enemy-action-phase.js";
import {
  battlefield,
  combatant,
  enemyMovementPlanningContent,
  entry
} from "./enemy-movement-planning.fixture.js";
import { createInitialState } from "./index.js";

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
  const preparation = createInitialState(
    content,
    "level.conformance_map" as never,
    "1"
  ).battlefield;
  if (preparation === undefined) throw new Error("missing fixture battlefield");
  const dwarfAuthority = createBattlefieldDwarfDeploymentAuthority(
    [
      {
        entityId: "entity.dwarf.warden" as never,
        characterDefinitionId: "character.iron_warden" as never,
        placementPointId: "placement.goal" as never
      }
    ],
    preparation,
    content
  );
  const resolveEnemyActionPhase = (
    actionRequest: EnemyActionPhaseRequest,
    _content: typeof content,
    _authority: typeof dwarfAuthority
  ) => {
    propagateBattlefieldRoundLineage(preparation, actionRequest.battlefield);
    return executeEnemyActionPhase(actionRequest, content, dwarfAuthority);
  };

  const trackingEnemy = combatant("entity.enemy.waiting", 6, null);
  const tracking = resolveEnemyActionPhase(
    request(1, battlefield(trackingEnemy, "node.entry" as NavigationNodeId)),
    content,
    dwarfAuthority
  );

  const startingEnemy = combatant("entity.enemy.already", 6, null);
  const startState = battlefield(
    startingEnemy,
    "node.south" as NavigationNodeId
  );
  const started = resolveEnemyActionPhase(
    request(6, startState),
    content,
    dwarfAuthority
  );
  const startedState = started.battlefield;
  const winding = resolveEnemyActionPhase(
    request(10, startedState),
    content,
    dwarfAuthority
  );

  const cancelledState: BattlefieldState = {
    ...startedState,
    occupancy: startedState.occupancy.filter(
      (occupant) => occupant.entityId !== "entity.dwarf.warden"
    ),
    dwarfCombatants: startedState.dwarfCombatants.map((dwarf) => ({
      ...dwarf,
      currentHealth: 0,
      lifecycleState: "downed"
    }))
  };
  const cancelled = resolveEnemyActionPhase(
    request(10, cancelledState, false),
    content,
    dwarfAuthority
  );

  const committed = resolveEnemyActionPhase(
    request(12, startedState),
    content,
    dwarfAuthority
  );
  const impactDue = resolveEnemyActionPhase(
    request(13, committed.battlefield),
    content,
    dwarfAuthority
  );
  const cooldownState: BattlefieldState = {
    ...impactDue.battlefield,
    pendingCommittedAttacks: []
  };
  const coolingDown = resolveEnemyActionPhase(
    request(20, cooldownState),
    content,
    dwarfAuthority
  );
  const restarted = resolveEnemyActionPhase(
    request(32, cooldownState),
    content,
    dwarfAuthority
  );

  return Object.freeze({
    tracking,
    started,
    winding,
    cancelled,
    committed,
    impactDue,
    coolingDown,
    restarted
  });
}
