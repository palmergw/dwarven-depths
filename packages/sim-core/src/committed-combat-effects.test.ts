import {
  type CommittedHealingEffect,
  type CommittedStatusEffect,
  canonicalHash
} from "@dwarven-depths/contracts";
import { describe, expect, it } from "vitest";
import {
  committedCombatEffectCombatants,
  committedCombatEffectParityEvidence,
  committedCombatEffectStatus,
  committedHealingEffect,
  committedStatusEffect
} from "./committed-combat-effects.fixture.js";
import { resolveCommittedCombatEffects } from "./index.js";

function resolve(overrides: Record<string, unknown> = {}) {
  return resolveCommittedCombatEffects({
    currentTick: 12,
    healingEffects: [committedHealingEffect],
    statusEffects: [committedStatusEffect],
    combatants: committedCombatEffectCombatants,
    statuses: [committedCombatEffectStatus],
    ...overrides
  } as never);
}

describe("committed healing and status effects", () => {
  it("retains committed work before its exact impact tick", () => {
    const result = resolve({ currentTick: 11 });
    expect(result.pendingHealingEffects).toEqual([committedHealingEffect]);
    expect(result.pendingStatusEffects).toEqual([committedStatusEffect]);
    expect(
      result.decisions.map(({ status, reason }) => ({ status, reason }))
    ).toEqual([
      { status: "pending", reason: "waiting_for_impact" },
      { status: "pending", reason: "waiting_for_impact" }
    ]);
    expect(result.health).toEqual([
      committedCombatEffectCombatants[1],
      committedCombatEffectCombatants[0]
    ]);
    expect(result.statuses).toEqual([committedCombatEffectStatus]);
  });

  it("aggregates simultaneous healing and caps it at maximum health", () => {
    const result = resolve({
      statusEffects: [],
      healingEffects: [
        { ...committedHealingEffect, effectId: "effect.heal.zulu" as never },
        {
          ...committedHealingEffect,
          effectId: "effect.heal.alpha" as never,
          healing: 2
        }
      ]
    });
    expect(result.decisions.map((decision) => decision.effectId)).toEqual([
      "effect.heal.alpha",
      "effect.heal.zulu"
    ]);
    expect(result.health[1]).toMatchObject({
      entityId: "entity.dwarf.warden",
      currentHealth: 20
    });
    expect(result.healingResolutions).toEqual([
      {
        schemaVersion: 1,
        entityId: "entity.dwarf.warden",
        healthBefore: 17,
        incomingHealing: 12,
        appliedHealing: 3,
        healthAfter: 20
      }
    ]);
  });

  it("refreshes statuses in stable effect-ID order using shared semantics", () => {
    const result = resolve({
      healingEffects: [],
      statusEffects: [
        {
          ...committedStatusEffect,
          effectId: "effect.status.zulu" as never,
          durationTicks: 4,
          magnitude: 12
        },
        {
          ...committedStatusEffect,
          effectId: "effect.status.alpha" as never,
          durationTicks: 9,
          magnitude: 3
        }
      ]
    });
    expect(result.decisions.map((decision) => decision.effectId)).toEqual([
      "effect.status.alpha",
      "effect.status.zulu"
    ]);
    expect(result.statuses).toEqual([
      {
        schemaVersion: 1,
        statusId: "status.guard",
        ownerEntityId: "entity.dwarf.warden",
        appliedAtTick: 12,
        expiresAtTick: 16,
        magnitude: 12
      }
    ]);
    expect(result.decisions[1]?.statusApplication).toMatchObject({
      status: "refreshed",
      previousMagnitude: 8,
      resultingMagnitude: 12,
      expiresAtTick: 16
    });
  });

  it("discards effects against absent and zero-health targets without revival", () => {
    const result = resolve({
      healingEffects: [
        {
          ...committedHealingEffect,
          effectId: "effect.heal.absent" as never,
          targetEntityId: "entity.dwarf.absent" as never
        },
        {
          ...committedHealingEffect,
          effectId: "effect.heal.downed" as never,
          targetEntityId: "entity.dwarf.downed" as never
        }
      ],
      statusEffects: []
    });
    expect(result.decisions).toHaveLength(2);
    expect(
      result.decisions.every(
        (decision) => decision.reason === "target_not_living_at_impact"
      )
    ).toBe(true);
    expect(result.health[0]?.currentHealth).toBe(0);
    expect(result.healingResolutions).toEqual([]);
  });

  it("does not cancel committed work when the source is absent", () => {
    const result = resolve({ statusEffects: [] });
    expect(result.decisions[0]).toMatchObject({
      status: "resolved",
      reason: "healing_applied"
    });
  });

  it("is input-order independent, detached, and deeply immutable", () => {
    const request = {
      currentTick: 12,
      healingEffects: [
        { ...committedHealingEffect, effectId: "effect.heal.zulu" as never },
        { ...committedHealingEffect, effectId: "effect.heal.alpha" as never }
      ],
      statusEffects: [committedStatusEffect],
      combatants: [...committedCombatEffectCombatants].reverse(),
      statuses: [committedCombatEffectStatus]
    };
    const before = structuredClone(request);
    const forward = resolveCommittedCombatEffects(request);
    const reverse = resolveCommittedCombatEffects({
      ...request,
      healingEffects: [...request.healingEffects].reverse()
    });
    expect(forward).toEqual(reverse);
    expect(request).toEqual(before);
    expect(Object.isFrozen(forward)).toBe(true);
    expect(Object.isFrozen(forward.decisions)).toBe(true);
    expect(Object.isFrozen(forward.decisions[0])).toBe(true);
    expect(Object.isFrozen(forward.health)).toBe(true);
    expect(Object.isFrozen(forward.health[0])).toBe(true);
    expect(Object.isFrozen(forward.statuses)).toBe(true);
  });

  it("rejects stale timing, duplicates, overflow, and malformed records", () => {
    expect(() => resolve({ currentTick: 13 })).toThrow(
      "passed its impact tick"
    );
    expect(() =>
      resolve({
        statusEffects: [
          {
            ...committedStatusEffect,
            effectId: committedHealingEffect.effectId
          }
        ]
      })
    ).toThrow("duplicate committed effect ID");
    expect(() =>
      resolve({
        statusEffects: [],
        healingEffects: [
          {
            ...committedHealingEffect,
            effectId: "effect.heal.alpha" as never,
            healing: Number.MAX_SAFE_INTEGER
          },
          {
            ...committedHealingEffect,
            effectId: "effect.heal.zulu" as never,
            healing: 1
          }
        ]
      })
    ).toThrow("aggregate incoming healing exceeds");
    expect(() =>
      resolve({
        healingEffects: [
          { ...committedHealingEffect, effectId: "invalid" as never }
        ],
        statusEffects: []
      })
    ).toThrow("valid domain stable ID");
    expect(() =>
      resolve({
        healingEffects: [],
        statusEffects: [{ ...committedStatusEffect, durationTicks: 0 }]
      })
    ).toThrow("durationTicks must be positive");
  });

  it("rejects sparse arrays and accessors without invoking caller code", () => {
    expect(() =>
      resolve({
        healingEffects: new Array(1) as CommittedHealingEffect[],
        statusEffects: []
      })
    ).toThrow("dense data array");

    let getterCalls = 0;
    const accessor = { ...committedStatusEffect } as CommittedStatusEffect;
    Object.defineProperty(accessor, "magnitude", {
      enumerable: true,
      get() {
        getterCalls += 1;
        return 3;
      }
    });
    expect(() =>
      resolve({ healingEffects: [], statusEffects: [accessor] })
    ).toThrow("magnitude must be an enumerable data property");
    expect(getterCalls).toBe(0);
  });

  it("pins the shared Node and browser parity evidence", async () => {
    expect(await canonicalHash(committedCombatEffectParityEvidence())).toBe(
      "d7c56f09047cd6d1abf972424f5ea78cbe4b181c778b3496e2c9fd86cfd8194c"
    );
  });
});
