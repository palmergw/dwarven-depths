import type { AttackWindup } from "@dwarven-depths/contracts";
import { describe, expect, it } from "vitest";
import { resolveAttackCommitments } from "./index.js";

function windup(overrides: Partial<AttackWindup> = {}): AttackWindup {
  return {
    schemaVersion: 1,
    attackId: "attack.warden.basic" as never,
    sourceEntityId: "entity.dwarf.warden" as never,
    targetEntityId: "entity.enemy.cutter" as never,
    startedAtTick: 10,
    commitAtTick: 12,
    impactAtTick: 15,
    cooldownDurationTicks: 30,
    targetIsValid: true,
    ...overrides
  };
}

describe("deterministic attack commitment", () => {
  it("waits before the commit tick without starting cooldown", () => {
    expect(
      resolveAttackCommitments({ currentTick: 11, windups: [windup()] })
    ).toEqual({
      decisions: [
        {
          attackId: "attack.warden.basic",
          status: "winding_up",
          reason: "waiting_for_commit"
        }
      ]
    });
  });

  it.each([11, 12])("cancels an invalid target at tick %i", (currentTick) => {
    expect(
      resolveAttackCommitments({
        currentTick,
        windups: [windup({ targetIsValid: false })]
      })
    ).toEqual({
      decisions: [
        {
          attackId: "attack.warden.basic",
          status: "cancelled",
          reason: "target_invalid_before_commit"
        }
      ]
    });
  });

  it("commits exactly at the boundary and pins impact and cooldown timing", () => {
    expect(
      resolveAttackCommitments({ currentTick: 12, windups: [windup()] })
    ).toEqual({
      decisions: [
        {
          attackId: "attack.warden.basic",
          status: "committed",
          reason: "committed",
          committedAttack: {
            schemaVersion: 1,
            attackId: "attack.warden.basic",
            sourceEntityId: "entity.dwarf.warden",
            targetEntityId: "entity.enemy.cutter",
            committedAtTick: 12,
            impactAtTick: 15,
            cooldownCompleteAtTick: 42
          }
        }
      ]
    });
  });

  it("sorts decisions by stable attack ID without mutating inputs", () => {
    const request = {
      currentTick: 12,
      windups: [
        windup({ attackId: "attack.zulu" as never }),
        windup({ attackId: "attack.alpha" as never })
      ]
    };
    const before = structuredClone(request);
    const result = resolveAttackCommitments(request);
    expect(result.decisions.map((item) => item.attackId)).toEqual([
      "attack.alpha",
      "attack.zulu"
    ]);
    expect(request).toEqual(before);
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.decisions)).toBe(true);
    expect(Object.isFrozen(result.decisions[0]?.committedAttack)).toBe(true);
  });

  it("rejects invalid timing, IDs, duplicates, and overflow", () => {
    for (const invalid of [
      windup({ attackId: "invalid" as never }),
      windup({ sourceEntityId: "enemy.invalid" as never }),
      windup({ startedAtTick: -1 }),
      windup({ commitAtTick: 9 }),
      windup({ impactAtTick: 11 }),
      windup({ cooldownDurationTicks: -1 })
    ]) {
      expect(() =>
        resolveAttackCommitments({ currentTick: 10, windups: [invalid] })
      ).toThrow();
    }
    expect(() =>
      resolveAttackCommitments({
        currentTick: 12,
        windups: [windup(), windup()]
      })
    ).toThrow("duplicate attack windup ID");
    expect(() =>
      resolveAttackCommitments({ currentTick: 9, windups: [windup()] })
    ).toThrow("has not started");
    expect(() =>
      resolveAttackCommitments({ currentTick: 13, windups: [windup()] })
    ).toThrow("passed its commit tick");
    expect(() =>
      resolveAttackCommitments({
        currentTick: Number.MAX_SAFE_INTEGER,
        windups: [
          windup({
            startedAtTick: Number.MAX_SAFE_INTEGER,
            commitAtTick: Number.MAX_SAFE_INTEGER,
            impactAtTick: Number.MAX_SAFE_INTEGER,
            cooldownDurationTicks: 1
          })
        ]
      })
    ).toThrow("cooldown completion exceeds");
  });

  it("rejects sparse arrays and accessors without invoking caller code", () => {
    const sparse = new Array(1) as AttackWindup[];
    expect(() =>
      resolveAttackCommitments({ currentTick: 10, windups: sparse })
    ).toThrow("dense data array");

    let getterCalls = 0;
    const accessor = windup();
    Object.defineProperty(accessor, "attackId", {
      enumerable: true,
      get() {
        getterCalls += 1;
        return "attack.accessor";
      }
    });
    expect(() =>
      resolveAttackCommitments({ currentTick: 10, windups: [accessor] })
    ).toThrow("attackId must be an enumerable data property");
    expect(getterCalls).toBe(0);
  });
});
