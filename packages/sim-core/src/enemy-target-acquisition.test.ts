import type { EnemyTargetCandidate } from "@dwarven-depths/contracts";
import { describe, expect, it } from "vitest";
import { acquireEnemyTarget } from "./index.js";

function candidate(
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

describe("deterministic enemy target acquisition", () => {
  it("selects the lowest path cost across reachable dwarves and route-opening blockers", () => {
    expect(
      acquireEnemyTarget({
        candidates: [
          candidate("entity.dwarf.far", { pathCost: 30 }),
          candidate("entity.deployable.blocker", {
            targetKind: "attackable_blocker",
            pathCost: 10,
            opensRoute: true
          })
        ]
      })
    ).toEqual({
      targetEntityId: "entity.deployable.blocker",
      targetKind: "attackable_blocker",
      placementPointId: "placement.middle",
      pathCost: 10,
      reason: "selected_route_opening_blocker"
    });
  });

  it("excludes dead, unreachable, and non-route-opening blockers", () => {
    const result = acquireEnemyTarget({
      candidates: [
        candidate("entity.dwarf.dead", { isAlive: false }),
        candidate("entity.dwarf.unreachable", { isReachable: false }),
        candidate("entity.deployable.decorative", {
          targetKind: "attackable_blocker",
          opensRoute: false
        })
      ]
    });
    expect(result).toEqual({ reason: "no_eligible_targets" });
    expect(Object.isFrozen(result)).toBe(true);
  });

  it("breaks equal-cost ties by placement point and then entity ID", () => {
    const inputs = [
      candidate("entity.dwarf.zulu", {
        placementPointId: "placement.alpha" as never
      }),
      candidate("entity.dwarf.alpha", {
        placementPointId: "placement.alpha" as never
      }),
      candidate("entity.dwarf.other", {
        placementPointId: "placement.zulu" as never
      })
    ];
    expect(acquireEnemyTarget({ candidates: inputs }).targetEntityId).toBe(
      "entity.dwarf.alpha"
    );
    expect(
      acquireEnemyTarget({ candidates: [...inputs].reverse() }).targetEntityId
    ).toBe("entity.dwarf.alpha");
  });

  it("strictly validates records without invoking accessors", () => {
    const valid = candidate("entity.dwarf.valid");
    expect(() => acquireEnemyTarget({ candidates: [valid, valid] })).toThrow(
      "duplicate enemy target candidate entity ID"
    );
    for (const invalid of [
      candidate("invalid"),
      candidate("entity.dwarf.bad_point", {
        placementPointId: "node.bad" as never
      }),
      candidate("entity.dwarf.bad_cost", { pathCost: -1 }),
      candidate("entity.dwarf.unsafe", {
        pathCost: Number.MAX_SAFE_INTEGER + 1
      }),
      candidate("entity.dwarf.bad_kind", { targetKind: "boss" as never }),
      candidate("entity.dwarf.bad_route", { opensRoute: true })
    ])
      expect(() => acquireEnemyTarget({ candidates: [invalid] })).toThrow();

    let calls = 0;
    const accessor = candidate("entity.dwarf.accessor");
    Object.defineProperty(accessor, "pathCost", {
      enumerable: true,
      get() {
        calls += 1;
        return 1;
      }
    });
    expect(() => acquireEnemyTarget({ candidates: [accessor] })).toThrow(
      "pathCost must be an enumerable data property"
    );
    expect(calls).toBe(0);
  });

  it("does not mutate inputs and returns a detached frozen decision", () => {
    const request = {
      candidates: [
        candidate("entity.dwarf.beta"),
        candidate("entity.dwarf.alpha")
      ]
    };
    const before = structuredClone(request);
    const decision = acquireEnemyTarget(request);
    expect(request).toEqual(before);
    expect(decision.targetEntityId).toBe("entity.dwarf.alpha");
    expect(Object.isFrozen(decision)).toBe(true);
  });
});
