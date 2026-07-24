import { describe, expect, it } from "vitest";
import {
  dwarfCandidate,
  enemyCandidate,
  targetLockMap,
  targetLockParityEvidence
} from "./target-locks.fixture.js";
import {
  resolveDwarfTargetLock,
  resolveEnemyTargetLock
} from "./target-locks.js";

const dwarfRequest = {
  map: targetLockMap,
  sourceAimPointId: "aim.dwarf" as never,
  range: 10,
  requiresLineOfSight: true,
  currentTargetEntityId: "entity.enemy.current" as never,
  requestedPolicy: "highest_armor" as const,
  supportedPolicies: ["nearest", "highest_armor"] as const,
  candidates: [
    dwarfCandidate("entity.enemy.current"),
    dwarfCandidate("entity.enemy.preferred", { armor: 50 })
  ]
};

describe("deterministic target locks", () => {
  it("retains a valid dwarf target without reapplying a changed policy", () => {
    expect(resolveDwarfTargetLock(dwarfRequest)).toEqual({
      schemaVersion: 1,
      status: "retained",
      targetEntityId: "entity.enemy.current",
      previousTargetReason: "target_remains_valid"
    });
  });

  it.each([
    ["entity.enemy.missing", [], "target_absent"],
    [
      "entity.enemy.current",
      [dwarfCandidate("entity.enemy.current", { currentHealth: 0 })],
      "target_not_living"
    ],
    [
      "entity.enemy.current",
      [dwarfCandidate("entity.enemy.current", { isHostile: false })],
      "target_not_hostile"
    ],
    [
      "entity.enemy.current",
      [
        dwarfCandidate("entity.enemy.current", {
          aimPointId: "aim.far" as never
        })
      ],
      "target_out_of_range"
    ],
    [
      "entity.enemy.current",
      [
        dwarfCandidate("entity.enemy.current", {
          aimPointId: "aim.obscured" as never
        })
      ],
      "target_outside_line_of_sight"
    ]
  ] as const)(
    "reacquires after %s becomes invalid",
    (current, invalid, reason) => {
      const result = resolveDwarfTargetLock({
        ...dwarfRequest,
        currentTargetEntityId: current as never,
        candidates: [...invalid, dwarfCandidate("entity.enemy.replacement")]
      });
      expect(result).toEqual({
        schemaVersion: 1,
        status: "reacquired",
        targetEntityId: "entity.enemy.replacement",
        previousTargetReason: reason,
        selectionReason: "selected_requested_policy"
      });
    }
  );

  it("filters dead, friendly, out-of-range, and obscured candidates before policy selection", () => {
    const result = resolveDwarfTargetLock({
      ...dwarfRequest,
      currentTargetEntityId: null,
      candidates: [
        dwarfCandidate("entity.enemy.dead", { currentHealth: 0, armor: 100 }),
        dwarfCandidate("entity.friend", { isHostile: false, armor: 100 }),
        dwarfCandidate("entity.enemy.far", {
          aimPointId: "aim.far" as never,
          armor: 100
        }),
        dwarfCandidate("entity.enemy.obscured", {
          aimPointId: "aim.obscured" as never,
          armor: 100
        }),
        dwarfCandidate("entity.enemy.valid", { armor: 5 })
      ]
    });
    expect(result.targetEntityId).toBe("entity.enemy.valid");
    expect(result.previousTargetReason).toBe("no_previous_target");
  });

  it("returns an unlocked reason-coded decision when no candidate is eligible", () => {
    expect(
      resolveDwarfTargetLock({
        ...dwarfRequest,
        currentTargetEntityId: null,
        candidates: []
      })
    ).toEqual({
      schemaVersion: 1,
      status: "unlocked",
      previousTargetReason: "no_previous_target",
      selectionReason: "no_valid_targets"
    });
  });

  it("retains eligible enemy route targets and reacquires invalid ones", () => {
    const candidates = [
      enemyCandidate("entity.dwarf.current", { pathCost: 50 }),
      enemyCandidate("entity.dwarf.better", { pathCost: 5 })
    ];
    expect(
      resolveEnemyTargetLock({
        currentTargetEntityId: "entity.dwarf.current" as never,
        candidates
      })
    ).toEqual({
      schemaVersion: 1,
      status: "retained",
      targetEntityId: "entity.dwarf.current",
      previousTargetReason: "target_remains_eligible"
    });
    expect(
      resolveEnemyTargetLock({
        currentTargetEntityId: "entity.dwarf.current" as never,
        candidates: [
          enemyCandidate("entity.dwarf.current", { isReachable: false }),
          enemyCandidate("entity.dwarf.better", { pathCost: 5 })
        ]
      })
    ).toEqual({
      schemaVersion: 1,
      status: "reacquired",
      targetEntityId: "entity.dwarf.better",
      previousTargetReason: "target_not_eligible",
      acquisitionReason: "selected_reachable_dwarf"
    });
  });

  it("strictly validates target-lock requests and candidate identities", () => {
    expect(() =>
      resolveDwarfTargetLock({
        ...dwarfRequest,
        candidates: [
          dwarfCandidate("entity.enemy.same"),
          dwarfCandidate("entity.enemy.same")
        ]
      })
    ).toThrow("duplicate target-lock candidate entity ID");
    expect(() =>
      resolveDwarfTargetLock({ ...dwarfRequest, range: -1 })
    ).toThrow("range must be a non-negative safe integer");
    expect(() =>
      resolveDwarfTargetLock({
        ...dwarfRequest,
        requestedPolicy: "unknown" as never
      })
    ).toThrow("unknown requested target policy");
    expect(() =>
      resolveDwarfTargetLock({
        ...dwarfRequest,
        candidates: [dwarfCandidate("entity.enemy.bad", { currentHealth: 101 })]
      })
    ).toThrow("health must not exceed a positive maximumHealth");
    expect(() =>
      resolveDwarfTargetLock({
        ...dwarfRequest,
        candidates: [
          dwarfCandidate("entity.enemy.dead", {
            aimPointId: "aim.missing" as never,
            currentHealth: 0
          })
        ]
      })
    ).toThrow("unknown aim point ID (aim.missing)");
  });

  it("is input-order independent, detached, and deeply immutable", () => {
    const forward = targetLockParityEvidence();
    const reversed = resolveDwarfTargetLock({
      ...dwarfRequest,
      currentTargetEntityId: "entity.enemy.dead" as never,
      candidates: [
        dwarfCandidate("entity.enemy.near"),
        dwarfCandidate("entity.enemy.dead", { currentHealth: 0 })
      ].reverse()
    });
    expect(reversed.targetEntityId).toBe("entity.enemy.near");
    expect(Object.isFrozen(forward)).toBe(true);
    expect(Object.isFrozen(forward.retained)).toBe(true);
  });
});
