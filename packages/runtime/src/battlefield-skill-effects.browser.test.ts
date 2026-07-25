import { canonicalHash } from "@dwarven-depths/contracts";
import { describe, expect, it } from "vitest";
import { battlefieldSkillEffectParityEvidence } from "./battlefield-skill-effects.fixture.js";

const checksum =
  "c449431624fdb3f2689edf5b1bc4d2582c57eb88eddc5ae3d6365039408f5fff";

describe("live battlefield skill-effect browser parity", () => {
  it("matches Node evidence for health, future attacks, and committed work", async () => {
    const evidence = await battlefieldSkillEffectParityEvidence();
    expect(evidence.upgradedDeployment).toMatchObject({
      currentHealth: 265,
      maximumHealth: 265,
      basicAttack: { damage: 21, range: 3, cooldownTicks: 22 }
    });
    const before = evidence.damagedBefore;
    const upgraded = evidence.afterSecond.battlefield.dwarfCombatants[0];
    if (before === undefined || upgraded === undefined)
      throw new Error("expected Warden battlefield evidence");

    expect(before.maximumHealth - before.currentHealth).toBe(9);
    expect(upgraded.maximumHealth - upgraded.currentHealth).toBe(9);
    expect(upgraded.basicAttack).toMatchObject({
      damage: 21,
      range: 3,
      cooldownTicks: 22
    });
    expect(upgraded.actionState.cooldownCompleteAtTick).toBe(32);
    expect(evidence.committedAfter).toEqual(evidence.committedBefore);
    expect(evidence.repeatedIsEquivalent).toBe(true);
    expect(await canonicalHash(evidence)).toBe(checksum);
  });
});
