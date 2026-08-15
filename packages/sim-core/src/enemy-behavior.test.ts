import type { AuthoredEnemyBehaviorDefinition } from "@dwarven-depths/contracts";
import { describe, expect, it } from "vitest";
import { resolveEnemyBehaviorIntent } from "./enemy-behavior.js";

const behavior: AuthoredEnemyBehaviorDefinition = {
  schemaVersion: 1,
  roleId: "enemy_role.warden_hunter" as never,
  strategy: "priority_hunt",
  tellId: "enemy_tell.warden_hunter_mark" as never,
  tellTicks: 3,
  purposeId: "enemy_purpose.priority_threat" as never,
  counterplayId: "enemy_counterplay.break_hunter_mark" as never,
  mechanic: "target_mark",
  effectId: "enemy_effect.warden_hunter_mark" as never,
  effectMagnitude: 25,
  effectDurationTicks: 4,
  effectCooldownTicks: 5
};

function request(currentTick: number) {
  return {
    schemaVersion: 1 as const,
    currentTick,
    admittedAtTick: 10,
    enemyEntityId: "entity.enemy.hunter" as never,
    behavior,
    targets: [
      {
        entityId: "entity.dwarf.near" as never,
        currentHealth: 80,
        maximumHealth: 100,
        pathCost: 1
      },
      {
        entityId: "entity.dwarf.wounded" as never,
        currentHealth: 20,
        maximumHealth: 100,
        pathCost: 4
      }
    ],
    allies: []
  };
}

describe("enemy behavior intent", () => {
  it("emits exact tell, active, and cooldown boundaries", () => {
    expect(resolveEnemyBehaviorIntent(request(10))).toMatchObject({
      phase: "telling",
      phaseStartedAtTick: 10,
      phaseCompletesAtTick: 13,
      targetEntityId: "entity.dwarf.wounded",
      reason: "lowest_health_target",
      effectStatus: "telling",
      effectMagnitude: 25
    });
    expect(resolveEnemyBehaviorIntent(request(13))).toMatchObject({
      phase: "active",
      phaseStartedAtTick: 13,
      phaseCompletesAtTick: 17,
      effectStatus: "committed"
    });
    expect(resolveEnemyBehaviorIntent(request(17))).toMatchObject({
      phase: "cooldown",
      phaseStartedAtTick: 17,
      phaseCompletesAtTick: 22,
      effectStatus: "cooling_down"
    });
    expect(resolveEnemyBehaviorIntent(request(22))).toMatchObject({
      phase: "telling",
      phaseStartedAtTick: 22,
      phaseCompletesAtTick: 25
    });
  });

  it("uses canonical ratio, path-cost, and stable-ID tie-breaks", () => {
    const input = request(10);
    const tied = {
      ...input,
      targets: [
        {
          entityId: "entity.dwarf.zulu" as never,
          currentHealth: 1,
          maximumHealth: 2,
          pathCost: 2
        },
        {
          entityId: "entity.dwarf.alpha" as never,
          currentHealth: 2,
          maximumHealth: 4,
          pathCost: 2
        }
      ]
    };
    expect(resolveEnemyBehaviorIntent(tied).targetEntityId).toBe(
      "entity.dwarf.alpha"
    );
    expect(
      resolveEnemyBehaviorIntent({
        ...tied,
        targets: [...tied.targets].reverse()
      })
    ).toEqual(resolveEnemyBehaviorIntent(tied));
  });

  it("selects wounded allies for guard/support and excludes self", () => {
    const input = request(10);
    expect(
      resolveEnemyBehaviorIntent({
        ...input,
        behavior: { ...behavior, strategy: "guard", mechanic: "ally_guard" },
        allies: [
          {
            entityId: input.enemyEntityId,
            currentHealth: 1,
            maximumHealth: 100,
            pathCost: 0
          },
          {
            entityId: "entity.enemy.ally" as never,
            currentHealth: 50,
            maximumHealth: 100,
            pathCost: 2
          }
        ]
      })
    ).toMatchObject({
      targetEntityId: "entity.enemy.ally",
      reason: "lowest_health_ally"
    });
  });

  it("fails closed on extra properties, malformed timing, and duplicates", () => {
    expect(() =>
      resolveEnemyBehaviorIntent({ ...request(10), unexpected: true } as never)
    ).toThrow(/exactly the expected keys/);
    expect(() =>
      resolveEnemyBehaviorIntent({
        ...request(10),
        currentTick: 9
      })
    ).toThrow(/must not precede/);
    const input = request(10);
    const duplicate = input.targets[0];
    if (duplicate === undefined) throw new Error("missing target fixture");
    expect(() =>
      resolveEnemyBehaviorIntent({
        ...input,
        targets: [duplicate, duplicate]
      })
    ).toThrow(/duplicate entityId/);
  });
});
