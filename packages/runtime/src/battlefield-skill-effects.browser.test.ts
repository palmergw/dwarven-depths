import { canonicalHash } from "@dwarven-depths/contracts";
import { describe, expect, it } from "vitest";
import { battlefieldSkillEffectParityEvidence } from "./battlefield-skill-effects.fixture.js";

const checksum =
  "cbeb101b84a97c5c02a32cb76ed399ee1799294a8ccd5e93c0bd6f76be2623dd";

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
    expect(evidence.windupAfterUpgrade?.actionState.activeBasicAttack).toEqual(
      evidence.windupBefore?.actionState.activeBasicAttack
    );
    expect(evidence.windupCommitment).toMatchObject({
      cooldownCompleteAtTick: 32,
      damage: 18,
      range: 2
    });
    expect(evidence.nextWindup?.actionState.activeBasicAttack).toMatchObject({
      startedAtTick: 32,
      cooldownDurationTicks: 22,
      damage: 21,
      range: 3
    });
    expect(evidence.repeatedIsEquivalent).toBe(true);
    expect(await canonicalHash(evidence)).toBe(checksum);
  });
});
