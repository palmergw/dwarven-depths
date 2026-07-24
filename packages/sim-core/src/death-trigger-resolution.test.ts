import {
  type CombatantLifecycle,
  canonicalHash,
  type DeathTriggerEffect
} from "@dwarven-depths/contracts";
import { describe, expect, it } from "vitest";
import { deathTriggerParityEvidence } from "./death-trigger-resolution.fixture.js";
import { resolveDeathTriggers } from "./index.js";

function combatant(
  entityId: string,
  overrides: Partial<CombatantLifecycle> = {}
): CombatantLifecycle {
  return {
    schemaVersion: 1,
    entityId: entityId as never,
    kind: "enemy",
    currentHealth: 10,
    lifecycleState: "active",
    ...overrides
  };
}

function effect(
  effectId: string,
  ownerEntityId: string,
  targetEntityId: string,
  damage: number
): DeathTriggerEffect {
  return {
    schemaVersion: 1,
    effectId: effectId as never,
    ownerEntityId: ownerEntityId as never,
    targetEntityId: targetEntityId as never,
    damage
  };
}

const deadAlpha = combatant("entity.enemy.alpha", {
  currentHealth: 0,
  lifecycleState: "destroyed"
});

describe("death trigger resolution", () => {
  it("resolves a recursive chain once per death in stable rounds", () => {
    const result = deathTriggerParityEvidence();

    expect(result.status).toBe("complete");
    expect(result.completedRounds).toBe(4);
    expect(result.pendingDeathEntityIds).toEqual([]);
    expect(
      result.decisions.map(({ round, effectId, status, reason }) => ({
        round,
        effectId,
        status,
        reason
      }))
    ).toEqual([
      {
        round: 1,
        effectId: "effect.alpha.blast",
        status: "executed",
        reason: "damage_applied"
      },
      {
        round: 2,
        effectId: "effect.bravo.blast",
        status: "executed",
        reason: "damage_applied"
      },
      {
        round: 3,
        effectId: "effect.charlie.blast",
        status: "executed",
        reason: "damage_applied"
      },
      {
        round: 4,
        effectId: "effect.delta.blast",
        status: "discarded",
        reason: "target_not_living"
      }
    ]);
    expect(
      result.lifecycleTransitions.map(
        ({ round, entityId, lifecycleAfter }) => ({
          round,
          entityId,
          lifecycleAfter
        })
      )
    ).toEqual([
      {
        round: 1,
        entityId: "entity.enemy.bravo",
        lifecycleAfter: "destroyed"
      },
      {
        round: 2,
        entityId: "entity.dwarf.charlie",
        lifecycleAfter: "downed"
      },
      {
        round: 3,
        entityId: "entity.deployable.delta",
        lifecycleAfter: "destroyed"
      }
    ]);
  });

  it("aggregates simultaneous trigger damage before lifecycle transitions", () => {
    const deadZulu = combatant("entity.enemy.zulu", {
      currentHealth: 0,
      lifecycleState: "destroyed"
    });
    const target = combatant("entity.enemy.target", { currentHealth: 7 });
    const result = resolveDeathTriggers({
      combatants: [deadZulu, target, deadAlpha],
      deathEntityIds: [deadZulu.entityId, deadAlpha.entityId],
      effects: [
        effect(
          "effect.zulu.hit",
          "entity.enemy.zulu",
          "entity.enemy.target",
          3
        ),
        effect(
          "effect.alpha.hit",
          "entity.enemy.alpha",
          "entity.enemy.target",
          4
        )
      ],
      recursionLimit: 2
    });

    expect(result.decisions.map((decision) => decision.effectId)).toEqual([
      "effect.alpha.hit",
      "effect.zulu.hit"
    ]);
    expect(result.healthResolutions).toEqual([
      {
        schemaVersion: 1,
        round: 1,
        entityId: "entity.enemy.target",
        healthBefore: 7,
        incomingDamage: 7,
        appliedDamage: 7,
        healthAfter: 0
      }
    ]);
    expect(result.lifecycleTransitions).toHaveLength(1);
    expect(result.completedRounds).toBe(2);
  });

  it("reports pending deaths when the authored recursion limit is reached", () => {
    const result = resolveDeathTriggers({
      combatants: [
        deadAlpha,
        combatant("entity.enemy.bravo", { currentHealth: 1 })
      ],
      deathEntityIds: [deadAlpha.entityId],
      effects: [
        effect(
          "effect.alpha.hit",
          "entity.enemy.alpha",
          "entity.enemy.bravo",
          1
        ),
        effect(
          "effect.bravo.hit",
          "entity.enemy.bravo",
          "entity.missing.target",
          1
        )
      ],
      recursionLimit: 1
    });

    expect(result.status).toBe("safety_limit_reached");
    expect(result.completedRounds).toBe(1);
    expect(result.pendingDeathEntityIds).toEqual(["entity.enemy.bravo"]);
    expect(result.decisions.map((decision) => decision.effectId)).toEqual([
      "effect.alpha.hit"
    ]);
  });

  it("executes only effects owned by supplied new death events", () => {
    const deadBravo = combatant("entity.enemy.bravo", {
      currentHealth: 0,
      lifecycleState: "destroyed"
    });
    const result = resolveDeathTriggers({
      combatants: [deadBravo, deadAlpha, combatant("entity.enemy.target")],
      deathEntityIds: [deadAlpha.entityId],
      effects: [
        effect(
          "effect.alpha.hit",
          "entity.enemy.alpha",
          "entity.enemy.target",
          1
        ),
        effect(
          "effect.bravo.hit",
          "entity.enemy.bravo",
          "entity.enemy.target",
          9
        )
      ],
      recursionLimit: 2
    });

    expect(result.decisions.map((decision) => decision.effectId)).toEqual([
      "effect.alpha.hit"
    ]);
    expect(
      result.combatants.find((item) => item.entityId === "entity.enemy.target")
    ).toMatchObject({ currentHealth: 9, lifecycleState: "active" });
  });

  it("is input-order independent, deeply frozen, detached, and nonmutating", () => {
    const request = {
      combatants: [
        combatant("entity.enemy.target", { currentHealth: 2 }),
        deadAlpha
      ],
      deathEntityIds: [deadAlpha.entityId],
      effects: [
        effect(
          "effect.alpha.zulu",
          "entity.enemy.alpha",
          "entity.enemy.target",
          1
        ),
        effect(
          "effect.alpha.alpha",
          "entity.enemy.alpha",
          "entity.enemy.target",
          1
        )
      ],
      recursionLimit: 2
    };
    const before = structuredClone(request);
    const forward = resolveDeathTriggers(request);
    const reverse = resolveDeathTriggers({
      ...request,
      combatants: [...request.combatants].reverse(),
      effects: [...request.effects].reverse()
    });

    expect(forward).toEqual(reverse);
    expect(request).toEqual(before);
    expect(Object.isFrozen(forward)).toBe(true);
    for (const value of [
      forward.combatants,
      forward.combatants[0],
      forward.decisions,
      forward.decisions[0],
      forward.healthResolutions,
      forward.healthResolutions[0],
      forward.lifecycleTransitions,
      forward.lifecycleTransitions[0],
      forward.pendingDeathEntityIds
    ])
      expect(Object.isFrozen(value)).toBe(true);
  });

  it("rejects malformed, duplicate, and inconsistent inputs", () => {
    const target = combatant("entity.enemy.target");
    const base = {
      combatants: [deadAlpha, target],
      deathEntityIds: [deadAlpha.entityId],
      effects: [
        effect(
          "effect.alpha.hit",
          "entity.enemy.alpha",
          "entity.enemy.target",
          1
        )
      ],
      recursionLimit: 2
    };

    for (const invalidLimit of [0, -0, -1, 1.5, Number.MAX_SAFE_INTEGER])
      expect(() =>
        resolveDeathTriggers({ ...base, recursionLimit: invalidLimit })
      ).toThrow();
    expect(() =>
      resolveDeathTriggers({
        ...base,
        combatants: [deadAlpha, deadAlpha]
      })
    ).toThrow("duplicate combatant entity ID");
    expect(() =>
      resolveDeathTriggers({
        ...base,
        deathEntityIds: [deadAlpha.entityId, deadAlpha.entityId]
      })
    ).toThrow("duplicate death entity ID");
    expect(() =>
      resolveDeathTriggers({
        ...base,
        deathEntityIds: [target.entityId]
      })
    ).toThrow("still active");
    expect(() =>
      resolveDeathTriggers({
        ...base,
        deathEntityIds: ["entity.missing" as never]
      })
    ).toThrow("unknown combatant");
    expect(() =>
      resolveDeathTriggers({
        ...base,
        effects: [
          base.effects[0] as DeathTriggerEffect,
          base.effects[0] as DeathTriggerEffect
        ]
      })
    ).toThrow("duplicate death trigger effect ID");
    expect(() =>
      resolveDeathTriggers({
        ...base,
        effects: [
          effect(
            "effect.missing.hit",
            "entity.missing.owner",
            "entity.enemy.target",
            1
          )
        ]
      })
    ).toThrow("unknown owner");
    expect(() =>
      resolveDeathTriggers({
        ...base,
        effects: [
          effect(
            "effect.alpha.hit",
            "entity.enemy.alpha",
            "entity.enemy.target",
            -0
          )
        ]
      })
    ).toThrow("non-negative safe integer");
    expect(() =>
      resolveDeathTriggers({
        ...base,
        combatants: [
          deadAlpha,
          combatant("entity.enemy.invalid", { currentHealth: 0 })
        ]
      })
    ).toThrow("must have positive health");
  });

  it("rejects sparse arrays and accessors without invoking caller code", () => {
    expect(() =>
      resolveDeathTriggers({
        combatants: new Array(1) as CombatantLifecycle[],
        deathEntityIds: [],
        effects: [],
        recursionLimit: 1
      })
    ).toThrow("dense data array");

    let getterCalls = 0;
    const accessor = { ...deadAlpha };
    Object.defineProperty(accessor, "entityId", {
      enumerable: true,
      get() {
        getterCalls += 1;
        return "entity.enemy.alpha";
      }
    });
    expect(() =>
      resolveDeathTriggers({
        combatants: [accessor],
        deathEntityIds: [],
        effects: [],
        recursionLimit: 1
      })
    ).toThrow("entityId must be an enumerable data property");
    expect(getterCalls).toBe(0);
  });

  it("pins the shared Node and browser parity evidence", async () => {
    expect(await canonicalHash(deathTriggerParityEvidence())).toBe(
      "c2642666869b0348c1a3edc5c08390543fa3b5bdb7d5b47af9f5b7e4c66b2ea1"
    );
  });
});
