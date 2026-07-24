import type {
  BattlefieldMapDefinition,
  DwarfTargetLockCandidate,
  EnemyTargetCandidate
} from "@dwarven-depths/contracts";
import {
  resolveDwarfTargetLock,
  resolveEnemyTargetLock
} from "./target-locks.js";

export const targetLockMap: BattlefieldMapDefinition = {
  kind: "map",
  id: "map.target_locks" as never,
  nodes: [],
  connections: [],
  placementPoints: [],
  enemyEntrances: [],
  aimPoints: [
    { id: "aim.dwarf" as never, x: 0, y: 0 },
    { id: "aim.near" as never, x: 3, y: 4 },
    { id: "aim.far" as never, x: 20, y: 0 },
    { id: "aim.obscured" as never, x: 7, y: 7 }
  ],
  opaqueRegions: [
    {
      id: "opaque.wall" as never,
      minimumX: 5,
      minimumY: 5,
      maximumX: 6,
      maximumY: 6
    }
  ]
};

export function dwarfCandidate(
  entityId: string,
  overrides: Partial<DwarfTargetLockCandidate> = {}
): DwarfTargetLockCandidate {
  return {
    entityId,
    aimPointId: "aim.near",
    isHostile: true,
    currentHealth: 50,
    maximumHealth: 100,
    armor: 5,
    speed: 10,
    isBoss: false,
    isElite: false,
    ...overrides
  } as DwarfTargetLockCandidate;
}

export function enemyCandidate(
  entityId: string,
  overrides: Partial<EnemyTargetCandidate> = {}
): EnemyTargetCandidate {
  return {
    entityId,
    targetKind: "living_dwarf",
    placementPointId: "placement.middle",
    pathCost: 20,
    isAlive: true,
    isReachable: true,
    opensRoute: false,
    ...overrides
  } as EnemyTargetCandidate;
}

export function targetLockParityEvidence() {
  const retained = resolveDwarfTargetLock({
    map: targetLockMap,
    sourceAimPointId: "aim.dwarf" as never,
    range: 10,
    requiresLineOfSight: true,
    currentTargetEntityId: "entity.enemy.near" as never,
    requestedPolicy: "highest_armor",
    supportedPolicies: ["nearest", "highest_armor"],
    candidates: [
      dwarfCandidate("entity.enemy.near"),
      dwarfCandidate("entity.enemy.strong", { armor: 50 })
    ]
  });
  const reacquired = resolveDwarfTargetLock({
    map: targetLockMap,
    sourceAimPointId: "aim.dwarf" as never,
    range: 10,
    requiresLineOfSight: true,
    currentTargetEntityId: "entity.enemy.dead" as never,
    requestedPolicy: "highest_armor",
    supportedPolicies: ["nearest", "highest_armor"],
    candidates: [
      dwarfCandidate("entity.enemy.dead", { currentHealth: 0 }),
      dwarfCandidate("entity.enemy.near"),
      dwarfCandidate("entity.enemy.obscured", {
        aimPointId: "aim.obscured" as never,
        armor: 100
      })
    ]
  });
  const enemy = resolveEnemyTargetLock({
    currentTargetEntityId: "entity.dwarf.blocked" as never,
    candidates: [
      enemyCandidate("entity.dwarf.blocked", { isReachable: false }),
      enemyCandidate("entity.deployable.route", {
        targetKind: "attackable_blocker",
        pathCost: 5,
        opensRoute: true
      })
    ]
  });
  return Object.freeze({ retained, reacquired, enemy });
}
