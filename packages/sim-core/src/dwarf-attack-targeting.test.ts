import { canonicalHash } from "@dwarven-depths/contracts";
import { describe, expect, it } from "vitest";
import {
  dwarfAttackTargetingParityEvidence,
  targetingEntry
} from "./dwarf-attack-targeting.fixture.js";
import { resolveDwarfAttackTargeting } from "./dwarf-attack-targeting.js";
import { dwarfCandidate } from "./target-locks.fixture.js";

describe("dwarf attack targeting integration", () => {
  it("retains a valid lock and commits exactly at the boundary", () => {
    const result = resolveDwarfAttackTargeting({
      schemaVersion: 1,
      currentTick: 12,
      entries: [targetingEntry()]
    });
    expect(result.decisions[0]).toMatchObject({
      attackId: "attack.warden.basic",
      targetLock: {
        status: "retained",
        targetEntityId: "entity.enemy.near",
        previousTargetReason: "target_remains_valid"
      },
      commitment: {
        status: "committed",
        reason: "committed",
        committedAttack: { targetEntityId: "entity.enemy.near" }
      }
    });
  });

  it("cancels old work while exposing normal reacquisition", () => {
    const result = resolveDwarfAttackTargeting({
      schemaVersion: 1,
      currentTick: 11,
      entries: [
        targetingEntry("attack.warden.reacquire", "entity.enemy.dead", [
          dwarfCandidate("entity.enemy.dead", { currentHealth: 0 }),
          dwarfCandidate("entity.enemy.near")
        ])
      ]
    });
    expect(result.decisions[0]).toMatchObject({
      targetLock: {
        status: "reacquired",
        targetEntityId: "entity.enemy.near",
        previousTargetReason: "target_not_living"
      },
      commitment: {
        status: "cancelled",
        reason: "target_invalid_before_commit"
      }
    });
  });

  it("keeps valid pre-boundary work winding up and cancels unlocked work", () => {
    const valid = resolveDwarfAttackTargeting({
      schemaVersion: 1,
      currentTick: 11,
      entries: [targetingEntry()]
    });
    expect(valid.decisions[0]?.commitment.status).toBe("winding_up");

    const unlocked = resolveDwarfAttackTargeting({
      schemaVersion: 1,
      currentTick: 12,
      entries: [
        targetingEntry("attack.warden.unlocked", "entity.enemy.dead", [
          dwarfCandidate("entity.enemy.dead", { currentHealth: 0 })
        ])
      ]
    });
    expect(unlocked.decisions[0]).toMatchObject({
      targetLock: { status: "unlocked" },
      commitment: { status: "cancelled" }
    });
  });

  it("sorts detached immutable evidence without mutating inputs", () => {
    const request = {
      schemaVersion: 1 as const,
      currentTick: 12,
      entries: [targetingEntry("attack.zulu"), targetingEntry("attack.alpha")]
    };
    const before = structuredClone(request);
    const result = resolveDwarfAttackTargeting(request);
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

  it("rejects mismatched identities, ranges, malformed windups, and unsafe containers", () => {
    expect(() =>
      resolveDwarfAttackTargeting({
        schemaVersion: 1,
        currentTick: -1,
        entries: []
      })
    ).toThrow("currentTick must be a non-negative safe integer");
    expect(() =>
      resolveDwarfAttackTargeting({
        schemaVersion: 2 as never,
        currentTick: 12,
        entries: []
      })
    ).toThrow("unsupported schemaVersion");

    expect(() =>
      resolveDwarfAttackTargeting({
        schemaVersion: 1,
        currentTick: 12,
        entries: [
          {
            ...targetingEntry(),
            sourceEntityId: "entity.dwarf.other" as never
          }
        ]
      })
    ).toThrow("source identity does not match windup");

    const base = targetingEntry();
    const mismatched = {
      ...base,
      targetLock: {
        ...base.targetLock,
        currentTargetEntityId: "entity.enemy.other" as never
      }
    };
    expect(() =>
      resolveDwarfAttackTargeting({
        schemaVersion: 1,
        currentTick: 12,
        entries: [mismatched]
      })
    ).toThrow("current target does not match windup target");

    expect(() =>
      resolveDwarfAttackTargeting({
        schemaVersion: 1,
        currentTick: 12,
        entries: [targetingEntry(), targetingEntry()]
      })
    ).toThrow("duplicate attack windup ID");

    const sparse = new Array(1) as ReturnType<typeof targetingEntry>[];
    expect(() =>
      resolveDwarfAttackTargeting({
        schemaVersion: 1,
        currentTick: 12,
        entries: sparse
      })
    ).toThrow("dense data array");

    let getterCalls = 0;
    const accessor = targetingEntry();
    Object.defineProperty(accessor, "windup", {
      enumerable: true,
      get() {
        getterCalls += 1;
        return targetingEntry().windup;
      }
    });
    expect(() =>
      resolveDwarfAttackTargeting({
        schemaVersion: 1,
        currentTick: 12,
        entries: [accessor]
      })
    ).toThrow("windup must be an enumerable data property");
    expect(getterCalls).toBe(0);

    const malformedValidity = targetingEntry();
    expect(() =>
      resolveDwarfAttackTargeting({
        schemaVersion: 1,
        currentTick: 12,
        entries: [
          {
            ...malformedValidity,
            windup: {
              ...malformedValidity.windup,
              targetIsValid: "yes"
            } as never
          }
        ]
      })
    ).toThrow("targetIsValid must be boolean");

    const mismatchedRange = targetingEntry();
    expect(() =>
      resolveDwarfAttackTargeting({
        schemaVersion: 1,
        currentTick: 12,
        entries: [
          {
            ...mismatchedRange,
            windup: { ...mismatchedRange.windup, range: 9 }
          }
        ]
      })
    ).toThrow("range does not match target-lock range");
  });

  it("pins shared integration evidence to the browser checksum", async () => {
    expect(await canonicalHash(dwarfAttackTargetingParityEvidence())).toBe(
      "9ab71c2dff51e19bfabc925e174697f6dd68b0e0a731815393e072632b477437"
    );
  });
});
