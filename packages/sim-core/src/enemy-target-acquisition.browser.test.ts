import { canonicalHash } from "@dwarven-depths/contracts";
import { describe, expect, it } from "vitest";
import { acquireEnemyTarget } from "./index.js";

describe("enemy target acquisition browser parity", () => {
  it("pins dwarf, route-opening blocker, and empty decisions", async () => {
    const base = {
      placementPointId: "placement.gate" as never,
      isAlive: true,
      isReachable: true
    };
    const decisions = [
      acquireEnemyTarget({
        candidates: [
          {
            ...base,
            entityId: "entity.dwarf.warden" as never,
            targetKind: "living_dwarf",
            pathCost: 20,
            opensRoute: false
          }
        ]
      }),
      acquireEnemyTarget({
        candidates: [
          {
            ...base,
            entityId: "entity.deployable.barricade" as never,
            targetKind: "attackable_blocker",
            pathCost: 10,
            opensRoute: true
          }
        ]
      }),
      acquireEnemyTarget({ candidates: [] })
    ];
    expect(decisions.map((decision) => decision.reason)).toEqual([
      "selected_reachable_dwarf",
      "selected_route_opening_blocker",
      "no_eligible_targets"
    ]);
    expect(await canonicalHash(decisions)).toBe(
      "f221c73b229b80ad5551ea234d60d03ca24e79acdd7a0cc94a7b9f9c6d683b8c"
    );
  });

  it("pins eligibility, validation, and permutation boundaries", () => {
    const valid = {
      entityId: "entity.dwarf.alpha" as never,
      targetKind: "living_dwarf" as const,
      placementPointId: "placement.alpha" as never,
      pathCost: 10,
      isAlive: true,
      isReachable: true,
      opensRoute: false
    };
    const ineligible = [
      { ...valid, entityId: "entity.dwarf.dead" as never, isAlive: false },
      {
        ...valid,
        entityId: "entity.dwarf.unreachable" as never,
        isReachable: false
      },
      {
        ...valid,
        entityId: "entity.deployable.closed" as never,
        targetKind: "attackable_blocker" as const,
        opensRoute: false
      }
    ];
    expect(acquireEnemyTarget({ candidates: ineligible })).toEqual({
      reason: "no_eligible_targets"
    });

    const tied = [{ ...valid, entityId: "entity.dwarf.zulu" as never }, valid];
    expect(acquireEnemyTarget({ candidates: tied })).toEqual(
      acquireEnemyTarget({ candidates: [...tied].reverse() })
    );
    expect(acquireEnemyTarget({ candidates: tied }).targetEntityId).toBe(
      "entity.dwarf.alpha"
    );

    expect(() => acquireEnemyTarget({ candidates: [valid, valid] })).toThrow(
      "duplicate enemy target candidate entity ID"
    );
    expect(() =>
      acquireEnemyTarget({ candidates: [{ ...valid, pathCost: -1 }] })
    ).toThrow("pathCost must be a non-negative safe integer");
  });
});
