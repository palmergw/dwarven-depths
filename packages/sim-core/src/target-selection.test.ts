import type {
  DwarfTargetCandidate,
  DwarfTargetPolicy
} from "@dwarven-depths/contracts";
import { describe, expect, it } from "vitest";
import { selectDwarfTarget } from "./index.js";

function candidate(
  entityId: string,
  overrides: Partial<DwarfTargetCandidate> = {}
): DwarfTargetCandidate {
  return {
    entityId,
    distanceSquared: 100,
    currentHealth: 50,
    maximumHealth: 100,
    armor: 5,
    speed: 10,
    isBoss: false,
    isElite: false,
    ...overrides
  } as DwarfTargetCandidate;
}

const allPolicies: readonly DwarfTargetPolicy[] = [
  "nearest",
  "lowest_health",
  "highest_health",
  "highest_armor",
  "fastest",
  "boss_or_elite_first"
];

describe("deterministic dwarf target selection", () => {
  it.each([
    ["nearest", { distanceSquared: 25 }],
    ["lowest_health", { currentHealth: 10 }],
    ["highest_health", { currentHealth: 90 }],
    ["highest_armor", { armor: 20 }],
    ["fastest", { speed: 20 }]
  ] as const)("selects the %s policy preference", (policy, preferredStats) => {
    const result = selectDwarfTarget({
      requestedPolicy: policy,
      supportedPolicies: allPolicies,
      candidates: [
        candidate("entity.enemy.alpha"),
        candidate("entity.enemy.preferred", preferredStats)
      ]
    });

    expect(result).toEqual({
      requestedPolicy: policy,
      appliedPolicy: policy,
      targetEntityId: "entity.enemy.preferred",
      reason: "selected_requested_policy"
    });
  });

  it("prioritizes bosses and elites before applying universal ties", () => {
    expect(
      selectDwarfTarget({
        requestedPolicy: "boss_or_elite_first",
        supportedPolicies: allPolicies,
        candidates: [
          candidate("entity.enemy.normal", { distanceSquared: 1 }),
          candidate("entity.enemy.elite", {
            distanceSquared: 36,
            isElite: true
          }),
          candidate("entity.enemy.boss", {
            distanceSquared: 36,
            isBoss: true
          })
        ]
      })
    ).toEqual({
      requestedPolicy: "boss_or_elite_first",
      appliedPolicy: "boss_or_elite_first",
      targetEntityId: "entity.enemy.boss",
      reason: "selected_requested_policy"
    });
  });

  it("falls back to nearest for unsupported and impossible preferences", () => {
    const candidates = [
      candidate("entity.enemy.far", { distanceSquared: 100 }),
      candidate("entity.enemy.near", { distanceSquared: 4 })
    ];

    expect(
      selectDwarfTarget({
        requestedPolicy: "highest_armor",
        supportedPolicies: ["nearest"],
        candidates
      })
    ).toEqual({
      requestedPolicy: "highest_armor",
      appliedPolicy: "nearest",
      targetEntityId: "entity.enemy.near",
      reason: "fallback_unsupported_policy"
    });
    expect(
      selectDwarfTarget({
        requestedPolicy: "boss_or_elite_first",
        supportedPolicies: allPolicies,
        candidates
      })
    ).toEqual({
      requestedPolicy: "boss_or_elite_first",
      appliedPolicy: "nearest",
      targetEntityId: "entity.enemy.near",
      reason: "fallback_no_preferred_target"
    });
  });

  it("returns a reason-coded result when no valid target exists", () => {
    expect(
      selectDwarfTarget({
        requestedPolicy: "nearest",
        supportedPolicies: ["nearest"],
        candidates: []
      })
    ).toEqual({
      requestedPolicy: "nearest",
      appliedPolicy: "nearest",
      reason: "no_valid_targets"
    });
  });

  it("resolves every primary-stat tie by distance and then stable entity ID", () => {
    for (const policy of allPolicies) {
      const candidates = [
        candidate("entity.enemy.zulu", {
          distanceSquared: 25,
          ...(policy === "boss_or_elite_first" ? { isElite: true } : {})
        }),
        candidate("entity.enemy.alpha", {
          distanceSquared: 25,
          ...(policy === "boss_or_elite_first" ? { isBoss: true } : {})
        }),
        candidate("entity.enemy.nearer", {
          distanceSquared: 9,
          ...(policy === "boss_or_elite_first" ? { isElite: true } : {})
        })
      ];

      expect(
        selectDwarfTarget({
          requestedPolicy: policy,
          supportedPolicies: allPolicies,
          candidates
        }).targetEntityId
      ).toBe("entity.enemy.nearer");

      expect(
        selectDwarfTarget({
          requestedPolicy: policy,
          supportedPolicies: allPolicies,
          candidates: candidates.slice(0, 2)
        }).targetEntityId
      ).toBe("entity.enemy.alpha");
    }
  });

  it("rejects malformed policies, candidates, and duplicate IDs", () => {
    const valid = candidate("entity.enemy.valid");
    expect(() =>
      selectDwarfTarget({
        requestedPolicy: "unknown" as DwarfTargetPolicy,
        supportedPolicies: ["nearest"],
        candidates: [valid]
      })
    ).toThrow("unknown requested target policy");
    expect(() =>
      selectDwarfTarget({
        requestedPolicy: "nearest",
        supportedPolicies: ["nearest", "nearest"],
        candidates: [valid]
      })
    ).toThrow("duplicate supported target policy");
    expect(() =>
      selectDwarfTarget({
        requestedPolicy: "nearest",
        supportedPolicies: ["nearest"],
        candidates: [valid, valid]
      })
    ).toThrow("duplicate target candidate entity ID");

    for (const invalid of [
      candidate("invalid"),
      candidate("entity.enemy.invalid_distance", { distanceSquared: -1 }),
      candidate("entity.enemy.invalid_health", { currentHealth: 0 }),
      candidate("entity.enemy.invalid_maximum", { maximumHealth: 0 }),
      candidate("entity.enemy.health_overflow", {
        currentHealth: 101,
        maximumHealth: 100
      }),
      candidate("entity.enemy.invalid_armor", { armor: -1 }),
      candidate("entity.enemy.invalid_speed", { speed: -1 }),
      candidate("entity.enemy.unsafe", { speed: Number.MAX_SAFE_INTEGER + 1 })
    ]) {
      expect(() =>
        selectDwarfTarget({
          requestedPolicy: "nearest",
          supportedPolicies: ["nearest"],
          candidates: [invalid]
        })
      ).toThrow();
    }
  });

  it("rejects accessors and overridden array methods without invoking them", () => {
    let getterCalls = 0;
    const accessorCandidate = candidate("entity.enemy.accessor");
    Object.defineProperty(accessorCandidate, "entityId", {
      enumerable: true,
      get() {
        getterCalls += 1;
        return "entity.enemy.accessor";
      }
    });
    expect(() =>
      selectDwarfTarget({
        requestedPolicy: "nearest",
        supportedPolicies: ["nearest"],
        candidates: [accessorCandidate]
      })
    ).toThrow("entityId must be an enumerable data property");
    expect(getterCalls).toBe(0);

    const candidates = [candidate("entity.enemy.valid")];
    Object.defineProperty(candidates, "map", {
      enumerable: true,
      value: () => []
    });
    expect(() =>
      selectDwarfTarget({
        requestedPolicy: "nearest",
        supportedPolicies: ["nearest"],
        candidates
      })
    ).toThrow("target candidates must be a dense data array");
  });

  it("rejects policy objects without invoking caller-controlled coercion", () => {
    let coercionCalls = 0;
    const invalidPolicy = {
      [Symbol.toPrimitive]() {
        coercionCalls += 1;
        throw new Error("caller code executed");
      }
    } as unknown as DwarfTargetPolicy;

    expect(() =>
      selectDwarfTarget({
        requestedPolicy: invalidPolicy,
        supportedPolicies: ["nearest"],
        candidates: []
      })
    ).toThrow("unknown requested target policy");
    expect(() =>
      selectDwarfTarget({
        requestedPolicy: "nearest",
        supportedPolicies: [invalidPolicy],
        candidates: []
      })
    ).toThrow("unknown supported target policy");
    expect(coercionCalls).toBe(0);
  });

  it("is permutation-invariant, detached, and deeply immutable", () => {
    const request = {
      requestedPolicy: "lowest_health" as const,
      supportedPolicies: [...allPolicies],
      candidates: [
        candidate("entity.enemy.beta", { currentHealth: 10 }),
        candidate("entity.enemy.alpha", { currentHealth: 10 })
      ]
    };
    const before = structuredClone(request);
    const forward = selectDwarfTarget(request);
    const reversed = selectDwarfTarget({
      ...request,
      supportedPolicies: [...request.supportedPolicies].reverse(),
      candidates: [...request.candidates].reverse()
    });

    expect(reversed).toEqual(forward);
    expect(request).toEqual(before);
    expect(Object.isFrozen(forward)).toBe(true);
  });
});
