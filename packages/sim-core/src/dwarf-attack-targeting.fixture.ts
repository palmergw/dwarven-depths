import type {
  AttackWindup,
  DwarfAttackTargetingEntry,
  DwarfTargetLockRequest
} from "@dwarven-depths/contracts";
import { resolveDwarfAttackTargeting } from "./dwarf-attack-targeting.js";
import { dwarfCandidate, targetLockMap } from "./target-locks.fixture.js";

function lock(
  currentTargetEntityId: string,
  candidates: DwarfTargetLockRequest["candidates"]
): DwarfTargetLockRequest {
  return {
    map: targetLockMap,
    sourceAimPointId: "aim.dwarf" as never,
    range: 10,
    requiresLineOfSight: true,
    currentTargetEntityId: currentTargetEntityId as never,
    requestedPolicy: "nearest",
    supportedPolicies: ["nearest"],
    candidates
  };
}

function windup(
  attackId: string,
  targetEntityId: string,
  overrides: Partial<AttackWindup> = {}
): AttackWindup {
  return {
    schemaVersion: 1,
    attackId: attackId as never,
    sourceEntityId: "entity.dwarf.warden" as never,
    targetEntityId: targetEntityId as never,
    startedAtTick: 10,
    commitAtTick: 12,
    impactAtTick: 15,
    cooldownDurationTicks: 30,
    damage: 12,
    range: 10,
    targetIsValid: false,
    ...overrides
  };
}

export function targetingEntry(
  attackId = "attack.warden.basic",
  targetEntityId = "entity.enemy.near",
  candidates: DwarfTargetLockRequest["candidates"] = [
    dwarfCandidate("entity.enemy.near")
  ],
  overrides: Partial<DwarfAttackTargetingEntry> = {}
): DwarfAttackTargetingEntry {
  return {
    schemaVersion: 1,
    sourceEntityId: "entity.dwarf.warden" as never,
    targetLock: lock(targetEntityId, candidates),
    windup: windup(attackId, targetEntityId),
    ...overrides
  };
}

export function dwarfAttackTargetingParityEvidence() {
  const retained = resolveDwarfAttackTargeting({
    schemaVersion: 1,
    currentTick: 12,
    entries: [targetingEntry()]
  });
  const reacquired = resolveDwarfAttackTargeting({
    schemaVersion: 1,
    currentTick: 11,
    entries: [
      targetingEntry("attack.warden.reacquire", "entity.enemy.dead", [
        dwarfCandidate("entity.enemy.dead", { currentHealth: 0 }),
        dwarfCandidate("entity.enemy.near")
      ])
    ]
  });
  const unlocked = resolveDwarfAttackTargeting({
    schemaVersion: 1,
    currentTick: 12,
    entries: [
      targetingEntry("attack.warden.unlocked", "entity.enemy.dead", [
        dwarfCandidate("entity.enemy.dead", { currentHealth: 0 })
      ])
    ]
  });
  return Object.freeze({ retained, reacquired, unlocked });
}
