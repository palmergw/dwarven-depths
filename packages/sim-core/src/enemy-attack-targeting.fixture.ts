import type {
  AttackWindup,
  EnemyAttackTargetingEntry,
  EnemyTargetLockRequest
} from "@dwarven-depths/contracts";
import { resolveEnemyAttackTargeting } from "./enemy-attack-targeting.js";
import { enemyCandidate } from "./target-locks.fixture.js";

function windup(
  attackId: string,
  targetEntityId: string,
  overrides: Partial<AttackWindup> = {}
): AttackWindup {
  return {
    schemaVersion: 1,
    attackId: attackId as never,
    sourceEntityId: "entity.enemy.cutter" as never,
    targetEntityId: targetEntityId as never,
    startedAtTick: 10,
    commitAtTick: 12,
    impactAtTick: 15,
    cooldownDurationTicks: 24,
    damage: 8,
    range: 1,
    targetIsValid: false,
    ...overrides
  };
}

export function enemyTargetingEntry(
  attackId = "attack.cutter.basic",
  targetEntityId = "entity.dwarf.warden",
  candidates: EnemyTargetLockRequest["candidates"] = [
    enemyCandidate("entity.dwarf.warden")
  ],
  overrides: Partial<EnemyAttackTargetingEntry> = {}
): EnemyAttackTargetingEntry {
  return {
    schemaVersion: 1,
    sourceEntityId: "entity.enemy.cutter" as never,
    targetLock: {
      currentTargetEntityId: targetEntityId as never,
      candidates
    },
    windup: windup(attackId, targetEntityId),
    ...overrides
  };
}

export function enemyAttackTargetingParityEvidence() {
  const retainedDwarf = resolveEnemyAttackTargeting({
    schemaVersion: 1,
    currentTick: 12,
    entries: [enemyTargetingEntry()]
  });
  const retainedBlocker = resolveEnemyAttackTargeting({
    schemaVersion: 1,
    currentTick: 11,
    entries: [
      enemyTargetingEntry(
        "attack.cutter.blocker",
        "entity.deployable.barricade",
        [
          enemyCandidate("entity.deployable.barricade", {
            targetKind: "attackable_blocker",
            opensRoute: true,
            pathCost: 2
          })
        ]
      )
    ]
  });
  const reacquired = resolveEnemyAttackTargeting({
    schemaVersion: 1,
    currentTick: 11,
    entries: [
      enemyTargetingEntry(
        "attack.cutter.reacquire",
        "entity.dwarf.unreachable",
        [
          enemyCandidate("entity.dwarf.unreachable", { isReachable: false }),
          enemyCandidate("entity.dwarf.warden", { pathCost: 5 })
        ]
      )
    ]
  });
  const unlocked = resolveEnemyAttackTargeting({
    schemaVersion: 1,
    currentTick: 12,
    entries: [
      enemyTargetingEntry(
        "attack.cutter.unlocked",
        "entity.deployable.barricade",
        [
          enemyCandidate("entity.deployable.barricade", {
            targetKind: "attackable_blocker",
            opensRoute: false
          })
        ]
      )
    ]
  });
  return Object.freeze({
    retainedDwarf,
    retainedBlocker,
    reacquired,
    unlocked
  });
}
