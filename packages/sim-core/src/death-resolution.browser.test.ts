import { canonicalHash } from "@dwarven-depths/contracts";
import { describe, expect, it } from "vitest";
import { deathResolutionParityEvidence } from "./death-resolution.fixture.js";
import { resolveZeroHealthLifecycles } from "./index.js";

describe("zero-health lifecycle browser parity", () => {
  it("pins simultaneous mixed-kind death resolution evidence", async () => {
    expect(await canonicalHash(deathResolutionParityEvidence())).toBe(
      "414cf6301c7bf3368a937fb5594c703b6cc6ca0288ae4a8d7f8e88167b8c2640"
    );
  });

  it("pins ordering and validation boundaries", () => {
    const combatants = [
      {
        schemaVersion: 1 as const,
        entityId: "entity.zulu" as never,
        kind: "enemy" as const,
        currentHealth: 1,
        lifecycleState: "active" as const
      },
      {
        schemaVersion: 1 as const,
        entityId: "entity.alpha" as never,
        kind: "dwarf" as const,
        currentHealth: 1,
        lifecycleState: "active" as const
      }
    ];
    const forward = resolveZeroHealthLifecycles({
      combatants,
      occupancy: []
    });
    const reverse = resolveZeroHealthLifecycles({
      combatants: [...combatants].reverse(),
      occupancy: []
    });
    expect(forward).toEqual(reverse);
    expect(() =>
      resolveZeroHealthLifecycles({
        combatants: [
          {
            schemaVersion: 1,
            entityId: "entity.zulu" as never,
            kind: "enemy",
            currentHealth: 0,
            lifecycleState: "downed"
          }
        ],
        occupancy: []
      })
    ).toThrow("only a dwarf can be downed");
  });
});
