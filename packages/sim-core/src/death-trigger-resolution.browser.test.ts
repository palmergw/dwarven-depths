import { canonicalHash } from "@dwarven-depths/contracts";
import { describe, expect, it } from "vitest";
import { deathTriggerParityEvidence } from "./death-trigger-resolution.fixture.js";
import { resolveDeathTriggers } from "./index.js";

describe("death trigger browser parity", () => {
  it("pins recursive trigger resolution evidence", async () => {
    expect(await canonicalHash(deathTriggerParityEvidence())).toBe(
      "c2642666869b0348c1a3edc5c08390543fa3b5bdb7d5b47af9f5b7e4c66b2ea1"
    );
  });

  it("pins ordering and safety-limit boundaries", () => {
    const combatants = [
      {
        schemaVersion: 1 as const,
        entityId: "entity.enemy.zulu" as never,
        kind: "enemy" as const,
        currentHealth: 1,
        lifecycleState: "active" as const
      },
      {
        schemaVersion: 1 as const,
        entityId: "entity.enemy.alpha" as never,
        kind: "enemy" as const,
        currentHealth: 0,
        lifecycleState: "destroyed" as const
      }
    ];
    const result = resolveDeathTriggers({
      combatants,
      deathEntityIds: ["entity.enemy.alpha" as never],
      effects: [
        {
          schemaVersion: 1,
          effectId: "effect.alpha.hit" as never,
          ownerEntityId: "entity.enemy.alpha" as never,
          targetEntityId: "entity.enemy.zulu" as never,
          damage: 1
        }
      ],
      recursionLimit: 1
    });

    expect(result.status).toBe("safety_limit_reached");
    expect(result.pendingDeathEntityIds).toEqual(["entity.enemy.zulu"]);
    expect(() =>
      resolveDeathTriggers({
        combatants,
        deathEntityIds: ["entity.enemy.alpha" as never],
        effects: [],
        recursionLimit: 0
      })
    ).toThrow("recursionLimit must be between");
  });
});
