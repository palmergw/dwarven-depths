import type { CompiledContent } from "@dwarven-depths/content-runtime";
import type {
  AttackWindup,
  BattlefieldEnemyCombatant,
  CommittedAttack,
  EnemyActionPhaseDecision,
  EnemyActionPhaseRequest,
  EnemyActionPhaseResolution,
  EnemyMovementPlanningEntry,
  EnemyTargetLockDecision,
  EntityId,
  StableId
} from "@dwarven-depths/contracts";
import { resolveEnemyAttackTargeting } from "./enemy-attack-targeting.js";
import { planEnemyMovement } from "./enemy-movement-planning.js";
import { hasLineOfSight, isAimPointInRange } from "./range-line-of-sight.js";

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function attackInstanceId(
  authoredAttackId: StableId,
  sourceEntityId: EntityId,
  startedAtTick: number
): StableId {
  return `${authoredAttackId}.${sourceEntityId.slice("entity.".length)}.tick_${startedAtTick}` as StableId;
}

function freezeCombatant(
  combatant: BattlefieldEnemyCombatant,
  actionState: BattlefieldEnemyCombatant["actionState"]
): BattlefieldEnemyCombatant {
  return Object.freeze({
    ...combatant,
    basicAttack: Object.freeze({ ...combatant.basicAttack }),
    actionState: Object.freeze({
      ...actionState,
      activeBasicAttack:
        actionState.activeBasicAttack === null
          ? null
          : Object.freeze({ ...actionState.activeBasicAttack })
    })
  });
}

function decision(
  enemyEntityId: EntityId,
  status: EnemyActionPhaseDecision["status"],
  reason: EnemyActionPhaseDecision["reason"],
  targetLock: EnemyTargetLockDecision,
  attackId?: StableId
): EnemyActionPhaseDecision {
  return Object.freeze({
    schemaVersion: 1,
    enemyEntityId,
    status,
    reason,
    targetLock,
    ...(attackId === undefined ? {} : { attackId })
  });
}

/**
 * Resolves the fixed-step target-validation boundary for admitted enemies.
 * Movement planning supplies the strictly validated authoritative snapshot and
 * target-lock decisions; this phase persists those locks and owns basic-attack
 * windup/cooldown state changes without moving any occupant.
 */
