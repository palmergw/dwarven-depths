import { canonicalHash } from "@dwarven-depths/contracts";
import { describe, expect, it } from "vitest";
import {
  enemyAttackTargetingParityEvidence,
  enemyTargetingEntry
} from "./enemy-attack-targeting.fixture.js";
import { resolveEnemyAttackTargeting } from "./enemy-attack-targeting.js";
import { enemyCandidate } from "./target-locks.fixture.js";

describe("enemy attack targeting integration", () => {
  it("retains an eligible dwarf and commits exactly at the boundary", () => {
    const result = resolveEnemyAttackTargeting({
      schemaVersion: 1,
      currentTick: 12,
      entries: [enemyTargetingEntry()]
    });
    expect(result.decisions[0]).toMatchObject({
      attackId: "attack.cutter.basic",
      targetLock: {
        status: "retained",
        targetEntityId: "entity.dwarf.warden",
        previousTargetReason: "target_remains_eligible"
      },
      commitment: {
        status: "committed",
        reason: "committed",
        committedAttack: { targetEntityId: "entity.dwarf.warden" }
      }
    });
  });

  it("retains route-opening blockers while the windup remains active", () => {
    const result = resolveEnemyAttackTargeting({
      schemaVersion: 1,
      currentTick: 11,
      entries: [
        enemyTargetingEntry(
          "attack.cutter.blocker",
          "entity.deployable.barricade",
          [
            enemyCandidate("entity.deployable.barricade", {
              targetKind: "attackable_blocker",
              opensRoute: true
            })
          ]
        )
      ]
    });
    expect(result.decisions[0]).toMatchObject({
      targetLock: { status: "retained" },
      commitment: { status: "winding_up", reason: "waiting_for_commit" }
    });
  });

  it.each([
    ["absent", []],
    ["dead", [enemyCandidate("entity.dwarf.old", { isAlive: false })]],
    [
      "unreachable",
      [enemyCandidate("entity.dwarf.old", { isReachable: false })]
    ],
    [
      "non-route-opening",
      [
        enemyCandidate("entity.dwarf.old", {
          targetKind: "attackable_blocker",
          opensRoute: false
        })
      ]
    ]
  ] as const)("cancels a windup whose old target is %s", (_reason, invalid) => {
    const result = resolveEnemyAttackTargeting({
      schemaVersion: 1,
      currentTick: 11,
      entries: [
        enemyTargetingEntry("attack.cutter.reacquire", "entity.dwarf.old", [
          ...invalid,
          enemyCandidate("entity.dwarf.replacement", { pathCost: 5 })
        ])
      ]
    });
    expect(result.decisions[0]).toMatchObject({
      targetLock: {
        status: "reacquired",
        targetEntityId: "entity.dwarf.replacement"
      },
      commitment: {
        status: "cancelled",
        reason: "target_invalid_before_commit"
      }
    });
  });

  it("does not retarget started work and unlocks when no target is eligible", () => {
    const result = resolveEnemyAttackTargeting({
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
    expect(result.decisions[0]).toMatchObject({
      targetLock: { status: "unlocked" },
      commitment: { status: "cancelled" }
    });
    expect(result.decisions[0]?.commitment).not.toHaveProperty(
      "committedAttack"
    );
  });

  it("sorts detached immutable evidence without mutating inputs", () => {
    const request = {
      schemaVersion: 1 as const,
      currentTick: 12,
      entries: [
        enemyTargetingEntry("attack.zulu"),
        enemyTargetingEntry("attack.alpha")
      ]
    };
    const before = structuredClone(request);
    const result = resolveEnemyAttackTargeting(request);
    expect(result.decisions.map((decision) => decision.attackId)).toEqual([
      "attack.alpha",
      "attack.zulu"
    ]);
    expect(request).toEqual(before);
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.decisions)).toBe(true);
    expect(Object.isFrozen(result.decisions[0])).toBe(true);
    expect(Object.isFrozen(result.decisions[0]?.targetLock)).toBe(true);
    expect(Object.isFrozen(result.decisions[0]?.commitment)).toBe(true);
  });

  it("rejects incoherent identities, malformed entries, and unsafe containers", () => {
    expect(() =>
      resolveEnemyAttackTargeting({
        schemaVersion: 2 as never,
        currentTick: 12,
        entries: []
      })
    ).toThrow("unsupported schemaVersion");
    expect(() =>
      resolveEnemyAttackTargeting({
        schemaVersion: 1,
        currentTick: -1,
        entries: []
      })
    ).toThrow("currentTick must be a non-negative safe integer");

    expect(() =>
      resolveEnemyAttackTargeting({
        schemaVersion: 1,
        currentTick: 12,
        entries: [
          {
            ...enemyTargetingEntry(),
            sourceEntityId: "entity.enemy.other" as never
          }
        ]
      })
    ).toThrow("source identity does not match windup");

    const mismatched = enemyTargetingEntry();
    expect(() =>
      resolveEnemyAttackTargeting({
        schemaVersion: 1,
        currentTick: 12,
        entries: [
          {
            ...mismatched,
            targetLock: {
              ...mismatched.targetLock,
              currentTargetEntityId: "entity.dwarf.other" as never
            }
          }
        ]
      })
    ).toThrow("current target does not match windup target");

    expect(() =>
      resolveEnemyAttackTargeting({
        schemaVersion: 1,
        currentTick: 12,
        entries: [enemyTargetingEntry(), enemyTargetingEntry()]
      })
    ).toThrow("duplicate attack windup ID");

    const sparse = new Array(1) as ReturnType<typeof enemyTargetingEntry>[];
    expect(() =>
      resolveEnemyAttackTargeting({
        schemaVersion: 1,
        currentTick: 12,
        entries: sparse
      })
    ).toThrow("dense data array");

    let getterCalls = 0;
    const accessor = enemyTargetingEntry();
    Object.defineProperty(accessor, "targetLock", {
      enumerable: true,
      get() {
        getterCalls += 1;
        return enemyTargetingEntry().targetLock;
      }
    });
    expect(() =>
      resolveEnemyAttackTargeting({
        schemaVersion: 1,
        currentTick: 12,
        entries: [accessor]
      })
    ).toThrow("targetLock must be an enumerable data property");
    expect(getterCalls).toBe(0);
  });

  it("pins shared integration evidence to the browser checksum", async () => {
    expect(await canonicalHash(enemyAttackTargetingParityEvidence())).toBe(
      "3aa7bfc0ef7da7612a49a37ccd03107daa7ee315932b93a412085df162ab0e7a"
    );
  });
});