export function resolveEnemyActionPhase(
  request: EnemyActionPhaseRequest,
  content: CompiledContent
): EnemyActionPhaseResolution {
  const planning = planEnemyMovement(request, content);
  const currentTick = request.currentTick;
  const map = content.maps.get(request.battlefield.mapId);
  if (map === undefined)
    throw new Error("validated battlefield map is missing");

  const entriesByEnemy = new Map<EntityId, EnemyMovementPlanningEntry>(
    request.entries.map((entry) => [entry.enemyEntityId, entry])
  );
  const planningByEnemy = new Map(
    planning.decisions.map((item) => [item.enemyEntityId, item] as const)
  );
  const occupancyByEntity = new Map(
    request.battlefield.occupancy.map((item) => [item.entityId, item] as const)
  );
  const nodesById = new Map(map.nodes.map((node) => [node.id, node] as const));
  const placementsById = new Map(
    map.placementPoints.map((placement) => [placement.id, placement] as const)
  );

  const combatants: BattlefieldEnemyCombatant[] = [];
  const committedAttacks: CommittedAttack[] = [];
  const decisions: EnemyActionPhaseDecision[] = [];

  for (const combatant of [...request.battlefield.enemyCombatants].sort(
    (left, right) => compareText(left.entityId, right.entityId)
  )) {
    if (combatant.lifecycleState === "destroyed") {
      combatants.push(freezeCombatant(combatant, combatant.actionState));
      continue;
    }
    const entry = entriesByEnemy.get(combatant.entityId);
    const planned = planningByEnemy.get(combatant.entityId);
    if (entry === undefined || planned === undefined)
      throw new Error("validated active enemy planning evidence is missing");

    const selectedTargetId = planned.targetLock.targetEntityId ?? null;
    const baseAction = {
      ...combatant.actionState,
      currentTargetEntityId: selectedTargetId
    };

    if (combatant.actionState.activeBasicAttack !== null) {
      const targeting = resolveEnemyAttackTargeting({
        schemaVersion: 1,
        currentTick,
        entries: [
          {
            schemaVersion: 1,
            sourceEntityId: combatant.entityId,
            targetLock: {
              currentTargetEntityId:
                combatant.actionState.currentTargetEntityId,
              candidates: entry.candidates
            },
            windup: combatant.actionState.activeBasicAttack
          }
        ]
      }).decisions[0];
      if (targeting === undefined)
        throw new Error("enemy targeting decision is missing");
      const resolvedTargetId = targeting.targetLock.targetEntityId ?? null;
      if (targeting.commitment.status === "committed") {
        const committed = targeting.commitment.committedAttack;
        if (committed === undefined)
          throw new Error("committed enemy attack evidence is missing");
        committedAttacks.push(committed);
        combatants.push(
          freezeCombatant(combatant, {
            ...baseAction,
            currentTargetEntityId: resolvedTargetId,
            activeBasicAttack: null,
            cooldownCompleteAtTick: committed.cooldownCompleteAtTick
          })
        );
        decisions.push(
          decision(
            combatant.entityId,
            "committed",
            "basic_attack_committed",
            targeting.targetLock,
            committed.attackId
          )
        );
        continue;
      }
      if (targeting.commitment.status === "cancelled") {
        combatants.push(
          freezeCombatant(combatant, {
            ...baseAction,
            currentTargetEntityId: resolvedTargetId,
            activeBasicAttack: null,
            cooldownCompleteAtTick: null
          })
        );
        decisions.push(
          decision(
            combatant.entityId,
            "cancelled",
            "basic_attack_cancelled",
            targeting.targetLock,
            combatant.actionState.activeBasicAttack.attackId
          )
        );
        continue;
      }
      combatants.push(
        freezeCombatant(combatant, {
          ...baseAction,
          currentTargetEntityId: resolvedTargetId,
          activeBasicAttack: {
            ...combatant.actionState.activeBasicAttack,
            targetIsValid: true
          },
          cooldownCompleteAtTick: null
        })
      );
      decisions.push(
        decision(
          combatant.entityId,
          "winding_up",
          "basic_attack_winding_up",
          targeting.targetLock,
          combatant.actionState.activeBasicAttack.attackId
        )
      );
      continue;
    }

    const cooldownCompleteAtTick = combatant.actionState.cooldownCompleteAtTick;
    if (
      cooldownCompleteAtTick !== null &&
      cooldownCompleteAtTick > currentTick
    ) {
      combatants.push(freezeCombatant(combatant, baseAction));
      decisions.push(
        decision(
          combatant.entityId,
          "cooling_down",
          "cooldown_in_progress",
          planned.targetLock
        )
      );
      continue;
    }

    if (selectedTargetId === null) {
      combatants.push(
        freezeCombatant(combatant, {
          ...baseAction,
          cooldownCompleteAtTick: null
        })
      );
      decisions.push(
        decision(
          combatant.entityId,
          "unlocked",
          "no_eligible_target",
          planned.targetLock
        )
      );
      continue;
    }

    const candidate = entry.candidates.find(
      (item) => item.entityId === selectedTargetId
    );
    const sourceOccupant = occupancyByEntity.get(combatant.entityId);
    const placement = candidate
      ? placementsById.get(candidate.placementPointId)
      : undefined;
    const sourceNode = sourceOccupant
      ? nodesById.get(sourceOccupant.nodeId)
      : undefined;
    const targetNode = placement ? nodesById.get(placement.nodeId) : undefined;
    if (
      candidate === undefined ||
      sourceNode === undefined ||
      targetNode === undefined
    )
      throw new Error("validated enemy attack geometry is missing");

    const inRange = isAimPointInRange(
      map,
      sourceNode.aimPointId,
      targetNode.aimPointId,
      combatant.basicAttack.range
    );
    const visible =
      !combatant.basicAttack.requiresLineOfSight ||
      hasLineOfSight(map, sourceNode.aimPointId, targetNode.aimPointId);
    if (!inRange || !visible) {
      combatants.push(
        freezeCombatant(combatant, {
          ...baseAction,
          cooldownCompleteAtTick: null
        })
      );
      decisions.push(
        decision(
          combatant.entityId,
          "tracking",
          "target_acquired_for_movement",
          planned.targetLock
        )
      );
      continue;
    }

    const commitAtTick = currentTick + combatant.basicAttack.windupTicks;
    const impactAtTick = commitAtTick + combatant.basicAttack.impactDelayTicks;
    const cooldownBoundary = commitAtTick + combatant.basicAttack.cooldownTicks;
    if (
      !Number.isSafeInteger(commitAtTick) ||
      !Number.isSafeInteger(impactAtTick) ||
      !Number.isSafeInteger(cooldownBoundary)
    )
      throw new RangeError(
        `enemy basic attack timing exceeds safe integer bounds (${combatant.entityId})`
      );
    const attackId = attackInstanceId(
      combatant.basicAttack.id,
      combatant.entityId,
      currentTick
    );
    const windup: AttackWindup = Object.freeze({
      schemaVersion: 1,
      attackId,
      sourceEntityId: combatant.entityId,
      targetEntityId: selectedTargetId,
      startedAtTick: currentTick,
      commitAtTick,
      impactAtTick,
      cooldownDurationTicks: combatant.basicAttack.cooldownTicks,
      damage: combatant.basicAttack.damage,
      range: combatant.basicAttack.range,
      targetIsValid: true
    });
    combatants.push(
      freezeCombatant(combatant, {
        ...baseAction,
        activeBasicAttack: windup,
        cooldownCompleteAtTick: null
      })
    );
    decisions.push(
      decision(
        combatant.entityId,
        "winding_up",
        "basic_attack_started",
        planned.targetLock,
        attackId
      )
    );
  }

  return Object.freeze({
    schemaVersion: 1,
    enemyCombatants: Object.freeze(combatants),
    committedAttacks: Object.freeze(
      committedAttacks.sort((left, right) =>
        compareText(left.attackId, right.attackId)
      )
    ),
    decisions: Object.freeze(decisions)
  });
}
